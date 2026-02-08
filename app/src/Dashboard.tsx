import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";

interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number;
  type: "TEXT" | "EXCEL" | "TODO";
}

type SortOption = "date" | "name";

export const Dashboard = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [search, setSearch] = useState("");
  const [showNewDocModal, setShowNewDocModal] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await apiFetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async (type: "TEXT" | "EXCEL" | "TODO") => {
    setCreating(true);
    setShowNewDocModal(false);
    const titles = {
      TEXT: "Sans titre",
      EXCEL: "Nouveau tableur",
      TODO: "Ma liste de taches",
    };
    try {
      const response = await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          title: titles[type],
          type,
        }),
      });
      if (response.ok) {
        const newDoc = await response.json();
        navigate(`/document/${newDoc.id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const filteredDocuments = documents
    .filter((doc) => doc.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "date") {
        return (
          new Date(b.last_update).getTime() - new Date(a.last_update).getTime()
        );
      }
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Mes documents
              </h2>
              <button
                onClick={() => setShowNewDocModal(true)}
                disabled={creating}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-700 transition disabled:opacity-50"
              >
                {creating ? "Création..." : "+ Nouveau document"}
              </button>
            </div>

            <div className="flex items-center gap-6">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un document..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Trier par :</span>
                <button
                  onClick={() => setSortBy("date")}
                  className={`px-3 py-1.5 rounded-md transition ${
                    sortBy === "date"
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Date
                </button>
                <button
                  onClick={() => setSortBy("name")}
                  className={`px-3 py-1.5 rounded-md transition ${
                    sortBy === "name"
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Nom
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-6">
                <p className="text-gray-500 text-sm text-center">
                  Chargement...
                </p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-6">
                <p className="text-gray-500 text-sm text-center py-8">
                  {documents.length === 0
                    ? "Aucun document. Créez votre premier document !"
                    : "Aucun document trouvé."}
                </p>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <Link
                  key={doc.id}
                  to={`/document/${doc.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {doc.type === "EXCEL" ? (
                      <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center shrink-0">
                        <svg
                          className="w-5 h-5 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    ) : doc.type === "TODO" ? (
                      <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center shrink-0">
                        <svg
                          className="w-5 h-5 text-purple-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center shrink-0">
                        <svg
                          className="w-5 h-5 text-blue-600"
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
                      </div>
                    )}
                    <p className="font-medium text-gray-900 truncate">
                      {doc.title || "Sans titre"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        doc.public
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {doc.public ? "Public" : "Privé"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(doc.last_update).toLocaleDateString("fr-FR")}
                    </span>
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
      </div>

      {/* Modal nouveau document */}
      {showNewDocModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                Nouveau document
              </h3>
              <button
                onClick={() => setShowNewDocModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg
                  className="w-6 h-6"
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

            <div className="p-6">
              <p className="text-gray-500 mb-6 text-center">
                Choisissez le type de document à créer
              </p>

              <div className="grid grid-cols-3 gap-4">
                {/* Document Texte */}
                <button
                  onClick={() => handleCreateDocument("TEXT")}
                  className="group p-5 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left"
                >
                  <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-blue-200 transition">
                    <svg
                      className="w-7 h-7 text-blue-600"
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
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 mb-1">
                    Document Texte
                  </h4>
                  <p className="text-xs text-gray-500">
                    Markdown, commandes slash et chat IA.
                  </p>
                </button>

                {/* Document Excel */}
                <button
                  onClick={() => handleCreateDocument("EXCEL")}
                  className="group p-5 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50/50 transition-all text-left"
                >
                  <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-green-200 transition">
                    <svg
                      className="w-7 h-7 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 mb-1">
                    Tableur Excel
                  </h4>
                  <p className="text-xs text-gray-500">
                    Cellules, formules et donnees.
                  </p>
                </button>

                {/* Liste TODO */}
                <button
                  onClick={() => handleCreateDocument("TODO")}
                  className="group p-5 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50/50 transition-all text-left"
                >
                  <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-purple-200 transition">
                    <svg
                      className="w-7 h-7 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      />
                    </svg>
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 mb-1">
                    Liste TODO
                  </h4>
                  <p className="text-xs text-gray-500">
                    Gerez vos taches facilement.
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
