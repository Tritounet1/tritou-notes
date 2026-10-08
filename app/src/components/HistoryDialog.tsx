import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";
import { computeDiff } from "../utils/textDiff";
import { Dialog } from "./Dialog";

interface HistoryEntry {
  id: number;
  title: string;
  text: string;
  public: boolean;
  created_at: string;
  documentId: number;
  authorId: number | null;
}

const closeIcon = <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;

/** A page's versions, newest last, each compared with the one before it. */
export const HistoryDialog = ({ documentId, onClose }: { documentId: string; onClose: () => void }) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const response = await apiFetch(`/api/document-histories/${documentId}`);
      if (!response.ok) throw new Error(`history ${response.status}`);
      const data = await response.json();
      setHistory(data);
      if (data.length > 0) {
        setSelectedVersion(data.length - 1);
      }
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const getDiff = () => {
    if (selectedVersion === null || history.length === 0) return [];

    const current = history[selectedVersion];
    const previous = selectedVersion > 0 ? history[selectedVersion - 1] : null;

    const oldText = previous?.text || "";
    const newText = current.text || "";

    return computeDiff(oldText, newText);
  };

  return (
    <Dialog onClose={onClose} className="modal flex max-h-[85vh] max-w-4xl flex-col overflow-hidden" labelledBy="history-modal-title">
            <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
              <h2 id="history-modal-title" className="section-title">Historique des modifications</h2>
              <button type="button" onClick={onClose} aria-label="Fermer" className="icon-btn">
                {closeIcon}
              </button>
            </div>

            {historyLoading ? (
              <p className="p-8 text-center text-muted">Chargement…</p>
            ) : historyError ? (
              <p role="alert" className="p-8 text-center text-danger-ink">
                Impossible de charger l’historique.{" "}
                <button type="button" onClick={() => void fetchHistory()} className="cursor-pointer underline">Réessayer</button>
              </p>
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
                          <p className="text-code-faint">
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
                                    ? "bg-danger/15 text-danger-on-dark"
                                    : "text-code-faint"
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
    </Dialog>
  );
};
