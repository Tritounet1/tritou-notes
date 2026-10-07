import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";

// What scraper code can use, mirroring api/src/scraping/sandbox.ts: the code runs synchronously
// in an isolated world of the scraped page, with `$` (Cheerio loaded with the page HTML) and
// `result`, the object it must assign. Standard JS built-ins (JSON, Math, Array…) exist; there
// is no Node (process, require) and nothing asynchronous is awaited. One list feeds both the editor autocompletion and the documentation panel.

export interface ScraperApiEntry {
  /** Completion label. */
  label: string;
  /** Inserted text; `${…}` fields are tab stops. */
  snippet?: string;
  syntax: string;
  description: string;
  example: string;
}

export const SCRAPER_GLOBALS: ScraperApiEntry[] = [
  {
    label: "$",
    snippet: "$(\"${selector}\")",
    syntax: "$(selecteur)",
    description: "Sélectionne des éléments de la page avec un sélecteur CSS (Cheerio, API proche de jQuery).",
    example: '$("article h2")',
  },
  {
    label: "result",
    snippet: "result = {\n\t${key}: ${value},\n};",
    syntax: "result = { … }",
    description: "Objet renvoyé par le scraper : ses clés alimentent le template d’affichage. À assigner une fois, à la fin.",
    example: 'result = { title: $("h1").text().trim() };',
  },
];

/** Methods of a Cheerio selection (what `$(…)` returns). */
export const CHEERIO_METHODS: ScraperApiEntry[] = [
  { label: "text", snippet: "text()", syntax: ".text()", description: "Texte des éléments, balises retirées. Souvent suivi de .trim().", example: '$("h1").text().trim()' },
  { label: "html", snippet: "html()", syntax: ".html()", description: "HTML intérieur du premier élément.", example: '$(".description").html()' },
  { label: "attr", snippet: "attr(\"${name}\")", syntax: ".attr(nom)", description: "Valeur d’un attribut du premier élément.", example: '$("a.next").attr("href")' },
  { label: "prop", snippet: "prop(\"${name}\")", syntax: ".prop(nom)", description: "Propriété DOM (checked, selected, href résolu…).", example: '$("input#cgu").prop("checked")' },
  { label: "data", snippet: "data(\"${name}\")", syntax: ".data(nom)", description: "Attribut data-* converti (nombres, JSON…).", example: '$(".product").data("price")' },
  { label: "val", snippet: "val()", syntax: ".val()", description: "Valeur d’un champ de formulaire.", example: '$("input[name=q]").val()' },
  { label: "find", snippet: "find(\"${selector}\")", syntax: ".find(selecteur)", description: "Descendants qui correspondent au sélecteur.", example: '$(".card").find(".price")' },
  { label: "children", snippet: "children()", syntax: ".children([selecteur])", description: "Enfants directs, éventuellement filtrés.", example: '$("ul").children("li")' },
  { label: "parent", snippet: "parent()", syntax: ".parent([selecteur])", description: "Parent direct.", example: '$(".price").parent()' },
  { label: "closest", snippet: "closest(\"${selector}\")", syntax: ".closest(selecteur)", description: "Premier ancêtre (ou soi-même) qui correspond.", example: '$(".price").closest(".card")' },
  { label: "next", snippet: "next()", syntax: ".next([selecteur])", description: "Élément frère suivant.", example: '$("dt").next("dd")' },
  { label: "prev", snippet: "prev()", syntax: ".prev([selecteur])", description: "Élément frère précédent.", example: '$("dd").prev()' },
  { label: "siblings", snippet: "siblings()", syntax: ".siblings([selecteur])", description: "Tous les frères.", example: '$("li.active").siblings()' },
  { label: "first", snippet: "first()", syntax: ".first()", description: "Premier élément de la sélection.", example: '$("li").first().text()' },
  { label: "last", snippet: "last()", syntax: ".last()", description: "Dernier élément de la sélection.", example: '$("li").last().text()' },
  { label: "eq", snippet: "eq(${index})", syntax: ".eq(index)", description: "Élément à l’index donné (négatif depuis la fin).", example: '$("tr").eq(1)' },
  { label: "filter", snippet: "filter(\"${selector}\")", syntax: ".filter(selecteur | (i, el) => booléen)", description: "Garde les éléments qui correspondent.", example: '$("a").filter("[href^=http]")' },
  { label: "not", snippet: "not(\"${selector}\")", syntax: ".not(selecteur)", description: "Retire les éléments qui correspondent.", example: '$("li").not(".ad")' },
  { label: "has", snippet: "has(\"${selector}\")", syntax: ".has(selecteur)", description: "Garde les éléments contenant un descendant qui correspond.", example: '$(".card").has(".promo")' },
  { label: "is", snippet: "is(\"${selector}\")", syntax: ".is(selecteur)", description: "Vrai si au moins un élément correspond.", example: '$(".stock").is(".out")' },
  { label: "hasClass", snippet: "hasClass(\"${name}\")", syntax: ".hasClass(classe)", description: "Vrai si un élément a la classe.", example: '$(".item").hasClass("sold")' },
  {
    label: "each",
    snippet: "each((i, el) => {\n\t${}\n})",
    syntax: ".each((i, el) => { … })",
    description: "Parcourt la sélection ; enveloppe l’élément avec $(el) pour utiliser les méthodes.",
    example: '$("li").each((i, el) => { items.push($(el).text()); })',
  },
  {
    label: "map",
    snippet: "map((i, el) => ${$(el).text()}).get()",
    syntax: ".map((i, el) => valeur).get()",
    description: "Transforme chaque élément ; terminer par .get() pour obtenir un tableau.",
    example: '$("a").map((i, el) => $(el).attr("href")).get()',
  },
  { label: "get", snippet: "get()", syntax: ".get([index])", description: "Tableau JS des éléments (ou de valeurs après .map).", example: '$("li").map((i, el) => $(el).text()).get()' },
  { label: "toArray", snippet: "toArray()", syntax: ".toArray()", description: "Tableau des éléments DOM.", example: '$("li").toArray().length' },
  { label: "length", syntax: ".length", description: "Nombre d’éléments sélectionnés.", example: '$(".result").length' },
  { label: "contents", snippet: "contents()", syntax: ".contents()", description: "Enfants, nœuds texte compris.", example: '$("p").contents()' },
];

