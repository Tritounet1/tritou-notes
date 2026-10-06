import type { UserPermissions } from "../generated/prisma/client";
import type { ToolDefinition } from "./openrouter";

// Shared building blocks for the assistant's tools (ai/tools.ts, scrapingTools.ts, workspaceTools.ts).

export type PermissionKey = keyof Omit<UserPermissions, "id" | "userId">;

export interface ToolContext {
  userId: number;
  isAdmin: boolean;
  permissions: UserPermissions | null;
  /** Ids of pages created or modified during this turn, so the UI can reload them. */
  changed: Set<number>;
  /** Set when folders changed: the sidebar tree must refresh even if no page did. */
  treeChanged?: boolean;
}

export interface ToolResult {
  /** JSON sent back to the model. */
  output: unknown;
  /** Short French label shown in the chat. */
  summary: string;
  ok: boolean;
}

export type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<Omit<ToolResult, "ok">>;
export type Tool = { definition: ToolDefinition["function"]; run: Handler };

/** An error the model can recover from: sent back as the tool result. */
export class ToolError extends Error {}

export const can = (ctx: ToolContext, permission: PermissionKey) => ctx.isAdmin || ctx.permissions?.[permission] === true;

/** Tools apply the same permission as the matching REST route. */
export const requirePermission = (ctx: ToolContext, permission: PermissionKey) => {
  if (!can(ctx, permission)) throw new ToolError(`Permission « ${permission} » manquante pour cet utilisateur.`);
};

export const requireAdmin = (ctx: ToolContext) => {
  if (!ctx.isAdmin) throw new ToolError("Réservé aux administrateurs.");
};

export const positiveInt = (value: unknown, what: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ToolError(`Identifiant de ${what} invalide.`);
  return id;
};

export const label = (title: string) => `« ${title || "Sans titre"} »`;

export const string = (value: unknown, name: string, { allowEmpty = false } = {}) => {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new ToolError(`Paramètre « ${name} » manquant.`);
  return value;
};

/** "3 pages" / "1 page" for summaries. */
export const count = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
