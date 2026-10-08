import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import type { SubPage } from "../components/SubPageBlock";
import { notifyDocumentsChanged } from "../utils/documentEvents";
import { useDebouncedAction } from "./useDebounce";

export interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number | null;
  type: "TEXT" | "EXCEL" | "TODO";
  parentId: number | null;
  folderId: number | null;
  /** Folder path of the page's top-level ancestor, root first (GET only). */
  folders?: { id: number; name: string }[];
  /** Parent chain, root first (only on GET /api/documents/:id). */
  ancestors?: { id: number; title: string }[];
  children?: SubPage[];
}

/**
 * Loads a page and saves it: title / text / visibility state, autosave queue, optimistic
 * versioning (409 → conflict), failure banner, reload after an assistant change.
 */
export const useDocumentPersistence = (id: string | undefined) => {
  const [document, setDocument] = useState<Document | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  // Latest title / text / visibility, for async work (a /scrape) that ends after more edits.
  const latestRef = useRef({ title: "", text: "", isPublic: false });
  useEffect(() => {
    latestRef.current = { title, text, isPublic };
  }, [title, text, isPublic]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Bumped when the assistant edits this page to refetch it.
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped after each fetch: the to-do / spreadsheet editors only read their data on mount,
  // so they are remounted once the fresh content is in state.
  const [loadedVersion, setLoadedVersion] = useState(0);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        const response = await apiFetch(`/api/documents/${id}`);
        if (!response.ok) {
          throw new Error("Document non trouvé");
        }
        const data = await response.json();
        setDocument(data);
        versionRef.current = data.last_update;
        conflictRef.current = false;
        setConflict(false);
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

  const savedTitleRef = useRef<string | null>(null);
  // `last_update` the editor content is based on, sent with each save: the API refuses the
  // save (409) if the page changed meanwhile (assistant, other tab, other user).
  const versionRef = useRef<string | null>(null);
  // Saves run one after the other, so each one is based on the version the previous one returned.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  // While in conflict, autosaves stop and the user chooses which version to keep.
  const conflictRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  // Failed actions (save, sub-page, deletion) show a banner; the editor stays mounted with the text.
  const [actionError, setActionError] = useState<{ message: string; retrySave: boolean } | null>(null);

  const saveDocument = useCallback(
    (newTitle: string, newText: string, newIsPublic: boolean, overwrite = false) => {
      const run = async () => {
        if (conflictRef.current && !overwrite) return;
        setSaving(true);
        try {
          const response = await apiFetch(`/api/documents/${id}`, {
            method: "PUT",
            body: JSON.stringify({
              title: newTitle,
              text: newText,
              is_public: newIsPublic,
              ...(!overwrite && versionRef.current && { expectedLastUpdate: versionRef.current }),
            }),
          });
          if (response.status === 409) {
            conflictRef.current = true;
            setConflict(true);
            return;
          }
          if (!response.ok) {
            throw new Error("Erreur lors de la sauvegarde");
          }
          const data = await response.json();
          versionRef.current = data.last_update;
          conflictRef.current = false;
          setConflict(false);
          // PUT returns the bare row: keep the breadcrumb and sub-pages loaded by GET.
          setDocument((previous) => (previous ? { ...previous, ...data } : data));
          setActionError(null);
          if (newTitle !== savedTitleRef.current) {
            savedTitleRef.current = newTitle;
            notifyDocumentsChanged();
          }
        } catch {
          setActionError({ message: "L’enregistrement a échoué : vos modifications sont conservées ici, mais pas encore enregistrées.", retrySave: true });
        } finally {
          setSaving(false);
        }
      };
      const queued = saveQueueRef.current.then(run);
      saveQueueRef.current = queued;
      return queued;
    },
    [id],
  );

  const { run: debouncedSave, flush: flushSave, cancel: cancelSave } = useDebouncedAction(saveDocument, 1000);

  const handleTogglePublic = async () => {
    const newIsPublic = !isPublic;
    setIsPublic(newIsPublic);
    // A pending autosave still carries the old visibility: this save replaces it.
    cancelSave();
    await saveDocument(title, text, newIsPublic);
  };

  /** The assistant changed this page: save local edits first, then reload unless they conflict. */
  const handleExternalChange = () => {
    flushSave();
    void saveQueueRef.current.then(() => {
      if (!conflictRef.current) setReloadKey((n) => n + 1);
    });
  };

  const reloadSavedVersion = () => {
    cancelSave();
    void saveQueueRef.current.then(() => setReloadKey((n) => n + 1));
  };

  const keepMyVersion = () => {
    cancelSave();
    void saveDocument(title, text, isPublic, true);
  };

  return {
    document, setDocument, title, setTitle, text, setText, isPublic, setIsPublic, latestRef,
    loading, error, saving, loadedVersion, conflict, actionError, setActionError,
    saveDocument, debouncedSave, flushSave, cancelSave,
    handleTogglePublic, handleExternalChange, reloadSavedVersion, keepMyVersion,
  };
};
