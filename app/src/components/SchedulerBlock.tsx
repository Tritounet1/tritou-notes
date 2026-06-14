import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "../api";
import { TemplateBlock } from "../types/scraper";
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
    <div className="my-4 border border-purple-200 rounded-xl overflow-hidden bg-purple-50/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-purple-100">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-800">
            {loading ? "Chargement…" : error ? "Planificateur introuvable" : preview?.title}
          </span>
          {preview?.last_run_at && (
            <span className="text-xs text-gray-400">
              · {new Date(preview.last_run_at).toLocaleString("fr-FR")}
            </span>
          )}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 transition rounded"
            title="Supprimer ce bloc planificateur"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <p className="text-sm text-gray-400 animate-pulse">Chargement des données…</p>
        )}
        {!loading && error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        {!loading && !error && !preview?.latestData && (
          <p className="text-sm text-gray-400 italic">
            Aucune donnée disponible — le planificateur n'a pas encore été exécuté.
          </p>
        )}
        {!loading && !error && preview?.latestData && hasTemplate && (
          <ScraperTemplateRenderer
            data={preview.latestData.response as Record<string, unknown> | Record<string, unknown>[]}
            template={template!}
          />
        )}
        {!loading && !error && preview?.latestData && !hasTemplate && markdownFallback && (
          <div className="prose prose-sm prose-gray max-w-none overflow-x-auto">
            <Markdown remarkPlugins={[remarkGfm]}>{markdownFallback}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
};
