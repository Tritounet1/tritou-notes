import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";

interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number;
}

type SortOption = "date" | "name";

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [search, setSearch] = useState("");

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

  const handleCreateDocument = async () => {
    setCreating(true);
    try {
      const response = await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({ title: "Sans titre" }),
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
    .filter((doc) =>
      doc.title.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.last_update).getTime() - new Date(a.last_update).getTime();
      }
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Bienvenue, {user?.username}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Documents</p>
            <p className="text-2xl font-semibold text-gray-900">
              {documents.length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Publics</p>
            <p className="text-2xl font-semibold text-gray-900">
              {documents.filter((d) => d.public).length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Privés</p>
            <p className="text-2xl font-semibold text-gray-900">
              {documents.filter((d) => !d.public).length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Mes documents</h2>
              <button
                onClick={handleCreateDocument}
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
                  <p className="font-medium text-gray-900 truncate flex-1 min-w-0">
                    {doc.title || "Sans titre"}
                  </p>
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
    </div>
  );
};
