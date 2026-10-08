import { useState } from "react";
import { useDialog } from "../hooks/useDialog";
import { folderPaths, isInFolder, type FolderRow } from "../utils/folders";

interface FolderPickerModalProps {
  title: string;
  folders: FolderRow[];
  /** Folder being moved: it and its subfolders can't be picked. */
  excludeId?: number;
  currentId: number | null;
  onPick: (folderId: number | null) => void;
  onClose: () => void;
}

export const FolderPickerModal = ({ title, folders, excludeId, currentId, onPick, onClose }: FolderPickerModalProps) => {
  const dialog = useDialog(onClose);
  const [query, setQuery] = useState("");
  const paths = folderPaths(folders);
  const q = query.trim().toLowerCase();
  const options = folders
    .filter((f) => excludeId === undefined || !isInFolder(folders, f.id, excludeId))
    .map((f) => ({ id: f.id, path: paths.get(f.id) ?? f.name }))
    .filter((o) => !q || o.path.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path, "fr"));

  const option = (id: number | null, label: string) => (
    <button
      key={id ?? "root"}
      type="button"
      disabled={id === currentId}
      onClick={() => onPick(id)}
      className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-sm text-ink-2 transition hover:bg-indigo-tint hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="truncate">{label}</span>
      {id === currentId && <span className="font-mono text-[11px] text-muted">actuel</span>}
    </button>
  );

  return (
    <div className="modal-backdrop items-start pt-[12vh]" onClick={onClose}>
      <div {...dialog} role="dialog" aria-modal="true" aria-label={title} className="modal flex max-h-[70vh] max-w-md flex-col overflow-hidden outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-3 border-b border-line-soft p-4">
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un dossier…"
            aria-label="Chercher un dossier"
            className="input"
          />
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {!q && option(null, "Racine (hors dossier)")}
          {options.map((o) => option(o.id, o.path))}
          {q && options.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Aucun dossier</p>}
        </div>
      </div>
    </div>
  );
};
