import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { ScraperTemplateRenderer } from "./components/ScraperTemplateRenderer";
import { TemplateBlock } from "./types/scraper";

interface InstanceScrape {
  id: number;
  url: string;
  status: "IN_QUEUE" | "STARTING" | "WORKING" | "FINISHED" | "ERROR";
  response: Record<string, unknown> | null;
  created_at: string;
  last_update: string;
  scraper: {
    id: number;
    name: string;
    display_template: TemplateBlock[] | null;
  } | null;
}

const STATUS_CONFIG = {
  IN_QUEUE: { label: "En attente", color: "bg-gray-100 text-gray-700" },
  STARTING: { label: "Démarrage", color: "bg-blue-100 text-blue-700" },
  WORKING: { label: "En cours", color: "bg-yellow-100 text-yellow-700" },
  FINISHED: { label: "Terminé", color: "bg-green-100 text-green-700" },
  ERROR: { label: "Erreur", color: "bg-red-100 text-red-700" },
};

const PAGE_SIZES = [10, 25, 50, 100];

export const InstancesScrapePage = () => {
  const [instances, setInstances] = useState<InstanceScrape[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [renderedViews, setRenderedViews] = useState<Record<number, boolean>>({});
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchInstances = async () => {
    try {
      const response = await apiFetch("/api/instance-scrape");
      if (response.ok) {
        const data = await response.json();
        setInstances(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();

    // Refresh toutes les 5 secondes pour voir les mises à jour de status
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    setCreating(true);
    try {
      const response = await apiFetch("/api/instance-scrape", {
        method: "POST",
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        setInstances((prev) => [data, ...prev]);
        setNewUrl("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  // Tri des instances
  const sortedInstances = [...instances].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });

  // Pagination
  const totalPages = Math.ceil(sortedInstances.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedInstances = sortedInstances.slice(
    startIndex,
    startIndex + pageSize,
  );

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Formulaire de création */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Nouvelle instance
          </h2>
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/page-to-scrape"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800"
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
            >
              {creating ? "Lancement..." : "Lancer"}
            </button>
          </form>
        </div>

        {/* Liste des instances */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Historique ({instances.length})
            </h2>

            <button
              type="button"
              onClick={() =>
                setSortOrder(sortOrder === "desc" ? "asc" : "desc")
              }
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition"
            >
              <span>
                {sortOrder === "desc" ? "Plus récent" : "Plus ancien"}
              </span>
              <svg
                className={`w-4 h-4 transition-transform ${sortOrder === "asc" ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>

          {instances.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              Aucune instance de scrape pour le moment
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {paginatedInstances.map((instance) => {
                const isExpanded = expandedId === instance.id;
                return (
                  <div key={instance.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : instance.id)
                      }
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {instance.url}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Créé le{" "}
                          {new Date(instance.created_at).toLocaleString(
                            "fr-FR",
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 ml-4">
                        <span
                          className={`px-3 py-1 text-xs font-medium rounded-full ${
                            STATUS_CONFIG[instance.status].color
                          }`}
                        >
                          {STATUS_CONFIG[instance.status].label}
                        </span>

                        {(instance.status === "WORKING" ||
                          instance.status === "STARTING") && (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                        )}

                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                          {/* Toggle only when template exists and status is FINISHED */}
                          {instance.status === "FINISHED" && instance.scraper?.display_template && instance.scraper.display_template.length > 0 && (
                            <div className="flex items-center gap-2 mb-3">
                              <button
                                onClick={() => setRenderedViews((prev) => ({ ...prev, [instance.id]: false }))}
                                className={`px-3 py-1 text-xs rounded-md transition ${!renderedViews[instance.id] ? "bg-gray-800 text-white" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"}`}
                              >
                                JSON brut
                              </button>
                              <button
                                onClick={() => setRenderedViews((prev) => ({ ...prev, [instance.id]: true }))}
                                className={`px-3 py-1 text-xs rounded-md transition ${renderedViews[instance.id] ? "bg-gray-800 text-white" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"}`}
                              >
                                Vue structurée
                              </button>
                            </div>
                          )}

                          {renderedViews[instance.id] && instance.scraper?.display_template && instance.scraper.display_template.length > 0 ? (
                            <ScraperTemplateRenderer
                              data={instance.response as Record<string, unknown> | Record<string, unknown>[]}
                              template={instance.scraper.display_template}
                            />
                          ) : instance.response ? (
                            <pre className="text-sm bg-white border border-gray-200 text-gray-800 p-4 rounded-lg overflow-x-auto font-mono">
                              {JSON.stringify(instance.response, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-gray-500 italic">Aucune réponse disponible</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {instances.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Afficher</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-600">par page</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {startIndex + 1}-
                  {Math.min(startIndex + pageSize, instances.length)} sur{" "}
                  {instances.length}
                </span>

                <div className="flex items-center gap-1 ml-4">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
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
                  <span className="px-3 text-sm text-gray-700">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
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
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 5l7 7-7 7M5 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          La liste se rafraîchit automatiquement toutes les 5 secondes
        </p>
      </div>
    </div>
  );
};
