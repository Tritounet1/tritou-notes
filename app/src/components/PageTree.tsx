import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { DOCUMENTS_CHANGED, notifyDocumentsChanged } from "../utils/documentEvents";
import { docTypeStyles } from "../utils/docTypes";
import { type FolderRow } from "../utils/folders";
import { FolderPickerModal } from "./FolderPickerModal";

interface PageRow {
  id: number;
  title: string;
  type: keyof typeof docTypeStyles;
  parentId: number | null;
  folderId: number | null;
  created_at: string;
}

type DragItem = { kind: "page" | "folder"; id: number };
const DRAG_TYPE = "application/x-tritou-item";
const OPEN_FOLDERS_KEY = "tritou:open-folders";

const toggle = (set: Set<number>, id: number, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

// Folder open/closed state survives reloads; storage may be unavailable (private mode).
const loadOpenFolders = () => {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(OPEN_FOLDERS_KEY) ?? "[]"));
  } catch {
    return new Set<number>();
  }
};

const Svg = ({ children, className = "h-3.5 w-3.5" }: { children: ReactNode; className?: string }) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const chevron = <path d="m9 6 6 6-6 6" />;
const plus = <path d="M12 5v14M5 12h14" />;
const folderIcon = (open: boolean) =>
  open ? <path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 8h18l-2 10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> : <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />;

const rowClass = (active: boolean, dropTarget = false) =>
  `group relative flex min-h-8 items-center gap-1 rounded-[9px] pr-1 text-sm transition ${
    dropTarget
      ? "bg-indigo-tint ring-1 ring-indigo"
      : active
        ? "bg-paper font-semibold text-ink shadow-[0_1px_2px_rgba(28,27,25,0.06),0_0_0_1px_var(--color-line-strong)]"
        : "text-ink-2 hover:bg-black/[0.04]"
  }`;
const hoverButton =
  "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-black/[0.06] hover:text-ink group-hover:opacity-100 focus-visible:opacity-100";

/**
 * Sidebar tree: folders (closed by default, open state remembered) and pages with their
 * sub-pages. Folders and pages can be dragged into folders, or onto « Pages » for the root.
 */
