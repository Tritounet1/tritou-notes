import type { TemplateBlock } from "../types/scraper";

interface ScraperTemplateRendererProps {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  template: TemplateBlock[];
}

// When the worker spreads an array result into an object it produces
// { url: "...", 0: {...}, 1: {...} }. This reconstructs the original array.
function normalizeToItems(
  data: Record<string, unknown> | Record<string, unknown>[] | null,
): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  const keys = Object.keys(data);
  const numericKeys = keys
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));

  if (numericKeys.length > 0) {
    return numericKeys.map((k) => data[k] as Record<string, unknown>);
  }

  return [data];
}

export const ScraperTemplateRenderer = ({
  data,
  template,
}: ScraperTemplateRendererProps) => {
  if (data === null || template.length === 0) {
    return null;
  }

  const items = normalizeToItems(data);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {items.map((item, itemIndex) => (
        <div
          key={itemIndex}
          className="card overflow-hidden flex flex-col gap-1.5"
        >
          {template.map((block) => {
            const value = item[block.field];

            if (value === null || value === undefined || value === "") {
              return null;
            }

            if (block.type === "image") {
              if (typeof value !== "string" || value === "") return null;
              return (
                <img
                  key={block.id}
                  src={value}
                  alt=""
                  className="w-[calc(100%-16px)] h-44 m-2 mb-1 object-cover rounded-[10px] bg-chip"
                />
              );
            }

            if (block.type === "title") {
              return (
                <div key={block.id} className="px-4 pt-3">
                  <h3 className="font-semibold text-ink text-[15px] leading-snug">
                    {String(value)}
                  </h3>
                </div>
              );
            }

            if (block.type === "text") {
              return (
                <div key={block.id} className="px-4">
                  <p className="text-sm text-ink-2 leading-relaxed">{String(value)}</p>
                </div>
              );
            }

            if (block.type === "link") {
              return (
                <div key={block.id} className="px-4">
                  <a
                    href={String(value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-indigo-ink hover:text-ink hover:underline inline-flex items-center gap-1"
                  >
                    {block.label || "Ouvrir"} →
                  </a>
                </div>
              );
            }

            if (block.type === "badge") {
              return (
                <div key={block.id} className="px-4">
                  <span className="pill bg-neon-tint text-neon-ink">
                    {String(value)}
                  </span>
                </div>
              );
            }

            if (block.type === "date") {
              let displayValue: string;
              try {
                displayValue = new Date(String(value)).toLocaleDateString(
                  "fr-FR",
                  { day: "numeric", month: "long", year: "numeric" },
                );
              } catch {
                displayValue = String(value);
              }
              return (
                <div key={block.id} className="px-4">
                  <span className="font-mono text-xs text-muted">{displayValue}</span>
                </div>
              );
            }

            return null;
          })}
          <div className="pb-2.5" />
        </div>
      ))}
    </div>
  );
};
