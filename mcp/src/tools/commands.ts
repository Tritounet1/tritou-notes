import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const commandTools: Tool[] = [
  {
    name: "list_slash_commands",
    description:
      "Liste les slash commands de l'éditeur de documents (à garder synchronisé avec app/src/commands.ts). " +
      "Pour chaque commande, `syntax` donne ce qu'elle écrit dans Document.text et `viaMcp` comment obtenir le même résultat avec les outils MCP. " +
      "Blocs spéciaux reconnus dans le texte, chacun sur sa propre ligne : `::page[id]::` (lien vers une sous-page), " +
      "`::scheduler[id]::` (données live d'un planificateur), `::link[<JSON encodé URI>]::` (aperçu de lien web, créé quand on colle une URL seule sur une ligne) " +
      "et `::image[<JSON encodé URI>]::` (image envoyée via l'app). Ces marqueurs sont ignorés à l'intérieur des blocs de code.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// Mirrors app/src/commands.ts.
const slashCommands = [
  {
    name: "page",
    description: "Crée une sous-page et l'ouvre",
    syntax: "::page[<id>]::",
    viaMcp: "create_document avec parentId = id de la page courante, puis update_document pour insérer ::page[<id créé>]:: dans le texte du parent",
  },
  {
    name: "image",
    description: "Ajouter des images depuis votre appareil",
    syntax: "::image[<JSON encodé URI : {id, caption, alt, width}>]::",
    viaMcp: "Non disponible : l'envoi du fichier passe par l'API (POST /api/documents/:id/images) depuis l'app",
  },
  {
    name: "image-ia",
    description: "Générer une image avec l'IA (modèle d'image choisi dans les paramètres)",
    syntax: "::image[<JSON encodé URI : {id, caption, alt, width}>]::",
    viaMcp: "Non disponible : la génération passe par l'API (POST /api/ai/images) depuis l'app",
  },
  {
    name: "planificateur",
    description: "Lier un planificateur (données live)",
    syntax: "::scheduler[<id>]::",
    viaMcp: "list_schedulers pour trouver l'id, puis insérer ::scheduler[<id>]:: avec update_document",
  },
  {
    name: "scrape",
    description: "Scrape une URL",
    syntax: "Résultat du scrape converti en Markdown (tableau ou template du scraper)",
    viaMcp: "run_scrape puis get_instance pour lire la réponse, et l'insérer avec update_document",
  },
  { name: "date", description: "Insère la date du jour", syntax: "« mardi 6 octobre 2026 » (fr-FR)" },
  { name: "time", description: "Insère l'heure actuelle", syntax: "« 14:45 » (fr-FR)" },
  { name: "divider", description: "Insère une ligne de séparation", syntax: "---" },
  { name: "code", description: "Insère un bloc de code", syntax: "```langage\n…\n```" },
  { name: "quote", description: "Insère une citation", syntax: "> " },
  { name: "list", description: "Insère une liste à puces", syntax: "- " },
  { name: "checkbox", description: "Insère une case à cocher", syntax: "- [ ] " },
];

export async function handleCommandTool(name: string): Promise<unknown> {
  if (name === "list_slash_commands") {
    return slashCommands;
  }
  throw new Error(`Unknown command tool: ${name}`);
}
