import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { deleteFolderKeepingContent, resolveFolder, resolveFolderParent } from "../utils/folderTree";

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

const folderName = (value: unknown) => {
  const name = typeof value === "string" ? value.trim().slice(0, 120) : "";
  if (!name) throw httpError("Nom du dossier requis");
  return name;
};

const select = { id: true, name: true, parentId: true, created_at: true } as const;

export const getFolders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await prisma.folder.findMany({ select, orderBy: { name: "asc" } }));
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentId = req.body?.parentId == null ? null : await resolveFolder(req.body.parentId);
    const folder = await prisma.folder.create({
      data: { name: folderName(req.body?.name), ...(parentId !== null && { parent: { connect: { id: parentId } } }) },
      select,
    });
    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
};

/** Renames (`name`) and/or moves (`parentId`, null = root) a folder. */
export const updateFolder = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.folder.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw httpError("Dossier introuvable", 404);
    const { name, parentId } = req.body ?? {};
    const parent = parentId === undefined ? undefined : await resolveFolderParent(parentId, id);
    const folder = await prisma.folder.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: folderName(name) }),
        ...(parent !== undefined && { parent: parent === null ? { disconnect: true } : { connect: { id: parent } } }),
      },
      select,
    });
    res.json(folder);
  } catch (error) {
    next(error);
  }
};

/** Deletes a folder without deleting anything in it: its pages and subfolders move up one level. */
export const deleteFolder = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const folder = await deleteFolderKeepingContent(id);
    res.json({ success: true, movedTo: folder.parentId });
  } catch (error) {
    next(error);
  }
};
