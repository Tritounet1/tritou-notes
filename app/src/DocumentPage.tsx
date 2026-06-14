import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { apiFetch } from "./api";
import { slashCommands } from "./commands";
import { SchedulerBlock } from "./components/SchedulerBlock";
import { SpreadsheetEditor } from "./components/SpreadsheetEditor";
import { TodoEditor } from "./components/TodoEditor";
import { useAuth } from "./hooks/useAuth";
import { useDebounce } from "./hooks/useDebounce";
import { jsonToMarkdownTable, templateToMarkdown } from "./utils/jsonToMarkdown";

// ── Segment types for mixed text/scheduler documents ──────────────────────────
type TextSegment = { type: "text"; content: string };
type SchedulerSegment = { type: "scheduler"; id: number };
type Segment = TextSegment | SchedulerSegment;

const SCHEDULER_RE = /::scheduler\[(\d+)\]::/g;

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SCHEDULER_RE.lastIndex = 0;
  while ((m = SCHEDULER_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: "text", content: text.slice(last, m.index) });
    segments.push({ type: "scheduler", id: parseInt(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", content: text.slice(last) });
  return segments.length ? segments : [{ type: "text", content: text }];
}

// Ensures a text segment exists before/after every scheduler segment so there
// is always somewhere to type.
function normalizeSegments(segs: Segment[]): Segment[] {
  if (!segs.length) return [{ type: "text", content: "" }];
  const out: Segment[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (i === 0 && segs[i].type === "scheduler") out.push({ type: "text", content: "" });
    out.push(segs[i]);
    if (segs[i].type === "scheduler") {
      const next = segs[i + 1];
      if (!next || next.type === "scheduler") out.push({ type: "text", content: "" });
    }
  }
  return out;
}

function segmentsToText(segs: Segment[]): string {
  return segs.map(s => s.type === "text" ? s.content : `::scheduler[${s.id}]::`).join("");
}

function segmentGlobalOffset(segs: Segment[], upTo: number): number {
  let offset = 0;
  for (let i = 0; i < upTo; i++) {
    const s = segs[i];
    offset += s.type === "text" ? s.content.length : `::scheduler[${s.id}]::`.length;
  }
  return offset;
}

interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number;
  type: "TEXT" | "EXCEL" | "TODO";
}

interface HistoryEntry {
  id: number;
  title: string;
  text: string;
  public: boolean;
  created_at: string;
  documentId: number;
  authorId: number;
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
}

interface AIModel {
  type: string;
  id: string;
  display_name: string;
  created_at: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: number;
  message: string;
  response: string;
  model_id: string;
  documentId: number;
  authorId: number;
  created_at: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diff: DiffLine[] = [];

  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex];
    const newLine = newLines[newIndex];

    if (oldIndex >= oldLines.length) {
      diff.push({ type: "added", content: newLine });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      diff.push({ type: "removed", content: oldLine });
      oldIndex++;
    } else if (oldLine === newLine) {
      diff.push({ type: "unchanged", content: oldLine });
      oldIndex++;
      newIndex++;
    } else {
      const oldInNew = newLines.indexOf(oldLine, newIndex);
      const newInOld = oldLines.indexOf(newLine, oldIndex);

      if (oldInNew === -1 && newInOld === -1) {
        diff.push({ type: "removed", content: oldLine });
        diff.push({ type: "added", content: newLine });
        oldIndex++;
        newIndex++;
      } else if (
        oldInNew !== -1 &&
        (newInOld === -1 || oldInNew - newIndex <= newInOld - oldIndex)
      ) {
        while (newIndex < oldInNew) {
          diff.push({ type: "added", content: newLines[newIndex] });
          newIndex++;
        }
      } else {
        while (oldIndex < newInOld) {
          diff.push({ type: "removed", content: oldLines[oldIndex] });
          oldIndex++;
        }
      }
    }
  }

  return diff;
}

