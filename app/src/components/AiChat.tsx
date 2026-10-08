import { useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { notifyDocumentsChanged } from "../utils/documentEvents";

interface ConversationSummary {
  id: number;
  title: string;
  documentId: number | null;
  updated_at: string;
}

interface DisplayMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  attachments: string[];
  actions: { summary: string; ok: boolean }[];
}

interface AiStatus {
  configured: boolean;
  textModel: string | null;
}

interface AiChatProps {
  /** The page the chat is about, or null for global conversations (Assistant page). */
  documentId: number | null;
  variant: "panel" | "page";
  onClose?: () => void;
  /** Called with the ids of pages the assistant created or modified. */
  onDocumentsChanged?: (ids: number[]) => void;
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.toml,.sql,.log,.js,.ts,.tsx,.jsx,.py,.sh,.html,.css";

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** In-progress assistant reply, filled from the server-sent events. */
interface LiveReply {
  text: string;
  actions: { summary: string; ok: boolean }[];
  /** Tool currently running, if any. */
  tool: string | null;
}

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "action"; summary: string; ok: boolean }
  | { type: "done"; messages: DisplayMessage[]; changedDocumentIds: number[]; treeChanged?: boolean }
  | { type: "error"; message: string; messages?: DisplayMessage[]; changedDocumentIds?: number[]; treeChanged?: boolean };

const TOOL_LABELS: Record<string, string> = {
  list_pages: "Liste des pages",
  search_pages: "Recherche dans les pages",
  read_page: "Lecture de la page",
  create_page: "Création d’une page",
  edit_page: "Modification de la page",
  append_to_page: "Ajout de contenu",
  rewrite_page: "Réécriture de la page",
  move_page: "Déplacement de la page",
  update_todos: "Mise à jour des tâches",
  set_cells: "Mise à jour du tableur",
  list_schedulers: "Lecture des planificateurs",
  read_scheduler: "Lecture du planificateur",
  create_scheduler: "Création d’un planificateur",
  update_scheduler: "Mise à jour du planificateur",
  add_scheduler_url: "Ajout d’une URL au planificateur",
  remove_scheduler_url: "Retrait d’une URL du planificateur",
  delete_scheduler: "Suppression du planificateur",
  list_scrapers: "Lecture des scrapers",
  read_scraper: "Lecture du scraper",
  create_scraper: "Création d’un scraper",
  update_scraper: "Mise à jour du scraper",
  delete_scraper: "Suppression du scraper",
  list_instances: "Lecture des instances",
  read_instance: "Lecture de l’instance",
  run_scrape: "Lancement du scrape",
  wait_for_instance: "Scrape en cours",
  delete_instance: "Suppression de l’instance",
  list_folders: "Lecture des dossiers",
  create_folder: "Création d’un dossier",
  update_folder: "Mise à jour du dossier",
  delete_folder: "Suppression du dossier",
  delete_page: "Suppression de la page",
  list_users: "Lecture des utilisateurs",
  update_user_permissions: "Mise à jour des permissions",
};

