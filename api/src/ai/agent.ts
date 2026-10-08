import { prisma } from "../config/prismaClient";
import type { AiRole, Prisma } from "../generated/prisma/client";
import { chatCompletion, type AiConfig, type ChatMessage, type ContentPart } from "./openrouter";
import { runTool, toolDefinitions, type ToolContext } from "./tools";

/** Model calls per user message; each call may run several tools. */
export const MAX_STEPS = 10;

/** How the workspace works and how to use the tools: shared by the assistant and the MCP server. */
export const WORKSPACE_GUIDE = [
  "Les outils couvrent toute l’app : pages, dossiers, scrapers, planificateurs, instances de scrape et, pour les administrateurs, permissions des utilisateurs. N’affirme jamais qu’une action est impossible sans avoir vérifié les outils.",
  "Ne modifie QUE ce qui est demandé : ne renomme rien, ne touche à aucun autre élément (scraper, planificateur, page) de ta propre initiative ; si un autre changement semble utile, propose-le sans le faire. Les modifications de pages restent annulables depuis leur historique ; les suppressions (delete_*) sont définitives : ne les fais que sur demande explicite, en nommant ce qui sera supprimé.",
  "Scraping : un planificateur suit des URL (add_scheduler_url) et les scrape selon son cron (5 champs, ex. « 0 0 * * * » = tous les jours à minuit) une fois activé (status ACTIVATE). Chaque URL est traitée par le scraper ACTIVE dont base_url contient son origine : si aucun ne convient, signale-le et propose de créer ou d’activer le scraper, sans modifier un scraper existant sans accord. Pour tester une URL tout de suite : run_scrape puis wait_for_instance.",
  "Les pages racines peuvent être rangées dans des dossiers (list_folders) ; les sous-pages restent sous leur page parente.",
  "Lis toujours une page avant de la modifier. Pour une modification ponctuelle, utilise edit_page plutôt que de réécrire toute la page.",
  "Les pages texte sont en Markdown (GFM : titres, listes, cases - [ ], tableaux, blocs de code). Elles contiennent aussi des blocs spéciaux, chacun sur sa propre ligne, à conserver tels quels sauf demande explicite :",
  "- ::page[id]:: lien vers une sous-page ; ::scheduler[id]:: données live d’un planificateur ; ::link[…]:: aperçu de lien web ; ::image[…]:: image.",
  "Les listes de tâches (TODO) se modifient avec update_todos, les tableurs (EXCEL, grille A1 à Z50, formules =SUM(…), =AVERAGE(…) et arithmétique) avec set_cells. read_page les donne déjà structurés : lis-les avant de les modifier.",
];

export const buildSystemPrompt = (page: { id: number; title: string; type: string } | null, now = new Date()) =>
  [
    "Tu es l’assistant de Tritou Notes, une app de notes (pages Markdown, tableurs, to-do) avec du scraping web planifié.",
    "Réponds en français, de façon concise, sauf si l’utilisateur demande autre chose.",
    `Date du jour : ${now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
    page
      ? `L’utilisateur travaille sur la page #${page.id} « ${page.title || "Sans titre"} » (type ${page.type}). « cette page », « ici » ou « le document » désignent cette page.`
      : "Aucune page n’est ouverte : utilise list_pages ou search_pages pour trouver celles dont on parle.",
    "Agis directement quand on te le demande, puis résume ce que tu as changé.",
    ...WORKSPACE_GUIDE,
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
        .filter((part): part is Extract<ContentPart, { type: "text" }> => part.type === "text" && !part.text.startsWith("<fichier ") && !part.text.startsWith(ATTACHMENT_NOTE))
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
 * Makes a stored history acceptable to the provider: every tool call gets a result right
 * after its assistant message, and stray tool results are dropped. A turn interrupted
 * between the model call and its tool results (crash, redeploy) would otherwise make
 * every following request fail.
 */
export const repairHistory = (history: ChatMessage[]): ChatMessage[] => {
  const repaired: ChatMessage[] = [];
  for (let i = 0; i < history.length; i++) {
    const message = history[i];
    if (message.role === "tool") continue; // consumed with its assistant message below
    repaired.push(message);
    if (message.role !== "assistant" || !message.tool_calls?.length) continue;
    const results = new Map<string, ChatMessage>();
    while (history[i + 1]?.role === "tool") {
      const result = history[++i] as Extract<ChatMessage, { role: "tool" }>;
      results.set(result.tool_call_id, result);
    }
    for (const call of message.tool_calls) {
      repaired.push(results.get(call.id) ?? { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Action interrompue avant son résultat." }) });
    }
  }
  return repaired;
};

/** Characters of earlier conversation sent with each call (~50k tokens); the current turn is never cut. */
export const HISTORY_BUDGET_CHARS = 200_000;
/** Earlier tool results and inlined files are shortened to this; the current turn keeps them whole. */
const OLD_PART_CHARS = 4_000;
const ATTACHMENT_NOTE = "<pièce-jointe ";

/**
 * Attachments are sent to the model once, with the message that brings them: what is stored, and
 * earlier messages sent again, keep a note instead of the base64 file (and a shortened text file).
 */
export const withoutAttachments = (message: ChatMessage): ChatMessage => {
  if (message.role !== "user" || typeof message.content === "string") return message;
  return {
    ...message,
    content: message.content.map((part): ContentPart => {
      if (part.type === "image_url") return { type: "text", text: `${ATTACHMENT_NOTE}type="image">envoyée dans ce message, plus disponible</pièce-jointe>` };
      if (part.type === "file") return { type: "text", text: `${ATTACHMENT_NOTE}nom="${part.file.filename.replace(/"/g, "'")}">envoyée dans ce message, plus disponible</pièce-jointe>` };
      if (part.text.startsWith("<fichier ") && part.text.length > OLD_PART_CHARS) return { type: "text", text: `${part.text.slice(0, OLD_PART_CHARS)}\n[… tronqué]\n</fichier>` };
      return part;
    }),
  };
};

/** Earlier messages as sent to the model: repaired, lightened, then cut to the budget from the oldest. */
export const compactHistory = (history: ChatMessage[], budget = HISTORY_BUDGET_CHARS): ChatMessage[] => {
  const light = repairHistory(history).map((message) =>
    message.role === "tool" && message.content.length > OLD_PART_CHARS
      ? { ...message, content: `${message.content.slice(0, OLD_PART_CHARS)}… [résultat tronqué]` }
      : withoutAttachments(message),
  );
  let start = light.length;
  for (let total = 0, i = light.length - 1; i >= 0; i--) {
    total += JSON.stringify(light[i]).length;
    if (total > budget) break;
    start = i;
  }
  // Start on a user message: no tool result without its call, no reply without its question.
  while (start < light.length && light[start].role !== "user") start++;
  return light.slice(start);
};

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
    ...compactHistory(history.map((row) => row.data as unknown as ChatMessage)),
    userMessage,
  ];

  const save = (message: ChatMessage, summary: string | null = null) =>
    prisma.aiMessage.create({
      data: { conversationId, role: message.role as AiRole, data: message as unknown as Prisma.InputJsonValue, summary },
    });

  await save(withoutAttachments(userMessage), attachmentNames.length ? attachmentNames.join("\n") : null);

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
