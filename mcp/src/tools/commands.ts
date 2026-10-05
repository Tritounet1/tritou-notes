import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const commandTools: Tool[] = [
  {
    name: "list_slash_commands",
    description:
      "Liste les slash commands disponibles dans l'éditeur de documents. " +
      "Utilise ces infos pour savoir quels raccourcis tu peux mentionner ou insérer dans le texte d'un document.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

const slashCommands = [
  { name: "planificateur", description: "Lier un planificateur (données live)", opensModal: true },
  { name: "scrape", description: "Scrape une URL", opensModal: true },
  { name: "hello", description: "Insère Hello,World!" },
  { name: "date", description: "Insère la date du jour" },
  { name: "time", description: "Insère l'heure actuelle" },
  { name: "divider", description: "Insère une ligne de séparation (---)" },
  { name: "code", description: "Insère un bloc de code (```)" },
  { name: "quote", description: "Insère une citation (>)" },
  { name: "list", description: "Insère une liste à puces (-)" },
  { name: "checkbox", description: "Insère une case à cocher (- [ ])" },
];

export async function handleCommandTool(name: string): Promise<unknown> {
  if (name === "list_slash_commands") {
    return slashCommands;
  }
  throw new Error(`Unknown command tool: ${name}`);
}
