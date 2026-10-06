import { prisma } from "../config/prismaClient";
import type { Prisma } from "../generated/prisma/client";
import { chatCompletion, type AiConfig, type ChatMessage, type ContentPart } from "./openrouter";
import { runTool, toolDefinitions, type ToolContext } from "./tools";

/** Model calls per user message; each call may run several tools. */
export const MAX_STEPS = 10;

export const buildSystemPrompt = (page: { id: number; title: string; type: string } | null, now = new Date()) =>
  [
    "Tu es l’assistant de Tritou Notes, une app de notes (pages Markdown, tableurs, to-do) avec du scraping web planifié.",
    "Réponds en français, de façon concise, sauf si l’utilisateur demande autre chose.",
    `Date du jour : ${now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
    page
      ? `L’utilisateur travaille sur la page #${page.id} « ${page.title || "Sans titre"} » (type ${page.type}). « cette page », « ici » ou « le document » désignent cette page.`
      : "Aucune page n’est ouverte : utilise list_pages ou search_pages pour trouver celles dont on parle.",
    "Tu peux lire, chercher, créer, modifier et déplacer des pages avec tes outils. Tes modifications sont appliquées immédiatement et restent annulables depuis l’historique de la page : agis directement quand on te le demande, puis résume ce que tu as changé.",
    "Les pages racines peuvent être rangées dans des dossiers (list_folders) ; les sous-pages restent sous leur page parente.",
    "Lis toujours une page avant de la modifier. Pour une modification ponctuelle, utilise edit_page plutôt que de réécrire toute la page.",
    "Les pages texte sont en Markdown (GFM : titres, listes, cases - [ ], tableaux, blocs de code). Elles contiennent aussi des blocs spéciaux, chacun sur sa propre ligne, à conserver tels quels sauf demande explicite :",
    "- ::page[id]:: lien vers une sous-page ; ::scheduler[id]:: données live d’un planificateur ; ::link[…]:: aperçu de lien web ; ::image[…]:: image.",
    "Les listes de tâches (TODO) se modifient avec update_todos, les tableurs (EXCEL, grille A1 à Z50, formules =SUM(…), =AVERAGE(…) et arithmétique) avec set_cells. read_page te les donne déjà structurés : lis-les avant de les modifier.",
  ].join("\n");

type AiMessageRow = { id: number; role: string; data: Prisma.JsonValue; summary: string | null; created_at: Date };

export interface DisplayMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** User attachments, or actions taken by the assistant's tools. */
  attachments: string[];
  actions: { summary: string; ok: boolean }[];
  created_at: Date;
}

const textOf = (content: string | ContentPart[] | null) =>
  typeof content === "string"
    ? content
    : (content ?? [])
        .filter((part): part is Extract<ContentPart, { type: "text" }> => part.type === "text" && !part.text.startsWith("<fichier "))
        .map((part) => part.text)
        .join("\n");

/**
 * Folds stored chat-completions messages into chat bubbles: consecutive assistant
 * steps and their tool results become one assistant bubble with a list of actions.
 */
export const toDisplayMessages = (rows: AiMessageRow[]): DisplayMessage[] => {
  const out: DisplayMessage[] = [];
  for (const row of rows) {
    const message = row.data as unknown as ChatMessage;
    const last = out[out.length - 1];
    if (message.role === "user") {
      out.push({
        id: row.id,
        role: "user",
        text: textOf(message.content),
        attachments: row.summary ? row.summary.split("\n") : [],
        actions: [],
        created_at: row.created_at,
      });
    } else if (message.role === "assistant" || message.role === "tool") {
      const bubble =
        last?.role === "assistant"
          ? last
          : (out[out.push({ id: row.id, role: "assistant", text: "", attachments: [], actions: [], created_at: row.created_at }) - 1]);
      if (message.role === "assistant" && message.content) bubble.text = bubble.text ? `${bubble.text}\n\n${message.content}` : message.content;
      if (message.role === "tool" && row.summary) {
        bubble.actions.push({ summary: row.summary, ok: !/^Échec /.test(row.summary) });
      }
    }
  }
  return out;
};

/** Progress sent to the browser while a turn runs (server-sent events). */
export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "action"; summary: string; ok: boolean };

/**
 * Runs one user turn: stores the user message, then alternates model calls and
 * tool calls until the model answers without tools (or MAX_STEPS is reached).
 * Every message is persisted as it is produced, so a failure keeps the history valid.
 */
export const runTurn = async ({
  conversationId,
  page,
  userMessage,
  attachmentNames,
  ctx,
  config,
  emit = () => {},
  signal,
}: {
  conversationId: number;
  page: { id: number; title: string; type: string } | null;
  userMessage: Extract<ChatMessage, { role: "user" }>;
  attachmentNames: string[];
  ctx: ToolContext;
  config: AiConfig;
  emit?: (event: TurnEvent) => void;
  signal?: AbortSignal;
}) => {
  const history = await prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { id: "asc" } });
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(page) },
    ...history.map((row) => row.data as unknown as ChatMessage),
    userMessage,
  ];

  const save = (message: ChatMessage, summary: string | null = null) =>
    prisma.aiMessage.create({
      data: { conversationId, role: message.role, data: message as unknown as Prisma.InputJsonValue, summary },
    });

  await save(userMessage, attachmentNames.length ? attachmentNames.join("\n") : null);

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await chatCompletion(config, messages, toolDefinitions, { onText: (text) => emit({ type: "text", text }), signal });
    messages.push(reply);
    await save(reply);
    if (!reply.tool_calls?.length) return;
    for (const call of reply.tool_calls) {
      emit({ type: "tool", name: call.function.name });
      const result = await runTool(call.function.name, call.function.arguments, ctx);
      emit({ type: "action", summary: result.summary, ok: result.ok });
      const toolMessage: ChatMessage = { role: "tool", tool_call_id: call.id, content: JSON.stringify(result.output) };
      messages.push(toolMessage);
      await save(toolMessage, result.summary);
    }
  }
  await save({ role: "assistant", content: "J’ai atteint la limite d’actions pour ce message. Dis « continue » pour que je poursuive." });
};
