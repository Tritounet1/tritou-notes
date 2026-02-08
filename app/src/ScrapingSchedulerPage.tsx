import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { useDebounce } from "./hooks/useDebounce";

interface InstanceScrape {
  id: number;
  url: string;
  response: Record<string, unknown> | null;
  status: "IN_QUEUE" | "STARTING" | "WORKING" | "FINISHED" | "ERROR";
  created_at: string;
  last_update: string;
}

interface InstanceScrapeHistory {
  id: number;
  url: string;
  response: Record<string, unknown>;
  status: "IN_QUEUE" | "STARTING" | "WORKING" | "FINISHED" | "ERROR";
  created_at: string;
}

interface ScrapingScheduler {
  id: number;
  title: string;
  description: string | null;
  cron_expression: string | null;
  start_at: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  status: "DESACTIVATE" | "RUNNING" | "ERROR" | "ACTIVATE";
  update_at: string;
  created_at: string;
  InstanceScrapes?: InstanceScrape[];
}

const CRON_PRESETS = [
  { label: "Toutes les heures", value: "0 * * * *" },
  { label: "Tous les jours a minuit", value: "0 0 * * *" },
  { label: "Tous les 2 jours", value: "0 0 */2 * *" },
  { label: "Toutes les semaines (lundi)", value: "0 0 * * 1" },
  { label: "Tous les mois (1er)", value: "0 0 1 * *" },
];

