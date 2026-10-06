import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma";

export const documentTools: Tool[] = [
  {
    name: "list_documents",
    description: "List all documents with metadata (title, type, parentId, author, dates). Pages form a tree through parentId (null = root page). Does not include full text content.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_document",
    description: "Get a document by ID with its full text content, its sub-pages and recent history.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Document ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_document",
    description: "Create a new document.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        type: {
          type: "string",
          enum: ["TEXT", "EXCEL", "TODO"],
          description: "Document type (default: TEXT)",
        },
        authorId: { type: "number", description: "User ID of the author" },
        parentId: { type: "number", description: "Optional parent page ID to create a sub-page" },
      },
      required: ["title", "authorId"],
    },
  },
  {
    name: "update_document",
    description: "Update a document's title, text content, public visibility, or move it under another page (parentId, null for root).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Document ID" },
        title: { type: "string", description: "New title" },
        text: { type: "string", description: "New text content" },
        public: { type: "boolean", description: "Whether the document is public" },
        parentId: { type: ["number", "null"], description: "New parent page ID, or null to make it a root page" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_document",
    description: "Delete a document by ID. Its sub-pages are deleted with it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Document ID" },
      },
      required: ["id"],
    },
  },
];

type Args = Record<string, unknown>;

/** Refuses moving a page under itself or one of its own sub-pages. */
async function assertNotDescendant(id: number, parentId: number) {
  const seen = new Set<number>();
  for (let current: number | null = parentId; current !== null && !seen.has(current); ) {
    if (current === id) throw new Error("Cannot move a page under itself or one of its sub-pages");
    seen.add(current);
    const page: { parentId: number | null } | null = await prisma.document.findUnique({ where: { id: current }, select: { parentId: true } });
    if (!page) throw new Error(`Parent page ${parentId} not found`);
    current = page.parentId;
  }
}

export async function handleDocumentTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_documents": {
      return prisma.document.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          parentId: true,
          public: true,
          created_at: true,
          last_update: true,
          author: { select: { id: true, username: true, email: true } },
        },
        orderBy: { last_update: "desc" },
      });
    }

    case "get_document": {
      const id = Number(args.id);
      const doc = await prisma.document.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, username: true, email: true } },
          children: { select: { id: true, title: true, type: true }, orderBy: { created_at: "asc" } },
          documentHistories: {
            orderBy: { created_at: "desc" },
            take: 10,
            select: {
              id: true,
              title: true,
              created_at: true,
              author: { select: { id: true, username: true } },
            },
          },
        },
      });
      if (!doc) throw new Error(`Document ${id} not found`);
      return doc;
    }

    case "create_document": {
      const { title, type, authorId, parentId } = args as { title: string; type?: string; authorId: number; parentId?: number };
      return prisma.document.create({
        data: {
          title,
          type: (type as "TEXT" | "EXCEL" | "TODO") ?? "TEXT",
          authorId: Number(authorId),
          ...(parentId !== undefined && { parentId: Number(parentId) }),
        },
      });
    }

    case "update_document": {
      const { id, title, text, public: isPublic, parentId } = args as {
        id: number;
        title?: string;
        text?: string;
        public?: boolean;
        parentId?: number | null;
      };
      if (parentId !== undefined && parentId !== null) await assertNotDescendant(Number(id), Number(parentId));
      return prisma.document.update({
        where: { id: Number(id) },
        data: {
          ...(title !== undefined && { title }),
          ...(text !== undefined && { text }),
          ...(isPublic !== undefined && { public: isPublic }),
          ...(parentId !== undefined && { parentId: parentId === null ? null : Number(parentId) }),
          last_update: new Date(),
        },
      });
    }

    case "delete_document": {
      const id = Number(args.id);
      // Histories block the cascade, so clear them for the whole subtree first.
      const subtree = [id];
      for (let frontier = [id]; frontier.length; ) {
        const children = await prisma.document.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
        frontier = children.map((c) => c.id).filter((childId) => !subtree.includes(childId));
        subtree.push(...frontier);
      }
      await prisma.documentHistory.deleteMany({ where: { documentId: { in: subtree } } });
      await prisma.document.delete({ where: { id } });
      return { success: true, deleted_id: id };
    }

    default:
      throw new Error(`Unknown document tool: ${name}`);
  }
}
