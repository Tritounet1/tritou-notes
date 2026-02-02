import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { useDebounce } from "./hooks/useDebounce";

interface Scraper {
  id: number;
  name: string;
  description: string | null;
  code: string | null;
  browser: boolean;
  base_url: string[];
  status: string;
  last_update: string;
}

// Mini-langage de scraping - documentation et autocomplétion
const SCRAPER_COMMANDS = [
  {
    name: "fetch",
    syntax: "fetch(url)",
    description: "Récupère le contenu HTML d'une URL",
    example: 'fetch("https://example.com")',
  },
  {
    name: "select",
    syntax: "select(selector)",
    description: "Sélectionne des éléments avec un sélecteur CSS",
    example: 'select("div.content")',
  },
  {
    name: "selectAll",
    syntax: "selectAll(selector)",
    description: "Sélectionne tous les éléments correspondants",
    example: 'selectAll("li.item")',
  },
  {
    name: "text",
    syntax: ".text()",
    description: "Extrait le texte d'un élément",
    example: 'select("h1").text()',
  },
  {
    name: "html",
    syntax: ".html()",
    description: "Extrait le HTML interne d'un élément",
    example: 'select("div").html()',
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
    name: "find",
    syntax: ".find(selector)",
    description: "Recherche des éléments enfants",
    example: 'select("ul").find("li")',
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
    name: "parent",
    syntax: ".parent()",
    description: "Retourne l'élément parent",
    example: 'select("span").parent()',
  },
  {
    name: "children",
    syntax: ".children()",
    description: "Retourne les éléments enfants directs",
    example: 'select("ul").children()',
  },
  {
    name: "next",
    syntax: ".next()",
    description: "Retourne l'élément suivant",
    example: 'select("h2").next()',
  },
  {
    name: "prev",
    syntax: ".prev()",
    description: "Retourne l'élément précédent",
    example: 'select("p").prev()',
  },
  {
    name: "filter",
    syntax: ".filter(selector)",
    description: "Filtre les éléments avec un sélecteur",
    example: 'selectAll("li").filter(".active")',
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
    name: "type",
    syntax: ".type(text)",
    description: "Tape du texte dans un input (browser requis)",
    example: 'select("input").type("hello")',
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
  {
    name: "screenshot",
    syntax: "screenshot(filename)",
    description: "Prend une capture d'écran (browser requis)",
    example: 'screenshot("page.png")',
  },
  {
    name: "save",
    syntax: "save(data)",
    description: "Sauvegarde les données extraites",
    example: "save({ title, price })",
  },
  {
    name: "log",
    syntax: "log(message)",
    description: "Affiche un message dans les logs",
    example: 'log("Scraping terminé")',
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
      });
    },
    [name, description, browser, baseUrls, status, debouncedSave],
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
    } catch (err) {
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
      <div className="max-w-7xl mx-auto px-6 py-8">
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
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="error">Error</option>
            </select>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition"
            >
              Supprimer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Configuration */}
          <div className="col-span-2 space-y-6">
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Code</h2>

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
          </div>

          {/* Documentation */}
          <div className="col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-8 max-h-[calc(100vh-120px)] overflow-y-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Documentation
              </h2>

              <div className="space-y-3">
                {SCRAPER_COMMANDS.map((cmd) => (
                  <div key={cmd.name} className="border-b border-gray-100 pb-3">
                    <code className="text-sm font-mono text-blue-600">
                      {cmd.syntax}
                    </code>
                    <p className="text-sm text-gray-600 mt-1">
                      {cmd.description}
                    </p>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 mt-1 block">
                      {cmd.example}
                    </code>
                  </div>
                ))}
              </div>
            </div>
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
