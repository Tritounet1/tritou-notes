import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { useDebounce } from "./hooks/useDebounce";
import type { TemplateBlock } from "./types/scraper";

interface Scraper {
  id: number;
  name: string;
  description: string | null;
  code: string | null;
  browser: boolean;
  base_url: string[];
  status: string;
  last_update: string;
  display_template?: TemplateBlock[] | null;
}

const SCRAPER_COMMANDS = [
  {
    name: "sélecteur CSS",
    syntax: "$(selector)",
    description:
      "Accède à l'HTML et sélectionne des éléments via un sélecteur CSS",
    example: '$("div.content")',
  },
  {
    name: "fetch",
    syntax: "fetch(url)",
    description: "Récupère le contenu HTML d'une URL",
    example: 'fetch("https://example.com")',
  },
  {
    name: "select element(s) with css selector",
    syntax: "select element(s) with css selector",
    description: "Sélectionne des éléments avec un sélecteur CSS",
    example: '$("div.content")',
  },
  {
    name: "text",
    syntax: ".text()",
    description: "Extrait le texte d'un élément",
    example: 'select("h1").text()',
  },
  {
    name: "attr",
    syntax: ".attr(name)",
    description: "Récupère la valeur d'un attribut",
    example: 'select("a").attr("href")',
  },
  {
    name: "each",
    syntax: ".each(callback)",
    description: "Itère sur chaque élément sélectionné",
    example: 'selectAll("li").each((el) => { ... })',
  },
  {
    name: "first",
    syntax: ".first()",
    description: "Retourne le premier élément",
    example: 'selectAll("li").first()',
  },
  {
    name: "last",
    syntax: ".last()",
    description: "Retourne le dernier élément",
    example: 'selectAll("li").last()',
  },
  {
    name: "map",
    syntax: ".map(callback)",
    description: "Transforme chaque élément",
    example: 'selectAll("a").map((el) => el.attr("href"))',
  },
  {
    name: "click",
    syntax: ".click()",
    description: "Simule un clic sur l'élément (browser requis)",
    example: 'select("button").click()',
  },
  {
    name: "wait",
    syntax: "wait(ms)",
    description: "Attend un certain temps en millisecondes",
    example: "wait(1000)",
  },
  {
    name: "waitFor",
    syntax: "waitFor(selector)",
    description: "Attend qu'un élément apparaisse",
    example: 'waitFor("div.loaded")',
  },
];

