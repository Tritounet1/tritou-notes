import { prisma } from "../config/prismaClient";
import { decrypt } from "../utils/utils";

const BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 120_000;

/** Error with an HTTP status the error handler forwards to the client. */
const aiError = (message: string, status = 502) => Object.assign(new Error(message), { status });

export interface AiConfig {
  apiKey: string;
  textModel: string | null;
  imageModel: string | null;
}

/** Workspace-wide OpenRouter settings; throws a 400 when no key is configured. */
export const getAiConfig = async (): Promise<AiConfig> => {
  const settings = await prisma.settings.findFirst({
    select: { openrouterApiKey: true, aiTextModel: true, aiImageModel: true },
  });
  const apiKey = settings?.openrouterApiKey ? decrypt(settings.openrouterApiKey) : "";
  if (!apiKey) throw aiError("Aucune clé OpenRouter : ajoutez-la dans Paramètres › Intelligence artificielle.", 400);
  return { apiKey, textModel: settings?.aiTextModel ?? null, imageModel: settings?.aiImageModel ?? null };
};

const request = async <T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Tritou Notes",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message ?? `OpenRouter a répondu ${response.status}`;
    throw aiError(`OpenRouter : ${message}`, response.status === 401 || response.status === 402 ? 400 : 502);
  }
  return body as T;
};

// ---- Chat completions (OpenAI-compatible) ----

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
  /** Provider reasoning blocks (e.g. Gemini thought signatures): must be sent back unchanged on the next call. */
  reasoning_details?: Record<string, unknown>[];
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Yields the JSON payload of each `data:` line of a server-sent events stream. */
async function* sseEvents(body: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      // Lines starting with ":" are keep-alive comments ("OPENROUTER PROCESSING").
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      yield JSON.parse(data);
    }
  }
}

interface StreamDelta {
  content?: string | null;
  tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
  reasoning_details?: Record<string, unknown>[];
}

/** Streamed reasoning text arrives in pieces sharing a type and index: glue them back together. */
const mergeReasoning = (into: Record<string, unknown>[], detail: Record<string, unknown>) => {
  const last = into[into.length - 1];
  const field = typeof detail.text === "string" ? "text" : typeof detail.summary === "string" ? "summary" : null;
  if (field && last && last.type === detail.type && last.index === detail.index && typeof last[field] === "string") {
    last[field] = (last[field] as string) + (detail[field] as string);
  } else {
    into.push({ ...detail });
  }
};

/**
 * Streams one chat completion. `onText` receives answer text as it arrives; the
 * assembled message (text, tool calls, reasoning) is returned at the end.
 */
export const chatCompletion = async (
  config: AiConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  { onText, signal }: { onText?: (text: string) => void; signal?: AbortSignal } = {},
): Promise<AssistantMessage> => {
  if (!config.textModel) throw aiError("Aucun modèle texte choisi : sélectionnez-en un dans Paramètres › Intelligence artificielle.", 400);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "X-Title": "Tritou Notes" },
    body: JSON.stringify({ model: config.textModel, messages, tools, tool_choice: "auto", stream: true }),
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message ?? `OpenRouter a répondu ${response.status}`;
    throw aiError(`OpenRouter : ${message}`, response.status === 401 || response.status === 402 ? 400 : 502);
  }

  let content = "";
  const calls: ToolCall[] = [];
  const reasoning: Record<string, unknown>[] = [];
  for await (const event of sseEvents(response.body as unknown as AsyncIterable<Uint8Array>)) {
    if (event.error) throw aiError(`OpenRouter : ${event.error.message ?? "erreur pendant la génération"}`);
    const delta: StreamDelta | undefined = event.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      content += delta.content;
      onText?.(delta.content);
    }
    for (const part of delta.tool_calls ?? []) {
      // Arguments arrive as string fragments; `index` (or the id) says which call they extend.
      const byId = part.id ? calls.findIndex((c) => c.id === part.id) : -1;
      const index = typeof part.index === "number" ? part.index : byId >= 0 ? byId : part.id ? calls.length : calls.length - 1;
      const call = (calls[index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
      if (part.id) call.id = part.id;
      if (part.function?.name && !call.function.name) call.function.name = part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
    }
    for (const detail of delta.reasoning_details ?? []) mergeReasoning(reasoning, detail);
  }

  const toolCalls = calls.filter(Boolean);
  return {
    role: "assistant",
    content: content || null,
    ...(toolCalls.length && { tool_calls: toolCalls }),
    ...(reasoning.length && { reasoning_details: reasoning }),
  };
};

// ---- Models ----

export interface ModelSummary {
  id: string;
  name: string;
  inputModalities: string[];
  contextLength: number | null;
  /** USD per million tokens, when OpenRouter publishes per-token prices. */
  pricing: { prompt: number; completion: number } | null;
}

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
}

const summarize = (model: RawModel): ModelSummary => {
  const prompt = Number(model.pricing?.prompt);
  const completion = Number(model.pricing?.completion);
  return {
    id: model.id,
    name: model.name ?? model.id,
    inputModalities: model.architecture?.input_modalities ?? ["text"],
    contextLength: model.context_length ?? null,
    pricing: Number.isFinite(prompt) && Number.isFinite(completion) ? { prompt: prompt * 1e6, completion: completion * 1e6 } : null,
  };
};

/** Text models usable by the assistant: they must support tool calling. */
export const listTextModels = async (apiKey: string) => {
  const body = await request<{ data: RawModel[] }>(apiKey, "/models?supported_parameters=tools");
  return body.data
    // ":batch" variants are for OpenRouter's asynchronous batch API, not interactive chat.
    .filter((model) => !model.id.endsWith(":batch") && (model.architecture?.output_modalities?.includes("text") ?? true))
    .map(summarize)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const listImageModels = async (apiKey: string) => {
  const body = await request<{ data: RawModel[] }>(apiKey, "/images/models");
  return body.data.map(summarize).sort((a, b) => a.name.localeCompare(b.name));
};

// ---- Images ----

/** Generates one image with the configured image model; returns the raw bytes. */
export const generateImage = async (config: AiConfig, prompt: string): Promise<Buffer> => {
  if (!config.imageModel) throw aiError("Aucun modèle d’image choisi : sélectionnez-en un dans Paramètres › Intelligence artificielle.", 400);
  const body = await request<{ data?: { b64_json?: string; url?: string }[] }>(config.apiKey, "/images", {
    method: "POST",
    body: JSON.stringify({ model: config.imageModel, prompt, n: 1 }),
  });
  const image = body.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  const dataUrl = image?.url?.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrl) return Buffer.from(dataUrl[1], "base64");
  throw aiError("Le modèle d’image n’a renvoyé aucune image");
};
