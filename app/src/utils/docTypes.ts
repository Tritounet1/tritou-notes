// Doc type → colors, shared by the sidebar, dashboard and document page.
export const docTypeStyles = {
  TEXT: { chip: "bg-indigo-tint text-indigo-ink", dot: "bg-indigo", label: "Page", cover: "cover-dots" },
  EXCEL: { chip: "bg-neon-tint text-neon-ink", dot: "bg-neon-dot", label: "Tableur", cover: "cover-stripes" },
  TODO: { chip: "bg-coral-tint text-coral-ink", dot: "bg-coral", label: "To-do", cover: "cover-grid" },
} as const;
