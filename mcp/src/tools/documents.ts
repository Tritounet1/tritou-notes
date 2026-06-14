import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma";

export const documentTools: Tool[] = [
  {
    name: "list_documents",
    description: "List all documents with metadata (title, type, author, dates). Does not include full text content.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_document",
    description: "Get a document by ID with its full text content and recent history.",
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
      },
      required: ["title", "authorId"],
    },
  },
  {
    name: "update_document",
    description: "Update a document's title, text content, or public visibility.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Document ID" },
        title: { type: "string", description: "New title" },
        text: { type: "string", description: "New text content" },
        public: { type: "boolean", description: "Whether the document is public" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_document",
    description: "Delete a document by ID. This also deletes its history.",
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

export async function handleDocumentTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_documents": {
      return prisma.document.findMany({
        select: {
          id: true,
          title: true,
          type: true,
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
      const { title, type, authorId } = args as { title: string; type?: string; authorId: number };
      return prisma.document.create({
        data: {
          title,
          type: (type as "TEXT" | "EXCEL" | "TODO") ?? "TEXT",
          authorId: Number(authorId),
        },
      });
    }

    case "update_document": {
      const { id, title, text, public: isPublic } = args as {
        id: number;
        title?: string;
        text?: string;
        public?: boolean;
      };
      return prisma.document.update({
        where: { id: Number(id) },
        data: {
          ...(title !== undefined && { title }),
          ...(text !== undefined && { text }),
          ...(isPublic !== undefined && { public: isPublic }),
          last_update: new Date(),
        },
      });
    }

    case "delete_document": {
      const id = Number(args.id);
      await prisma.document.delete({ where: { id } });
      return { success: true, deleted_id: id };
    }

    default:
      throw new Error(`Unknown document tool: ${name}`);
  }
}