export const DocumentPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, hasPermission } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement | null>>(new Map());

  // Slash commands state
  const [showCommands, setShowCommands] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [commandStartPos, setCommandStartPos] = useState(0);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const commandMenuRef = useRef<HTMLDivElement>(null);

  // Scheduler modal state
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [schedulerList, setSchedulerList] = useState<{ id: number; title: string; status: string }[]>([]);
  const [schedulerListLoading, setSchedulerListLoading] = useState(false);
  const schedulerInsertRef = useRef<{ segIndex: number; cursorPos: number } | null>(null);

  // AI Chat state
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const aiTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Scrape modal state
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const scrapeInsertPosRef = useRef<number>(0);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await apiFetch(`/api/conversations/${id}`);
        if (response.ok) {
          const data: Conversation[] = await response.json();
          // Transform conversations into chat messages
          const messages: ChatMessage[] = [];
          data.forEach((conv) => {
            messages.push({ role: "user", content: conv.message });
            messages.push({ role: "assistant", content: conv.response });
          });
          setChatMessages(messages);
        }
      } catch (err) {
        console.error(err);
      }
    };

    const fetchDocument = async () => {
      try {
        const response = await apiFetch(`/api/documents/${id}`);
        if (!response.ok) {
          throw new Error("Document non trouvé");
        }
        const data = await response.json();
        setDocument(data);
        setTitle(data.title || "");
        setText(data.text || "");
        setIsPublic(data.public || false);
        // Fetch conversations after document is loaded
        fetchConversations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [id]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await apiFetch(`/api/document-histories/${id}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
        if (data.length > 0) {
          setSelectedVersion(data.length - 1);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    fetchHistory();
  };

  // AI Chat functions
  const fetchAiModels = async () => {
    try {
      const response = await apiFetch("/api/ai-client");
      if (response.ok) {
        const data = await response.json();
        setAiModels(data);
        if (data.length > 0 && !selectedModel) {
          setSelectedModel(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAiChat = () => {
    setShowAiChat(true);
    if (aiModels.length === 0) {
      fetchAiModels();
    }
  };

  const handleSendMessage = async () => {
    if (!aiInput.trim() || !selectedModel || aiLoading) return;

    const userMessage = aiInput.trim();

    // Replace @file with actual document content for AI
    const messageForAi = userMessage.replace(
      /@file/g,
      `[Document: ${title}]\n${text}\n[Fin du document]`,
    );

    setAiInput("");
    // Show the original message (with @file) to the user
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);
    setAiLoading(true);

    try {
      const response = await apiFetch("/api/ai-client", {
        method: "POST",
        body: JSON.stringify({
          model_id: selectedModel,
          message: messageForAi,
          document_id: document?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiResponse = data[0]?.text || "Pas de réponse";
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: aiResponse },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Erreur lors de la requête" },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erreur de connexion" },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-resize active segment textarea
  useEffect(() => {
    if (editingSegmentIndex !== null) {
      const el = textareaRefs.current.get(editingSegmentIndex);
      if (el) {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      }
    }
  }, [text, editingSegmentIndex]);

  // Mention system for @file
  const mentions = [
    {
      name: "file",
      description: "Insérer le contenu du document",
    },
  ];

  const filteredMentions = mentions.filter((m) =>
    m.name.toLowerCase().startsWith(mentionSearch.toLowerCase()),
  );

  const handleAiInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check for @ mention
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      // Cancel if space right after @
      if (textAfterAt.startsWith(" ")) {
        setShowMentions(false);
        setMentionSearch("");
      } else if (
        lastAtIndex === 0 ||
        newValue[lastAtIndex - 1] === " " ||
        newValue[lastAtIndex - 1] === "\n"
      ) {
        if (!/\s/.test(textAfterAt)) {
          setShowMentions(true);
          setMentionSearch(textAfterAt);
        } else {
          setShowMentions(false);
          setMentionSearch("");
        }
      } else {
        setShowMentions(false);
        setMentionSearch("");
      }
    } else {
      setShowMentions(false);
      setMentionSearch("");
    }

    setAiInput(newValue);

    // Auto-resize textarea
    if (aiTextareaRef.current) {
      aiTextareaRef.current.style.height = "auto";
      aiTextareaRef.current.style.height =
        Math.min(aiTextareaRef.current.scrollHeight, 150) + "px";
    }
  };

  const insertMention = (mentionName: string) => {
    const cursorPos = aiTextareaRef.current?.selectionStart || aiInput.length;
    const textBeforeCursor = aiInput.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) return;

    const beforeMention = aiInput.slice(0, lastAtIndex);
    const afterCursor = aiInput.slice(cursorPos);

    // Just insert the @mention tag, not the content
    const insertedText = `@${mentionName} `;

    const newText = beforeMention + insertedText + afterCursor;
    setAiInput(newText);
    setShowMentions(false);
    setMentionSearch("");

    setTimeout(() => {
      if (aiTextareaRef.current) {
        const newCursorPos = beforeMention.length + insertedText.length;
        aiTextareaRef.current.selectionStart = newCursorPos;
        aiTextareaRef.current.selectionEnd = newCursorPos;
        aiTextareaRef.current.focus();
      }
    }, 0);
  };

  // Check if message contains @file
  const hasFileMention = aiInput.includes("@file");

  const handleAiKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === "Enter" && filteredMentions.length > 0) {
        e.preventDefault();
        insertMention(filteredMentions[0].name);
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        setMentionSearch("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const saveDocument = useCallback(
    async (newTitle: string, newText: string, newIsPublic: boolean) => {
      setSaving(true);
      try {
        const response = await apiFetch(`/api/documents/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: newTitle,
            text: newText,
            is_public: newIsPublic,
          }),
        });
        if (!response.ok) {
          throw new Error("Erreur lors de la sauvegarde");
        }
        const data = await response.json();
        setDocument(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const debouncedSave = useDebounce(saveDocument, 1000);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    debouncedSave(newTitle, text, isPublic);
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
    debouncedSave(title, newText, isPublic);
  };

  const handleStartEditing = (segIndex: number) => {
    setEditingSegmentIndex(segIndex);
    setTimeout(() => {
      textareaRefs.current.get(segIndex)?.focus();
    }, 0);
  };

  const handleStopEditing = () => {
    if (!showCommands && !showSchedulerModal) {
      setEditingSegmentIndex(null);
    }
  };

  const fetchSchedulerList = async () => {
    setSchedulerListLoading(true);
    try {
      const res = await apiFetch("/api/scraping-schedulers");
      if (res.ok) setSchedulerList(await res.json());
    } catch { /* ignore */ } finally {
      setSchedulerListLoading(false);
    }
  };

  const handleSelectScheduler = (schedulerId: number) => {
    const ref = schedulerInsertRef.current;
    if (!ref) return;
    const segs = normalizeSegments(parseSegments(text));
    const activeSeg = segs[ref.segIndex];
    if (!activeSeg || activeSeg.type !== "text") return;

    const before = activeSeg.content.slice(0, ref.cursorPos);
    const after = activeSeg.content.slice(ref.cursorPos);
    const newSegs: Segment[] = [
      ...segs.slice(0, ref.segIndex),
      { type: "text", content: before },
      { type: "scheduler", id: schedulerId },
      { type: "text", content: after },
      ...segs.slice(ref.segIndex + 1),
    ];
    const newText = segmentsToText(newSegs);
    setText(newText);
    debouncedSave(title, newText, isPublic);
    setShowSchedulerModal(false);
    setEditingSegmentIndex(null);
    schedulerInsertRef.current = null;
  };

  const handleDeleteSegment = (segIndex: number) => {
    const segs = normalizeSegments(parseSegments(text));
    const newSegs = segs.filter((_, i) => i !== segIndex);
    const newText = segmentsToText(newSegs);
    handleTextChange(newText);
  };

  const SCRAPE_PLACEHOLDER = "\u23F3 Scraping en cours...";

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeLoading(true);
    setScrapeError("");

    // Insert placeholder at the saved cursor position
    const insertPos = scrapeInsertPosRef.current;
    const beforeInsert = text.slice(0, insertPos);
    const afterInsert = text.slice(insertPos);
    const textWithPlaceholder = beforeInsert + SCRAPE_PLACEHOLDER + afterInsert;
    setText(textWithPlaceholder);
    debouncedSave(title, textWithPlaceholder, isPublic);
    setShowScrapeModal(false);

    try {
      // Create the scrape instance
      const createResponse = await apiFetch("/api/instance-scrape", {
        method: "POST",
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });

      if (!createResponse.ok) {
        throw new Error("Erreur lors de la creation du scrape");
      }

      const instance = await createResponse.json();
      const instanceId = instance.id;

      // Poll for result
      const poll = async () => {
        const res = await apiFetch(`/api/instance-scrape/${instanceId}`);
        if (!res.ok) throw new Error("Erreur lors du polling");
        return res.json();
      };

      const pollInterval = setInterval(async () => {
        try {
          const data = await poll();

          if (data.status === "FINISHED") {
            clearInterval(pollInterval);
            const tmpl = data.scraper?.display_template;
            const markdown =
              tmpl && tmpl.length > 0
                ? templateToMarkdown(data.response, tmpl)
                : jsonToMarkdownTable(data.response);
            setText((current) => current.replace(SCRAPE_PLACEHOLDER, markdown));
            // Save after replacing placeholder
            setText((current) => {
              debouncedSave(title, current, isPublic);
              return current;
            });
            setScrapeLoading(false);
          } else if (data.status === "ERROR") {
            clearInterval(pollInterval);
            const errorMsg = `**Erreur de scraping** : impossible de scraper ${scrapeUrl}`;
            setText((current) => current.replace(SCRAPE_PLACEHOLDER, errorMsg));
            setText((current) => {
              debouncedSave(title, current, isPublic);
              return current;
            });
            setScrapeLoading(false);
          }
        } catch {
          clearInterval(pollInterval);
          setText((current) => current.replace(SCRAPE_PLACEHOLDER, "**Erreur** : le scraping a echoue"));
          setText((current) => {
            debouncedSave(title, current, isPublic);
            return current;
          });
          setScrapeLoading(false);
        }
      }, 3000);
    } catch {
      // Replace placeholder with error
      setText((current) => current.replace(SCRAPE_PLACEHOLDER, "**Erreur** : impossible de lancer le scraping"));
      setText((current) => {
        debouncedSave(title, current, isPublic);
        return current;
      });
      setScrapeLoading(false);
    }
  };

  // Filter commands based on search
  const filteredCommands = slashCommands.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(commandSearch.toLowerCase()),
  );

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [commandSearch]);

  const executeCommand = (commandIndex: number) => {
    const command = filteredCommands[commandIndex];
    if (!command || editingSegmentIndex === null) return;

    const segs = normalizeSegments(parseSegments(text));
    const activeSeg = segs[editingSegmentIndex];
    if (!activeSeg || activeSeg.type !== "text") return;

    const el = textareaRefs.current.get(editingSegmentIndex);
    const cursorPos = el?.selectionStart ?? activeSeg.content.length;
    const result = command.execute(activeSeg.content, cursorPos, commandStartPos);

    const newSegs = segs.map((s, i) =>
      i === editingSegmentIndex ? { type: "text" as const, content: result.newText } : s
    );
    const newText = segmentsToText(newSegs);
    setText(newText);
    debouncedSave(title, newText, isPublic);
    setShowCommands(false);
    setCommandSearch("");

    if (command.opensModal && command.name === "planificateur") {
      schedulerInsertRef.current = { segIndex: editingSegmentIndex, cursorPos: result.newCursorPosition };
      fetchSchedulerList();
      setShowSchedulerModal(true);
      return;
    }

    if (command.opensModal && command.name === "scrape") {
      const globalOffset = segmentGlobalOffset(segs, editingSegmentIndex);
      scrapeInsertPosRef.current = globalOffset + result.newCursorPosition;
      setScrapeUrl("");
      setScrapeError("");
      setShowScrapeModal(true);
      return;
    }

    setTimeout(() => {
      const activeEl = textareaRefs.current.get(editingSegmentIndex);
      if (activeEl) {
        activeEl.selectionStart = result.newCursorPosition;
        activeEl.selectionEnd = result.newCursorPosition;
        activeEl.focus();
      }
    }, 0);
  };

  const handleSegmentChange = (segIndex: number, newContent: string) => {
    const cursorPos = textareaRefs.current.get(segIndex)?.selectionStart ?? newContent.length;
    const textBeforeCursor = newContent.slice(0, cursorPos);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

    if (lastSlashIndex !== -1) {
      const textAfterSlash = textBeforeCursor.slice(lastSlashIndex + 1);
      if (textAfterSlash.startsWith(" ")) {
        setShowCommands(false);
        setCommandSearch("");
      } else if (
        lastSlashIndex === 0 ||
        newContent[lastSlashIndex - 1] === " " ||
        newContent[lastSlashIndex - 1] === "\n"
      ) {
        if (!/\s/.test(textAfterSlash)) {
          setShowCommands(true);
          setCommandSearch(textAfterSlash);
          setCommandStartPos(lastSlashIndex);
        } else {
          setShowCommands(false);
          setCommandSearch("");
        }
      } else {
        setShowCommands(false);
        setCommandSearch("");
      }
    } else {
      setShowCommands(false);
      setCommandSearch("");
    }

    const segs = normalizeSegments(parseSegments(text));
    const newSegs = segs.map((s, i) =>
      i === segIndex ? { type: "text" as const, content: newContent } : s
    );
    handleTextChange(segmentsToText(newSegs));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showCommands) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedCommandIndex((prev) =>
        prev < filteredCommands.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && filteredCommands.length > 0) {
      e.preventDefault();
      executeCommand(selectedCommandIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowCommands(false);
      setCommandSearch("");
    }
  };

  const handleTogglePublic = async () => {
    const newIsPublic = !isPublic;
    setIsPublic(newIsPublic);
    await saveDocument(title, text, newIsPublic);
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer ce document ?")) return;

    try {
      const response = await apiFetch(`/api/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Erreur lors de la suppression");
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const getDiff = () => {
    if (selectedVersion === null || history.length === 0) return [];

    const current = history[selectedVersion];
    const previous = selectedVersion > 0 ? history[selectedVersion - 1] : null;

    const oldText = previous?.text || "";
    const newText = current.text || "";

    return computeDiff(oldText, newText);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error || "Document non trouvé"}</p>
      </div>
    );
  }

  // Shared markdown component map (avoids duplication between view modes)
  const mdComponents = {
    input: ({ checked }: { checked?: boolean }) => (
      <input type="checkbox" checked={checked} readOnly className="mr-2 h-4 w-4 rounded border-gray-300 text-gray-800 focus:ring-gray-800" />
    ),
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-4 first:mt-0">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-2xl font-semibold text-gray-900 mt-5 mb-3">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-xl font-semibold text-gray-900 mt-4 mb-2">{children}</h3>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="text-gray-700 mb-4 leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside mb-4 text-gray-700 space-y-1">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside mb-4 text-gray-700 space-y-1">{children}</ol>,
    li: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <li className={`ml-2 ${className?.includes("task-list-item") ? "list-none flex items-center" : ""}`}>{children}</li>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-4">{children}</blockquote>
    ),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isBlock = className?.includes("language-");
      return isBlock ? (
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto my-4">
          <code className="text-sm font-mono">{children}</code>
        </pre>
      ) : (
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    hr: () => <hr className="my-6 border-gray-200" />,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-gray-900">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {isAuthenticated && (
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Retour
            </button>

            <div className="flex items-center gap-3">
              {saving && (
                <span className="text-xs text-gray-400">Sauvegarde...</span>
              )}
              {hasPermission("modifyDocument") ? (
                <button
                  onClick={handleTogglePublic}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    isPublic
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {isPublic ? "Public" : "Privé"}
                </button>
              ) : (
                <span
                  className={`px-3 py-1.5 text-sm rounded-md ${
                    isPublic
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {isPublic ? "Public" : "Privé"}
                </span>
              )}
              {hasPermission("deleteDocument") && (
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        )}

        <div className={`bg-white rounded-lg shadow-sm ${document.type === "EXCEL" || document.type === "TODO" ? "flex flex-col h-[calc(100vh-200px)]" : "p-8"}`}>
          <div className={document.type === "EXCEL" || document.type === "TODO" ? "px-6 py-4 border-b border-gray-100" : ""}>
            {isAuthenticated && hasPermission("modifyDocument") ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Titre du document"
                className={`w-full text-3xl font-bold text-gray-900 border-none outline-none placeholder-gray-300 ${document.type === "EXCEL" || document.type === "TODO" ? "" : "mb-6"}`}
              />
            ) : (
              <h1 className={`text-3xl font-bold text-gray-900 ${document.type === "EXCEL" || document.type === "TODO" ? "" : "mb-6"}`}>
                {title || "Sans titre"}
              </h1>
            )}
          </div>

          {document.type === "EXCEL" ? (
            <SpreadsheetEditor
              data={text}
              onChange={handleTextChange}
              readOnly={!isAuthenticated || !hasPermission("modifyDocument")}
            />
          ) : document.type === "TODO" ? (
            <TodoEditor
              data={text}
              onChange={handleTextChange}
              readOnly={!isAuthenticated || !hasPermission("modifyDocument")}
            />
          ) : (
            // TEXT document — segmented renderer (text + scheduler blocks)
            <div className="min-h-[60vh]">
              {(() => {
                const canEdit = isAuthenticated && hasPermission("modifyDocument");
                const segs = normalizeSegments(parseSegments(text));

                return segs.map((seg, segIndex) => {
                  if (seg.type === "scheduler") {
                    return (
                      <SchedulerBlock
                        key={`sched-${seg.id}-${segIndex}`}
                        schedulerId={seg.id}
                        onDelete={canEdit ? () => handleDeleteSegment(segIndex) : undefined}
                      />
                    );
                  }

                  const isEditingThis = canEdit && editingSegmentIndex === segIndex;
                  const isOnlySegment = segs.length === 1;

                  return (
                    <div key={`text-${segIndex}`}>
                      {isEditingThis ? (
                        <div className="relative">
                          <textarea
                            ref={el => { textareaRefs.current.set(segIndex, el); }}
                            value={seg.content}
                            onChange={e => handleSegmentChange(segIndex, e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleStopEditing}
                            placeholder={isOnlySegment
                              ? "Commencez à écrire en Markdown… (tapez / pour les commandes)"
                              : "Tapez ici… (/ pour les commandes)"}
                            className="w-full min-h-[50px] text-gray-700 border-none outline-none resize-none overflow-hidden placeholder-gray-300 leading-relaxed font-mono text-sm"
                          />
                          {showCommands && filteredCommands.length > 0 && (
                            <div
                              ref={commandMenuRef}
                              className="absolute left-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-64 z-50"
                            >
                              <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100 mb-1">
                                Commandes
                              </div>
                              {filteredCommands.map((cmd, index) => (
                                <button
                                  key={cmd.name}
                                  onMouseDown={e => { e.preventDefault(); executeCommand(index); }}
                                  className={`w-full px-3 py-2 text-left flex items-center gap-3 transition ${
                                    index === selectedCommandIndex ? "bg-gray-100" : "hover:bg-gray-50"
                                  }`}
                                >
                                  <span className="text-gray-400 font-mono text-sm">/{cmd.name}</span>
                                  <span className="text-gray-600 text-sm">{cmd.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={canEdit ? () => handleStartEditing(segIndex) : undefined}
                          className={`${canEdit ? "cursor-text" : ""} ${seg.content ? "prose prose-gray max-w-none" : "min-h-[40px]"}`}
                        >
                          {seg.content ? (
                            <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                              {seg.content}
                            </Markdown>
                          ) : canEdit ? (
                            <p className="text-gray-300 text-sm py-1">
                              {isOnlySegment ? "Cliquez pour écrire en Markdown…" : "Cliquez pour ajouter du texte…"}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-4">
          <p className="text-xs text-gray-400">
            Dernière modification :{" "}
            {new Date(document.last_update).toLocaleString("fr-FR")}
          </p>
          {isAuthenticated && (
            <button
              onClick={handleOpenHistory}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Historique
            </button>
          )}
        </div>
      </div>

      {/* AI Chat Toggle Button */}
      {isAuthenticated && hasPermission("useAiChatBot") && (
        <button
          onClick={handleOpenAiChat}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-gray-800 text-white p-3 rounded-l-lg shadow-lg hover:bg-gray-700 transition z-40"
          title="Ouvrir le chat IA"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* AI Chat Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-white shadow-xl transform transition-transform duration-300 z-50 ${
          showAiChat ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Assistant IA</h3>
            <button
              onClick={() => setShowAiChat(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Model Selector */}
          <div className="px-4 py-3 border-b border-gray-100">
            <label className="block text-xs text-gray-500 mb-1">Modèle</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800"
            >
              {aiModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 ? (
              <p className="text-gray-400 text-sm text-center mt-8">
                Posez une question à l'IA
              </p>
            ) : (
              chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                      msg.role === "user"
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {msg.role === "user"
                        ? msg.content.split(/(@file)/g).map((part, i) =>
                            part === "@file" ? (
                              <span
                                key={i}
                                className="bg-blue-500/30 text-blue-200 px-1 rounded font-mono"
                              >
                                @file
                              </span>
                            ) : (
                              part
                            ),
                          )
                        : msg.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg text-sm">
                  <span className="animate-pulse">Réflexion...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100">
            <div className="relative">
              {showMentions && filteredMentions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg py-2 w-full z-10">
                  <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100 mb-1">
                    Mentions
                  </div>
                  {filteredMentions.map((mention) => (
                    <button
                      key={mention.name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(mention.name);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-gray-50 transition"
                    >
                      <span className="text-gray-400 font-mono text-sm">
                        @{mention.name}
                      </span>
                      <span className="text-gray-600 text-sm">
                        {mention.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={aiTextareaRef}
                  value={aiInput}
                  onChange={handleAiInputChange}
                  onKeyDown={handleAiKeyDown}
                  placeholder="Écrivez votre message... (@file pour inclure le document)"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none min-h-[60px] max-h-[150px]"
                  disabled={aiLoading}
                  rows={1}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={aiLoading || !aiInput.trim()}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed h-10"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-400">
                  Shift+Enter pour nouvelle ligne
                </p>
                {hasFileMention && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Document inclus
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay when chat is open */}
      {showAiChat && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setShowAiChat(false)}
        />
      )}

      {/* Scheduler picker modal */}
      {showSchedulerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Lier un planificateur</h2>
              <button
                onClick={() => setShowSchedulerModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {schedulerListLoading ? (
              <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
            ) : schedulerList.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">Aucun planificateur disponible.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {schedulerList.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectScheduler(s.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">ID #{s.id}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === "ACTIVATE"
                        ? "bg-green-100 text-green-700"
                        : s.status === "RUNNING"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.status === "ACTIVATE" ? "Actif" : s.status === "RUNNING" ? "En cours" : "Inactif"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowSchedulerModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrape Modal */}
      {showScrapeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Scrape une URL
              </h2>
              <button
                onClick={() => setShowScrapeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <input
              type="url"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleScrape();
                }
              }}
              placeholder="https://example.com/page"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 mb-4"
              autoFocus
            />

            {scrapeError && (
              <p className="text-sm text-red-500 mb-4">{scrapeError}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowScrapeModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Annuler
              </button>
              <button
                onClick={handleScrape}
                disabled={!scrapeUrl.trim() || scrapeLoading}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Scraper
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Historique des modifications
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {historyLoading ? (
              <div className="p-8 text-center text-gray-500">Chargement...</div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Aucun historique disponible
              </div>
            ) : (
              <div className="flex flex-1 overflow-hidden">
                <div className="w-64 border-r border-gray-100 overflow-y-auto">
                  {history.map((entry, index) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedVersion(index)}
                      className={`w-full px-4 py-3 text-left border-b border-gray-50 transition ${
                        selectedVersion === index
                          ? "bg-gray-100"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {entry.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(entry.created_at).toLocaleString("fr-FR")}
                      </p>
                      {index === 0 && (
                        <span className="text-xs text-gray-400">
                          Version initiale
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {selectedVersion !== null && history[selectedVersion] && (
                    <div>
                      <div className="mb-4 flex items-center gap-4 text-sm">
                        <span className="text-gray-500">
                          {selectedVersion > 0
                            ? `Changements depuis la version précédente`
                            : "Version initiale"}
                        </span>
                        {history[selectedVersion].public !==
                          (selectedVersion > 0
                            ? history[selectedVersion - 1]?.public
                            : false) && (
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              history[selectedVersion].public
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {history[selectedVersion].public
                              ? "Rendu public"
                              : "Rendu privé"}
                          </span>
                        )}
                      </div>

                      {history[selectedVersion].title !==
                        (selectedVersion > 0
                          ? history[selectedVersion - 1]?.title
                          : "") && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500 mb-1">Titre</p>
                          {selectedVersion > 0 &&
                            history[selectedVersion - 1]?.title && (
                              <p className="text-sm text-red-600 line-through">
                                {history[selectedVersion - 1].title}
                              </p>
                            )}
                          <p className="text-sm text-green-600">
                            {history[selectedVersion].title}
                          </p>
                        </div>
                      )}

                      <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                        {getDiff().length === 0 ? (
                          <p className="text-gray-500">
                            Aucune modification du contenu
                          </p>
                        ) : (
                          getDiff().map((line, index) => (
                            <div
                              key={index}
                              className={`${
                                line.type === "added"
                                  ? "bg-green-900/30 text-green-400"
                                  : line.type === "removed"
                                    ? "bg-red-900/30 text-red-400"
                                    : "text-gray-400"
                              } px-2 py-0.5 -mx-2`}
                            >
                              <span className="select-none mr-2">
                                {line.type === "added"
                                  ? "+"
                                  : line.type === "removed"
                                    ? "-"
                                    : " "}
                              </span>
                              {line.content || " "}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
