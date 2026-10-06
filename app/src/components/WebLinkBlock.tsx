import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import { isWebUrl, youtubeVideo, type LinkMode, type WebLink } from "../utils/webLinks";

interface WebLinkBlockProps {
  data: WebLink;
  readOnly: boolean;
  initialOpen?: boolean;
  onChange: (data: WebLink) => void;
  onDelete?: () => void;
}

const choices: { mode: LinkMode; label: string; description: string; icon: string }[] = [
  { mode: "url", label: "URL simple", description: "Conserver le lien dans le texte", icon: "↗" },
  { mode: "embed", label: "Intégrer", description: "Afficher la vidéo ou la page ici", icon: "▣" },
  { mode: "preview", label: "Aperçu visuel", description: "Une carte avec titre, description et image", icon: "▤" },
];

export function WebLinkBlock({ data, readOnly, initialOpen, onChange, onDelete }: WebLinkBlockProps) {
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const video = youtubeVideo(data.url);
  const image = data.image || video?.image;
  const host = new URL(data.url).hostname;

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const choose = async (mode: LinkMode) => {
    request.current?.abort();
    setOpen(false);
    setPreviewError("");
    setLoading(false);
    setPlaying(false);
    const next = { ...data, mode };
    onChange(next);
    toggle.current?.focus();
    if (mode !== "preview" || data.title) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/link-preview?url=${encodeURIComponent(data.url)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("L’aperçu est indisponible pour cette page.");
      const metadata = await response.json();
      if (!controller.signal.aborted) change.current({
        ...next,
        title: typeof metadata.title === "string" ? metadata.title : host,
        description: typeof metadata.description === "string" ? metadata.description : "",
        siteName: typeof metadata.siteName === "string" ? metadata.siteName : host,
        image: typeof metadata.image === "string" && isWebUrl(metadata.image) ? metadata.image : undefined,
      });
    } catch (error) {
      if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : "Aperçu indisponible.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <div ref={root} className="group relative my-3" onClick={event => event.stopPropagation()}>
      {!readOnly && (
        <div className="mb-1 flex justify-end">
          <button ref={toggle} type="button" aria-label="Choisir l’affichage du lien" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-gray-400">
            {choices.find(choice => choice.mode === data.mode)?.label} <span aria-hidden="true">⌄</span>
          </button>
        </div>
      )}
      {open && !readOnly && (
        <div ref={menu} role="dialog" aria-label="Afficher ce lien sous quelle forme ?" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }} className="absolute right-0 top-8 z-30 w-80 max-w-full rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
          <p className="px-3 py-2 text-xs font-medium text-gray-400">Afficher ce lien sous quelle forme ?</p>
          {choices.map(choice => (
            <button key={choice.mode} type="button" onClick={() => void choose(choice.mode)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-lg text-gray-500">{choice.icon}</span>
              <span><span className="block text-sm text-gray-800">{choice.label}</span><span className="block text-xs text-gray-400">{choice.description}</span></span>
            </button>
          ))}
          {onDelete && <button type="button" onClick={onDelete} className="mt-1 w-full rounded-lg border-t border-gray-100 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50">Supprimer le lien</button>}
        </div>
      )}
      {data.mode === "url" ? (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-600">{data.url}</a>
      ) : data.mode === "preview" ? (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex min-h-32 overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:bg-gray-50">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-5 py-4">
            <p className="truncate text-sm font-medium text-gray-800">{loading ? "Chargement de l’aperçu…" : data.title || (video ? "Vidéo YouTube" : host)}</p>
            {data.description && <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{data.description}</p>}
            <p className="truncate text-xs text-gray-400">{data.siteName || host} · {data.url}</p>
          </div>
          {image && failedImage !== image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="w-28 shrink-0 object-cover sm:w-48" />}
        </a>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {video && !playing ? (
            <button type="button" onClick={() => setPlaying(true)} aria-label="Lire la vidéo YouTube" className="relative block aspect-video w-full overflow-hidden bg-gray-900">
              {image && failedImage !== image && <img src={image} alt={data.title || "Aperçu de la vidéo YouTube"} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="h-full w-full object-cover" />}
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/10"><span className="flex h-14 w-20 items-center justify-center rounded-2xl bg-red-600 text-3xl text-white shadow-lg">▶</span></span>
            </button>
          ) : (
            <iframe src={video?.embed || data.url} title={data.title || `Page intégrée : ${host}`} className={video ? "aspect-video min-h-[200px] w-full" : "h-[420px] w-full"} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox={video ? "allow-scripts allow-same-origin allow-presentation" : "allow-scripts allow-forms allow-popups allow-presentation"} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
          )}
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
            <span className="truncate">{video ? data.title || "YouTube" : "Si la page ne s’affiche pas, ouvrez le lien."}</span>
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:text-gray-900">Ouvrir ↗</a>
          </div>
        </div>
      )}
      {previewError && <p role="status" className="mt-2 text-xs text-gray-500">{previewError} {!readOnly && <button type="button" onClick={() => void choose("preview")} className="underline">Réessayer</button>}</p>}
    </div>
  );
}
