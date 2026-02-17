import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

interface ScrapingScheduler {
  id: number;
  title: string;
  description: string | null;
  cron_expression: string | null;
  status: "DESACTIVATE" | "RUNNING" | "ERROR" | "ACTIVATE";
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  update_at: string;
}

export const ScrapingSchedulersPage = () => {
  const navigate = useNavigate();
  const [schedulers, setSchedulers] = useState<ScrapingScheduler[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSchedulers();
  }, []);

  const fetchSchedulers = async () => {
    try {
      const response = await apiFetch("/api/scraping-schedulers");
      if (response.ok) {
        const data = await response.json();
        setSchedulers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setError("Le titre est requis");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const response = await apiFetch("/api/scraping-schedulers", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
        }),
      });

      if (response.ok) {
        const scheduler = await response.json();
        setShowModal(false);
        setNewTitle("");
        setNewDescription("");
        navigate(`/scraping-scheduler/${scheduler.id}`);
      } else {
        setError("Erreur lors de la creation");
      }
    } catch {
      setError("Erreur lors de la creation");
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVATE":
        return "Actif";
      case "RUNNING":
        return "En cours";
      case "ERROR":
        return "Erreur";
      case "DESACTIVATE":
      default:
        return "Desactive";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              Mes planificateurs
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-6">
                <p className="text-gray-500 text-sm text-center">
                  Chargement...
                </p>
              </div>
            ) : schedulers.length === 0 ? (
              <div className="p-6">
                <p className="text-gray-500 text-sm text-center py-8">
                  Aucun planificateur. Creez votre premier planificateur !
                </p>
              </div>
            ) : (
              schedulers.map((scheduler) => (
                <Link
                  key={scheduler.id}
                  to={`/scraping-scheduler/${scheduler.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {scheduler.title}
                    </p>
                    {scheduler.description && (
                      <p className="text-sm text-gray-500 truncate">
                        {scheduler.description}
                      </p>
                    )}
                    {scheduler.cron_expression && (
                      <p className="text-xs text-gray-400 mt-1 font-mono">
                        Cron: {scheduler.cron_expression}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${getStatusColor(
                        scheduler.status,
                      )}`}
                    >
                      {getStatusLabel(scheduler.status)}
                    </span>
                    {scheduler.next_run_at && (
                      <span className="text-xs text-gray-400">
                        Prochain:{" "}
                        {new Date(scheduler.next_run_at).toLocaleDateString(
                          "fr-FR",
                        )}
                      </span>
                    )}
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Bouton Nouveau planificateur */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full mt-4 py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 hover:bg-white transition-all flex items-center justify-center gap-2 group"
        >
          <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition">
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
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <span className="font-medium">Nouveau planificateur</span>
        </button>
      </div>

      {/* Modal de creation */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Nouveau planificateur
              </h2>
              <button
                onClick={() => setShowModal(false)}
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

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Titre
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800"
                  placeholder="Mon planificateur"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none"
                  rows={3}
                  placeholder="Description du planificateur..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-700 transition disabled:opacity-50"
                >
                  {creating ? "Creation..." : "Creer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
