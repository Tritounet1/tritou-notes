import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { useDebounce } from "./hooks/useDebounce";
import { useConfirm } from "./hooks/useConfirm";

interface InstanceScrape {
  id: number;
  url: string;
  response: Record<string, unknown> | null;
  status: "IN_QUEUE" | "STARTING" | "WORKING" | "FINISHED" | "ERROR";
  created_at: string;
  last_update: string;
}

interface InstanceScrapeHistory {
  id: number;
  url: string;
  response: Record<string, unknown>;
  status: "IN_QUEUE" | "STARTING" | "WORKING" | "FINISHED" | "ERROR";
  created_at: string;
}

interface ScrapingScheduler {
  id: number;
  title: string;
  description: string | null;
  cron_expression: string | null;
  start_at: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  status: "DESACTIVATE" | "RUNNING" | "ERROR" | "ACTIVATE";
  update_at: string;
  created_at: string;
  InstanceScrapes?: InstanceScrape[];
}

const CRON_PRESETS = [
  { label: "Toutes les heures", value: "0 * * * *" },
  { label: "Tous les jours à minuit", value: "0 0 * * *" },
  { label: "Tous les 2 jours", value: "0 0 */2 * *" },
  { label: "Toutes les semaines (lundi)", value: "0 0 * * 1" },
  { label: "Tous les mois (1er)", value: "0 0 1 * *" },
];

const SCHEDULER_STATUS: Record<ScrapingScheduler["status"], { label: string; pill: string }> = {
  RUNNING: { label: "En cours", pill: "bg-indigo-tint text-indigo-ink" },
  ACTIVATE: { label: "Actif", pill: "bg-neon-tint text-neon-ink" },
  ERROR: { label: "Erreur", pill: "bg-danger-tint text-danger-ink" },
  DESACTIVATE: { label: "Désactivé", pill: "bg-chip text-ink-2" },
};

const INSTANCE_STATUS: Record<InstanceScrape["status"], { label: string; pill: string; dot: string }> = {
  IN_QUEUE: { label: "En file", pill: "bg-chip text-ink-2", dot: "bg-muted" },
  STARTING: { label: "Démarrage", pill: "bg-indigo-tint text-indigo-ink", dot: "bg-indigo" },
  WORKING: { label: "En cours", pill: "bg-indigo-tint text-indigo-ink", dot: "bg-indigo" },
  FINISHED: { label: "Terminé", pill: "bg-neon-tint text-neon-ink", dot: "bg-neon-dot" },
  ERROR: { label: "Erreur", pill: "bg-danger-tint text-danger-ink", dot: "bg-danger" },
};

