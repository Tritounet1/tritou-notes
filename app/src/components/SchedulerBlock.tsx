import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "../api";
import type { TemplateBlock } from "../types/scraper";
import { jsonToMarkdownTable } from "../utils/jsonToMarkdown";
import { ScraperTemplateRenderer } from "./ScraperTemplateRenderer";

interface SchedulerPreview {
  id: number;
  title: string;
  description: string | null;
  status: string;
  last_run_at: string | null;
  latestData: {
    response: unknown;
    scraper: { id: number; name: string; display_template: TemplateBlock[] | null } | null;
  } | null;
}

interface SchedulerBlockProps {
  schedulerId: number;
  onDelete?: () => void;
}

export const SchedulerBlock = ({ schedulerId, onDelete }: SchedulerBlockProps) => {
  const [preview, setPreview] = useState<SchedulerPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/api/scraping-schedulers/${schedulerId}/preview`);
        if (!res.ok) throw new Error("Scheduler introuvable");
        setPreview(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [schedulerId]);

  const template = preview?.latestData?.scraper?.display_template;
  const hasTemplate = Array.isArray(template) && template.length > 0;
  const markdownFallback = preview?.latestData
    ? jsonToMarkdownTable(preview.latestData.response)
    : null;

  return (
    <section aria-label="Bloc planificateur" className="my-4 overflow-hidden rounded-2xl border border-line-strong leading-[1.4]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-ink px-3.5 py-3 text-white">
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${error ? "bg-danger" : "bg-neon shadow-[0_0_0_4px_rgba(212,244,90,0.25)]"}`} />
          <span className="truncate">
            Planificateur · {loading ? "Chargement…" : error ? "introuvable" : preview?.title}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {preview?.last_run_at && (
            <span className="font-mono text-[11px] text-stone">
              live · {new Date(preview.last_run_at).toLocaleString("fr-FR")}
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Supprimer ce bloc planificateur"
              title="Supprimer ce bloc planificateur"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-stone transition hover:bg-white/10 hover:text-white"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
        </span>
      </div>

      {/* Body */}
      <div className="text-[13px]">
        {loading && (
          <p className="animate-pulse px-3.5 py-4 text-muted">Chargement des données…</p>
        )}
        {!loading && error && (
          <p className="px-3.5 py-4 text-danger-ink">{error}</p>
        )}
        {!loading && !error && !preview?.latestData && (
          <p className="px-3.5 py-4 text-muted">
            Aucune donnée disponible — le planificateur n’a pas encore été exécuté.
          </p>
        )}
        {!loading && !error && preview?.latestData && hasTemplate && (
          <div className="p-3.5">
            <ScraperTemplateRenderer
              data={preview.latestData.response as Record<string, unknown> | Record<string, unknown>[]}
              template={template!}
            />
          </div>
        )}
        {!loading && !error && preview?.latestData && !hasTemplate && markdownFallback && (
          <div className="overflow-x-auto text-ink [&_table]:w-full [&_table]:min-w-[460px] [&_table]:border-collapse [&_th]:px-3.5 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted [&_td]:border-t [&_td]:border-line-soft [&_td]:px-3.5 [&_td]:py-2 [&_td]:text-ink-2 [&_p]:px-3.5 [&_p]:py-2 [&_a]:text-indigo-ink [&_a]:underline">
            <Markdown remarkPlugins={[remarkGfm]}>{markdownFallback}</Markdown>
          </div>
        )}
      </div>
    </section>
  );
};
