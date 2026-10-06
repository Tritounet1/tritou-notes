import { prisma } from "../config/prismaClient";
import { deleteDocumentTree } from "../services/documentService";
import { deleteFolderKeepingContent, resolveFolder, resolveFolderParent } from "../utils/folderTree";
import { count, label, positiveInt, requireAdmin, requirePermission, string, ToolError, type PermissionKey, type Tool } from "./toolKit";

// Folders, page deletion and (for administrators) user permissions.

const PERMISSIONS: PermissionKey[] = [
  "createDocument",
  "modifyDocument",
  "deleteDocument",
  "useAiChatBot",
  "accessScrapersPage",
  "modifyScraper",
  "deleteScraper",
  "modifyScraperStatus",
  "accessInstancesScrapersPage",
  "useScraper",
];

const findFolder = async (value: unknown) => {
  const folder = await prisma.folder.findUnique({ where: { id: positiveInt(value, "dossier") } });
  if (!folder) throw new ToolError(`Le dossier ${value} n’existe pas.`);
  return folder;
};

export const workspaceTools: Record<string, Tool> = {
  // ---- Folders ----
  list_folders: {
    definition: {
      name: "list_folders",
      description: "Liste les dossiers (id, nom, parentId). Les dossiers rangent les pages racines ; les sous-pages restent sous leur page parente.",
      parameters: { type: "object", properties: {} },
    },
    run: async () => {
      const folders = await prisma.folder.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
      return { output: folders, summary: `${count(folders.length, "dossier")} listé${folders.length > 1 ? "s" : ""}` };
    },
  },

  create_folder: {
    definition: {
      name: "create_folder",
      description: "Crée un dossier, à la racine ou dans un dossier parent (parentId).",
      parameters: { type: "object", properties: { name: { type: "string" }, parentId: { type: "integer" } }, required: ["name"] },
    },
    run: async ({ name, parentId }, ctx) => {
      requirePermission(ctx, "createDocument");
      const parent = parentId == null ? null : await resolveFolder(parentId);
      const folder = await prisma.folder.create({
        data: { name: string(name, "name").trim().slice(0, 120), ...(parent !== null && { parent: { connect: { id: parent } } }) },
      });
      ctx.treeChanged = true;
      return { output: { id: folder.id }, summary: `Dossier créé : ${label(folder.name)}` };
    },
  },

  update_folder: {
    definition: {
      name: "update_folder",
      description: "Renomme (name) et/ou déplace (parentId, null = racine) un dossier.",
      parameters: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, parentId: { type: ["integer", "null"] } }, required: ["id"] },
    },
    run: async ({ id, name, parentId }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      const folder = await findFolder(id);
      const parent = parentId === undefined ? undefined : await resolveFolderParent(parentId, folder.id);
      const updated = await prisma.folder.update({
        where: { id: folder.id },
        data: {
          ...(name !== undefined && { name: string(name, "name").trim().slice(0, 120) }),
          ...(parent !== undefined && { parent: parent === null ? { disconnect: true } : { connect: { id: parent } } }),
        },
      });
      ctx.treeChanged = true;
      return { output: { ok: true }, summary: `Dossier modifié : ${label(updated.name)}` };
    },
  },

  delete_folder: {
    definition: {
      name: "delete_folder",
      description: "Supprime un dossier. Aucune page n’est supprimée : son contenu remonte d’un niveau.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "deleteDocument");
      const folder = await findFolder(id);
      await deleteFolderKeepingContent(folder.id);
      ctx.treeChanged = true;
      return { output: { ok: true, contentMovedTo: folder.parentId }, summary: `Dossier supprimé : ${label(folder.name)}` };
    },
  },

  // ---- Pages ----
  delete_page: {
    definition: {
      name: "delete_page",
      description:
        "Supprime DÉFINITIVEMENT une page avec toutes ses sous-pages, leur historique et leurs images (non annulable). " +
        "Uniquement si l’utilisateur l’a explicitement demandé ; nomme la page et ses sous-pages avant de le faire.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "deleteDocument");
      const page = await prisma.document.findUnique({ where: { id: positiveInt(id, "page") }, select: { id: true, title: true } });
      if (!page) throw new ToolError(`La page ${id} n’existe pas.`);
      const { subtree } = await deleteDocumentTree(page.id);
      subtree.forEach((pageId) => ctx.changed.add(pageId));
      const extra = subtree.length - 1;
      return { output: { ok: true, deletedPages: subtree }, summary: `Page supprimée : ${label(page.title)}${extra ? ` (+ ${count(extra, "sous-page")})` : ""}` };
    },
  },

  // ---- Users (administrators only) ----
  list_users: {
    definition: {
      name: "list_users",
      description: "Liste les utilisateurs avec leur rôle et leurs permissions (administrateurs uniquement).",
      parameters: { type: "object", properties: {} },
    },
    run: async (_args, ctx) => {
      requireAdmin(ctx);
      const users = await prisma.user.findMany({
        select: { id: true, username: true, email: true, role: true, userPermissions: true },
        orderBy: { id: "asc" },
      });
      return { output: users, summary: `${count(users.length, "utilisateur")} listé${users.length > 1 ? "s" : ""}` };
    },
  },

  update_user_permissions: {
    definition: {
      name: "update_user_permissions",
      description: `Change les permissions d’un utilisateur (administrateurs uniquement). Clés possibles : ${PERMISSIONS.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          permissions: { type: "object", properties: Object.fromEntries(PERMISSIONS.map((key) => [key, { type: "boolean" }])) },
        },
        required: ["userId", "permissions"],
      },
    },
    run: async ({ userId, permissions }, ctx) => {
      requireAdmin(ctx);
      const id = positiveInt(userId, "utilisateur");
      const user = await prisma.user.findUnique({ where: { id }, select: { username: true, role: true } });
      if (!user) throw new ToolError(`L’utilisateur ${userId} n’existe pas.`);
      if (!permissions || typeof permissions !== "object") throw new ToolError("`permissions` doit être un objet { permission: booléen }.");
      const entries = Object.entries(permissions as Record<string, unknown>);
      const unknown = entries.filter(([key]) => !PERMISSIONS.includes(key as PermissionKey)).map(([key]) => key);
      if (unknown.length) throw new ToolError(`Permissions inconnues : ${unknown.join(", ")}.`);
      const data = Object.fromEntries(entries.map(([key, value]) => [key, value === true]));
      await prisma.userPermissions.upsert({ where: { userId: id }, update: data, create: { userId: id, ...data } });
      return { output: { ok: true, ...(user.role === "ADMIN" && { note: "Les administrateurs ont de toute façon tous les droits." }) }, summary: `Permissions de ${label(user.username)} modifiées` };
    },
  },
};
