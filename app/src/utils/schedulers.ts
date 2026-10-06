// Shape of GET /api/scraping-schedulers (list), shared by the schedulers page, the dashboard and the ⌘K palette.
export interface ScrapingScheduler {
  id: number;
  title: string;
  description: string | null;
  cron_expression: string | null;
  status: "DESACTIVATE" | "RUNNING" | "ERROR" | "ACTIVATE";
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  update_at: string;
  /** Last scrape outcomes, oldest first. */
  recentRuns: { status: "IN_QUEUE" | "STARTING" | "WORKING" | "FINISHED" | "ERROR"; at: string }[];
  /** Cron occurrences within ±24 h of the request (ISO). */
  timeline: string[];
}

export const STATUS_STYLE: Record<ScrapingScheduler["status"], { label: string; pill: string; tile: string }> = {
  RUNNING: { label: "En cours", pill: "bg-indigo-tint text-indigo-ink", tile: "bg-indigo-tint text-indigo" },
  ACTIVATE: { label: "Actif", pill: "bg-neon-tint text-neon-ink", tile: "bg-neon-tint text-neon-ink" },
  ERROR: { label: "Erreur", pill: "bg-danger-tint text-danger-ink", tile: "bg-danger-tint text-danger" },
  DESACTIVATE: { label: "Désactivé", pill: "bg-chip text-ink-2", tile: "bg-chip text-muted" },
};

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// ponytail: covers the common 5-field patterns only; anything else just shows the raw cron.
export const describeCron = (cron: string): string | null => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5 || parts[3] !== "*") return null;
  const [m, h, dom, , dow] = parts;
  if (m === "0" && dom === "*" && dow === "*") {
    if (h === "*") return "Toutes les heures";
    const every = h.match(/^\*\/(\d+)$/);
    if (every) return `Toutes les ${every[1]} heures`;
  }
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h)) return null;
  const at = `à ${Number(h)} h${m === "0" ? "" : ` ${m.padStart(2, "0")}`}`;
  if (dom === "*" && dow === "*") return `Chaque jour ${at}`;
  if (dom === "*" && /^[0-7]$/.test(dow)) return `Le ${DAYS[Number(dow)]} ${at}`;
  const everyDays = dom.match(/^\*\/(\d+)$/);
  if (everyDays && dow === "*") return `Tous les ${everyDays[1]} jours ${at}`;
  if (/^\d+$/.test(dom) && dow === "*") return `Le ${dom === "1" ? "1er" : dom} du mois ${at}`;
  return null;
};

export const formatRun = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Square color for one past run in the "En direct" strip. */
export const RUN_COLOR: Record<ScrapingScheduler["recentRuns"][number]["status"], string> = {
  FINISHED: "bg-neon-dot",
  ERROR: "bg-danger",
  WORKING: "bg-indigo",
  STARTING: "bg-indigo",
  IN_QUEUE: "bg-line-strong",
};