export const ScrapingSchedulerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scheduler, setScheduler] = useState<ScrapingScheduler | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [status, setStatus] =
    useState<ScrapingScheduler["status"]>("DESACTIVATE");
  const [newInstanceUrl, setNewInstanceUrl] = useState("");
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [selectedInstance, setSelectedInstance] =
    useState<InstanceScrape | null>(null);
  const [instanceHistory, setInstanceHistory] = useState<
    InstanceScrapeHistory[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const fetchScheduler = async () => {
      try {
        const response = await apiFetch(`/api/scraping-schedulers/${id}`);
        if (!response.ok) {
          throw new Error("Planificateur non trouve");
        }
        const data = await response.json();
        setScheduler(data);
        setTitle(data.title || "");
        setDescription(data.description || "");
        setCronExpression(data.cron_expression || "");
        setStatus(data.status || "DESACTIVATE");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
      }
    };

    fetchScheduler();
  }, [id]);

  const saveScheduler = useCallback(
    async (updates: Partial<ScrapingScheduler>) => {
      setSaving(true);
      try {
        const response = await apiFetch(`/api/scraping-schedulers/${id}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        if (response.ok) {
          const data = await response.json();
          setScheduler(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const debouncedSave = useDebounce(saveScheduler, 1000);

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case "title":
        setTitle(value);
        break;
      case "description":
        setDescription(value);
        break;
      case "cron_expression":
        setCronExpression(value);
        break;
      case "status":
        setStatus(value as ScrapingScheduler["status"]);
        break;
    }

    debouncedSave({
      title: field === "title" ? value : title,
      description: field === "description" ? value : description,
      cron_expression: field === "cron_expression" ? value : cronExpression,
      status:
        field === "status" ? (value as ScrapingScheduler["status"]) : status,
    });
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer ce planificateur ?")) return;

    try {
      const response = await apiFetch(`/api/scraping-schedulers/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        navigate("/scraping-schedulers");
      }
    } catch {
      setError("Erreur lors de la suppression");
    }
  };

  const refreshScheduler = async () => {
    try {
      const response = await apiFetch(`/api/scraping-schedulers/${id}`);
      if (response.ok) {
        const data = await response.json();
        setScheduler(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddInstance = async () => {
    if (!newInstanceUrl.trim()) return;

    setCreatingInstance(true);
    try {
      const response = await apiFetch("/api/instance-scrape", {
        method: "POST",
        body: JSON.stringify({
          url: newInstanceUrl.trim(),
          scrapingSchedulerId: id,
        }),
      });

      if (response.ok) {
        setNewInstanceUrl("");
        refreshScheduler();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingInstance(false);
    }
  };

  const handleDeleteInstance = async (instanceId: number) => {
    try {
      const response = await apiFetch(`/api/instance-scrape/${instanceId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        refreshScheduler();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenInstanceHistory = async (instance: InstanceScrape) => {
    setSelectedInstance(instance);
    setHistoryLoading(true);
    try {
      const response = await apiFetch(
        `/api/instance-scrape-histories/${instance.id}`,
      );
      if (response.ok) {
        const data = await response.json();
        setInstanceHistory(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCloseInstanceHistory = () => {
    setSelectedInstance(null);
    setInstanceHistory([]);
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case "ACTIVATE":
        return "bg-green-100 text-green-700";
      case "RUNNING":
        return "bg-blue-100 text-blue-700";
      case "ERROR":
        return "bg-red-100 text-red-700";
      case "DESACTIVATE":
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getInstanceStatusColor = (s: string) => {
    switch (s) {
      case "FINISHED":
        return "bg-green-100 text-green-700";
      case "WORKING":
      case "STARTING":
        return "bg-blue-100 text-blue-700";
      case "ERROR":
        return "bg-red-100 text-red-700";
      case "IN_QUEUE":
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getInstanceStatusLabel = (s: string) => {
    switch (s) {
      case "FINISHED":
        return "Termine";
      case "WORKING":
        return "En cours";
      case "STARTING":
        return "Demarrage";
      case "ERROR":
        return "Erreur";
      case "IN_QUEUE":
      default:
        return "En attente";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (error || !scheduler) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error || "Planificateur non trouve"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/scraping-schedulers")}
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
            {saving && (
              <span className="text-xs text-gray-400">Sauvegarde...</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => handleFieldChange("status", e.target.value)}
              className={`px-3 py-1.5 text-sm rounded-md border-0 ${getStatusColor(status)}`}
            >
              <option value="DESACTIVATE">Desactive</option>
              <option value="ACTIVATE">Actif</option>
            </select>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition"
            >
              Supprimer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Configuration */}
          <div className="col-span-2 space-y-6">
            {/* Infos de base */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Configuration
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titre
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleFieldChange("title", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) =>
                      handleFieldChange("description", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expression Cron
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cronExpression}
                      onChange={(e) =>
                        handleFieldChange("cron_expression", e.target.value)
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 font-mono"
                      placeholder="0 0 * * *"
                    />
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleFieldChange("cron_expression", e.target.value);
                        }
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm"
                      value=""
                    >
                      <option value="">Presets...</option>
                      {CRON_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Instances de scraping */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Instances de scraping
              </h2>

              {/* Ajouter une instance */}
              <div className="flex gap-2 mb-4">
                <input
                  type="url"
                  value={newInstanceUrl}
                  onChange={(e) => setNewInstanceUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddInstance();
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 font-mono text-sm"
                  placeholder="https://example.com/page-a-scraper"
                  disabled={creatingInstance}
                />
                <button
                  onClick={handleAddInstance}
                  disabled={creatingInstance || !newInstanceUrl.trim()}
                  className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition text-sm disabled:opacity-50"
                >
                  {creatingInstance ? "Ajout..." : "Ajouter"}
                </button>
              </div>

              {scheduler.InstanceScrapes &&
              scheduler.InstanceScrapes.length > 0 ? (
                <div className="space-y-2">
                  {scheduler.InstanceScrapes.map((instance) => (
                    <div
                      key={instance.id}
                      className="group flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                      onClick={() => handleOpenInstanceHistory(instance)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate font-mono">
                          {instance.url}
                        </p>
                        <p className="text-xs text-gray-500">
                          Mis a jour:{" "}
                          {new Date(instance.last_update).toLocaleString(
                            "fr-FR",
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-xs rounded ${getInstanceStatusColor(instance.status)}`}
                        >
                          {getInstanceStatusLabel(instance.status)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInstance(instance.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Supprimer"
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Aucune instance de scraping
                </p>
              )}
            </div>
          </div>

          {/* Informations */}
          <div className="col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Informations
              </h2>

              <div className="space-y-4">
                {scheduler.last_run_at && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Derniere execution
                    </p>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(scheduler.last_run_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                )}

                {scheduler.next_run_at && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Prochaine execution
                    </p>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(scheduler.next_run_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                )}

                {scheduler.start_at && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Date de debut
                    </p>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(scheduler.start_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Cree le
                  </p>
                  <p className="text-sm text-gray-900 mt-1">
                    {new Date(scheduler.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Derniere modification
                  </p>
                  <p className="text-sm text-gray-900 mt-1">
                    {new Date(scheduler.update_at).toLocaleString("fr-FR")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal historique instance */}
      {selectedInstance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Details de l'instance
                </h2>
                <p className="text-sm text-gray-500 font-mono truncate max-w-xl">
                  {selectedInstance.url}
                </p>
              </div>
              <button
                onClick={handleCloseInstanceHistory}
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

            <div className="flex-1 overflow-y-auto p-6">
              {/* Historique */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Historique ({instanceHistory.length})
                </h3>

                {historyLoading ? (
                  <p className="text-sm text-gray-500">Chargement...</p>
                ) : instanceHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    Aucun historique
                  </p>
                ) : (
                  <div className="space-y-4">
                    {[...instanceHistory]
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime(),
                      )
                      .map((history) => (
                        <div
                          key={history.id}
                          className="border border-gray-200 rounded-lg p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500">
                              {new Date(history.created_at).toLocaleString(
                                "fr-FR",
                              )}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs rounded ${getInstanceStatusColor(history.status)}`}
                            >
                              {getInstanceStatusLabel(history.status)}
                            </span>
                          </div>
                          <pre className="bg-gray-100 text-gray-800 rounded p-3 overflow-x-auto text-xs font-mono">
                            {JSON.stringify(history.response, null, 2)}
                          </pre>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
