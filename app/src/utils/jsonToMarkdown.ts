import { TemplateBlock } from "../types/scraper";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function normalizeData(data: unknown): unknown {
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const keys = Object.keys(record);
    const numericKeys = keys
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length > 0 && numericKeys.length >= keys.length - 1) {
      return numericKeys.map((k) => record[k]);
    }
  }
  return data;
}

export function templateToMarkdown(data: unknown, template: TemplateBlock[]): string {
  const normalized = normalizeData(data);
  const items: Record<string, unknown>[] = Array.isArray(normalized)
    ? (normalized as Record<string, unknown>[])
    : [normalized as Record<string, unknown>];

  const sections = items.map((item) => {
    const lines = template
      .map((block) => {
        const value = item[block.field];
        if (value === null || value === undefined || value === "") return null;
        const str = String(value);

        switch (block.type) {
          case "image":
            return `![](${str})`;
          case "title":
            return `### ${str}`;
          case "text":
            return str;
          case "link":
            return `[${block.label || "Ouvrir →"}](${str})`;
          case "badge":
            return `\`${str}\``;
          case "date": {
            try {
              return `*${new Date(str).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}*`;
            } catch {
              return `*${str}*`;
            }
          }
          default:
            return null;
        }
      })
      .filter(Boolean);

    return lines.join("\n\n");
  });

  return sections.join("\n\n---\n\n");
}

export function jsonToMarkdownTable(data: unknown): string {
  const normalized = normalizeData(data);
  if (Array.isArray(normalized) && normalized.length > 0 && typeof normalized[0] === "object" && normalized[0] !== null) {
    const keys = [...new Set(normalized.flatMap((item) => Object.keys(item as Record<string, unknown>)))];
    const header = `| ${keys.join(" | ")} |`;
    const separator = `| ${keys.map(() => "---").join(" | ")} |`;
    const rows = normalized.map((item) => {
      const record = item as Record<string, unknown>;
      return `| ${keys.map((key) => escapeCell(formatValue(record[key]))).join(" | ")} |`;
    });
    return [header, separator, ...rows].join("\n");
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const entries = Object.entries(record);
    if (entries.length === 0) return "*(Objet vide)*";
    return entries
      .map(([key, value]) => `- **${key}** : ${formatValue(value)}`)
      .join("\n");
  }

  return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
}
