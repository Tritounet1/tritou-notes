import { useEffect, useState } from "react";
import { apiFetch } from "../api";

interface ModelSummary {
  id: string;
  name: string;
  inputModalities: string[];
  contextLength: number | null;
  pricing: { prompt: number; completion: number } | null;
}

interface AiSettingsProps {
  settingsId: number;
  keySet: boolean;
  textModel: string | null;
  imageModel: string | null;
  /** Shows the page-level success / error banner. */
  onFeedback: (type: "success" | "error", message: string) => void;
}

const MODALITY_LABELS: Record<string, string> = { image: "images", file: "fichiers", audio: "audio", video: "vidéo" };

const price = (pricing: ModelSummary["pricing"]) =>
  pricing ? `${pricing.prompt.toFixed(2)} $ / ${pricing.completion.toFixed(2)} $ par M tokens` : null;

/** Searchable single-choice list of OpenRouter models. */
const ModelPicker = ({ label, hint, models, value, onChange }: {
  label: string;
  hint: string;
  models: ModelSummary[] | null;
  value: string | null;
  onChange: (id: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = (models ?? []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)).slice(0, 80);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="text-[13px] text-muted">{hint}</span>
      </legend>
      <div className="flex items-center gap-2 rounded-[10px] bg-chip px-3 py-2 text-[13px]">
        <span className="text-muted">Actuel :</span>
        <code className="truncate font-mono text-ink">{value ?? "aucun"}</code>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un modèle (nom ou identifiant)…" aria-label={`Rechercher un ${label.toLowerCase()}`} className="input" />
      <div role="radiogroup" aria-label={label} className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-[12px] border border-line p-1">
        {models === null ? (
          <p className="px-3 py-6 text-center text-sm text-muted">Chargement des modèles…</p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">Aucun modèle</p>
        ) : (
          shown.map((model) => {
            const selected = model.id === value;
            const extras = model.inputModalities.filter((m) => m !== "text").map((m) => MODALITY_LABELS[m] ?? m);
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(model.id)}
                className={`flex cursor-pointer flex-col items-start gap-1 rounded-[9px] px-3 py-2 text-left transition ${selected ? "bg-indigo-tint" : "hover:bg-paper-soft"}`}
              >
                <span className="flex w-full items-center gap-2">
                  <span className={`truncate text-sm ${selected ? "font-semibold text-ink" : "text-ink-2"}`}>{model.name}</span>
                  {extras.map((x) => (
                    <span key={x} className="pill shrink-0 bg-neon-tint text-[10px] text-neon-ink">{x}</span>
                  ))}
                </span>
                <span className="flex w-full flex-wrap gap-x-3 font-mono text-[11px] text-muted">
                  <span className="truncate">{model.id}</span>
                  {price(model.pricing) && <span>{price(model.pricing)}</span>}
                  {model.contextLength && <span>{Math.round(model.contextLength / 1000)}k ctx</span>}
                </span>
              </button>
            );
          })
        )}
      </div>
    </fieldset>
  );
};

/** Paramètres › Intelligence artificielle: OpenRouter key and workspace-wide text / image models. */
export const AiSettings = ({ settingsId, keySet: initialKeySet, textModel: initialText, imageModel: initialImage, onFeedback }: AiSettingsProps) => {
  const [keySet, setKeySet] = useState(initialKeySet);
  const [apiKey, setApiKey] = useState("");
  const [textModel, setTextModel] = useState(initialText);
  const [imageModel, setImageModel] = useState(initialImage);
  const [models, setModels] = useState<{ text: ModelSummary[]; image: ModelSummary[] } | null>(null);
  const [modelsError, setModelsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedModels, setSavedModels] = useState({ text: initialText, image: initialImage });
  // Bumped after a new key is saved so the model lists are fetched with it.
  const [keyVersion, setKeyVersion] = useState(0);

  // Model lists need a valid key; refetch once a new key is saved.
  useEffect(() => {
    if (!keySet) return;
    let cancelled = false;
    apiFetch("/api/ai/models")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.message ?? "Impossible de charger les modèles");
        setModels(data);
        setModelsError("");
      })
      .catch((err) => !cancelled && setModelsError(err instanceof Error ? err.message : "Erreur"));
    return () => {
      cancelled = true;
    };
  }, [keySet, keyVersion]);

  const save = async (data: Record<string, string | null>) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/settings/${settingsId}`, { method: "PUT", body: JSON.stringify(data) });
      if (!res.ok) throw new Error();
      onFeedback("success", "Paramètres IA enregistrés");
      return true;
    } catch {
      onFeedback("error", "Erreur lors de la sauvegarde");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim()) return;
    if (await save({ openrouterApiKey: apiKey.trim() })) {
      setApiKey("");
      setModels(null);
      setKeySet(true);
      setKeyVersion((n) => n + 1);
    }
  };

  const removeKey = async () => {
    if (await save({ openrouterApiKey: "" })) {
      setKeySet(false);
      setModels(null);
    }
  };

  return (
    <section className="flex flex-col gap-[22px]">
      <div className="flex items-start gap-3.5 rounded-2xl bg-indigo-tint p-5">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-indigo text-white">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <b className="text-[15px] text-ink">OpenRouter</b>
          <span className="text-sm text-ink-2">
            Une seule clé pour accéder à des centaines de modèles. Les modèles choisis ici sont utilisés par tout l’espace : assistant, commande /image-ia.
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="label">
          Clé API OpenRouter
          <span className="flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keySet ? "Clé enregistrée — saisir pour la remplacer" : "sk-or-v1-…"}
              autoComplete="off"
              className="input min-w-[220px] flex-1 font-mono text-[13px]"
            />
            <button type="button" onClick={saveKey} disabled={saving || !apiKey.trim()} className="btn-ink">
              {keySet ? "Remplacer" : "Enregistrer"}
            </button>
            {keySet && (
              <button type="button" onClick={removeKey} disabled={saving} className="btn-danger">Retirer</button>
            )}
          </span>
        </label>
        <span className={`flex items-center gap-2 text-[13px] ${keySet ? "text-neon-ink" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${keySet ? "bg-neon-dot" : "bg-muted"}`} />
          {keySet ? "Clé enregistrée (chiffrée, jamais réaffichée)" : (
            <>Aucune clé — créez-en une sur <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-ink underline underline-offset-2">openrouter.ai/keys</a></>
          )}
        </span>
      </div>

      {keySet && (
        <>
          {modelsError && <p role="alert" className="rounded-[10px] bg-danger-tint px-4 py-3 text-sm text-danger-ink">{modelsError}</p>}
          <ModelPicker
            label="Modèle texte"
            hint="Pour l’assistant. Seuls les modèles compatibles avec les outils sont listés ; « images » et « fichiers » indiquent les pièces jointes acceptées."
            models={modelsError ? [] : models?.text ?? null}
            value={textModel}
            onChange={setTextModel}
          />
          <ModelPicker
            label="Modèle d’image"
            hint="Pour la commande /image-ia."
            models={modelsError ? [] : models?.image ?? null}
            value={imageModel}
            onChange={setImageModel}
          />
          <div className="flex justify-end border-t border-line-soft pt-3">
            <button
              type="button"
              onClick={async () => {
                if (await save({ aiTextModel: textModel, aiImageModel: imageModel })) setSavedModels({ text: textModel, image: imageModel });
              }}
              disabled={saving || (textModel === savedModels.text && imageModel === savedModels.image)}
              className="btn-ink"
            >
              {saving ? "Enregistrement…" : "Enregistrer les modèles"}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
