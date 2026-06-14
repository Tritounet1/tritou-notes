import { TemplateBlock } from "../types/scraper";

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item, itemIndex) => (
        <div
          key={itemIndex}
          className="bg-white border border-gray-200 rounded-lg overflow-hidden"
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
                  className="w-full h-44 object-cover"
                />
              );
            }

            if (block.type === "title") {
              return (
                <div key={block.id} className="px-4 pt-3">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">
                    {String(value)}
                  </h3>
                </div>
              );
            }

            if (block.type === "text") {
              return (
                <div key={block.id} className="px-4">
                  <p className="text-sm text-gray-600">{String(value)}</p>
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
                    className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    {block.label || "Ouvrir"} →
                  </a>
                </div>
              );
            }

            if (block.type === "badge") {
              return (
                <div key={block.id} className="px-4">
                  <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
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
                <div key={block.id} className="px-4 pb-3">
                  <span className="text-xs text-gray-400">{displayValue}</span>
                </div>
              );
            }

            return null;
          })}
          <div className="pb-3" />
        </div>
      ))}
    </div>
  );
};
