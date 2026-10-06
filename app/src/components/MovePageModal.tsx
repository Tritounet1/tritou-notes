import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { docTypeStyles } from "../utils/docTypes";
import { folderPaths, type FolderRow } from "../utils/folders";

interface PageRow {
  id: number;
  title: string;
  type: keyof typeof docTypeStyles;
  parentId: number | null;
  folderId: number | null;
}

/** Where the page ends up, to update its breadcrumb without refetching. */
export interface PageLocation {
  parentId: number | null;
  folderId: number | null;
  ancestors: { id: number; title: string }[];
  folders: { id: number; name: string }[];
}

interface MovePageModalProps {
  documentId: number;
  currentParentId: number | null;
  currentFolderId: number | null;
  onMoved: (location: PageLocation) => void;
  onClose: () => void;
}

/** Parent chain of `id` in a flat page list, root first, `id` included. */
const chainOf = (id: number, byId: Map<number, PageRow>) => {
  const chain: PageRow[] = [];
  for (let page = byId.get(id); page && !chain.includes(page); page = page.parentId ? byId.get(page.parentId) : undefined) {
    chain.unshift(page);
  }
  return chain;
};

/** Folder chain of `id`, root first. */
const folderChainOf = (id: number | null, folders: FolderRow[]) => {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: { id: number; name: string }[] = [];
  for (let f = id === null ? undefined : byId.get(id); f && !chain.some((c) => c.id === f!.id); f = f.parentId === null ? undefined : byId.get(f.parentId)) {
    chain.unshift({ id: f.id, name: f.name });
  }
  return chain;
};

const folderSvg = (
  <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

/**
 * Moves a page into a folder, under another page, or to the root.
 * The page's own subtree is excluded to prevent cycles.
 */
export const MovePageModal = ({ documentId, currentParentId, currentFolderId, onMoved, onClose }: MovePageModalProps) => {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/documents").then((res) => (res.ok ? res.json() : [])).then(setPages).catch(() => setPages([]));
    apiFetch("/api/folders").then((res) => (res.ok ? res.json() : [])).then(setFolders).catch(() => setFolders([]));
  }, []);

  const q = query.trim().toLowerCase();
  const byId = new Map((pages ?? []).map((page) => [page.id, page]));
  const inSubtree = (page: PageRow) => chainOf(page.id, byId).some((ancestor) => ancestor.id === documentId);
  const pageOptions = (pages ?? [])
    .filter((page) => !inSubtree(page))
    .map((page) => ({ page, path: chainOf(page.id, byId).map((p) => p.title || "Sans titre").join(" / ") }))
    .filter(({ path }) => path.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path, "fr"));
  const paths = folderPaths(folders);
  const folderOptions = folders
    .map((f) => ({ id: f.id, path: paths.get(f.id) ?? f.name }))
    .filter(({ path }) => path.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path, "fr"));

  const move = async (target: { parentId: number } | { folderId: number | null }) => {
    setSaving(true);
    setError("");
    try {
      // Root = no parent page and no folder.
      const body = "parentId" in target ? target : target.folderId === null ? { parentId: null, folderId: null } : target;
      const response = await apiFetch(`/api/documents/${documentId}`, { method: "PUT", body: JSON.stringify(body) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? "Déplacement impossible");
      if ("parentId" in target) {
        const ancestors = chainOf(target.parentId, byId);
        onMoved({
          parentId: target.parentId,
          folderId: null,
          ancestors: ancestors.map(({ id, title }) => ({ id, title })),
          folders: folderChainOf(ancestors[0]?.folderId ?? null, folders),
        });
      } else {
        onMoved({ parentId: null, folderId: target.folderId, ancestors: [], folders: folderChainOf(target.folderId, folders) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Déplacement impossible");
      setSaving(false);
    }
  };

  const row = (key: string, label: string, icon: React.ReactNode, isCurrent: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      disabled={saving || isCurrent}
      onClick={onClick}
      className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-left text-sm text-ink-2 transition hover:bg-indigo-tint hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {isCurrent && <span className="font-mono text-[11px] text-muted">actuel</span>}
    </button>
  );
  const isRoot = currentParentId === null && currentFolderId === null;

  return (
    <div className="modal-backdrop items-start pt-[12vh]" onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="move-page-title" className="modal flex max-h-[70vh] max-w-lg flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-3 border-b border-line-soft p-4">
          <h2 id="move-page-title" className="font-display text-xl font-bold tracking-tight">Déplacer la page</h2>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Chercher un dossier ou une page…"
            aria-label="Chercher une destination"
            className="input"
          />
          {error && <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-sm text-danger-ink">{error}</p>}
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {!q && row("root", "Racine (hors dossier, sans page parente)", <span className="h-2 w-2 shrink-0 rounded-[3px] bg-line-strong" />, isRoot, () => move({ folderId: null }))}
          {folderOptions.length > 0 && <p className="eyebrow px-2.5 pb-1 pt-2.5">Dossiers</p>}
          {folderOptions.map(({ id, path }) => row(`f${id}`, path, folderSvg, currentParentId === null && currentFolderId === id, () => move({ folderId: id })))}
          {pages === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Chargement…</p>
          ) : (
            <>
              {pageOptions.length > 0 && <p className="eyebrow px-2.5 pb-1 pt-2.5">Sous une page</p>}
              {pageOptions.map(({ page, path }) =>
                row(`p${page.id}`, path, <span className={`h-2 w-2 shrink-0 rounded-[3px] ${(docTypeStyles[page.type] ?? docTypeStyles.TEXT).dot}`} />, currentParentId === page.id, () => move({ parentId: page.id })),
              )}
              {q && !pageOptions.length && !folderOptions.length && <p className="px-3 py-6 text-center text-sm text-muted">Aucun résultat</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
