import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runTurn, toDisplayMessages } from "../ai/agent";
import { attachmentToPart, MAX_ATTACHMENTS, type Attachment } from "../ai/attachments";
import type { ToolContext } from "../ai/toolKit";
import { generateImage as generateWithOpenRouter, getAiConfig, listImageModels, listTextModels } from "../ai/openrouter";
import { prisma } from "../config/prismaClient";
import { prepareImage, removeImage, storeImage } from "../utils/documentImageStorage";
import { httpError, toHttpError } from "../utils/httpError";


// ---- Helpers ----

/** The current user's conversation, or a 404 (conversations are private). */
const ownConversation = async (req: Request<{ id: string }>) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: Number(req.params.id), authorId: req.user.id },
    include: { document: { select: { id: true, title: true, type: true } } },
  });
  if (!conversation) throw httpError("Conversation introuvable", 404);
  return conversation;
};

const toolContext = async (req: Request): Promise<ToolContext> => ({
  userId: req.user.id,
  isAdmin: req.user.role === "ADMIN",
  permissions: await prisma.userPermissions.findUnique({ where: { userId: req.user.id } }),
  changed: new Set<number>(),
});

// ---- Models & config ----

export const getModels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { apiKey } = await getAiConfig();
    const [text, image] = await Promise.all([listTextModels(apiKey), listImageModels(apiKey)]);
    res.json({ text, image });
  } catch (error) {
    next(error);
  }
};

/** What the chat UI needs: which models are configured (never the key). */
export const getAiStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.settings.findFirst({ select: { openrouterApiKey: true, aiTextModel: true, aiImageModel: true } });
    res.json({
      configured: Boolean(settings?.openrouterApiKey),
      textModel: settings?.aiTextModel ?? null,
      imageModel: settings?.aiImageModel ?? null,
    });
  } catch (error) {
    next(error);
  }
};

// ---- Conversations ----

/** `?documentId=12` for a page's conversations, `?documentId=none` for global ones. */
export const listConversations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.query.documentId;
    const documentId = raw === "none" ? null : raw === undefined ? undefined : Number(raw);
    if (documentId !== undefined && documentId !== null && !Number.isInteger(documentId)) throw httpError("documentId invalide");
    const conversations = await prisma.conversation.findMany({
      where: { authorId: req.user.id, ...(documentId !== undefined && { documentId }) },
      select: { id: true, title: true, documentId: true, created_at: true, updated_at: true },
      orderBy: { updated_at: "desc" },
    });
    res.json(conversations);
  } catch (error) {
    next(error);
  }
};

export const createConversation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documentId = req.body?.documentId == null ? null : Number(req.body.documentId);
    if (documentId !== null) {
      const page = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true } });
      if (!page) throw httpError("Page introuvable", 404);
    }
    const conversation = await prisma.conversation.create({
      data: { documentId, authorId: req.user.id },
      select: { id: true, title: true, documentId: true, created_at: true, updated_at: true },
    });
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
};

export const getConversation = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { document, ...conversation } = await ownConversation(req);
    const rows = await prisma.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { id: "asc" } });
    res.json({ ...conversation, document, messages: toDisplayMessages(rows) });
  } catch (error) {
    next(error);
  }
};

export const renameConversation = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const conversation = await ownConversation(req);
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 120) : "";
    if (!title) throw httpError("Titre requis");
    res.json(await prisma.conversation.update({ where: { id: conversation.id }, data: { title } }));
  } catch (error) {
    next(error);
  }
};

export const deleteConversation = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const conversation = await ownConversation(req);
    await prisma.conversation.delete({ where: { id: conversation.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * Sends a message (text + optional attachments) and runs the assistant, tools included.
 * The reply is streamed as server-sent events: `text` deltas, `tool` / `action` progress,
 * then `done` with the whole conversation and the ids of pages the assistant changed
 * (or `error`). Validation errors happen before the stream starts and stay plain JSON.
 */
// Conversations with a turn in progress (one API process: memory is enough). A second
// message would interleave its rows with the running turn and corrupt the history.
const busyConversations = new Set<number>();

export const sendMessage = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  let locked: number | undefined;
  try {
    const conversation = await ownConversation(req);
    if (busyConversations.has(conversation.id)) throw httpError("Une réponse est déjà en cours dans cette conversation.", 409);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const attachments: Attachment[] = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (!text && !attachments.length) throw httpError("Message vide");
    if (attachments.length > MAX_ATTACHMENTS) throw httpError(`${MAX_ATTACHMENTS} fichiers maximum par message.`);
    const parts = attachments.map(attachmentToPart);
    const config = await getAiConfig();
    const ctx = await toolContext(req);
    busyConversations.add(conversation.id);
    locked = conversation.id;

    if (conversation.title === "Nouvelle conversation" && text) {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { title: text.slice(0, 60) } });
    }

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx from buffering the stream.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = (event: object) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    // Closing the chat (or the tab) stops the model instead of paying for an unread answer.
    const abort = new AbortController();
    res.on("close", () => !res.writableEnded && abort.abort());

    const finish = async () => {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updated_at: new Date() } });
      const rows = await prisma.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { id: "asc" } });
      return { messages: toDisplayMessages(rows), changedDocumentIds: [...ctx.changed], treeChanged: Boolean(ctx.treeChanged) };
    };
    try {
      await runTurn({
        conversationId: conversation.id,
        page: conversation.document,
        userMessage: { role: "user", content: parts.length ? [{ type: "text", text: text || "(voir les fichiers joints)" }, ...parts] : text },
        attachmentNames: attachments.map((a) => a.name),
        ctx,
        config,
        emit: send,
        signal: abort.signal,
      });
      send({ type: "done", ...(await finish()) });
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error(error);
        // Tools may already have changed pages: report them with the error.
        send({ type: "error", message: toHttpError(error).message, ...(await finish().catch(() => ({}))) });
      }
    }
    res.end();
  } catch (error) {
    next(error);
  } finally {
    if (locked !== undefined) busyConversations.delete(locked);
  }
};

// ---- Images ----

/** Generates an image with the configured image model and stores it in the page, like an upload. */
export const generateImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const documentId = Number(req.body?.documentId);
    const page = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, type: true } });
    if (!page) throw httpError("Page introuvable", 404);
    if (!prompt) throw httpError("Décris l’image à générer.");
    if (page.type !== "TEXT") throw httpError("Les images sont réservées aux pages texte.");

    const prepared = await prepareImage(await generateWithOpenRouter(await getAiConfig(), prompt));
    const imageId = randomUUID();
    await storeImage(page.id, imageId, prepared.data);
    try {
      const image = await prisma.documentImage.create({
        data: {
          id: imageId,
          documentId: page.id,
          filename: `ia-${prompt.slice(0, 60)}.webp`,
          mimeType: prepared.mimeType,
          size: prepared.data.length,
          width: prepared.width,
          height: prepared.height,
        },
      });
      res.status(201).json({ ...image, url: `/api/documents/${page.id}/images/${image.id}` });
    } catch (error) {
      await removeImage(page.id, imageId);
      throw error;
    }
  } catch (error) {
    next(error);
  }
};
