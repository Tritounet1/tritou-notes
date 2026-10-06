import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { prisma } from "../config/prismaClient";
import { IMAGE_ID_PATTERN, imagePath, prepareImage, removeImage, storeImage } from "../utils/documentImageStorage";

export const uploadDocumentImage: RequestHandler = async (req, res, next) => {
  const documentId = Number(req.params.id);
  try {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      res.status(400).json({ message: "Identifiant du document invalide" }); return;
    }
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) { res.status(404).json({ message: "Document introuvable" }); return; }
    if (document.type !== "TEXT") { res.status(400).json({ message: "Les images sont réservées aux documents texte." }); return; }
    if (!req.file) { res.status(400).json({ message: "Une image est requise." }); return; }
    const prepared = await prepareImage(req.file.buffer);
    const imageId = randomUUID();
    await storeImage(documentId, imageId, prepared.data);
    try {
      const image = await prisma.documentImage.create({ data: {
        id: imageId, documentId,
        filename: req.file.originalname.slice(0, 255),
        mimeType: prepared.mimeType, size: prepared.data.length,
        width: prepared.width, height: prepared.height,
      } });
      res.status(201).json({ ...image, url: `/api/documents/${documentId}/images/${image.id}` });
    } catch (error) {
      await removeImage(documentId, imageId);
      throw error;
    }
  } catch (error) { next(error); }
};

export const getDocumentImage: RequestHandler = async (req, res, next) => {
  try {
    const documentId = Number(req.params.id);
    const imageId = String(req.params.imageId);
    if (!Number.isSafeInteger(documentId) || documentId <= 0 || !IMAGE_ID_PATTERN.test(imageId)) {
      res.status(400).json({ message: "Identifiant de l’image invalide" }); return;
    }
    const image = await prisma.documentImage.findUnique({ where: { id: imageId }, include: { document: { select: { public: true } } } });
    if (!image || image.documentId !== documentId || (!req.user && !image.document.public)) {
      res.status(404).json({ message: "Image introuvable" }); return;
    }
    res.set({
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.sendFile(imagePath(documentId, image.id), error => {
      if (!error) return;
      if (res.headersSent) { next(error); return; }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ message: "Fichier image introuvable" }); return;
      }
      next(error);
    });
  } catch (error) { next(error); }
};
