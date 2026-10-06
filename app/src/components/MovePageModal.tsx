import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { docTypeStyles } from "../utils/docTypes";

interface PageRow {
  id: number;
  title: string;
  type: keyof typeof docTypeStyles;
  parentId: number | null;
}

interface MovePageModalProps {
  documentId: number;
  currentParentId: number | null;
  onMoved: (parentId: number | null, ancestors: { id: number; title: string }[]) => void;
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

/** Picks a new parent for a page; its own subtree is excluded to prevent cycles. */
export const MovePageModal = ({ documentId, currentParentId, onMoved, onClose }: MovePageModalProps) => {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/documents")
      .then((res) => (res.ok ? res.json() : []))
      .then(setPages)
      .catch(() => setPages([]));
  }, []);

  const byId = new Map((pages ?? []).map((page) => [page.id, page]));
  const inSubtree = (page: PageRow) => chainOf(page.id, byId).some((ancestor) => ancestor.id === documentId);
  const candidates = (pages ?? [])
    .filter((page) => !inSubtree(page))
    .map((page) => ({ page, path: chainOf(page.id, byId).map((p) => p.title || "Sans titre").join(" / ") }))
    .filter(({ path }) => path.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path, "fr"));

  const move = async (parentId: number | null) => {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/documents/${documentId}`, {
        method: "PUT",
        body: JSON.stringify({ parentId }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? "Déplacement impossible");
      const ancestors = parentId === null ? [] : chainOf(parentId, byId).map(({ id, title }) => ({ id, title }));
      onMoved(parentId, ancestors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Déplacement impossible");
      setSaving(false);
    }
  };

  const option = (key: string, label: string, parentId: number | null, dot: string) => (
    <button
      key={key}
      type="button"
      disabled={saving || parentId === currentParentId}
      onClick={() => move(parentId)}
      className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-left text-sm text-ink-2 transition hover:bg-indigo-tint hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className={`h-2 w-2 shrink-0 rounded-[3px] ${dot}`} />
      <span className="flex-1 truncate">{label}</span>
      {parentId === currentParentId && <span className="font-mono text-[11px] text-muted">actuel</span>}
    </button>
  );

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
            placeholder="Chercher une page parente…"
            aria-label="Chercher une page parente"
            className="input"
          />
          {error && <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-sm text-danger-ink">{error}</p>}
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {!query.trim() && option("root", "Racine (aucune page parente)", null, "bg-line-strong")}
          {pages === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Chargement…</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Aucune page</p>
          ) : (
            candidates.map(({ page, path }) => option(String(page.id), path, page.id, (docTypeStyles[page.type] ?? docTypeStyles.TEXT).dot))
          )}
        </div>
      </div>
    </div>
  );
};