const InstancePill = ({ status }: { status: InstanceScrape["status"] }) => {
  const st = INSTANCE_STATUS[status] ?? INSTANCE_STATUS.IN_QUEUE;
  return (
    <span className={`pill ${st.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
};

const Icon = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const formatDate = (iso: string) => new Date(iso).toLocaleString("fr-FR");

export const ScrapingSchedulerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confirm, confirmDialog] = useConfirm();
  const [scheduler, setScheduler] = useState<ScrapingScheduler | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [status, setStatus] =
    useState<ScrapingScheduler["status"]>("DESACTIVATE");
  const [newInstanceUrl, setNewInstanceUrl] = useState("");
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [selectedInstance, setSelectedInstance] =
    useState<InstanceScrape | null>(null);
  const [instanceHistory, setInstanceHistory] = useState<
    InstanceScrapeHistory[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const fetchScheduler = async () => {
      try {
        const response = await apiFetch(`/api/scraping-schedulers/${id}`);
        if (!response.ok) {
          throw new Error("Planificateur non trouvé");
        }
        const data = await response.json();
        setScheduler(data);
        setTitle(data.title || "");
        setDescription(data.description || "");
        setCronExpression(data.cron_expression || "");
        setStatus(data.status || "DESACTIVATE");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
      }
    };

    fetchScheduler();
  }, [id]);

  const saveScheduler = useCallback(
    async (updates: Partial<ScrapingScheduler>) => {
      setSaving(true);
      try {
        const response = await apiFetch(`/api/scraping-schedulers/${id}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        if (response.ok) {
          const data = await response.json();
          setScheduler(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const debouncedSave = useDebounce(saveScheduler, 1000);

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case "title":
        setTitle(value);
        break;
      case "description":
        setDescription(value);
        break;
      case "cron_expression":
        setCronExpression(value);
        break;
      case "status":
        setStatus(value as ScrapingScheduler["status"]);
        break;
    }

    debouncedSave({
      title: field === "title" ? value : title,
      description: field === "description" ? value : description,
      cron_expression: field === "cron_expression" ? value : cronExpression,
      status:
        field === "status" ? (value as ScrapingScheduler["status"]) : status,
    });
  };

  const handleDelete = async () => {
    if (!(await confirm({ title: "Supprimer ce planificateur ?", message: "Ses URLs ne seront plus scrapées automatiquement ; les instances existantes sont conservées. Cette action est définitive." }))) return;

    try {
      const response = await apiFetch(`/api/scraping-schedulers/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        navigate("/scraping-schedulers");
      }
    } catch {
      setError("Erreur lors de la suppression");
    }
  };

  const refreshScheduler = async () => {
    try {
      const response = await apiFetch(`/api/scraping-schedulers/${id}`);
      if (response.ok) {
        const data = await response.json();
        setScheduler(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddInstance = async () => {
    if (!newInstanceUrl.trim()) return;

    setCreatingInstance(true);
    try {
      const response = await apiFetch("/api/instance-scrape", {
        method: "POST",
        body: JSON.stringify({
          url: newInstanceUrl.trim(),
          scrapingSchedulerId: id,
        }),
      });

      if (response.ok) {
        setNewInstanceUrl("");
        refreshScheduler();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingInstance(false);
    }
  };

  const handleDeleteInstance = async (instanceId: number) => {
    try {
      const response = await apiFetch(`/api/instance-scrape/${instanceId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        refreshScheduler();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenInstanceHistory = async (instance: InstanceScrape) => {
    setSelectedInstance(instance);
    setHistoryLoading(true);
    try {
      const response = await apiFetch(
        `/api/instance-scrape-histories/${instance.id}`,
      );
      if (response.ok) {
        const data = await response.json();
        setInstanceHistory(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCloseInstanceHistory = () => {
    setSelectedInstance(null);
    setInstanceHistory([]);
  };

  if (loading) {
    return <p className="py-24 text-center text-muted">Chargement…</p>;
  }

  if (error || !scheduler) {
    return (
      <p className="py-24 text-center text-danger-ink">
        {error || "Planificateur non trouvé"}
      </p>
    );
  }

  const isOn = status !== "DESACTIVATE";
  const statusStyle = SCHEDULER_STATUS[status] ?? SCHEDULER_STATUS.DESACTIVATE;
  const infos = [
    { label: "Dernière exécution", value: scheduler.last_run_at },
    { label: "Prochaine exécution", value: scheduler.next_run_at },
    { label: "Date de début", value: scheduler.start_at },
    { label: "Créé le", value: scheduler.created_at },
    { label: "Dernière modification", value: scheduler.update_at },
  ].filter((i) => i.value);

  return (
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      {confirmDialog}
      <header className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => navigate("/scraping-schedulers")}
          className="self-start inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition cursor-pointer"
        >
          <Icon d="M15 18l-6-6 6-6" />
          Planificateurs
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="page-title break-words">{title || "Sans titre"}</h1>
              <span className={`pill ${statusStyle.pill}`}>{statusStyle.label}</span>
            </div>
            <p className="text-[15px] text-ink-2 min-h-5 line-clamp-2">
              {saving ? "Sauvegarde…" : description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isOn}
              aria-label="Activer le planificateur"
              onClick={() => handleFieldChange("status", isOn ? "DESACTIVATE" : "ACTIVATE")}
              className="inline-flex items-center gap-2.5 text-sm text-ink-2 cursor-pointer"
            >
              <span className={`relative w-10 h-6 rounded-full transition ${isOn ? "bg-indigo" : "bg-stone-soft"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isOn ? "translate-x-4" : ""}`} />
              </span>
              {isOn ? "Activé" : "Désactivé"}
            </button>
            <button type="button" onClick={handleDelete} className="btn-danger">
              <Icon d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              Supprimer
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <section className="card p-6 flex flex-col gap-4">
            <h2 className="section-title">Configuration</h2>
            <label className="label">
              Titre
              <input
                type="text"
                value={title}
                onChange={(e) => handleFieldChange("title", e.target.value)}
                className="input"
              />
            </label>
            <label className="label">
              Description
              <textarea
                value={description}
                onChange={(e) => handleFieldChange("description", e.target.value)}
                className="input py-2 resize-none"
                rows={3}
              />
            </label>
            <div className="label">
              <label htmlFor="cron-expression">Expression cron</label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="cron-expression"
                  type="text"
                  value={cronExpression}
                  onChange={(e) => handleFieldChange("cron_expression", e.target.value)}
                  className="input flex-[1_1_180px] w-auto font-mono"
                  placeholder="0 0 * * *"
                />
                <select
                  aria-label="Préréglages cron"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleFieldChange("cron_expression", e.target.value);
                    }
                  }}
                  className="input flex-[1_1_180px] w-auto font-normal"
                  value=""
                >
                  <option value="">Préréglages…</option>
                  {CRON_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="card p-6 flex flex-col gap-4">
            <h2 className="section-title">Instances de scraping</h2>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                aria-label="URL de la nouvelle instance"
                value={newInstanceUrl}
                onChange={(e) => setNewInstanceUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddInstance();
                  }
                }}
                className="input flex-[999_1_240px] w-auto font-mono text-[13px]"
                placeholder="https://example.com/page-a-scraper"
                disabled={creatingInstance}
              />
              <button
                type="button"
                onClick={handleAddInstance}
                disabled={creatingInstance || !newInstanceUrl.trim()}
                className="btn-ink flex-none"
              >
                {creatingInstance ? "Ajout…" : "Ajouter"}
              </button>
            </div>

            {scheduler.InstanceScrapes && scheduler.InstanceScrapes.length > 0 ? (
              <div className="overflow-x-auto border border-line rounded-[14px]">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-muted">
                      <th className="px-4 py-2.5 font-medium border-b border-line">URL</th>
                      <th className="px-4 py-2.5 font-medium border-b border-line">Statut</th>
                      <th className="px-4 py-2.5 font-medium border-b border-line text-right">Mise à jour</th>
                      <th className="w-12 border-b border-line">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduler.InstanceScrapes.map((instance) => (
                      <tr
                        key={instance.id}
                        tabIndex={0}
                        onClick={() => handleOpenInstanceHistory(instance)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleOpenInstanceHistory(instance);
                        }}
                        className="group cursor-pointer hover:bg-paper-warm focus-visible:bg-indigo-tint/50 outline-none transition"
                      >
                        <td className="px-4 py-[11px] border-b border-line-soft font-mono text-[12.5px] text-ink max-w-[280px] truncate">
                          {instance.url}
                        </td>
                        <td className="px-4 py-[11px] border-b border-line-soft">
                          <InstancePill status={instance.status} />
                        </td>
                        <td className="px-4 py-[11px] border-b border-line-soft text-right font-mono text-xs text-muted whitespace-nowrap">
                          {formatDate(instance.last_update)}
                        </td>
                        <td className="px-2 py-1 border-b border-line-soft text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInstance(instance.id);
                            }}
                            className="icon-btn hover:text-danger sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label="Supprimer l’instance"
                            title="Supprimer"
                          >
                            <Icon d="M6 6l12 12M18 6L6 18" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted border border-dashed border-line-strong rounded-[14px]">
                Aucune instance de scraping
              </p>
            )}
          </section>
        </div>

        <aside className="card bg-paper-warm p-6 flex flex-col gap-4 lg:sticky lg:top-8">
          <h2 className="section-title">Informations</h2>
          <dl className="flex flex-col gap-3.5">
            {infos.map((info) => (
              <div key={info.label} className="flex flex-col gap-1">
                <dt className="eyebrow">{info.label}</dt>
                <dd className="font-mono text-[13px] text-ink">{formatDate(info.value!)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      {selectedInstance && (
        <div className="modal-backdrop" onClick={handleCloseInstanceHistory}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="instance-history-title"
            className="modal max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4 border-b border-line-soft flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5 min-w-0">
                <h2 id="instance-history-title" className="section-title">
                  Détails de l’instance
                </h2>
                <p className="font-mono text-xs text-indigo-ink break-all">{selectedInstance.url}</p>
              </div>
              <button type="button" onClick={handleCloseInstanceHistory} className="icon-btn flex-none" aria-label="Fermer">
                <Icon d="M6 6l12 12M18 6L6 18" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
              <h3 className="eyebrow">Historique ({instanceHistory.length})</h3>
              {historyLoading ? (
                <p className="text-sm text-muted">Chargement…</p>
              ) : instanceHistory.length === 0 ? (
                <p className="text-sm text-muted italic">Aucun historique</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {[...instanceHistory]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )
                    .map((history) => (
                      <li key={history.id} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs text-muted">{formatDate(history.created_at)}</span>
                          <InstancePill status={history.status} />
                        </div>
                        <pre className="m-0 px-3.5 py-3 rounded-xl bg-code text-code-ink font-mono text-[11.5px] leading-relaxed overflow-x-auto">
                          {JSON.stringify(history.response, null, 2)}
                        </pre>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
