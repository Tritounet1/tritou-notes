import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { useDebounce } from "./hooks/useDebounce";

interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number;
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
      } else if (oldInNew !== -1 && (newInOld === -1 || oldInNew - newIndex <= newInOld - oldIndex)) {
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

  useEffect(() => {
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
    [id]
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
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
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition"
            >
              Supprimer
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Titre du document"
            className="w-full text-3xl font-bold text-gray-900 border-none outline-none placeholder-gray-300 mb-6"
          />

          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Commencez à écrire..."
            className="w-full min-h-[60vh] text-gray-700 border-none outline-none resize-none placeholder-gray-300 leading-relaxed"
          />
        </div>

        <div className="mt-4 flex items-center justify-end gap-4">
          <p className="text-xs text-gray-400">
            Dernière modification :{" "}
            {new Date(document.last_update).toLocaleString("fr-FR")}
          </p>
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
        </div>
      </div>

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
                        {history[selectedVersion].public !== (selectedVersion > 0 ? history[selectedVersion - 1]?.public : false) && (
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
                          <p className="text-gray-500">Aucune modification du contenu</p>
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
