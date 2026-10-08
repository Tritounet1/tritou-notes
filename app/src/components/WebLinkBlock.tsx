import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
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
  // Anonymous readers of a public page load nothing from the third-party site (which would
  // reveal their IP address) until they ask for it.
  const { isAuthenticated } = useAuth();
  const [thirdPartyAllowed, setThirdPartyAllowed] = useState(false);
  const showThirdParty = isAuthenticated || thirdPartyAllowed;
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
          <button ref={toggle} type="button" aria-label="Choisir l’affichage du lien" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} className="cursor-pointer rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-chip hover:text-ink focus-visible:outline-2 focus-visible:outline-indigo">
            {choices.find(choice => choice.mode === data.mode)?.label} <span aria-hidden="true">⌄</span>
          </button>
        </div>
      )}
      {open && !readOnly && (
        <div ref={menu} role="dialog" aria-label="Afficher ce lien sous quelle forme ?" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }} className="absolute right-0 top-8 z-30 w-80 max-w-full rounded-[14px] bg-paper p-1.5 leading-[1.3] shadow-[0_18px_50px_-12px_rgba(28,27,25,0.35),0_0_0_1px_var(--color-line-strong)]">
          <p className="eyebrow px-2.5 pt-1.5 pb-1">Afficher ce lien sous quelle forme ?</p>
          {choices.map(choice => (
            <button key={choice.mode} type="button" onClick={() => void choose(choice.mode)} className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-paper-soft focus-visible:bg-indigo-tint focus-visible:outline-none ${choice.mode === data.mode ? "bg-indigo-tint" : ""}`}>
              <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line bg-chip text-base text-ink-2">{choice.icon}</span>
              <span><span className="block text-sm font-medium text-ink">{choice.label}</span><span className="block text-xs text-muted">{choice.description}</span></span>
            </button>
          ))}
          {onDelete && <button type="button" onClick={onDelete} className="mt-1 w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-xs text-danger-ink hover:bg-danger-tint">Supprimer le lien</button>}
        </div>
      )}
      {data.mode === "url" ? (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="break-all text-indigo-ink underline decoration-indigo-soft underline-offset-4 hover:decoration-indigo">{data.url}</a>
      ) : data.mode === "preview" ? (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex gap-3.5 rounded-2xl border border-line-strong bg-paper p-3.5 leading-[1.4] text-ink no-underline transition hover:border-indigo-soft hover:bg-paper-warm">
          {showThirdParty && image && failedImage !== image
            ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="h-[72px] w-24 shrink-0 rounded-[10px] object-cover sm:h-24 sm:w-36" />
            : <span aria-hidden="true" className="cover-stripes h-[72px] w-24 shrink-0 rounded-[10px]" />}
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <span className="truncate text-[15px] font-semibold">{loading ? "Chargement de l’aperçu…" : data.title || (video ? "Vidéo YouTube" : host)}</span>
            {data.description && <span className="line-clamp-2 text-[13px] text-muted">{data.description}</span>}
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted">
              <svg aria-hidden="true" className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
              <span className="truncate">{data.siteName || host}</span>
            </span>
          </span>
        </a>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line-strong bg-paper-soft">
          {video && !playing ? (
            <button type="button" onClick={() => setPlaying(true)} aria-label="Lire la vidéo YouTube" className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-ink">
              {showThirdParty && image && failedImage !== image && <img src={image} alt={data.title || "Aperçu de la vidéo YouTube"} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="h-full w-full object-cover" />}
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-ink/10"><span className="flex h-14 w-20 items-center justify-center rounded-2xl bg-ink text-neon shadow-lg"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg></span></span>
            </button>
          ) : !video && !showThirdParty ? (
            <button type="button" onClick={() => setThirdPartyAllowed(true)} className="flex h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-1 text-sm text-ink-2 hover:bg-chip">
              <span className="font-medium">Afficher la page intégrée</span>
              <span className="text-xs text-muted">Le contenu est chargé depuis {host}.</span>
            </button>
          ) : (
            <iframe src={video?.embed || data.url} title={data.title || `Page intégrée : ${host}`} className={video ? "aspect-video min-h-[200px] w-full" : "h-[420px] w-full"} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox={video ? "allow-scripts allow-same-origin allow-presentation" : "allow-scripts allow-forms allow-popups allow-presentation"} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
          )}
          <div className="flex items-center justify-between gap-3 border-t border-line-strong px-4 py-2 text-xs text-muted">
            <span className="truncate">{video ? data.title || "YouTube" : "Si la page ne s’affiche pas, ouvrez le lien."}</span>
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-indigo-ink hover:text-ink">Ouvrir ↗</a>
          </div>
        </div>
      )}
      {previewError && <p role="status" className="mt-2 text-xs text-muted">{previewError} {!readOnly && <button type="button" onClick={() => void choose("preview")} className="cursor-pointer text-indigo-ink underline">Réessayer</button>}</p>}
    </div>
  );
}
