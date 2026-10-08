import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";
import { describeCron, formatRun, STATUS_STYLE, type ScrapingScheduler } from "./utils/schedulers";

const Icon = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const DAY_MS = 86_400_000;

const formatDelay = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${String(minutes % 60).padStart(2, "0")} min` : `${minutes} min`;
};

/** Dark strip showing today's cron runs per scheduler, past filled, upcoming outlined. */
const TodayTimeline = ({ schedulers }: { schedulers: ScrapingScheduler[] }) => {
  // Frozen at mount: the page is a snapshot, like the rest of the list.
  const [now] = useState(() => Date.now());
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const lanes = schedulers.filter((s) => s.cron_expression && s.timeline?.length);
  if (!lanes.length) return null;

  const upcoming = lanes
    .filter((s) => s.status !== "DESACTIVATE")
    .flatMap((s) => s.timeline.map((iso) => new Date(iso).getTime()))
    .filter((t) => t > now);
  const next = upcoming.length ? Math.min(...upcoming) : null;
  const pct = (t: number) => `${((t - dayStart) / DAY_MS) * 100}%`;

  return (
    <section aria-label="Exécutions d’aujourd’hui" className="cover-ink rounded-[18px] px-[22px] pt-5 pb-[18px] text-white flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Aujourd’hui</h2>
        {next && (
          <span className="font-mono text-xs text-stone">
            prochaine exécution dans <span className="text-neon">{formatDelay(next - now)}</span>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px] flex flex-col gap-2">
          {lanes.map((s) => {
            const off = s.status === "DESACTIVATE";
            const ticks = s.timeline
              .map((iso) => new Date(iso).getTime())
              .filter((t) => t >= dayStart && t < dayStart + DAY_MS);
            return (
              <div key={s.id} className="flex items-center gap-3">
                <Link to={`/scraping-scheduler/${s.id}`} className="w-[140px] flex-none text-[13px] text-code-ink truncate hover:text-neon">
                  {s.title}
                </Link>
                <div className="flex-1 h-[22px] relative rounded-md bg-night">
                  {ticks.map((t) => {
                    const past = t <= now;
                    const color = off
                      ? "bg-umber"
                      : past
                        ? s.status === "ERROR" ? "bg-danger" : "bg-neon-dot"
                        : s.status === "RUNNING" ? "bg-indigo" : "bg-neon";
                    return (
                      <span
                        key={t}
                        title={new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        className={`absolute top-1 bottom-1 w-2 -ml-1 rounded-[3px] ${color} ${past ? "" : "ring-1 ring-white/50 ring-offset-1 ring-offset-night"}`}
                        style={{ left: pct(t) }}
                      />
                    );
                  })}
                  <span className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-white" style={{ left: pct(now) }} aria-hidden="true" />
                </div>
              </div>
            );
          })}
          <div className="flex gap-3 font-mono text-[10px] text-code-faint" aria-hidden="true">
            <span className="w-[140px] flex-none" />
            <div className="flex-1 flex justify-between">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const ScrapingSchedulersPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [schedulers, setSchedulers] = useState<ScrapingScheduler[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    fetchSchedulers();
  }, []);

  const fetchSchedulers = async () => {
    try {
      const response = await apiFetch("/api/scraping-schedulers");
      if (response.ok) {
        const data = await response.json();
        setSchedulers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setError("Le titre est requis");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const response = await apiFetch("/api/scraping-schedulers", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
        }),
      });

      if (response.ok) {
        const scheduler = await response.json();
        setShowModal(false);
        setNewTitle("");
        setNewDescription("");
        navigate(`/scraping-scheduler/${scheduler.id}`);
      } else {
        setError("Erreur lors de la création");
      }
    } catch {
      setError("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  // Same endpoint as the detail page's switch; RUNNING counts as "on".
  const toggleStatus = async (scheduler: ScrapingScheduler) => {
    const status = scheduler.status === "DESACTIVATE" ? "ACTIVATE" : "DESACTIVATE";
    setTogglingId(scheduler.id);
    try {
      const response = await apiFetch(`/api/scraping-schedulers/${scheduler.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        const updated = await response.json();
        setSchedulers((list) => list.map((s) => (s.id === scheduler.id ? { ...s, ...updated } : s)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="page-title">Planificateurs</h1>
          <p className="text-[15px] text-ink-2">
            Des scrapes qui tournent tout seuls, au rythme d’une expression cron.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission("modifyScraperStatus") && (
            <button type="button" onClick={() => setShowModal(true)} className="btn-primary">
              <Icon d="M12 5v14M5 12h14" />
              Nouveau planificateur
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <p className="py-24 text-center text-muted">Chargement…</p>
      ) : schedulers.length === 0 ? (
        <p className="py-16 text-center text-muted border border-dashed border-line-strong rounded-2xl">
          Aucun planificateur. Créez votre premier planificateur !
        </p>
      ) : (
        <>
        <TodayTimeline schedulers={schedulers} />
        <div className="flex flex-col gap-2.5">
          {schedulers.map((scheduler) => {
            const st = STATUS_STYLE[scheduler.status] ?? STATUS_STYLE.DESACTIVATE;
            const human = scheduler.cron_expression && describeCron(scheduler.cron_expression);
            return (
              <div
                key={scheduler.id}
                className="card relative flex flex-wrap items-center gap-[18px] px-[18px] py-4 hover:border-line-strong hover:bg-paper-warm transition"
              >
                <span className={`w-11 h-11 flex-none rounded-xl flex items-center justify-center ${st.tile}`}>
                  <Icon d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" className="w-5 h-5" />
                </span>
                <div className="flex-[999_1_220px] min-w-0 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The ::after overlay makes the whole card clickable while the switch stays a separate control. */}
                    <Link
                      to={`/scraping-scheduler/${scheduler.id}`}
                      className="font-semibold text-base text-ink after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {scheduler.title}
                    </Link>
                    <span className={`pill ${st.pill}`}>{st.label}</span>
                  </div>
                  {scheduler.description && (
                    <span className="text-[13px] text-muted truncate">{scheduler.description}</span>
                  )}
                </div>
                <div className="flex-[1_1_180px] flex flex-col gap-1">
                  {scheduler.cron_expression ? (
                    <>
                      <code className="self-start font-mono text-xs px-2 py-[3px] rounded-[7px] bg-chip text-ink">
                        {scheduler.cron_expression}
                      </code>
                      {human && <span className="text-[13px] text-ink-2">{human}</span>}
                    </>
                  ) : (
                    <span className="text-[13px] text-muted">Pas de cron</span>
                  )}
                </div>
                <div className="flex-[1_1_150px] flex flex-col gap-0.5 text-xs text-muted">
                  <span>
                    Dernière : <span className="font-mono text-ink">{formatRun(scheduler.last_run_at)}</span>
                  </span>
                  <span>
                    Suivante : <span className="font-mono text-ink">{formatRun(scheduler.next_run_at)}</span>
                  </span>
                </div>
                {hasPermission("modifyScraperStatus") ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={scheduler.status !== "DESACTIVATE"}
                    aria-label={`Activer ${scheduler.title}`}
                    disabled={togglingId === scheduler.id}
                    onClick={() => toggleStatus(scheduler)}
                    className={`relative z-10 flex-none w-[46px] h-7 rounded-full p-[3px] flex transition cursor-pointer disabled:opacity-60 ${
                      scheduler.status !== "DESACTIVATE" ? "bg-indigo justify-end" : "bg-stone-soft justify-start"
                    }`}
                  >
                    <span className="w-[22px] h-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]" />
                  </button>
                ) : (
                  <Icon d="M9 6l6 6-6 6" className="w-4 h-4 text-muted flex-none" />
                )}
              </div>
            );
          })}
        </div>
        </>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-scheduler-title"
            className="modal max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <h2 id="new-scheduler-title" className="section-title">
                Nouveau planificateur
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="icon-btn" aria-label="Fermer">
                <Icon d="M6 6l12 12M18 6L6 18" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 pb-6 flex flex-col gap-4">
              {error && (
                <div className="px-3 py-2.5 rounded-[10px] bg-danger-tint text-danger-ink text-sm">{error}</div>
              )}

              <label className="label">
                Titre
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="input"
                  placeholder="Mon planificateur"
                />
              </label>

              <label className="label">
                Description
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="input py-2 resize-none"
                  rows={3}
                  placeholder="Description du planificateur…"
                />
              </label>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Annuler
                </button>
                <button type="submit" disabled={creating} className="btn-primary flex-1">
                  {creating ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
