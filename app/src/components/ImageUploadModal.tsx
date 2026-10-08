import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import { IMAGE_ACCEPT, MAX_IMAGE_SIZE, type DocumentImageBlock } from "../utils/documentImages";

interface Props {
  documentId: number;
  initialFiles: File[];
  onInsert: (images: DocumentImageBlock[]) => void;
  onClose: () => void;
}
export function ImageUploadModal({ documentId, initialFiles, onInsert, onClose }: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const insert = useRef(onInsert);
  useEffect(() => { insert.current = onInsert; }, [onInsert]);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => { request.current?.abort(); previous?.focus(); };
  }, []);

  const select = (selected: File[]) => {
    setError("");
    if (selected.length > 10) { setError("Sélectionnez au maximum 10 images à la fois."); return; }
    const invalid = selected.find(file => !IMAGE_ACCEPT.split(",").includes(file.type) || file.size > MAX_IMAGE_SIZE || !file.size);
    if (invalid) { setError(`${invalid.name} : utilisez une image JPEG, PNG, WebP ou GIF de 10 Mo maximum.`); return; }
    setFiles(selected);
  };

  const upload = async () => {
    if (!files.length || busy) return;
    if (files.length > 10) { setError("Sélectionnez au maximum 10 images à la fois."); return; }
    setBusy(true); setError("");
    const controller = new AbortController();
    request.current = controller;
    const succeeded: DocumentImageBlock[] = [];
    const failed: File[] = [];
    const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      if (controller.signal.aborted) break;
      setProgress(`Envoi de l’image ${index + 1} sur ${files.length}…`);
      try {
        if (file.size > MAX_IMAGE_SIZE) throw new Error("L’image dépasse 10 Mo.");
        const body = new FormData(); body.append("image", file);
        const response = await apiFetch(`/api/documents/${documentId}/images`, { method: "POST", body, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Impossible d’envoyer cette image.");
        succeeded.push({ id: data.id, caption: "", alt: String(data.filename).slice(0, 255), width: 100 });
      } catch (failure) {
        if (controller.signal.aborted) break;
        failed.push(file);
        errors.push(`${file.name} : ${failure instanceof Error ? failure.message : "Échec de l’envoi"}`);
      }
    }
    if (controller.signal.aborted) return;
    if (succeeded.length) insert.current(succeeded);
    setBusy(false); setProgress(""); setFiles(failed);
    if (!failed.length) onClose();
    else setError(errors.join("\n"));
  };

  return (
    <div className="modal-backdrop z-[70]" onClick={() => { if (!busy) onClose(); }}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="image-upload-title" className="modal max-w-lg p-6" onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === "Escape" && !busy) onClose();
          if (event.key === "Tab") {
            const controls = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
            if (!controls.length) { event.preventDefault(); return; }
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 id="image-upload-title" className="font-display text-xl font-bold tracking-tight text-ink">Ajouter des images</h2>
          <button ref={close} type="button" disabled={busy} aria-label="Fermer" onClick={onClose} className="icon-btn disabled:opacity-40"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) select(Array.from(event.dataTransfer.files)); }} className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-stone-line bg-paper-warm px-4 py-6 text-ink-2 hover:border-muted transition disabled:opacity-50">
          <span className="w-10 h-10 rounded-full bg-paper border border-line-strong flex items-center justify-center" aria-hidden="true"><svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6M15 9h.01" /></svg></span>
          <span className="text-sm font-medium">Choisir des images ou les déposer ici</span>
          <span className="text-xs text-muted">JPEG, PNG, WebP, GIF · 10 Mo par image</span>
        </button>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple disabled={busy} className="sr-only" tabIndex={-1} aria-label="Fichiers images" onChange={event => { select(Array.from(event.target.files || [])); event.target.value = ""; }} />
        {files.length > 0 && <ul className="my-4 max-h-36 overflow-auto text-sm text-ink-2">{files.map((file, index) => <li key={`${file.name}-${index}`} className="truncate py-1">{file.name} <span className="font-mono text-xs text-muted">({(file.size / 1024 / 1024).toFixed(1)} Mo)</span></li>)}</ul>}
        {progress && <p role="status" className="mt-3 text-sm text-muted">{progress}</p>}
        {error && <p role="alert" className="mt-3 whitespace-pre-line text-sm text-danger-ink">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="button" disabled={!files.length || busy} onClick={() => void upload()} className="btn-primary">{busy ? "Envoi…" : "Insérer"}</button>
        </div>
      </div>
    </div>
  );
}
