import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { docTypeStyles } from "../utils/docTypes";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  dot?: string;
  run: () => void | Promise<void>;
}

interface DocumentSummary {
  id: number;
  title: string;
  last_update: string;
  type: keyof typeof docTypeStyles;
}

const fetchList = async <T,>(url: string): Promise<T[]> => {
  const res = await apiFetch(url);
  return res.ok ? res.json() : [];
};

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Bolds the first occurrence of `query` (accent-insensitive; NFD keeps lengths aligned for Latin text). */
const Highlighted = ({ text, query }: { text: string; query: string }) => {
  const index = query ? normalize(text).indexOf(normalize(query)) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <b className="font-semibold text-ink">{text.slice(index, index + query.length)}</b>
      {text.slice(index + query.length)}
    </>
  );
};

/** ⌘K quick switcher over documents, scrapers, schedulers and pages. Mounted only while open. */
export const CommandPalette = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const { isAdmin, hasPermission } = useAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [scrapers, setScrapers] = useState<{ id: number; name: string }[]>([]);
  const [schedulers, setSchedulers] = useState<{ id: number; title: string }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const canScrape = hasPermission("accessScrapersPage");

  useEffect(() => {
    fetchList<DocumentSummary>("/api/documents").then(setDocuments).catch(console.error);
    if (canScrape) {
      fetchList<{ id: number; name: string }>("/api/scrapers").then(setScrapers).catch(console.error);
      fetchList<{ id: number; title: string }>("/api/scraping-schedulers").then(setSchedulers).catch(console.error);
    }
  }, [canScrape]);

  const go = (path: string) => () => {
    onClose();
    navigate(path);
  };

  const q = normalize(query.trim());
  const matches = (text: string) => !q || normalize(text).includes(q);

  const sortedDocs = [...documents].sort((a, b) => new Date(b.last_update).getTime() - new Date(a.last_update).getTime());
  const docItems: Item[] = sortedDocs
    .filter((d) => matches(d.title || "Sans titre"))
    .slice(0, q ? 8 : 5)
    .map((d) => ({
      id: `doc-${d.id}`,
      group: q ? "Pages" : "Récents",
      label: d.title || "Sans titre",
      dot: (docTypeStyles[d.type] ?? docTypeStyles.TEXT).dot,
      run: go(`/document/${d.id}`),
    }));

  const scrapingItems: Item[] = q
    ? [
        ...scrapers.filter((s) => matches(s.name)).slice(0, 4).map((s) => ({
          id: `scraper-${s.id}`, group: "Scraping", label: s.name, hint: "Scraper", run: go(`/scraper/${s.id}`),
        })),
        ...schedulers.filter((s) => matches(s.title)).slice(0, 4).map((s) => ({
          id: `scheduler-${s.id}`, group: "Scraping", label: s.title, hint: "Planificateur", run: go(`/scraping-scheduler/${s.id}`),
        })),
      ]
    : [];

  const pages: [string, string, boolean][] = [
    ["Accueil", "/dashboard", true],
    ["Scrapers", "/scrapers", canScrape],
    ["Instances", "/instances", hasPermission("accessInstancesScrapersPage")],
    ["Planificateurs", "/scraping-schedulers", canScrape],
    ["Utilisateurs", "/users", isAdmin],
    ["Paramètres", "/settings", true],
  ];
  const pageItems: Item[] = pages
    .filter(([label, , allowed]) => allowed && matches(label))
    .map(([label, path]) => ({ id: `page-${path}`, group: "Aller à", label, run: go(path) }));

  const actionItems: Item[] =
    hasPermission("createDocument") && query.trim()
      ? [{
          id: "create",
          group: "Actions",
          label: `Créer la page « ${query.trim()} »`,
          hint: "⌘↵",
          run: async () => {
            const res = await apiFetch("/api/documents", {
              method: "POST",
              body: JSON.stringify({ title: query.trim(), type: "TEXT" }),
            });
            if (res.ok) go(`/document/${(await res.json()).id}`)();
          },
        }]
      : [];

  const items = [...docItems, ...scrapingItems, ...pageItems, ...actionItems];
  const current = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(items.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = (e.metaKey || e.ctrlKey) && actionItems.length ? actionItems[0] : items[current];
      target?.run();
    }
  };

  let lastGroup = "";
  return (
    <div className="modal-backdrop items-start pt-[12vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Recherche rapide" className="modal max-w-[620px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-[18px] py-4 border-b border-line-soft">
          <svg className="w-[18px] h-[18px] text-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={items[current] ? `cmd-${items[current].id}` : undefined}
            aria-label="Rechercher"
            placeholder="Chercher une page, un scraper…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="flex-1 border-0 outline-none bg-transparent text-[17px] text-ink placeholder:text-muted/70"
          />
          <button type="button" onClick={onClose} className="font-mono text-[11px] px-[7px] py-[3px] rounded-md border border-line-strong bg-paper-soft text-muted cursor-pointer">
            esc
          </button>
        </div>
        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[min(60vh,440px)] overflow-y-auto p-2 flex flex-col gap-0.5 text-sm">
          {items.length === 0 && <p className="px-3 py-6 text-center text-muted">Aucun résultat</p>}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id} className="contents">
                {header && <span className="eyebrow px-2.5 pt-2.5 pb-1">{header}</span>}
                <div
                  id={`cmd-${item.id}`}
                  role="option"
                  aria-selected={index === current}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => item.run()}
                  className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-[10px] cursor-pointer text-ink-2 ${index === current ? "bg-indigo-tint" : ""}`}
                >
                  {item.dot ? (
                    <span className={`w-2 h-2 rounded-[3px] shrink-0 ${item.dot}`} />
                  ) : (
                    <span className="w-2 h-2 rounded-full shrink-0 border border-muted" />
                  )}
                  <span className="flex-1 truncate">
                    <Highlighted text={item.label} query={query.trim()} />
                  </span>
                  {item.hint && <span className="font-mono text-[11px] text-muted">{item.hint}</span>}
                  {index === current && !item.hint && <span className="font-mono text-[11px] text-indigo-ink">↵ ouvrir</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
