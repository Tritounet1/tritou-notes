import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { describeCron, formatRun, RUN_COLOR, STATUS_STYLE, type ScrapingScheduler } from "../utils/schedulers";

const ORDER: Record<ScrapingScheduler["status"], number> = { RUNNING: 0, ERROR: 1, ACTIVATE: 2, DESACTIVATE: 3 };

/** Dashboard side panel: each scheduler's status and its last scrape outcomes. */
export const LivePanel = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission("accessScrapersPage");
  const [schedulers, setSchedulers] = useState<ScrapingScheduler[]>([]);

  useEffect(() => {
    if (!allowed) return;
    apiFetch("/api/scraping-schedulers")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ScrapingScheduler[]) => setSchedulers(list))
      .catch(console.error);
  }, [allowed]);

  if (!allowed || schedulers.length === 0) return null;

  const sorted = [...schedulers].sort((a, b) => ORDER[a.status] - ORDER[b.status]).slice(0, 5);
  const running = schedulers.some((s) => s.status === "RUNNING");

  return (
    <aside aria-label="En direct" className="flex-[1_1_280px] min-w-0 flex flex-col gap-3.5 p-[18px] rounded-[18px] bg-paper-soft border border-line-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold tracking-tight flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${running ? "bg-indigo shadow-[0_0_0_4px_var(--color-indigo-soft)] animate-pulse" : "bg-muted"}`} />
          En direct
        </h2>
        <Link to="/scraping-schedulers" className="text-[13px] font-medium text-indigo-ink hover:text-ink">
          Tout voir
        </Link>
      </div>
      {sorted.map((s) => {
        const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.DESACTIVATE;
        const human = s.cron_expression ? (describeCron(s.cron_expression) ?? s.cron_expression) : "Pas de cron";
        const runs = s.recentRuns ?? [];
        return (
          <Link key={s.id} to={`/scraping-scheduler/${s.id}`} className="flex flex-col gap-2.5 p-3.5 rounded-[14px] bg-paper border border-line-soft hover:border-line-strong transition">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-ink truncate">{s.title}</span>
              <span className={`pill text-[11px] ${st.pill}`}>{st.label}</span>
            </div>
            <div className="flex gap-[3px]" aria-label={`${runs.length} derniers scrapes`}>
              {runs.length === 0 ? (
                <span className="text-xs text-muted">Aucune exécution pour l’instant</span>
              ) : (
                runs.map((r, i) => (
                  <span key={i} title={`${r.status} · ${formatRun(r.at)}`} className={`flex-1 max-w-6 h-[18px] rounded ${RUN_COLOR[r.status] ?? "bg-line-strong"}`} />
                ))
              )}
            </div>
            <span className="font-mono text-[11px] text-muted">
              {human}
              {s.status !== "DESACTIVATE" && s.next_run_at && ` · suivant ${formatRun(s.next_run_at)}`}
            </span>
          </Link>
        );
      })}
    </aside>
  );
};
