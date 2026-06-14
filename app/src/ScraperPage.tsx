import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { useDebounce } from "./hooks/useDebounce";
import { TemplateBlock } from "./types/scraper";

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (error || !scraper) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error || "Scraper non trouvé"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fullscreen code editor overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex">
          {/* Code editor */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
              <span className="text-sm text-gray-300 font-medium">
                Code - {name}
              </span>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-md transition"
                title="Quitter le plein écran"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                  />
                </svg>
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
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="px-4 py-2 border-b border-gray-700">
              <span className="text-sm text-gray-300 font-medium">
                Documentation
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {SCRAPER_COMMANDS.map((cmd) => (
                <div key={cmd.name} className="border-b border-gray-700 pb-3">
                  <code className="text-sm font-mono text-blue-400">
                    {cmd.syntax}
                  </code>
                  <p className="text-sm text-gray-400 mt-1">
                    {cmd.description}
                  </p>
                  <code className="text-xs bg-gray-900 px-2 py-1 rounded text-gray-300 mt-1 block">
                    {cmd.example}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/scrapers")}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Retour
            </button>
            {saving && (
              <span className="text-xs text-gray-400">Sauvegarde...</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => handleFieldChange("status", e.target.value)}
              className={`px-3 py-1.5 text-sm rounded-md border-0 ${
                status === "active"
                  ? "bg-green-100 text-green-700"
                  : status === "paused"
                    ? "bg-yellow-100 text-yellow-700"
                    : status === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
              }`}
            >
              <option value="DISABLE">Désactivé</option>
              <option value="ACTIVE">Active</option>
            </select>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition"
            >
              Supprimer
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Infos de base */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleFieldChange("name", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) =>
                    handleFieldChange("description", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URLs de base
                </label>

                {/* Liste des URLs */}
                {baseUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {baseUrls.map((url, index) => (
                      <div
                        key={index}
                        className="group flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition"
                      >
                        <span className="text-sm text-gray-700 max-w-xs truncate">
                          {url}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveUrl(index)}
                          className="text-gray-400 hover:text-red-500 transition"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input pour ajouter une URL */}
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800"
                    placeholder="https://example.com"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition text-sm"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Utiliser un navigateur
                  </label>
                  <p className="text-xs text-gray-500">
                    Activer pour permettre au page d'avoir le JavaScript
                    dynamique
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBrowserToggle}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    browser ? "bg-gray-800" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      browser ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Éditeur de code */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Code</h2>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"
                title="Plein écran"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
            </div>

            <div className="rounded-lg overflow-hidden border border-gray-200">
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
            </div>
          </div>

          {/* Template d'affichage */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Template d'affichage
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Définit comment les données scrapées sont affichées (au lieu
                  du JSON brut)
                </p>
              </div>
              <button
                type="button"
                onClick={addTemplateBlock}
                className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-700 transition"
              >
                + Bloc
              </button>
            </div>

            {template.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                Aucun bloc défini — les données s'afficheront en JSON brut.
              </p>
            ) : (
              <div className="space-y-2">
                {template.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <select
                      value={block.type}
                      onChange={(e) =>
                        updateTemplateBlock(block.id, {
                          type: e.target.value as TemplateBlock["type"],
                        })
                      }
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
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
                      placeholder="Clé JSON (ex: title)"
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800"
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
                        placeholder="Label du lien"
                        className="w-36 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeTemplateBlock(block.id)}
                      className="text-gray-400 hover:text-red-500 transition p-1"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-right">
          Dernière modification :{" "}
          {new Date(scraper.last_update).toLocaleString("fr-FR")}
        </p>
      </div>
    </div>
  );
};
