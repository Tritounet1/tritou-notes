import { useState } from "react";
import { apiFetch } from "../api";
import type { DocumentImageBlock } from "../utils/documentImages";

interface AiImageModalProps {
  documentId: number;
  onInsert: (images: DocumentImageBlock[]) => void;
  onClose: () => void;
}

/** /image-ia: generates an image with the workspace image model and inserts it as an image block. */
export const AiImageModal = ({ documentId, onInsert, onClose }: AiImageModalProps) => {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/ai/images", { method: "POST", body: JSON.stringify({ prompt: prompt.trim(), documentId }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "La génération a échoué");
      onInsert([{ id: data.id, caption: "", alt: prompt.trim().slice(0, 255), width: 100 }]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La génération a échoué");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="ai-image-title" className="modal flex max-w-lg flex-col gap-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m3 16 5-5 4 4 3-3 6 6M15 9h.01" />
            </svg>
          </span>
          <h2 id="ai-image-title" className="font-display text-xl font-bold tracking-tight text-ink">Générer une image</h2>
        </div>
        <label className="label">
          Description
          <textarea
            autoFocus
            rows={4}
            value={prompt}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) onClose();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
            }}
            placeholder="Un renard roux qui lit un carnet sous un lampadaire, style illustration à l’encre…"
            className="input min-h-24 resize-y py-2.5"
          />
        </label>
        {error && <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-sm text-danger-ink">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">{busy ? "Génération en cours, cela peut prendre une minute…" : "⌘↵ pour générer"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Annuler</button>
            <button type="button" onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary">
              {busy ? "Génération…" : "Générer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