/** Parses a text/event-stream body into its `data:` JSON payloads. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (data) yield JSON.parse(data.slice(6));
    }
  }
}

const errorMessage = async (res: Response) => (await res.json().catch(() => null))?.message ?? `Erreur ${res.status}`;

const sparkle = <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />;

const Icon = ({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

// Compact Markdown for chat bubbles.
const md = {
  p: ({ children }: { children?: ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="mb-2 list-disc pl-5 marker:text-muted">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="mb-2 list-decimal pl-5 marker:text-muted">{children}</ol>,
  h1: ({ children }: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 font-display text-base font-bold text-ink first:mt-0">{children}</h3>,
  h2: ({ children }: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 font-display text-base font-bold text-ink first:mt-0">{children}</h3>,
  h3: ({ children }: { children?: ReactNode }) => <h4 className="mb-1 mt-2 font-semibold text-ink first:mt-0">{children}</h4>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-ink underline underline-offset-2">{children}</a>
  ),
  code: ({ className, children }: { className?: string; children?: ReactNode }) =>
    className?.includes("language-") ? (
      <pre className="my-2 overflow-x-auto rounded-[10px] bg-code px-3 py-2.5 text-[12px] leading-relaxed text-code-ink"><code className="font-mono">{children}</code></pre>
    ) : (
      <code className="rounded bg-chip px-1 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
    ),
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
  table: ({ children }: { children?: ReactNode }) => <div className="my-2 overflow-x-auto"><table className="text-[13px] [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1">{children}</table></div>,
};

/** Assistant chat with conversations, attachments and tool actions; used in the document panel and on /assistant. */
export const AiChat = ({ documentId, variant, onClose, onDocumentsChanged }: AiChatProps) => {
  const { isAdmin } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState<LiveReply | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // A conversation created by send() already shows its optimistic messages: don't reload it.
  const createdRef = useRef<number | null>(null);
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  const scope = documentId === null ? "none" : String(documentId);

  useEffect(() => {
    apiFetch("/api/ai/status").then((res) => (res.ok ? res.json() : null)).then(setStatus).catch(() => setStatus(null));
    apiFetch(`/api/ai/conversations?documentId=${scope}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ConversationSummary[]) => {
        setConversations(list);
        setActiveId(list[0]?.id ?? null);
      })
      .catch(console.error);
  }, [scope]);

  useEffect(() => {
    if (activeId === null) {
      setMessages([]);
      return;
    }
    if (createdRef.current === activeId) {
      createdRef.current = null;
      return;
    }
    apiFetch(`/api/ai/conversations/${activeId}`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => setMessages(data.messages))
      .catch(console.error);
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, live]);

  // Leaving the page cancels a running reply (the server then stops the model too).
  useEffect(() => () => abortRef.current?.abort(), []);

  const addFiles = (incoming: File[]) => {
    setError("");
    const next = [...files, ...incoming];
    const tooBig = incoming.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) return setError(`${tooBig.name} dépasse 10 Mo.`);
    if (next.length > MAX_FILES) return setError(`${MAX_FILES} fichiers maximum par message.`);
    setFiles(next);
  };

  const newConversation = () => {
    setActiveId(null);
    setError("");
    textareaRef.current?.focus();
  };

  const deleteConversation = async () => {
    if (activeId === null) return;
    const ok = await confirm({ title: "Supprimer cette conversation ?", message: "Les messages seront définitivement supprimés. Les pages modifiées par l’assistant ne changent pas." });
    if (!ok) return;
    const res = await apiFetch(`/api/ai/conversations/${activeId}`, { method: "DELETE" });
    if (!res.ok) return setError(await errorMessage(res));
    const rest = conversations.filter((c) => c.id !== activeId);
    setConversations(rest);
    setActiveId(rest[0]?.id ?? null);
  };

  const send = async (text = input) => {
    const content = text.trim();
    if ((!content && !files.length) || sending) return;
    setSending(true);
    setError("");
    const pending = files;
    // Optimistic bubble while the assistant works (tool loops can take a while).
    setMessages((list) => [...list, { id: -Date.now(), role: "user", text: content, attachments: pending.map((f) => f.name), actions: [] }]);
    setInput("");
    setFiles([]);
    try {
      let conversationId = activeId;
      if (conversationId === null) {
        const res = await apiFetch("/api/ai/conversations", { method: "POST", body: JSON.stringify({ documentId }) });
        if (!res.ok) throw new Error(await errorMessage(res));
        const created: ConversationSummary = await res.json();
        conversationId = created.id;
        setConversations((list) => [created, ...list]);
        createdRef.current = created.id;
        setActiveId(created.id);
      }
      const attachments = await Promise.all(pending.map(async (file) => ({ name: file.name, data: await readAsDataUrl(file) })));
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await apiFetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: content, attachments }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(await errorMessage(res));
      setConversations((list) =>
        list.map((c) => (c.id === conversationId && c.title === "Nouvelle conversation" && content ? { ...c, title: content.slice(0, 60) } : c)),
      );

      let reply: LiveReply = { text: "", actions: [], tool: null };
      setLive(reply);
      let afterTools = false;
      for await (const event of readEvents(res.body)) {
        if (event.type === "text") {
          // A new answer step after tool calls starts a new paragraph, like the saved message.
          const separator = afterTools && reply.text ? "\n\n" : "";
          afterTools = false;
          reply = { ...reply, text: reply.text + separator + event.text };
        } else if (event.type === "tool") {
          reply = { ...reply, tool: event.name };
        } else if (event.type === "action") {
          afterTools = true;
          reply = { ...reply, tool: null, actions: [...reply.actions, { summary: event.summary, ok: event.ok }] };
        } else {
          if (event.messages) setMessages(event.messages);
          if (event.changedDocumentIds?.length || event.treeChanged) notifyDocumentsChanged();
          if (event.changedDocumentIds?.length) onDocumentsChanged?.(event.changedDocumentIds);
          if (event.type === "error") setError(event.message);
          break;
        }
        setLive(reply);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Stopped by the user: reload what the server kept (the question, any finished tool steps).
        if (activeIdRef.current !== null) {
          apiFetch(`/api/ai/conversations/${activeIdRef.current}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setMessages(d.messages)).catch(() => {});
        }
      } else {
        setError(err instanceof Error ? err.message : "Erreur");
        setInput(content);
        setFiles(pending);
        setMessages((list) => list.filter((m) => m.id >= 0));
      }
    } finally {
      abortRef.current = null;
      setLive(null);
      setSending(false);
    }
  };

  const suggestions =
    documentId === null
      ? ["Quelles pages parlent de … ?", "Crée un planificateur qui suit le prix de … chaque jour", "Fais le point sur mes planificateurs et scrapers"]
      : ["Résume cette page", "Corrige l’orthographe de cette page", "Crée une sous-page avec un plan détaillé"];

  const notConfigured = status !== null && (!status.configured || !status.textModel);
  const modelLabel = status?.textModel?.split("/").pop();

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col ${variant === "page" ? "" : "bg-paper-warm"}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {confirmDialog}

      <div className={`flex flex-wrap items-center gap-2 border-b border-line-soft ${variant === "page" ? "py-3" : "px-4 py-3"}`}>
        {variant === "panel" && (
          <h2 className="mr-auto flex items-center gap-2.5 font-display text-[17px] font-bold text-ink">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-indigo text-white">
              <Icon className="h-[15px] w-[15px]">{sparkle}</Icon>
            </span>
            Assistant IA
          </h2>
        )}
        <label className={`flex min-w-0 items-center ${variant === "page" ? "mr-auto flex-1" : "order-last basis-full"}`}>
          <span className="sr-only">Conversation</span>
          <select
            value={activeId ?? ""}
            onChange={(e) => setActiveId(e.target.value ? Number(e.target.value) : null)}
            className="min-h-8 w-full max-w-md cursor-pointer truncate rounded-lg border border-line-strong bg-paper px-2 text-[13px] text-ink"
          >
            <option value="">Nouvelle conversation</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={newConversation} aria-label="Nouvelle conversation" title="Nouvelle conversation" className="icon-btn h-8 w-8 rounded-lg">
          <Icon><path d="M12 5v14M5 12h14" /></Icon>
        </button>
        {activeId !== null && (
          <button type="button" onClick={deleteConversation} aria-label="Supprimer la conversation" title="Supprimer la conversation" className="icon-btn h-8 w-8 rounded-lg hover:bg-danger-tint hover:text-danger-ink">
            <Icon><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Icon>
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer l’assistant" className="icon-btn h-8 w-8 rounded-lg">
            <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>
          </button>
        )}
      </div>

      <div className={`flex flex-1 flex-col gap-4 overflow-y-auto py-[18px] text-sm leading-[1.55] ${variant === "page" ? "" : "px-4"}`}>
        {notConfigured ? (
          <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center text-muted">
            <span className="font-semibold text-ink">L’assistant n’est pas configuré</span>
            {isAdmin ? (
              <span>
                Ajoutez une clé OpenRouter et choisissez un modèle dans{" "}
                <Link to="/settings" className="text-indigo-ink underline underline-offset-2">Paramètres</Link>.
              </span>
            ) : (
              <span>Demandez à un administrateur d’ajouter une clé OpenRouter.</span>
            )}
          </div>
        ) : messages.length === 0 && !sending ? (
          <div className="m-auto flex w-full max-w-sm flex-col gap-2">
            <span className="text-center text-muted">
              {documentId === null ? "L’assistant peut gérer toute l’app : pages, dossiers, scrapers, planificateurs…" : "L’assistant connaît cette page et peut la modifier, comme le reste de l’app."}
            </span>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setInput(s);
                  textareaRef.current?.focus();
                }}
                className="cursor-pointer rounded-xl border border-line-strong bg-paper px-3 py-2 text-left text-ink-2 transition hover:border-indigo hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
                {m.text && <div className="whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-ink px-3.5 py-2.5 text-white">{m.text}</div>}
                {m.attachments.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {m.attachments.map((name) => (
                      <span key={name} className="rounded-md bg-chip px-2 py-0.5 font-mono text-[11px] text-ink-2">{name}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key={m.id} className="flex max-w-[95%] flex-col gap-2 text-ink-2">
                {m.actions.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {m.actions.map((a, i) => (
                      <li key={i} className={`flex items-start gap-1.5 text-[12px] ${a.ok ? "text-muted" : "text-danger-ink"}`}>
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0">{a.ok ? <path d="m5 12 5 5 9-10" /> : <path d="M6 6l12 12M18 6 6 18" />}</Icon>
                        {a.summary}
                      </li>
                    ))}
                  </ul>
                )}
                {m.text && (
                  <div className="break-words">
                    <Markdown remarkPlugins={[remarkGfm]} components={md}>{m.text}</Markdown>
                  </div>
                )}
              </div>
            ),
          )
        )}
        {sending && (
          <div className="flex max-w-[95%] flex-col gap-2 text-ink-2" aria-live="polite">
            {live && live.actions.length > 0 && (
              <ul className="flex flex-col gap-1">
                {live.actions.map((a, i) => (
                  <li key={i} className={`flex items-start gap-1.5 text-[12px] ${a.ok ? "text-muted" : "text-danger-ink"}`}>
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0">{a.ok ? <path d="m5 12 5 5 9-10" /> : <path d="M6 6l12 12M18 6 6 18" />}</Icon>
                    {a.summary}
                  </li>
                ))}
              </ul>
            )}
            {live?.text ? (
              <div className="break-words">
                <Markdown remarkPlugins={[remarkGfm]} components={md}>{live.text}</Markdown>
              </div>
            ) : null}
            {(!live?.text || live.tool) && (
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <span aria-hidden="true" className="flex gap-[3px]">
                  <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-indigo" />
                  <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-indigo-light [animation-delay:150ms]" />
                  <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-indigo-soft [animation-delay:300ms]" />
                </span>
                {live?.tool ? `${TOOL_LABELS[live.tool] ?? live.tool}…` : "Réflexion…"}
              </span>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={`border-t border-line-soft ${variant === "page" ? "py-3" : "p-3"}`}>
        {error && <p role="alert" className="mb-2 rounded-[10px] bg-danger-tint px-3 py-2 text-[13px] text-danger-ink">{error}</p>}
        <div className="flex flex-col gap-2 rounded-[14px] border border-line-strong bg-paper px-3 pb-2 pt-2.5 focus-within:border-indigo">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="flex items-center gap-1 rounded-md bg-chip py-0.5 pl-2 pr-1 font-mono text-[11px] text-ink-2">
                  {file.name}
                  <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Retirer ${file.name}`} className="cursor-pointer rounded p-0.5 hover:bg-line-strong">
                    <Icon className="h-3 w-3"><path d="M6 6l12 12M18 6 6 18" /></Icon>
                  </button>
                </span>
              ))}
            </div>
          )}
          <label htmlFor={`ai-input-${scope}`} className="sr-only">Message</label>
          <textarea
            id={`ai-input-${scope}`}
            ref={textareaRef}
            rows={2}
            value={input}
            disabled={notConfigured}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files);
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            placeholder="Écrivez votre message… (Maj+Entrée pour aller à la ligne)"
            className="resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <input ref={fileInputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={notConfigured} aria-label="Joindre des fichiers" title="Joindre des images, PDF ou fichiers texte" className="icon-btn h-8 w-8 rounded-lg">
                <Icon><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></Icon>
              </button>
              {modelLabel && <span className="truncate font-mono text-[11px] text-muted" title={status?.textModel ?? ""}>{modelLabel}</span>}
            </div>
            {sending ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Arrêter la réponse"
                title="Arrêter"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-ink text-white transition hover:bg-ink-2"
              >
                <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={notConfigured || (!input.trim() && !files.length)}
                aria-label="Envoyer"
                className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-indigo text-white transition hover:bg-indigo-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon className="h-4 w-4"><path d="M12 19V5M5 12l7-7 7 7" /></Icon>
              </button>
            )}
          </div>
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo bg-indigo-tint/80 text-sm font-semibold text-indigo-ink">
          Déposez vos fichiers ici
        </div>
      )}
    </div>
  );
};
