import { useEffect, useState } from "react";
import { Dialog } from "./components/Dialog";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";
import type { TemplateBlock } from "./types/scraper";

interface Scraper {
  id: number;
  name: string;
  description: string | null;
  status: string;
  last_update: string;
  code?: string | null;
  display_template?: TemplateBlock[] | null;
}

type Filter = "all" | "active" | "disabled";

const FILTERS: [Filter, string][] = [
  ["all", "Tous"],
  ["active", "Actifs"],
  ["disabled", "Désactivés"],
];

const Icon = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

export const ScrapersPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetchScrapers();
  }, []);

  const fetchScrapers = async () => {
    try {
      const response = await apiFetch("/api/scrapers");
      if (response.ok) {
        const data = await response.json();
        setScrapers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError("Le nom est requis");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const response = await apiFetch("/api/scrapers", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          description: newDescription,
        }),
      });

      if (response.ok) {
        const scraper = await response.json();
        setShowModal(false);
        setNewName("");
        setNewDescription("");
        navigate(`/scraper/${scraper.id}`);
      } else {
        setError("Erreur lors de la création");
      }
    } catch {
      setError("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const canModify = hasPermission("modifyScraper");
  const query = search.trim().toLowerCase();
  const shown = scrapers.filter((s) => {
    if (filter === "active" && s.status !== "ACTIVE") return false;
    if (filter === "disabled" && s.status === "ACTIVE") return false;
    return (
      !query ||
      s.name.toLowerCase().includes(query) ||
      (s.description ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2.5">
          <span className="w-12 h-12 rounded-[14px] bg-ink text-neon flex items-center justify-center -rotate-6">
            <Icon className="w-6 h-6" d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" />
          </span>
          <h1 className="page-title">Scrapers</h1>
          <p className="text-[15px] text-ink-2">
            Le code qui transforme une page web en données propres.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canModify && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="btn-primary"
            >
              <Icon d="M12 5v14M5 12h14" />
              Nouveau scraper
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex-[1_1_260px] flex items-center gap-2.5 min-h-10 px-3 rounded-[11px] border border-line-strong bg-paper-soft text-muted focus-within:border-indigo focus-within:ring-4 focus-within:ring-indigo-tint transition">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">Rechercher un scraper</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un scraper…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink placeholder:text-muted"
          />
        </label>
        <div className="segmented" role="group" aria-label="Filtrer par statut">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-24 text-center text-muted">Chargement…</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
          {shown.map((scraper) => {
            const active = scraper.status === "ACTIVE";
            const preview = (scraper.code ?? "")
              .split("\n")
              .filter((l) => l.trim())
              .slice(0, 3)
              .join("\n");
            const fields = (scraper.display_template ?? [])
              .map((b) => b.field)
              .filter(Boolean);
            return (
              <article
                key={scraper.id}
                className="card flex flex-col overflow-hidden hover:border-line-strong hover:shadow-[0_8px_24px_-16px_rgba(28,27,25,0.3)] transition"
              >
                <div className="px-4 pt-4 pb-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={`/scraper/${scraper.id}`}
                      className="font-semibold text-base text-ink hover:text-indigo-ink truncate"
                    >
                      {scraper.name}
                    </Link>
                    <span
                      className={`pill shrink-0 ${
                        active
                          ? "bg-neon-tint text-neon-ink"
                          : "bg-chip text-ink-2"
                      }`}
                    >
                      {active ? "Actif" : "Désactivé"}
                    </span>
                  </div>
                  {scraper.description && (
                    <p className="text-[13px] text-muted leading-snug line-clamp-2">
                      {scraper.description}
                    </p>
                  )}
                </div>
                {preview && (
                  <pre className="mx-3 px-3.5 py-3 rounded-[10px] bg-code text-code-ink font-mono text-[11.5px] leading-relaxed overflow-hidden whitespace-pre">
                    {preview}
                  </pre>
                )}
                <div className="mt-auto px-4 pt-3 pb-3.5 flex flex-wrap items-center gap-1.5">
                  {fields.map((f, i) => (
                    <span
                      key={`${f}-${i}`}
                      className="font-mono text-[11px] px-[7px] py-[3px] rounded-md bg-chip text-ink-2"
                    >
                      {f}
                    </span>
                  ))}
                  <span className="flex-1" />
                  <span className="font-mono text-[11px] text-muted">
                    {new Date(scraper.last_update).toLocaleDateString("fr-FR")}
                  </span>
                  <Link
                    to={`/scraper/${scraper.id}`}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-tint text-indigo-ink hover:bg-indigo-soft transition"
                  >
                    Ouvrir
                    <Icon className="w-3 h-3" d="M5 12h14M13 6l6 6-6 6" />
                  </Link>
                </div>
              </article>
            );
          })}

          {canModify && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="min-h-[220px] rounded-2xl border-[1.5px] border-dashed border-stone-line bg-paper-warm text-ink-2 flex flex-col items-center justify-center gap-2.5 hover:border-muted hover:bg-paper-soft transition cursor-pointer"
            >
              <span className="w-10 h-10 rounded-full bg-paper border border-line-strong flex items-center justify-center">
                <Icon className="w-[18px] h-[18px]" d="M12 5v14M5 12h14" />
              </span>
              <span className="font-semibold">Nouveau scraper</span>
              <span className="text-[13px] text-muted">
                Écrire le code, définir le rendu
              </span>
            </button>
          )}

          {shown.length === 0 && !canModify && (
            <p className="col-span-full py-24 text-center text-muted">
              {scrapers.length === 0
                ? "Aucun scraper pour le moment."
                : "Aucun scraper ne correspond à votre recherche."}
            </p>
          )}
        </div>
      )}

      {/* Modal de création */}
      {showModal && (
        <Dialog onClose={() => setShowModal(false)} className="modal max-w-md" label="Nouveau scraper">
            <div className="px-6 pt-5 pb-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="section-title">Nouveau scraper</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="icon-btn"
                aria-label="Fermer"
              >
                <Icon className="w-5 h-5" d="M6 18 18 6M6 6l12 12" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4">
              {error && (
                <div className="p-3 rounded-[10px] bg-danger-tint text-danger-ink text-sm">
                  {error}
                </div>
              )}

              <label className="label">
                Nom
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input"
                  placeholder="Mon scraper"
                />
              </label>

              <label className="label">
                Description
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="input py-2 resize-none"
                  rows={3}
                  placeholder="Description du scraper…"
                />
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary flex-1"
                >
                  {creating ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
};