export const PageTree = () => {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [confirm, confirmDialog] = useConfirm();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [reload, setReload] = useState(0);
  // Pages: manual overrides on top of the automatic "path to the current page" expansion.
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<number>>(loadOpenFolders);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [movingFolder, setMovingFolder] = useState<FolderRow | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canCreate = hasPermission("createDocument");
  const canModify = hasPermission("modifyDocument");
  const canDelete = hasPermission("deleteDocument");

  useEffect(() => {
    const refresh = () => setReload((n) => n + 1);
    window.addEventListener(DOCUMENTS_CHANGED, refresh);
    return () => window.removeEventListener(DOCUMENTS_CHANGED, refresh);
  }, []);

  useEffect(() => {
    apiFetch("/api/documents").then((res) => (res.ok ? res.json() : [])).then(setPages).catch(console.error);
    apiFetch("/api/folders").then((res) => (res.ok ? res.json() : [])).then(setFolders).catch(console.error);
  }, [location.pathname, reload]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify([...openFolders]));
    } catch {
      // Not persisted: the tree still works for this session.
    }
  }, [openFolders]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuFor]);

  // ---- Structure ----
  const currentId = Number(location.pathname.match(/^\/document\/(\d+)/)?.[1]);
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const subPages = new Map<number, PageRow[]>();
  const pagesInFolder = new Map<number | null, PageRow[]>();
  for (const page of [...pages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (page.parentId !== null && pageById.has(page.parentId)) {
      subPages.set(page.parentId, [...(subPages.get(page.parentId) ?? []), page]);
    } else {
      // Root page; a missing folder shows it at the root rather than losing it.
      const key = page.folderId !== null && folderById.has(page.folderId) ? page.folderId : null;
      pagesInFolder.set(key, [...(pagesInFolder.get(key) ?? []), page]);
    }
  }
  const foldersIn = new Map<number | null, FolderRow[]>();
  for (const folder of folders) {
    const key = folder.parentId !== null && folderById.has(folder.parentId) ? folder.parentId : null;
    foldersIn.set(key, [...(foldersIn.get(key) ?? []), folder]);
  }

  // Open the pages and folders leading to the current page.
  const autoOpenPages = new Set<number>();
  let root = pageById.get(currentId);
  for (let page = pageById.get(root?.parentId ?? NaN); page && !autoOpenPages.has(page.id); page = pageById.get(page.parentId ?? NaN)) {
    autoOpenPages.add(page.id);
    root = page;
  }
  const autoOpenFolders = new Set<number>();
  for (let folder = folderById.get(root?.folderId ?? NaN); folder && !autoOpenFolders.has(folder.id); folder = folderById.get(folder.parentId ?? NaN)) {
    autoOpenFolders.add(folder.id);
  }

  const isPageOpen = (id: number) => opened.has(id) || (autoOpenPages.has(id) && !closed.has(id));
  const setPageOpen = (id: number, on: boolean) => {
    setOpened((set) => toggle(set, id, on));
    setClosed((set) => toggle(set, id, !on));
  };
  const isFolderOpen = (id: number) => openFolders.has(id) || autoOpenFolders.has(id);
  const setFolderOpen = (id: number, on: boolean) => setOpenFolders((set) => toggle(set, id, on));

  // ---- Actions ----
  const refresh = () => notifyDocumentsChanged();

  const createPage = async (target: { parentId?: number; folderId?: number }) => {
    const res = await apiFetch("/api/documents", { method: "POST", body: JSON.stringify({ title: "Sans titre", type: "TEXT", ...target }) });
    if (!res.ok) return;
    const page = await res.json();
    if (target.parentId) setPageOpen(target.parentId, true);
    if (target.folderId) setFolderOpen(target.folderId, true);
    refresh();
    navigate(`/document/${page.id}`);
  };

  const createFolder = async (parentId: number | null) => {
    setMenuFor(null);
    const res = await apiFetch("/api/folders", { method: "POST", body: JSON.stringify({ name: "Nouveau dossier", parentId }) });
    if (!res.ok) return;
    const folder: FolderRow = await res.json();
    if (parentId !== null) setFolderOpen(parentId, true);
    setFolders((list) => [...list, folder]);
    setRenaming(folder.id);
  };

  const updateFolder = async (id: number, data: { name?: string; parentId?: number | null }) => {
    const res = await apiFetch(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    if (res.ok) {
      const updated: FolderRow = await res.json();
      setFolders((list) => list.map((f) => (f.id === id ? updated : f)));
      if (data.parentId) setFolderOpen(data.parentId, true);
    }
    return res.ok;
  };

  const deleteFolder = async (folder: FolderRow) => {
    setMenuFor(null);
    const destination = folder.parentId !== null ? `« ${folderById.get(folder.parentId)?.name} »` : "la racine";
    const ok = await confirm({
      title: `Supprimer le dossier « ${folder.name} » ?`,
      message: `Aucune page n’est supprimée : son contenu (pages et sous-dossiers) est déplacé dans ${destination}.`,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (res.ok) refresh();
  };

  const movePage = async (id: number, folderId: number | null) => {
    const page = pageById.get(id);
    if (!page || (page.parentId === null && page.folderId === folderId)) return;
    const res = await apiFetch(`/api/documents/${id}`, { method: "PUT", body: JSON.stringify(folderId === null ? { parentId: null, folderId: null } : { folderId }) });
    if (res.ok) {
      if (folderId !== null) setFolderOpen(folderId, true);
      refresh();
    }
  };

  // ---- Drag and drop ----
  const dragProps = (item: DragItem) =>
    canModify
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
            e.dataTransfer.effectAllowed = "move";
          },
        }
      : {};

  const dropProps = (target: number | "root") =>
    canModify
      ? {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(target);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDropTarget(null);
            const raw = e.dataTransfer.getData(DRAG_TYPE);
            if (!raw) return;
            const item: DragItem = JSON.parse(raw);
            const folderId = target === "root" ? null : target;
            if (item.kind === "page") void movePage(item.id, folderId);
            else if (item.id !== folderId) void updateFolder(item.id, { parentId: folderId }).then((ok) => ok || refresh());
          },
        }
      : {};

  // ---- Rendering ----
  const renderPages = (list: PageRow[], depth: number, seen: Set<number>): ReactNode =>
    list
      .filter((page) => !seen.has(page.id))
      .map((page) => {
        const kids = subPages.get(page.id) ?? [];
        const open = isPageOpen(page.id);
        const active = page.id === currentId;
        const dot = (docTypeStyles[page.type] ?? docTypeStyles.TEXT).dot;
        return (
          <div key={`p${page.id}`} role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={active}>
            <div className={rowClass(active)} style={{ paddingLeft: 4 + depth * 14 }} {...dragProps({ kind: "page", id: page.id })}>
              {kids.length ? (
                <button
                  type="button"
                  onClick={() => setPageOpen(page.id, !open)}
                  aria-label={open ? `Replier ${page.title}` : `Déplier ${page.title}`}
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-black/[0.06] hover:text-ink"
                >
                  <Svg className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}>{chevron}</Svg>
                </button>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className={`h-2 w-2 rounded-[3px] ${dot}`} />
                </span>
              )}
              <Link to={`/document/${page.id}`} className="min-w-0 flex-1 truncate py-1" draggable={false}>
                {page.title || "Sans titre"}
              </Link>
              {canCreate && (
                <button type="button" onClick={() => createPage({ parentId: page.id })} aria-label={`Ajouter une sous-page à ${page.title || "Sans titre"}`} title="Ajouter une sous-page" className={hoverButton}>
                  <Svg>{plus}</Svg>
                </button>
              )}
            </div>
            {open && kids.length > 0 && <div role="group">{renderPages(kids, depth + 1, new Set(seen).add(page.id))}</div>}
          </div>
        );
      });

  const renderFolders = (parentId: number | null, depth: number, seen: Set<number>): ReactNode =>
    (foldersIn.get(parentId) ?? [])
      .filter((folder) => !seen.has(folder.id))
      .map((folder) => {
        const open = isFolderOpen(folder.id);
        const nextSeen = new Set(seen).add(folder.id);
        const empty = !(foldersIn.get(folder.id)?.length || pagesInFolder.get(folder.id)?.length);
        return (
          <div key={`f${folder.id}`} role="treeitem" aria-expanded={open}>
            <div className={rowClass(false, dropTarget === folder.id)} style={{ paddingLeft: 4 + depth * 14 }} {...dragProps({ kind: "folder", id: folder.id })} {...dropProps(folder.id)}>
              <button
                type="button"
                onClick={() => setFolderOpen(folder.id, !open)}
                aria-label={open ? `Fermer le dossier ${folder.name}` : `Ouvrir le dossier ${folder.name}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-1 text-left"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted">
                  <Svg className="h-4 w-4">{folderIcon(open)}</Svg>
                </span>
                {renaming === folder.id ? null : <span className="truncate">{folder.name}</span>}
              </button>
              {renaming === folder.id && (
                <input
                  autoFocus
                  defaultValue={folder.name}
                  aria-label="Nom du dossier"
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    setRenaming(null);
                    if (name && name !== folder.name) void updateFolder(folder.id, { name });
                  }}
                  className="absolute inset-y-0.5 right-1 left-9 min-w-0 rounded-md border border-indigo bg-paper px-1.5 text-sm text-ink outline-none"
                  style={{ left: 32 + depth * 14 }}
                />
              )}
              {canCreate && renaming !== folder.id && (
                <button type="button" onClick={() => createPage({ folderId: folder.id })} aria-label={`Nouvelle page dans ${folder.name}`} title="Nouvelle page dans ce dossier" className={hoverButton}>
                  <Svg>{plus}</Svg>
                </button>
              )}
              {(canCreate || canModify || canDelete) && renaming !== folder.id && (
                <button
                  type="button"
                  onClick={() => setMenuFor(menuFor === folder.id ? null : folder.id)}
                  aria-label={`Actions du dossier ${folder.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === folder.id}
                  className={`${hoverButton} ${menuFor === folder.id ? "opacity-100" : ""}`}
                >
                  <Svg><path d="M5 12h.01M12 12h.01M19 12h.01" /></Svg>
                </button>
              )}
              {menuFor === folder.id && (
                <div ref={menuRef} role="menu" className="absolute right-0 top-full z-30 mt-1 flex w-48 flex-col rounded-xl bg-paper p-1 text-sm shadow-[0_12px_32px_-12px_rgba(28,27,25,0.35),0_0_0_1px_var(--color-line-strong)]">
                  {canCreate && <MenuItem onClick={() => createFolder(folder.id)}>Nouveau sous-dossier</MenuItem>}
                  {canModify && <MenuItem onClick={() => { setMenuFor(null); setRenaming(folder.id); }}>Renommer</MenuItem>}
                  {canModify && <MenuItem onClick={() => { setMenuFor(null); setMovingFolder(folder); }}>Déplacer…</MenuItem>}
                  {canDelete && <MenuItem danger onClick={() => deleteFolder(folder)}>Supprimer</MenuItem>}
                </div>
              )}
            </div>
            {open && (
              <div role="group">
                {renderFolders(folder.id, depth + 1, nextSeen)}
                {renderPages(pagesInFolder.get(folder.id) ?? [], depth + 1, new Set())}
                {empty && <p className="py-1 text-xs text-muted" style={{ paddingLeft: 36 + depth * 14 }}>Vide</p>}
              </div>
            )}
          </div>
        );
      });

  if (!pages.length && !folders.length) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {confirmDialog}
      <div className={`group flex items-center justify-between rounded-md pr-1 ${dropTarget === "root" ? "bg-indigo-tint ring-1 ring-indigo" : ""}`} {...dropProps("root")}>
        <div className="eyebrow px-2.5 py-1">Pages</div>
        {canCreate && (
          <button type="button" onClick={() => createFolder(null)} aria-label="Nouveau dossier" title="Nouveau dossier" className={hoverButton}>
            <Svg><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6" /></Svg>
          </button>
        )}
      </div>
      <div role="tree" aria-label="Pages" className="flex flex-col gap-0.5">
        {renderFolders(null, 0, new Set())}
        {renderPages(pagesInFolder.get(null) ?? [], 0, new Set())}
      </div>
      {movingFolder && (
        <FolderPickerModal
          title={`Déplacer « ${movingFolder.name} »`}
          folders={folders}
          excludeId={movingFolder.id}
          currentId={movingFolder.parentId}
          onPick={async (parentId) => {
            if (await updateFolder(movingFolder.id, { parentId })) setMovingFolder(null);
          }}
          onClose={() => setMovingFolder(null)}
        />
      )}
    </div>
  );
};

const MenuItem = ({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-left transition ${danger ? "text-danger-ink hover:bg-danger-tint" : "text-ink-2 hover:bg-paper-soft hover:text-ink"}`}
  >
    {children}
  </button>
);
