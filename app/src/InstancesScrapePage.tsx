import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { ScraperTemplateRenderer } from "./components/ScraperTemplateRenderer";
import type { TemplateBlock } from "./types/scraper";

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
  IN_QUEUE: { label: "En file", pill: "bg-chip text-ink-2", dot: "bg-muted" },
  STARTING: { label: "Démarrage", pill: "bg-indigo-tint text-indigo-ink", dot: "bg-indigo animate-pulse" },
  WORKING: { label: "En cours", pill: "bg-indigo-tint text-indigo-ink", dot: "bg-indigo animate-pulse" },
  FINISHED: { label: "Terminé", pill: "bg-neon-tint text-neon-ink", dot: "bg-neon-dot" },
  ERROR: { label: "Erreur", pill: "bg-danger-tint text-danger-ink", dot: "bg-danger" },
};

const StatusPill = ({ status }: { status: InstanceScrape["status"] }) => (
  <span className={`pill ${STATUS_CONFIG[status].pill}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[status].dot}`} />
    {STATUS_CONFIG[status].label}
  </span>
);

const Icon = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

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

  const expanded = instances.find((i) => i.id === expandedId) ?? null;
  const hasTemplate = (i: InstanceScrape) =>
    !!i.scraper?.display_template && i.scraper.display_template.length > 0;
  const countBy = (status: InstanceScrape["status"][]) =>
    instances.filter((i) => status.includes(i.status)).length;

  if (loading) {
    return <p className="py-24 text-center text-muted">Chargement…</p>;
  }

  return (
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="page-title">Instances</h1>
        <p className="text-[15px] text-ink-2">
          Chaque exécution d’un scraper sur une URL, en file ou terminée.
        </p>
      </header>

      <form
        onSubmit={handleCreate}
        className="cover-ink rounded-2xl p-2 flex flex-wrap gap-2"
      >
        <label className="flex-[999_1_280px] flex items-center gap-2.5 min-h-11 px-3.5 rounded-[11px] bg-night text-stone">
          <Icon d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
          <span className="sr-only">URL à scraper</span>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/page-to-scrape"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-[13px] text-white placeholder:text-taupe"
            required
          />
        </label>
        <button type="submit" disabled={creating} className="btn-neon min-h-11 flex-none">
          <Icon d="M5 3l14 9-14 9V3z" />
          {creating ? "Lancement…" : "Lancer"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 text-[13px]">
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-ink text-white">
          Toutes <span className="font-mono text-[11px] text-stone">{instances.length}</span>
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-indigo-tint text-indigo-ink">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo" />
          En cours {countBy(["WORKING", "STARTING"])}
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-chip text-ink-2">
          <span className="w-1.5 h-1.5 rounded-full bg-muted" />
          En file {countBy(["IN_QUEUE"])}
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-danger-tint text-danger-ink">
          <span className="w-1.5 h-1.5 rounded-full bg-danger" />
          Erreurs {countBy(["ERROR"])}
        </span>
      </div>

      {instances.length === 0 ? (
        <p className="py-16 text-center text-muted border border-dashed border-line-strong rounded-[14px]">
          Aucune instance de scrape pour le moment
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto border border-line rounded-[14px]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="px-4 py-2.5 font-medium border-b border-line">URL</th>
                  <th className="px-4 py-2.5 font-medium border-b border-line">Scraper</th>
                  <th className="px-4 py-2.5 font-medium border-b border-line">Statut</th>
                  <th className="px-4 py-2.5 font-medium border-b border-line text-right">
                    <button
                      type="button"
                      onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                      className="inline-flex items-center gap-1 hover:text-ink transition cursor-pointer"
                      aria-label={`Trier par date : ${sortOrder === "desc" ? "plus récent" : "plus ancien"} d’abord`}
                    >
                      Lancée
                      <Icon
                        d="M6 9l6 6 6-6"
                        className={`w-3.5 h-3.5 transition-transform ${sortOrder === "asc" ? "rotate-180" : ""}`}
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedInstances.map((instance) => (
                  <tr
                    key={instance.id}
                    tabIndex={0}
                    onClick={() => setExpandedId(instance.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setExpandedId(instance.id);
                    }}
                    className="cursor-pointer hover:bg-paper-warm focus-visible:bg-indigo-tint/50 outline-none transition"
                  >
                    <td className="px-4 py-[11px] border-b border-line-soft font-mono text-[12.5px] text-ink max-w-[300px] truncate">
                      {instance.url}
                    </td>
                    <td className="px-4 py-[11px] border-b border-line-soft text-ink-2">
                      {instance.scraper?.name ?? "—"}
                    </td>
                    <td className="px-4 py-[11px] border-b border-line-soft">
                      <StatusPill status={instance.status} />
                    </td>
                    <td className="px-4 py-[11px] border-b border-line-soft text-right font-mono text-xs text-muted whitespace-nowrap">
                      {formatDate(instance.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 text-[13px] text-muted">
            <label className="flex items-center gap-2">
              Afficher
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="border border-line-strong rounded-lg px-2 py-1 bg-paper text-ink outline-none focus:border-indigo"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              par page
            </label>

            <div className="flex items-center gap-1">
              <span className="mr-2 font-mono text-xs">
                {startIndex + 1}–{Math.min(startIndex + pageSize, instances.length)} sur {instances.length}
              </span>
              {[
                { label: "Première page", d: "M11 17l-5-5 5-5M18 17l-5-5 5-5", to: 1, disabled: currentPage === 1 },
                { label: "Page précédente", d: "M15 18l-6-6 6-6", to: Math.max(1, currentPage - 1), disabled: currentPage === 1 },
              ].map((b) => (
                <button key={b.label} type="button" aria-label={b.label} onClick={() => setCurrentPage(b.to)} disabled={b.disabled} className="icon-btn border border-line-strong bg-paper disabled:opacity-30 disabled:cursor-not-allowed">
                  <Icon d={b.d} />
                </button>
              ))}
              <span className="px-2.5 font-mono text-xs text-ink">
                {currentPage} / {totalPages}
              </span>
              {[
                { label: "Page suivante", d: "M9 18l6-6-6-6", to: Math.min(totalPages, currentPage + 1), disabled: currentPage === totalPages },
                { label: "Dernière page", d: "M13 17l5-5-5-5M6 17l5-5-5-5", to: totalPages, disabled: currentPage === totalPages },
              ].map((b) => (
                <button key={b.label} type="button" aria-label={b.label} onClick={() => setCurrentPage(b.to)} disabled={b.disabled} className="icon-btn border border-line-strong bg-paper disabled:opacity-30 disabled:cursor-not-allowed">
                  <Icon d={b.d} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted text-center">
        La liste se rafraîchit automatiquement toutes les 5 secondes
      </p>

      {expanded && (
        <div className="modal-backdrop" onClick={() => setExpandedId(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Détail de l’instance"
            className="modal max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-line-soft">
              <div className="flex flex-col gap-2 min-w-0">
                <span className="self-start">
                  <StatusPill status={expanded.status} />
                </span>
                <h2 className="section-title">{expanded.scraper?.name ?? "Instance"}</h2>
                <span className="font-mono text-xs text-indigo-ink break-all">{expanded.url}</span>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => setExpandedId(null)} className="icon-btn flex-none">
                <Icon d="M6 6l12 12M18 6L6 18" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
                <dt className="text-muted">Lancée</dt>
                <dd className="font-mono">{formatDate(expanded.created_at)}</dd>
                <dt className="text-muted">Mise à jour</dt>
                <dd className="font-mono">{formatDate(expanded.last_update)}</dd>
              </dl>

              {expanded.status === "FINISHED" && hasTemplate(expanded) && (
                <div className="segmented self-start">
                  <button
                    type="button"
                    aria-pressed={!renderedViews[expanded.id]}
                    onClick={() => setRenderedViews((prev) => ({ ...prev, [expanded.id]: false }))}
                  >
                    JSON brut
                  </button>
                  <button
                    type="button"
                    aria-pressed={!!renderedViews[expanded.id]}
                    onClick={() => setRenderedViews((prev) => ({ ...prev, [expanded.id]: true }))}
                  >
                    Vue structurée
                  </button>
                </div>
              )}

              {renderedViews[expanded.id] && hasTemplate(expanded) ? (
                <ScraperTemplateRenderer
                  data={expanded.response as Record<string, unknown> | Record<string, unknown>[]}
                  template={expanded.scraper!.display_template!}
                />
              ) : expanded.response ? (
                <pre className="m-0 px-3.5 py-3 rounded-xl bg-code text-code-ink font-mono text-[11.5px] leading-relaxed overflow-x-auto">
                  {JSON.stringify(expanded.response, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted italic">Aucune réponse disponible</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
