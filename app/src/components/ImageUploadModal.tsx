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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={() => { if (!busy) onClose(); }}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="image-upload-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}
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
          <h2 id="image-upload-title" className="text-lg font-semibold text-gray-900">Ajouter des images</h2>
          <button ref={close} type="button" disabled={busy} aria-label="Fermer" onClick={onClose} className="rounded p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-40">✕</button>
        </div>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) select(Array.from(event.dataTransfer.files)); }} className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-6 text-gray-600 hover:border-gray-400 disabled:opacity-50">
          <span className="text-2xl" aria-hidden="true">▧</span>
          <span className="text-sm">Choisir des images ou les déposer ici</span>
          <span className="text-xs text-gray-400">JPEG, PNG, WebP, GIF · 10 Mo par image</span>
        </button>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple disabled={busy} className="sr-only" tabIndex={-1} aria-label="Fichiers images" onChange={event => { select(Array.from(event.target.files || [])); event.target.value = ""; }} />
        {files.length > 0 && <ul className="my-4 max-h-36 overflow-auto text-sm text-gray-600">{files.map((file, index) => <li key={`${file.name}-${index}`} className="truncate py-1">{file.name} <span className="text-xs text-gray-400">({(file.size / 1024 / 1024).toFixed(1)} Mo)</span></li>)}</ul>}
        {progress && <p role="status" className="mt-3 text-sm text-gray-500">{progress}</p>}
        {error && <p role="alert" className="mt-3 whitespace-pre-line text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-40">Annuler</button>
          <button type="button" disabled={!files.length || busy} onClick={() => void upload()} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-40">{busy ? "Envoi…" : "Insérer"}</button>
        </div>
      </div>
    </div>
  );
}
