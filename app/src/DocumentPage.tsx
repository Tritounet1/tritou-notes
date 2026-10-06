import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { AiChat } from "./components/AiChat";
import { AiImageModal } from "./components/AiImageModal";
import { ImageBlock } from "./components/ImageBlock";
import { ImageUploadModal } from "./components/ImageUploadModal";
import { insertImageBlocks, serializeDocumentImage, type DocumentImageBlock } from "./utils/documentImages";
import { apiFetch } from "./api";
import { slashCommands } from "./commands";
import { SchedulerBlock } from "./components/SchedulerBlock";
import { SubPageBlock, type SubPage } from "./components/SubPageBlock";
import { MovePageModal } from "./components/MovePageModal";
import { SpreadsheetEditor } from "./components/SpreadsheetEditor";
import { TodoEditor } from "./components/TodoEditor";
import { useAuth } from "./hooks/useAuth";
import { useDebounce } from "./hooks/useDebounce";
import { jsonToMarkdownTable, templateToMarkdown } from "./utils/jsonToMarkdown";
import { docTypeStyles } from "./utils/docTypes";
import { notifyDocumentsChanged } from "./utils/documentEvents";
import { caretTop, scrollParent, sourceOffsetFromPoint } from "./utils/caretFromClick";

import { CodeBlock } from "./components/CodeBlock";
import { WebLinkBlock } from "./components/WebLinkBlock";
import { insertPastedWebLink, webUrlOnLine, serializeWebLink, type WebLink } from "./utils/webLinks";
import { codeValue, convertStandaloneLinks, keepBlocksOnOwnLine, normalizeSegments, parseSegments, segmentGlobalOffset, segmentsToText, updateCodeSegment, type Segment } from "./utils/documentSegments";
import { useConfirm } from "./hooks/useConfirm";

interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number;
  type: "TEXT" | "EXCEL" | "TODO";
  parentId: number | null;
  /** Parent chain, root first (only on GET /api/documents/:id). */
  ancestors?: { id: number; title: string }[];
  children?: SubPage[];
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

const docTypeIcons = {
  TEXT: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  EXCEL: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>,
  TODO: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></>,
};

