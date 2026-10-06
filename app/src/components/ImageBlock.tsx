import { useState } from "react";
import { API_URL } from "../api";
import { imageEndpoint, type DocumentImageBlock } from "../utils/documentImages";

interface Props {
  documentId: number;
  data: DocumentImageBlock;
  readOnly: boolean;
  onChange: (data: DocumentImageBlock) => void;
  onDelete?: () => void;
}
export function ImageBlock({ documentId, data, readOnly, onChange, onDelete }: Props) {
  const [failed, setFailed] = useState(false);
  const src = `${API_URL}${imageEndpoint(documentId, data.id)}`;
  return (
    <figure className="group relative my-5" style={{ width: `${data.width}%`, minWidth: "min(240px, 100%)", maxWidth: "100%", marginInline: "auto" }} onClick={event => event.stopPropagation()}>
      {!readOnly && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500">
          <label className="flex items-center gap-1">Largeur
            <select aria-label="Largeur de l’image" value={data.width} onChange={event => onChange({ ...data, width: Number(event.target.value) })} className="rounded border border-gray-200 bg-white px-2 py-1">
              {[25, 50, 75, 100].map(width => <option key={width} value={width}>{width} %</option>)}
            </select>
          </label>
          <a href={src} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 hover:bg-gray-100">Ouvrir ↗</a>
          <button type="button" onClick={onDelete} className="rounded px-2 py-1 text-red-500 hover:bg-red-50">Retirer</button>
        </div>
      )}
      {failed ? (
        <div role="status" className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          Image indisponible. <button type="button" onClick={() => setFailed(false)} className="underline">Réessayer</button>
        </div>
      ) : (
        <img src={src} alt={data.caption || data.alt} loading="lazy" crossOrigin="use-credentials" onError={() => setFailed(true)} className="block h-auto w-full rounded-lg object-contain" />
      )}
      {!readOnly ? (
        <input aria-label="Légende de l’image" type="text" maxLength={500} value={data.caption} onChange={event => onChange({ ...data, caption: event.target.value })} placeholder="Ajouter une légende…" className="mt-2 w-full border-none bg-transparent text-center text-sm text-gray-500 outline-none placeholder-gray-300" />
      ) : data.caption ? <figcaption className="mt-2 text-center text-sm text-gray-500">{data.caption}</figcaption> : null}
    </figure>
  );
}
