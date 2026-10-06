import type { RequestHandler } from "express";
import multer from "multer";
import { MAX_IMAGE_SIZE } from "../utils/documentImageStorage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 0, parts: 1, fieldNameSize: 50 },
}).single("image");

export const documentImageUpload: RequestHandler = (req, res, next) => {
  upload(req, res, error => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({ message: tooLarge ? "L’image dépasse la limite de 10 Mo." : "Envoyez un seul fichier dans le champ image." });
      return;
    }
    next();
  });
};
