import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";
import { LivePanel } from "./components/LivePanel";
import { docTypeStyles } from "./utils/docTypes";

interface Document {
  id: number;
  title: string;
  text: string | null;
  public: boolean;
  last_update: string;
  authorId: number;
  type: "TEXT" | "EXCEL" | "TODO";
  parentId: number | null;
}

type SortOption = "date" | "name";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
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

  const handleCreateDocument = async (type: "TEXT" | "EXCEL" | "TODO") => {
    setCreating(true);
    const titles = {
      TEXT: "Sans titre",
      EXCEL: "Nouveau tableur",
      TODO: "Ma liste de tâches",
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

  const titleById = new Map(documents.map((doc) => [doc.id, doc.title]));
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

  const recentDocuments = [...documents]
    .sort(
      (a, b) =>
        new Date(b.last_update).getTime() - new Date(a.last_update).getTime(),
    )
    .slice(0, 4);

  const now = new Date();
  const greeting = now.getHours() >= 18 || now.getHours() < 5 ? "Bonsoir" : "Bonjour";
  const dateLine = `${now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} · ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  const canCreate = hasPermission("createDocument");
  const canScrape = hasPermission("accessInstancesScrapersPage");

  const createCards = [
    {
      type: "TEXT" as const,
      desc: "Texte, markdown, blocs",
      icon: (
        <>
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </>
      ),
    },
    {
      type: "EXCEL" as const,
      desc: "Cellules, colonnes, export",
      icon: (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M3 15h18M9 4v16" />
        </>
      ),
    },
    {
      type: "TODO" as const,
      desc: "Cases à cocher, priorités",
      icon: (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="m8 12 3 3 5-6" />
        </>
      ),
    },
  ];

  return (
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-11">
      <section className="flex flex-col gap-2.5">
        <span className="font-mono text-xs tracking-[0.12em] text-muted uppercase">
          {dateLine}
        </span>
        <h1 className="font-display font-bold text-[44px] sm:text-[60px] leading-none tracking-[-0.035em] text-ink">
          {greeting}
          {user && (
            <>
              , <span className="highlight">{user.username}</span>
            </>
          )}
          .
        </h1>
      </section>

      {(canCreate || canScrape) && (
        <section
          aria-label="Créer"
          className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3"
        >
          {canCreate &&
            createCards.map((card) => (
              <button
                key={card.type}
                type="button"
                onClick={() => handleCreateDocument(card.type)}
                disabled={creating}
                className="card flex flex-col items-start gap-[18px] p-[18px] text-left cursor-pointer transition hover:border-line-strong hover:bg-paper-soft disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${docTypeStyles[card.type].chip}`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {card.icon}
                  </svg>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-[15px] text-ink">
                    {docTypeStyles[card.type].label}
                  </span>
                  <span className="text-[13px] text-muted">
                    {creating ? "Création…" : card.desc}
                  </span>
                </span>
              </button>
            ))}
          {canScrape && (
            <Link
              to="/instances"
              className="cover-ink flex flex-col items-start gap-[18px] p-[18px] rounded-2xl text-white transition hover:brightness-110"
            >
              <span className="w-10 h-10 rounded-xl bg-neon text-ink flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                </svg>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-[15px]">Scraper une URL</span>
                <span className="text-[13px] text-white/70">
                  Coller un lien, choisir un scraper
                </span>
              </span>
            </Link>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-8 items-start">
        <div className="flex-[999_1_520px] min-w-0 flex flex-col gap-10">
          {recentDocuments.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className="section-title">Récemment ouverts</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {recentDocuments.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/document/${doc.id}`}
                    className="flex flex-col rounded-[14px] border border-line overflow-hidden bg-paper text-ink transition hover:border-line-strong hover:-translate-y-0.5"
                  >
                    <span className={`h-[76px] ${docTypeStyles[doc.type].cover}`} />
                    <span className="px-3.5 pt-3 pb-3.5 flex flex-col gap-1.5">
                      <span className="font-semibold text-sm truncate">
                        {doc.title || "Sans titre"}
                      </span>
                      <span className="text-xs text-muted">
                        {docTypeStyles[doc.type].label} ·{" "}
                        <span className="font-mono">{formatDate(doc.last_update)}</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-title">Toutes les pages</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher une page…"
                    aria-label="Rechercher une page"
                    className="input min-h-9 pl-9 w-56"
                  />
                </div>
                <div role="group" aria-label="Trier par" className="segmented">
                  <button
                    type="button"
                    aria-pressed={sortBy === "date"}
                    onClick={() => setSortBy("date")}
                  >
                    Récents
                  </button>
                  <button
                    type="button"
                    aria-pressed={sortBy === "name"}
                    onClick={() => setSortBy("name")}
                  >
                    A → Z
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // TODO: Importer des documents
                    console.log("TODO: Import documents");
                  }}
                  className="icon-btn"
                  aria-label="Importer des documents"
                  title="Importer des documents"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 15V3M7 8l5-5 5 5M5 21h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // TODO: Exporter les documents
                    console.log("TODO: Export documents");
                  }}
                  className="icon-btn"
                  aria-label="Exporter les documents"
                  title="Exporter les documents"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                  </svg>
                </button>
              </div>
            </div>

            {loading ? (
              <p className="py-24 text-center text-muted">Chargement…</p>
            ) : filteredDocuments.length === 0 ? (
              <p className="py-16 text-center text-muted border border-dashed border-line-strong rounded-[14px]">
                {documents.length === 0
                  ? "Aucun document. Créez votre premier document !"
                  : "Aucun document trouvé."}
              </p>
            ) : (
              <div className="overflow-x-auto border border-line rounded-[14px]">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="px-4 py-2.5 text-xs font-medium text-muted border-b border-line">
                        Nom
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium text-muted border-b border-line">
                        Type
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium text-muted border-b border-line">
                        Visibilité
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium text-muted border-b border-line text-right">
                        Modifié
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((doc) => {
                      const style = docTypeStyles[doc.type];
                      return (
                        <tr
                          key={doc.id}
                          className="border-b border-line-soft last:border-b-0 hover:bg-paper-soft transition"
                        >
                          <td className="px-4 py-[11px]">
                            <Link
                              to={`/document/${doc.id}`}
                              className="flex items-center gap-2.5 font-medium text-ink"
                            >
                              <span className={`w-2 h-2 rounded-[3px] shrink-0 ${style.dot}`} />
                              <span className="truncate">{doc.title || "Sans titre"}</span>
                              {doc.parentId !== null && titleById.has(doc.parentId) && (
                                <span className="truncate text-xs font-normal text-muted">dans {titleById.get(doc.parentId) || "Sans titre"}</span>
                              )}
                            </Link>
                          </td>
                          <td className="px-4 py-[11px]">
                            <span className={`pill font-medium ${style.chip}`}>{style.label}</span>
                          </td>
                          <td className="px-4 py-[11px] text-ink-2">
                            {doc.public ? "Public" : "Privé"}
                          </td>
                          <td className="px-4 py-[11px] text-right font-mono text-xs text-muted">
                            {new Date(doc.last_update).toLocaleDateString("fr-FR")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <LivePanel />
      </div>
    </div>
  );
};