/** Static helpers on `$` itself. */
const CHEERIO_STATIC: ScraperApiEntry[] = [
  { label: "root", snippet: "root()", syntax: "$.root()", description: "Racine du document.", example: '$.root().find("title").text()' },
  { label: "html", snippet: "html()", syntax: "$.html()", description: "HTML complet de la page.", example: "$.html().length" },
  { label: "text", snippet: "text()", syntax: "$.text()", description: "Texte complet de la page.", example: "$.text().includes(\"Rupture\")" },
];

const toCompletion = (entry: ScraperApiEntry, type: string): Completion => {
  const base = { label: entry.label, type, detail: entry.syntax, info: `${entry.description}\n\nEx. : ${entry.example}` };
  return entry.snippet ? snippetCompletion(entry.snippet, base) : base;
};

const globalCompletions = SCRAPER_GLOBALS.map((entry) => toCompletion(entry, entry.label === "$" ? "function" : "variable"));
const methodCompletions = CHEERIO_METHODS.map((entry) => toCompletion(entry, entry.label === "length" ? "property" : "method"));
const staticCompletions = CHEERIO_STATIC.map((entry) => toCompletion(entry, "method"));

// Built-ins whose members are already known: don't offer Cheerio methods after `JSON.` etc.
const JS_NAMESPACES = /\b(JSON|Math|Object|Array|Number|String|Date|Promise|Reflect)\.\w*$/;

/**
 * After `$.`: Cheerio static helpers. After any other `expr.`: Cheerio selection methods
 * (selections are what scraper code chains on). Elsewhere: `$` and `result`.
 */
export function scraperCompletionSource(context: CompletionContext): CompletionResult | null {
  const member = context.matchBefore(/\.[\w$]*$/);
  if (member) {
    const before = context.state.sliceDoc(Math.max(0, member.from - 40), member.to);
    if (JS_NAMESPACES.test(before)) return null;
    const onDollar = /(^|[^\w$])\$\.[\w$]*$/.test(before);
    return { from: member.from + 1, options: onDollar ? staticCompletions : methodCompletions, validFor: /^[\w$]*$/ };
  }
  const word = context.matchBefore(/[\w$]+$/);
  if (!word && !context.explicit) return null;
  return { from: word?.from ?? context.pos, options: globalCompletions, validFor: /^[\w$]*$/ };
}

/** Editor extension: adds the scraper API on top of the default JavaScript completions. */
export const scraperCompletions = javascriptLanguage.data.of({ autocomplete: scraperCompletionSource });
