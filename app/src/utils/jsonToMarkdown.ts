function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function jsonToMarkdownTable(data: unknown): string {
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
    const keys = [...new Set(data.flatMap((item) => Object.keys(item as Record<string, unknown>)))];
    const header = `| ${keys.join(" | ")} |`;
    const separator = `| ${keys.map(() => "---").join(" | ")} |`;
    const rows = data.map((item) => {
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
