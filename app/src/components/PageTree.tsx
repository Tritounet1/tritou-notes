import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { DOCUMENTS_CHANGED, notifyDocumentsChanged } from "../utils/documentEvents";
import { docTypeStyles } from "../utils/docTypes";

interface PageRow {
  id: number;
  title: string;
  type: keyof typeof docTypeStyles;
  parentId: number | null;
  created_at: string;
}

const toggle = (set: Set<number>, id: number, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

/** Notion-like page tree for the sidebar; the current page's ancestors open automatically. */
export const PageTree = () => {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [reload, setReload] = useState(0);
  // Manual overrides on top of the automatic "ancestors of the current page" expansion.
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [closed, setClosed] = useState<Set<number>>(new Set());

  useEffect(() => {
    const refresh = () => setReload((n) => n + 1);
    window.addEventListener(DOCUMENTS_CHANGED, refresh);
    return () => window.removeEventListener(DOCUMENTS_CHANGED, refresh);
  }, []);

  useEffect(() => {
    apiFetch("/api/documents")
      .then((res) => (res.ok ? res.json() : []))
      .then(setPages)
      .catch(console.error);
  }, [location.pathname, reload]);

  const currentId = Number(location.pathname.match(/^\/document\/(\d+)/)?.[1]);
  const byId = new Map(pages.map((page) => [page.id, page]));
  const childrenOf = new Map<number | null, PageRow[]>();
  for (const page of [...pages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    // A page whose parent is missing from the list is shown at the root rather than lost.
    const key = page.parentId !== null && byId.has(page.parentId) ? page.parentId : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), page]);
  }
  const autoOpen = new Set<number>();
  for (let page = byId.get(byId.get(currentId)?.parentId ?? NaN); page && !autoOpen.has(page.id); page = byId.get(page.parentId ?? NaN)) {
    autoOpen.add(page.id);
  }
  const isOpen = (id: number) => opened.has(id) || (autoOpen.has(id) && !closed.has(id));
  const setOpen = (id: number, on: boolean) => {
    setOpened((set) => toggle(set, id, on));
    setClosed((set) => toggle(set, id, !on));
  };

  const canCreate = hasPermission("createDocument");
  const addChild = async (parentId: number) => {
    const res = await apiFetch("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title: "Sans titre", type: "TEXT", parentId }),
    });
    if (!res.ok) return;
    const child = await res.json();
    setOpen(parentId, true);
    notifyDocumentsChanged();
    navigate(`/document/${child.id}`);
  };

  const renderLevel = (parentId: number | null, depth: number, seen: Set<number>): React.ReactNode =>
    (childrenOf.get(parentId) ?? [])
      .filter((page) => !seen.has(page.id))
      .map((page) => {
        const kids = childrenOf.get(page.id) ?? [];
        const open = isOpen(page.id);
        const active = page.id === currentId;
        const dot = (docTypeStyles[page.type] ?? docTypeStyles.TEXT).dot;
        return (
          <div key={page.id} role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={active}>
            <div
              className={`group flex min-h-8 items-center gap-1 rounded-[9px] pr-1 text-sm transition ${
                active
                  ? "bg-paper font-semibold text-ink shadow-[0_1px_2px_rgba(28,27,25,0.06),0_0_0_1px_var(--color-line-strong)]"
                  : "text-ink-2 hover:bg-black/[0.04]"
              }`}
              style={{ paddingLeft: 4 + depth * 14 }}
            >
              {kids.length ? (
                <button
                  type="button"
                  onClick={() => setOpen(page.id, !open)}
                  aria-label={open ? `Replier ${page.title}` : `Déplier ${page.title}`}
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-black/[0.06] hover:text-ink"
                >
                  <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className={`h-2 w-2 rounded-[3px] ${dot}`} />
                </span>
              )}
              <Link to={`/document/${page.id}`} className="min-w-0 flex-1 truncate py-1">
                {page.title || "Sans titre"}
              </Link>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => addChild(page.id)}
                  aria-label={`Ajouter une sous-page à ${page.title || "Sans titre"}`}
                  title="Ajouter une sous-page"
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-black/[0.06] hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              )}
            </div>
            {open && kids.length > 0 && <div role="group">{renderLevel(page.id, depth + 1, new Set(seen).add(page.id))}</div>}
          </div>
        );
      });

  if (!pages.length) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="eyebrow px-2.5 pb-1">Pages</div>
      <div role="tree" aria-label="Pages" className="flex flex-col gap-0.5">
        {renderLevel(null, 0, new Set())}
      </div>
    </div>
  );
};