// Short glyphs shown in the slash command menu tiles.
const commandGlyphs: Record<string, string> = {
  page: "¶", image: "▣", "image-ia": "✦", planificateur: "↻", scrape: "↯", date: "31", time: "◷",
  divider: "—", code: "{}", quote: "“", list: "•", checkbox: "[ ]",
};

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
  const [confirm, confirmDialog] = useConfirm();
  const { isAuthenticated, hasPermission } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [focusCodeIndex, setFocusCodeIndex] = useState<number | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const imageInsertRef = useRef({ start: 0, end: 0, source: "" });
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showMoveModal, setShowMoveModal] = useState(false);

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

  const [showAiChat, setShowAiChat] = useState(false);
  const [showAiImageModal, setShowAiImageModal] = useState(false);
  // Bumped when the assistant edits this page to refetch it.
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped after each fetch: the to-do / spreadsheet editors only read their data on mount,
  // so they are remounted once the fresh content is in state.
  const [loadedVersion, setLoadedVersion] = useState(0);

  // Scrape modal state
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const scrapeInsertPosRef = useRef<number>(0);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        const response = await apiFetch(`/api/documents/${id}`);
        if (!response.ok) {
          throw new Error("Document non trouvé");
        }
        const data = await response.json();
        setDocument(data);
        savedTitleRef.current = data.title;
        setTitle(data.title || "");
        setText(data.text || "");
        setLoadedVersion((n) => n + 1);
        setIsPublic(data.public || false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [id, reloadKey]);

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


  const savedTitleRef = useRef<string | null>(null);

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
        // PUT returns the bare row: keep the breadcrumb and sub-pages loaded by GET.
        setDocument((previous) => (previous ? { ...previous, ...data } : data));
        if (newTitle !== savedTitleRef.current) {
          savedTitleRef.current = newTitle;
          notifyDocumentsChanged();
        }
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

  /**
   * Creates a sub-page and opens it. For text pages a `::page[id]::` block is
   * inserted on its own line at `offset` of `baseText`; the save goes through the
   * debounce so it replaces any pending one and is flushed when this page unmounts.
   */
  const createSubPage = async (offset: number | null, baseText: string) => {
    if (!document) return;
    try {
      const response = await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title: "Sans titre", type: "TEXT", parentId: document.id }),
      });
      if (!response.ok) throw new Error("Impossible de créer la sous-page");
      const child = await response.json();
      if (offset !== null && document.type === "TEXT") {
        const before = baseText.slice(0, offset);
        const after = baseText.slice(offset);
        const nextText = `${before}${before && !before.endsWith("\n") ? "\n" : ""}::page[${child.id}]::${after.startsWith("\n") ? "" : "\n"}${after}`;
        setText(nextText);
        debouncedSave(title, nextText, isPublic);
      }
      notifyDocumentsChanged();
      navigate(`/document/${child.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleMoved = (parentId: number | null, ancestors: { id: number; title: string }[]) => {
    setDocument((previous) => (previous ? { ...previous, parentId, ancestors } : previous));
    setShowMoveModal(false);
    notifyDocumentsChanged();
  };

  /**
   * Switches a text segment to its Markdown editor. `offset` places the caret where the
   * user clicked; `clickY` keeps that line under the pointer although the raw Markdown
   * is laid out differently from the rendered text.
   */
  const handleStartEditing = (segIndex: number, atEnd = false, { offset, clickY }: { offset?: number | null; clickY?: number } = {}) => {
    setEditingSegmentIndex(segIndex);
    setTimeout(() => {
      const textarea = textareaRefs.current.get(segIndex);
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      const position = offset ?? (atEnd ? textarea.value.length : null);
      if (position === null) return;
      textarea.setSelectionRange(position, position);
      if (clickY === undefined) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 24;
      const caretY = textarea.getBoundingClientRect().top + caretTop(textarea, position) + lineHeight / 2;
      scrollParent(textarea).scrollBy({ top: caretY - clickY });
    }, 0);
  };

  const handleDocumentBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || document?.type !== "TEXT" || !isAuthenticated || !hasPermission("modifyDocument")) return;
    const segs = normalizeSegments(parseSegments(text));
    handleStartEditing(segs.length - 1, true);
  };

  const handleStopEditing = () => {
    if (!showCommands && !showSchedulerModal && !showImageModal) {
      const converted = convertStandaloneLinks(text);
      if (converted.ids.length) {
        handleTextChange(converted.text);
        setPendingLinkId(converted.ids[0]);
      }
      setEditingSegmentIndex(null);
    }
  };

  const handleLinkPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>, segIndex: number) => {
    const textarea = event.currentTarget;
    const inserted = insertPastedWebLink(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.clipboardData.getData("text/plain"));
    if (!inserted) return;
    event.preventDefault();
    const segs = normalizeSegments(parseSegments(text));
    const offset = segmentGlobalOffset(segs, segIndex);
    const segment = segs[segIndex];
    if (!segment || segment.type !== "text") return;
    const end = offset + segment.content.length;
    const prefix = offset > 0 && text[offset - 1] !== "\n" ? "\n" : "";
    const suffix = end < text.length && text[end] !== "\n" && !inserted.text.endsWith("\n") ? "\n" : "";
    const updated = segs.map((segment, index) => index === segIndex ? { type: "text" as const, content: prefix + inserted.text + suffix } : segment);
    handleTextChange(segmentsToText(updated));
    setEditingSegmentIndex(null);
    setShowCommands(false);
    setPendingLinkId(inserted.data.id);
  };

  const openImageUpload = (files: File[] = [], start = text.length, end = start, source = text) => {
    if (!isAuthenticated || !hasPermission("modifyDocument") || document?.type !== "TEXT") return;
    imageInsertRef.current = { start, end, source };
    setImageFiles(files);
    setShowImageModal(true);
    setShowCommands(false);
    setEditingSegmentIndex(null);
  };

  const handleInsertImages = (images: DocumentImageBlock[]) => {
    const insertion = imageInsertRef.current;
    // Background scraping may have changed the text while uploading. Preserve it.
    const start = insertion.source === text ? insertion.start : text.length;
    const end = insertion.source === text ? insertion.end : text.length;
    const next = insertImageBlocks(text, start, end, images);
    const position = next.length - (text.length - end);
    imageInsertRef.current = { start: position, end: position, source: next };
    handleTextChange(next);
  };

  const handleImageChange = (data: DocumentImageBlock) => {
    const updated = parseSegments(text).map(segment => segment.type === "image" && segment.data.id === data.id
      ? { ...segment, data, source: serializeDocumentImage(data) } : segment);
    handleTextChange(segmentsToText(updated));
  };

  const handleWebLinkChange = (data: WebLink) => {
    setText(current => {
      const updated = parseSegments(current).map(segment => segment.type === "link" && segment.data.id === data.id
        ? { ...segment, data, source: serializeWebLink(data) } : segment);
      const newText = segmentsToText(updated);
      debouncedSave(title, newText, isPublic);
      return newText;
    });
    setPendingLinkId(null);
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
    cmd.name.toLowerCase().startsWith(commandSearch.toLowerCase()) &&
    (cmd.name !== "image-ia" || hasPermission("useAiChatBot")),
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

    if (command.name === "page") {
      setShowCommands(false);
      setCommandSearch("");
      setEditingSegmentIndex(null);
      void createSubPage(segmentGlobalOffset(segs, editingSegmentIndex) + result.newCursorPosition, newText);
      return;
    }

    setText(newText);
    debouncedSave(title, newText, isPublic);
    setShowCommands(false);
    setCommandSearch("");

    if (command.name === "image-ia") {
      const offset = segmentGlobalOffset(segs, editingSegmentIndex) + result.newCursorPosition;
      imageInsertRef.current = { start: offset, end: offset, source: newText };
      setEditingSegmentIndex(null);
      setShowAiImageModal(true);
      return;
    }

    if (command.name === "image") {
      const offset = segmentGlobalOffset(segs, editingSegmentIndex) + result.newCursorPosition;
      openImageUpload([], offset, offset, newText);
      return;
    }

    if (command.name === "code") {
      const insertedOffset = segmentGlobalOffset(segs, editingSegmentIndex) + commandStartPos;
      const nextSegments = normalizeSegments(parseSegments(newText));
      const codeIndex = nextSegments.findIndex((segment, index) =>
        segment.type === "code" && segmentGlobalOffset(nextSegments, index) >= insertedOffset,
      );
      setEditingSegmentIndex(null);
      setFocusCodeIndex(codeIndex >= 0 ? codeIndex : null);
      return;
    }

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
    // Keep code fences and link / image blocks on their own lines, without moving the caret.
    const content = keepBlocksOnOwnLine(newContent, segs[segIndex - 1], segs[segIndex + 1]);
    if (content !== newContent) {
      const caret = cursorPos + (content.startsWith("\n") && !newContent.startsWith("\n") ? 1 : 0);
      setTimeout(() => textareaRefs.current.get(segIndex)?.setSelectionRange(caret, caret), 0);
    }
    const newSegs = segs.map((s, i) =>
      i === segIndex ? { type: "text" as const, content } : s
    );
    handleTextChange(segmentsToText(newSegs));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showCommands) {
      if (e.key === "Enter" && webUrlOnLine(e.currentTarget.value, e.currentTarget.selectionStart)) {
        e.preventDefault();
        handleStopEditing();
      }
      return;
    }

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
    const subPages = document?.children?.length ?? 0;
    const ok = await confirm({
      title: subPages ? "Supprimer la page et ses sous-pages ?" : "Supprimer cette page ?",
      message: subPages ? (
        <>
          « {title || "Sans titre"} » et ses {subPages} sous-page{subPages > 1 ? "s" : ""} (ainsi que leurs propres sous-pages) seront supprimées avec leur historique. Cette action est définitive.
        </>
      ) : (
        <>« {title || "Sans titre"} » et son historique seront supprimés. Cette action est définitive.</>
      ),
    });
    if (!ok) return;

    try {
      const response = await apiFetch(`/api/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Erreur lors de la suppression");
      }
      notifyDocumentsChanged();
      navigate(document?.parentId ? `/document/${document.parentId}` : "/dashboard");
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
    return <p className="py-24 text-center text-muted">Chargement…</p>;
  }

  if (error || !document) {
    return <p className="py-24 text-center text-danger-ink">{error || "Document non trouvé"}</p>;
  }

  const typeStyle = docTypeStyles[document.type];
  const canModify = isAuthenticated && hasPermission("modifyDocument");
  const canUseAi = isAuthenticated && hasPermission("useAiChatBot");

  // Shared markdown component map (avoids duplication between view modes)
  const mdComponents = {
    input: ({ checked }: { checked?: boolean }) => (
      <span
        role="checkbox"
        aria-checked={!!checked}
        aria-readonly="true"
        data-checked={checked ? "true" : undefined}
        className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] ${checked ? "bg-ink text-neon" : "border-[1.5px] border-[#bdb9b0]"}`}
      >
        {checked && <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
      </span>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="font-display text-[32px] leading-tight font-bold tracking-[-0.03em] text-ink mt-8 mb-3 first:mt-0">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] text-ink mt-7 mb-3 first:mt-0">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink mt-6 mb-2 first:mt-0">{children}</h3>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="text-ink-2 mb-4">{children}</p>,
    ul: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <ul className={`mb-4 text-ink-2 flex flex-col gap-1.5 ${className?.includes("contains-task-list") ? "list-none" : "list-disc pl-6 marker:text-muted"}`}>{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-6 mb-4 text-ink-2 flex flex-col gap-1.5 marker:text-muted marker:font-mono marker:text-sm">{children}</ol>,
    li: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <li className={className?.includes("task-list-item") ? "flex items-center gap-2.5 has-[[data-checked]]:text-muted has-[[data-checked]]:line-through" : "pl-1"}>{children}</li>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="my-4 rounded-xl bg-paper-soft px-[18px] py-3.5 font-display text-xl leading-[1.4] font-medium text-ink [&_p]:mb-0 [&_p]:text-ink">{children}</blockquote>
    ),
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const isBlock = className?.includes("language-");
      return isBlock ? (
        <pre className="my-4 overflow-x-auto rounded-[14px] bg-code px-5 py-4 text-[#e6e4de]">
          <code className="font-mono text-[13px] leading-[1.7]">{children}</code>
        </pre>
      ) : (
        <code className="rounded-md bg-chip px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} className="text-indigo-ink underline decoration-indigo-soft underline-offset-4 hover:decoration-indigo" target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    hr: () => <hr className="my-6 border-line-soft" />,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-4 overflow-x-auto rounded-2xl border border-line-strong"><table className="w-full border-collapse text-[13px] leading-snug">{children}</table></div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => <th className="px-3.5 py-2 text-left text-xs font-medium text-muted">{children}</th>,
    td: ({ children }: { children?: React.ReactNode }) => <td className="border-t border-line-soft px-3.5 py-2 text-ink-2">{children}</td>,
  };

  const closeIcon = <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;
  const sparkle = <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />;

  return (
    <div className={`flex flex-wrap items-stretch xl:h-[calc(100vh-20px)] ${isAuthenticated ? "" : "paper m-2.5 min-h-[calc(100vh-20px)] overflow-hidden"}`}>
      {confirmDialog}
      {showMoveModal && (
        <MovePageModal documentId={document.id} currentParentId={document.parentId} onMoved={handleMoved} onClose={() => setShowMoveModal(false)} />
      )}
      {showAiImageModal && (
        <AiImageModal documentId={document.id} onInsert={handleInsertImages} onClose={() => setShowAiImageModal(false)} />
      )}
      {showImageModal && <ImageUploadModal key={document.id} documentId={document.id} initialFiles={imageFiles}
        onInsert={handleInsertImages} onClose={() => setShowImageModal(false)} />}

      <div className="min-w-0 flex-[999_1_540px] xl:h-full xl:overflow-y-auto">
        {isAuthenticated ? (
          <header className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 pl-5 pr-4">
            <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
              <Link to="/dashboard" className="shrink-0 hover:text-ink">Pages</Link>
              <span aria-hidden="true">/</span>
              {document.ancestors?.map((ancestor) => (
                <span key={ancestor.id} className="flex min-w-0 items-center gap-1.5">
                  <Link to={`/document/${ancestor.id}`} className="max-w-[160px] truncate hover:text-ink">{ancestor.title || "Sans titre"}</Link>
                  <span aria-hidden="true">/</span>
                </span>
              ))}
              <span className="truncate font-medium text-ink">{title || "Sans titre"}</span>
            </nav>
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              <span role="status" className="flex items-center gap-1.5 px-2 text-muted">
                {saving ? (
                  <><span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo" />Enregistrement…</>
                ) : (
                  <><svg aria-hidden="true" className="h-3.5 w-3.5 text-neon-dot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>Enregistré</>
                )}
              </span>
              {(() => {
                const content = (
                  <>
                    <svg aria-hidden="true" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      {isPublic
                        ? <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>
                        : <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>}
                    </svg>
                    {isPublic ? "Public" : "Privé"}
                  </>
                );
                const cls = `flex min-h-[34px] items-center gap-1.5 rounded-[9px] px-2.5 ${isPublic ? "bg-neon-tint text-neon-ink" : "text-ink-2"}`;
                return hasPermission("modifyDocument")
                  ? <button type="button" onClick={handleTogglePublic} title={isPublic ? "Rendre privé" : "Rendre public"} className={`${cls} cursor-pointer transition hover:bg-chip`}>{content}</button>
                  : <span className={cls}>{content}</span>;
              })()}
              {canModify && (
                <button type="button" onClick={() => setShowMoveModal(true)} aria-label="Déplacer la page" title="Déplacer la page" className="icon-btn h-[34px] w-[34px] rounded-[9px] text-ink-2">
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10 13h6M13 10l3 3-3 3" /></svg>
                </button>
              )}
              <button type="button" onClick={handleOpenHistory} aria-label="Historique des versions" title="Historique des versions" className="icon-btn h-[34px] w-[34px] rounded-[9px] text-ink-2">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
              </button>
              {hasPermission("deleteDocument") && (
                <button type="button" onClick={handleDelete} aria-label="Supprimer le document" title="Supprimer le document" className="icon-btn h-[34px] w-[34px] rounded-[9px] text-ink-2 hover:bg-danger-tint hover:text-danger-ink">
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                </button>
              )}
              {canUseAi && (
                <button
                  type="button"
                  onClick={() => setShowAiChat(!showAiChat)}
                  aria-pressed={showAiChat}
                  className={`flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-[9px] px-3 font-semibold transition ${showAiChat ? "bg-indigo text-white hover:bg-indigo-ink" : "border border-line-strong bg-paper text-ink hover:bg-paper-soft"}`}
                >
                  <svg aria-hidden="true" className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{sparkle}<path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
                  Assistant
                </button>
              )}
            </div>
          </header>
        ) : <div className="h-3" />}

        <div aria-hidden="true" className={`mx-3 h-[140px] rounded-[14px] sm:h-[180px] ${typeStyle.cover}`} />

        <div onClick={handleDocumentBackgroundClick} className="mx-auto flex max-w-[760px] flex-col gap-[18px] px-5 sm:px-10">
          <span aria-hidden="true" className="relative -mt-9 flex h-[72px] w-[72px] -rotate-6 items-center justify-center rounded-[20px] bg-ink text-neon shadow-[0_0_0_5px_var(--color-paper)]">
            <svg className="h-[34px] w-[34px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">{docTypeIcons[document.type]}</svg>
          </span>

          {canModify ? (
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Sans titre"
              aria-label="Titre du document"
              className="w-full bg-transparent font-display text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-ink outline-none placeholder:text-line-strong sm:text-[46px]"
            />
          ) : (
            <h1 className="font-display text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-ink sm:text-[46px]">
              {title || "Sans titre"}
            </h1>
          )}

          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm leading-relaxed">
            <dt className="text-muted">Type</dt>
            <dd><span className={`pill font-medium ${typeStyle.chip}`}>{typeStyle.label}</span></dd>
            <dt className="text-muted">Modifié</dt>
            <dd className="font-mono text-[13px] text-ink-2">{new Date(document.last_update).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</dd>
          </dl>

          <hr className="my-1 border-line-soft" />

          {document.type === "TODO" && (
            <div className="pb-20">
              <TodoEditor key={loadedVersion} data={text} onChange={handleTextChange} readOnly={!canModify} />
            </div>
          )}

          {document.type === "TEXT" && (
            // TEXT document — segmented renderer (text + scheduler blocks)
            <div onClick={handleDocumentBackgroundClick} className={`flex min-h-[50vh] flex-col pb-20 text-base leading-[1.7] text-ink-2 ${canModify ? "cursor-text" : ""}`}>
              {(() => {
                const canEdit = canModify;
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

                  if (seg.type === "page") {
                    return (
                      <SubPageBlock
                        key={`page-${seg.id}-${segIndex}`}
                        page={document.children?.find((child) => child.id === seg.id)}
                        onDelete={canEdit ? () => handleDeleteSegment(segIndex) : undefined}
                      />
                    );
                  }

                  if (seg.type === "image") {
                    return <ImageBlock key={seg.data.id} documentId={document.id} data={seg.data} readOnly={!canEdit}
                      onChange={handleImageChange} onDelete={canEdit ? () => handleDeleteSegment(segIndex) : undefined} />;
                  }

                  if (seg.type === "link") {
                    return <WebLinkBlock key={seg.data.id} data={seg.data} readOnly={!canEdit} initialOpen={pendingLinkId === seg.data.id}
                      onChange={handleWebLinkChange} onDelete={canEdit ? () => handleDeleteSegment(segIndex) : undefined} />;
                  }

                  if (seg.type === "code") {
                    return (
                      <CodeBlock
                        key={`code-${segIndex}`}
                        value={codeValue(seg)}
                        language={seg.language}
                        readOnly={!canEdit}
                        autoFocus={focusCodeIndex === segIndex}
                        onFocus={() => setFocusCodeIndex(null)}
                        onChange={canEdit ? (value, language) => {
                          const updated = segs.map((segment, index) => index === segIndex ? updateCodeSegment(seg, value, language) : segment);
                          handleTextChange(segmentsToText(updated));
                        } : undefined}
                        onDelete={canEdit ? () => handleDeleteSegment(segIndex) : undefined}
                      />
                    );
                  }

                  const isEditingThis = canEdit && editingSegmentIndex === segIndex;
                  const isOnlySegment = segs.length === 1;
                  const isLastSegment = segIndex === segs.length - 1;

                  return (
                    <div key={`text-${segIndex}`} className={isLastSegment ? "flex grow flex-col" : undefined}>
                      {isEditingThis ? (
                        <div className={`relative ${isLastSegment ? "flex grow flex-col" : ""}`}>
                          <textarea
                            ref={el => { textareaRefs.current.set(segIndex, el); }}
                            value={seg.content}
                            onChange={e => handleSegmentChange(segIndex, e.target.value)}
                            onPaste={event => handleLinkPaste(event, segIndex)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleStopEditing}
                            placeholder={isOnlySegment
                              ? "Commencez à écrire en Markdown… (tapez / pour les commandes)"
                              : "Tapez ici… (/ pour les commandes)"}
                            aria-label="Contenu du document"
                            className={`w-full min-h-[50px] resize-none overflow-hidden border-none bg-transparent font-mono text-sm leading-[1.7] text-ink outline-none placeholder:text-muted/60 caret-indigo ${isLastSegment ? "grow" : ""}`}
                          />
                          {showCommands && filteredCommands.length > 0 && (
                            <div
                              ref={commandMenuRef}
                              role="listbox"
                              aria-label="Commandes"
                              className="absolute left-0 top-8 z-50 w-80 max-w-full rounded-[14px] bg-paper p-1.5 leading-[1.3] shadow-[0_18px_50px_-12px_rgba(28,27,25,0.35),0_0_0_1px_var(--color-line-strong)]"
                            >
                              <p className="eyebrow px-2.5 pt-1.5 pb-1">Blocs</p>
                              <div className="max-h-80 overflow-y-auto">
                                {filteredCommands.map((cmd, index) => (
                                  <button
                                    key={cmd.name}
                                    type="button"
                                    role="option"
                                    aria-selected={index === selectedCommandIndex}
                                    onMouseDown={e => { e.preventDefault(); executeCommand(index); }}
                                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 py-1.5 text-left transition ${
                                      index === selectedCommandIndex ? "bg-indigo-tint" : "hover:bg-paper-soft"
                                    }`}
                                  >
                                    <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line bg-chip font-mono text-[13px] font-semibold text-ink-2">
                                      {commandGlyphs[cmd.name] ?? "/"}
                                    </span>
                                    <span className="flex min-w-0 flex-col gap-px">
                                      <span className="text-sm font-medium text-ink">/{cmd.name}</span>
                                      <span className="truncate text-xs text-muted">{cmd.description}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={canEdit ? event => {
                            // Let links open, and let a drag-selection stay a selection (to copy text).
                            if ((event.target as HTMLElement).closest("a")) return;
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
                            const onBackground = event.target === event.currentTarget;
                            handleStartEditing(segIndex, onBackground, {
                              offset: onBackground ? null : sourceOffsetFromPoint(event.currentTarget, event.clientX, event.clientY, seg.content),
                              clickY: event.clientY,
                            });
                          } : undefined}
                          tabIndex={canEdit ? 0 : undefined}
                          onKeyDown={canEdit ? event => {
                            if (event.target === event.currentTarget && event.key === "Enter") {
                              event.preventDefault();
                              handleStartEditing(segIndex, true);
                            }
                          } : undefined}
                          aria-label={canEdit ? "Modifier le texte du document" : undefined}
                          className={`rounded-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-soft ${canEdit ? "cursor-text" : ""} ${isLastSegment ? "grow" : ""} ${seg.content ? "" : "min-h-[40px]"}`}
                        >
                          {seg.content ? (
                            <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                              {seg.content}
                            </Markdown>
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

        {document.type === "EXCEL" && (
          <div className="mx-3 mb-3 mt-[18px] flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line-strong sm:mx-5">
            <SpreadsheetEditor key={loadedVersion} data={text} onChange={handleTextChange} readOnly={!canModify} />
          </div>
        )}

        {(() => {
          // Text pages show embedded sub-pages as blocks; list the others here.
          const embedded = new Set(document.type === "TEXT" ? parseSegments(text).flatMap((seg) => (seg.type === "page" ? [seg.id] : [])) : []);
          const loose = (document.children ?? []).filter((child) => !embedded.has(child.id));
          if (!loose.length) return null;
          return (
            <section aria-label="Sous-pages" className="mx-auto flex max-w-[760px] flex-col gap-1 px-5 pb-16 sm:px-10">
              <h2 className="eyebrow px-2 pb-1">Sous-pages</h2>
              {loose.map((child) => <SubPageBlock key={child.id} page={child} />)}
            </section>
          );
        })()}

        {/* Room to scroll past the end, like Notion; clicking it resumes writing at the end. */}
        {document.type === "TEXT" && (
          <div
            aria-hidden="true"
            onClick={canModify ? () => handleStartEditing(normalizeSegments(parseSegments(text)).length - 1, true) : undefined}
            className={`h-[45vh] ${canModify ? "cursor-text" : ""}`}
          />
        )}
      </div>

      {/* AI Chat Panel */}
      {canUseAi && showAiChat && (
        <aside aria-label="Assistant IA" className="flex min-h-[520px] min-w-0 flex-[1_1_340px] flex-col border-t border-line-soft bg-paper-warm xl:h-full xl:min-h-0 xl:border-t-0 xl:border-l">
          <AiChat
            documentId={document.id}
            variant="panel"
            onClose={() => setShowAiChat(false)}
            onDocumentsChanged={(ids) => ids.includes(document.id) && setReloadKey((n) => n + 1)}
          />
        </aside>
      )}

      {/* Scheduler picker modal */}
      {showSchedulerModal && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="scheduler-modal-title" className="modal max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="scheduler-modal-title" className="section-title">Lier un planificateur</h2>
              <button type="button" onClick={() => setShowSchedulerModal(false)} aria-label="Fermer" className="icon-btn">
                {closeIcon}
              </button>
            </div>

            {schedulerListLoading ? (
              <p className="py-6 text-center text-sm text-muted">Chargement…</p>
            ) : schedulerList.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Aucun planificateur disponible.</p>
            ) : (
              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {schedulerList.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectScheduler(s.id)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left transition hover:border-indigo-soft hover:bg-indigo-tint"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{s.title}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted">#{s.id}</span>
                    </span>
                    <span className={`pill shrink-0 ${
                      s.status === "ACTIVATE"
                        ? "bg-neon-tint text-neon-ink"
                        : s.status === "RUNNING"
                          ? "bg-indigo-tint text-indigo-ink"
                          : "bg-chip text-ink-2"
                    }`}>
                      {s.status === "ACTIVATE" ? "Actif" : s.status === "RUNNING" ? "En cours" : "Inactif"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setShowSchedulerModal(false)} className="btn-secondary">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrape Modal */}
      {showScrapeModal && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="scrape-modal-title" className="modal max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="scrape-modal-title" className="section-title">Scraper une URL</h2>
              <button type="button" onClick={() => setShowScrapeModal(false)} aria-label="Fermer" className="icon-btn">
                {closeIcon}
              </button>
            </div>

            <label className="label mb-4">
              URL
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
                className="input font-mono"
                autoFocus
              />
            </label>

            {scrapeError && (
              <p className="mb-4 text-sm text-danger-ink">{scrapeError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowScrapeModal(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="button" onClick={handleScrape} disabled={!scrapeUrl.trim() || scrapeLoading} className="btn-primary">
                Scraper
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="history-modal-title" className="modal flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
              <h2 id="history-modal-title" className="section-title">Historique des modifications</h2>
              <button type="button" onClick={() => setShowHistory(false)} aria-label="Fermer" className="icon-btn">
                {closeIcon}
              </button>
            </div>

            {historyLoading ? (
              <p className="p-8 text-center text-muted">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="p-8 text-center text-muted">Aucun historique disponible</p>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
                <div className="max-h-48 shrink-0 overflow-y-auto border-b border-line-soft bg-paper-warm p-2 sm:max-h-none sm:w-64 sm:border-r sm:border-b-0">
                  {history.map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedVersion(index)}
                      aria-pressed={selectedVersion === index}
                      className={`w-full cursor-pointer rounded-[10px] px-3 py-2.5 text-left transition ${
                        selectedVersion === index ? "bg-indigo-tint" : "hover:bg-chip"
                      }`}
                    >
                      <span className="block truncate text-sm font-medium text-ink">{entry.title}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted">
                        {new Date(entry.created_at).toLocaleString("fr-FR")}
                      </span>
                      {index === 0 && (
                        <span className="text-xs text-muted">Version initiale</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {selectedVersion !== null && history[selectedVersion] && (
                    <div>
                      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-muted">
                          {selectedVersion > 0
                            ? "Changements depuis la version précédente"
                            : "Version initiale"}
                        </span>
                        {history[selectedVersion].public !==
                          (selectedVersion > 0
                            ? history[selectedVersion - 1]?.public
                            : false) && (
                          <span
                            className={`pill ${
                              history[selectedVersion].public
                                ? "bg-neon-tint text-neon-ink"
                                : "bg-chip text-ink-2"
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
                        <div className="mb-4 rounded-xl bg-paper-soft p-3">
                          <p className="eyebrow mb-1">Titre</p>
                          {selectedVersion > 0 &&
                            history[selectedVersion - 1]?.title && (
                              <p className="text-sm text-danger-ink line-through">
                                {history[selectedVersion - 1].title}
                              </p>
                            )}
                          <p className="text-sm text-neon-ink">
                            {history[selectedVersion].title}
                          </p>
                        </div>
                      )}

                      <div className="overflow-x-auto rounded-[14px] bg-code px-4 py-3 font-mono text-[13px] leading-[1.7]">
                        {getDiff().length === 0 ? (
                          <p className="text-[#9c9a94]">
                            Aucune modification du contenu
                          </p>
                        ) : (
                          getDiff().map((line, index) => (
                            <div
                              key={index}
                              className={`${
                                line.type === "added"
                                  ? "bg-neon/10 text-neon"
                                  : line.type === "removed"
                                    ? "bg-danger/15 text-[#ff9c87]"
                                    : "text-[#9c9a94]"
                              } -mx-2 whitespace-pre-wrap px-2`}
                            >
                              <span className="mr-2 select-none">
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