const Icon = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const Toggle = ({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onClick}
    className={`relative shrink-0 w-10 h-6 rounded-full transition-colors cursor-pointer ${
      on ? "bg-indigo" : "bg-[#dad6ce]"
    }`}
  >
    <span
      className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
        on ? "left-5" : "left-1"
      }`}
    />
  </button>
);

const CLOSE_PATH = "M6 18 18 6M6 6l12 12";

export const ScraperPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scraper, setScraper] = useState<Scraper | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [browser, setBrowser] = useState(false);
  const [baseUrls, setBaseUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [status, setStatus] = useState("draft");
  const [template, setTemplate] = useState<TemplateBlock[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const fetchScraper = async () => {
      try {
        const response = await apiFetch(`/api/scrapers/${id}`);
        if (!response.ok) {
          throw new Error("Scraper non trouvé");
        }
        const data = await response.json();
        setScraper(data);
        setName(data.name || "");
        setDescription(data.description || "");
        setCode(data.code || "");
        setBrowser(data.browser ?? false);
        setBaseUrls(data.base_url || []);
        setStatus(data.status || "draft");
        setTemplate(
          Array.isArray(data.display_template) ? data.display_template : [],
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
      }
    };

    fetchScraper();
  }, [id]);

  const saveScraper = useCallback(
    async (updates: Partial<Scraper>) => {
      setSaving(true);
      try {
        const response = await apiFetch(`/api/scrapers/${id}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        if (response.ok) {
          const data = await response.json();
          setScraper(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const debouncedSave = useDebounce(saveScraper, 1000);

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      debouncedSave({
        name,
        description,
        code: newCode,
        browser,
        base_url: baseUrls,
        status,
        display_template: template,
      });
    },
    [name, description, browser, baseUrls, status, template, debouncedSave],
  );

  const handleDelete = async () => {
    if (!confirm("Supprimer ce scraper ?")) return;

    try {
      const response = await apiFetch(`/api/scrapers/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        navigate("/scrapers");
      }
    } catch {
      setError("Erreur lors de la suppression");
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    switch (field) {
      case "name":
        setName(value);
        break;
      case "description":
        setDescription(value);
        break;
      case "status":
        setStatus(value);
        break;
    }

    debouncedSave({
      name: field === "name" ? value : name,
      description: field === "description" ? value : description,
      code,
      browser,
      base_url: baseUrls,
      status: field === "status" ? value : status,
      display_template: template,
    });
  };

  const handleBrowserToggle = () => {
    const newBrowser = !browser;
    setBrowser(newBrowser);
    debouncedSave({
      name,
      description,
      code,
      browser: newBrowser,
      base_url: baseUrls,
      status,
      display_template: template,
    });
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;
    const updatedUrls = [...baseUrls, newUrl.trim()];
    setBaseUrls(updatedUrls);
    setNewUrl("");
    debouncedSave({
      name,
      description,
      code,
      browser,
      base_url: updatedUrls,
      status,
      display_template: template,
    });
  };

  const handleRemoveUrl = (index: number) => {
    const updatedUrls = baseUrls.filter((_, i) => i !== index);
    setBaseUrls(updatedUrls);
    debouncedSave({
      name,
      description,
      code,
      browser,
      base_url: updatedUrls,
      status,
      display_template: template,
    });
  };

  const addTemplateBlock = () => {
    const newBlock: TemplateBlock = {
      id: `${Date.now()}-${Math.random()}`,
      type: "text",
      field: "",
    };
    const updated = [...template, newBlock];
    setTemplate(updated);
    debouncedSave({
      name,
      description,
      code,
      browser,
      base_url: baseUrls,
      status,
      display_template: updated,
    });
  };

  const removeTemplateBlock = (blockId: string) => {
    const updated = template.filter((b) => b.id !== blockId);
    setTemplate(updated);
    debouncedSave({
      name,
      description,
      code,
      browser,
      base_url: baseUrls,
      status,
      display_template: updated,
    });
  };

  const updateTemplateBlock = (
    blockId: string,
    changes: Partial<TemplateBlock>,
  ) => {
    const updated = template.map((b) =>
      b.id === blockId ? { ...b, ...changes } : b,
    );
    setTemplate(updated);
    debouncedSave({
      name,
      description,
      code,
      browser,
      base_url: baseUrls,
      status,
      display_template: updated,
    });
  };

  if (loading) {
    return <p className="py-24 text-center text-muted">Chargement…</p>;
  }

  if (error || !scraper) {
    return (
      <p className="py-24 text-center text-danger-ink">
        {error || "Scraper non trouvé"}
      </p>
    );
  }

  const active = status === "ACTIVE";

  return (
    <>
      {/* Fullscreen code editor overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-code flex">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <span className="text-sm text-[#e6e4de] font-medium truncate">
                Code — <span className="font-mono">{name}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="icon-btn text-[#a8a59e] hover:text-white hover:bg-white/10"
                aria-label="Quitter le plein écran"
                title="Quitter le plein écran"
              >
                <Icon
                  className="w-5 h-5"
                  d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeMirror
                value={code}
                height="100%"
                style={{ height: "100%" }}
                theme={vscodeDark}
                extensions={[javascript()]}
                onChange={handleCodeChange}
              />
            </div>
          </div>

          {/* Documentation panel */}
          <div className="hidden md:flex w-80 border-l border-white/10 flex-col">
            <div className="px-4 py-2.5 border-b border-white/10">
              <span className="eyebrow text-[#a8a59e]">Documentation</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {SCRAPER_COMMANDS.map((cmd) => (
                <div key={cmd.name} className="border-b border-white/10 pb-3">
                  <code className="text-sm font-mono text-neon">
                    {cmd.syntax}
                  </code>
                  <p className="text-sm text-[#a8a59e] mt-1">
                    {cmd.description}
                  </p>
                  <code className="text-xs font-mono bg-black/30 px-2 py-1 rounded-md text-[#e6e4de] mt-1.5 block">
                    {cmd.example}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/scrapers")}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition cursor-pointer"
            >
              <Icon d="M15 19l-7-7 7-7" />
              Scrapers
            </button>
            {saving && (
              <span className="text-xs text-muted">Sauvegarde…</span>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0 flex-[1_1_320px]">
              <span className="shrink-0 w-12 h-12 rounded-[14px] bg-ink text-neon flex items-center justify-center -rotate-6">
                <Icon
                  className="w-6 h-6"
                  d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"
                />
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                aria-label="Nom du scraper"
                placeholder="Sans titre"
                className="page-title min-w-0 w-full bg-transparent outline-none rounded-[10px] -mx-1.5 px-1.5 py-1 hover:bg-paper-soft focus:bg-paper-soft transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5 min-h-10 pl-3 pr-2 rounded-[11px] border border-line-strong">
                <span
                  className={`pill ${
                    active ? "bg-neon-tint text-neon-ink" : "bg-chip text-ink-2"
                  }`}
                >
                  {active ? "Actif" : "Désactivé"}
                </span>
                <Toggle
                  on={active}
                  label="Activer le scraper"
                  onClick={() =>
                    handleFieldChange("status", active ? "DISABLE" : "ACTIVE")
                  }
                />
              </div>
              <button
                type="button"
                onClick={handleDelete}
                className="btn-danger"
              >
                <Icon d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                Supprimer
              </button>
            </div>
          </div>
        </header>

        {/* Configuration */}
        <section className="card p-6 flex flex-col gap-5">
          <h2 className="section-title">Configuration</h2>

          <label className="label">
            Description
            <textarea
              value={description}
              onChange={(e) =>
                handleFieldChange("description", e.target.value)
              }
              className="input py-2 resize-none"
              rows={2}
              placeholder="À quoi sert ce scraper ?"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink">
              URLs de base
            </span>

            {baseUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {baseUrls.map((url, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 bg-chip pl-3 pr-1.5 py-1 rounded-full max-w-full"
                  >
                    <span className="font-mono text-xs text-ink-2 max-w-xs truncate">
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveUrl(index)}
                      className="p-0.5 rounded-full text-muted hover:text-danger-ink hover:bg-danger-tint transition cursor-pointer"
                      aria-label={`Retirer ${url}`}
                    >
                      <Icon className="w-3.5 h-3.5" d={CLOSE_PATH} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddUrl();
                  }
                }}
                className="input flex-1 font-mono"
                placeholder="https://example.com"
                aria-label="Nouvelle URL de base"
              />
              <button
                type="button"
                onClick={handleAddUrl}
                className="btn-ink"
              >
                Ajouter
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-line-soft">
            <div>
              <p className="text-[13px] font-medium text-ink">
                Utiliser un navigateur
              </p>
              <p className="text-xs text-muted mt-0.5">
                Active le rendu JavaScript dynamique de la page (Puppeteer).
              </p>
            </div>
            <Toggle
              on={browser}
              label="Utiliser un navigateur"
              onClick={handleBrowserToggle}
            />
          </div>
        </section>

        {/* Éditeur de code */}
        <section className="rounded-2xl bg-code overflow-hidden shadow-[0_12px_32px_-18px_rgba(28,27,25,0.45)]">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-neon" />
              <span className="font-mono text-xs text-[#e6e4de]">
                scraper.js
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="icon-btn w-8 h-8 text-[#a8a59e] hover:text-white hover:bg-white/10"
              aria-label="Plein écran"
              title="Plein écran"
            >
              <Icon d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0-5 5M4 16v4m0 0h4m-4 0 5-5m11 5-5-5m5 5v-4m0 4h-4" />
            </button>
          </div>
          <CodeMirror
            value={code}
            height="400px"
            theme={vscodeDark}
            extensions={[javascript()]}
            onChange={handleCodeChange}
            placeholder={`var html = getHtmlPage();

var products = html.select("div.product");

var productsDetails = [];

for (let product of products) {
  productsDetails.push({
    name: product.select(".productName")
  });
}

return productsDetails;`}
          />
        </section>

        {/* Template d'affichage */}
        <section className="card p-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title">Template d'affichage</h2>
              <p className="text-sm text-muted mt-1">
                Définit comment les données scrapées sont affichées (au lieu
                du JSON brut).
              </p>
            </div>
            <button
              type="button"
              onClick={addTemplateBlock}
              className="btn-secondary"
            >
              <Icon d="M12 5v14M5 12h14" />
              Bloc
            </button>
          </div>

          {template.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center rounded-[14px] border border-dashed border-line-strong bg-paper-warm">
              Aucun bloc défini — les données s'afficheront en JSON brut.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft rounded-[14px] border border-line">
              {template.map((block) => (
                <div
                  key={block.id}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5"
                >
                  <select
                    value={block.type}
                    onChange={(e) =>
                      updateTemplateBlock(block.id, {
                        type: e.target.value as TemplateBlock["type"],
                      })
                    }
                    aria-label="Type de bloc"
                    className="input w-auto cursor-pointer"
                  >
                    <option value="title">Titre</option>
                    <option value="text">Texte</option>
                    <option value="image">Image</option>
                    <option value="link">Lien</option>
                    <option value="badge">Badge</option>
                    <option value="date">Date</option>
                  </select>
                  <input
                    type="text"
                    value={block.field}
                    onChange={(e) =>
                      updateTemplateBlock(block.id, { field: e.target.value })
                    }
                    placeholder="Clé JSON (ex : title)"
                    aria-label="Clé JSON"
                    className="input flex-1 min-w-[140px] font-mono"
                  />
                  {block.type === "link" && (
                    <input
                      type="text"
                      value={block.label || ""}
                      onChange={(e) =>
                        updateTemplateBlock(block.id, {
                          label: e.target.value,
                        })
                      }
                      placeholder="Libellé du lien"
                      aria-label="Libellé du lien"
                      className="input sm:w-40"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeTemplateBlock(block.id)}
                    className="icon-btn hover:text-danger-ink hover:bg-danger-tint"
                    aria-label="Supprimer le bloc"
                  >
                    <Icon d={CLOSE_PATH} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-xs text-muted text-right">
          Dernière modification :{" "}
          <span className="font-mono">
            {new Date(scraper.last_update).toLocaleString("fr-FR")}
          </span>
        </p>
      </div>
    </>
  );
};
