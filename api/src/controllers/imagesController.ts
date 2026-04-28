import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { uploadFile } from "../utils/storageService";

export const createImage = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, file_body } = req.body;
    uploadFile(file_body, name, "test");
    const image = await prisma.images.create({
      data: {
        name: name,
      },
    });
    res.status(201).json(image);
  } catch (error) {
    next(error);
  }
};

export const getImages = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const images = await prisma.images.findMany();
    res.json(images);
  } catch (error) {
    next(error);
  }
};

export const getImageById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const image = await prisma.images.findUnique({
      where: {
        id: id,
      },
    });
    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }
    res.json(image);
  } catch (error) {
    next(error);
  }
};

export const deleteImage = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedImage = await prisma.images.delete({
      where: {
        id: id,
      },
    });
    res.json(deletedImage);
  } catch (error) {
    next(error);
  }
};
