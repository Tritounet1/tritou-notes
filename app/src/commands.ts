export interface SlashCommand {
  name: string;
  description: string;
  opensModal?: boolean;
  execute: (currentText: string, cursorPosition: number, commandStart: number) => {
    newText: string;
    newCursorPosition: number;
  };
}

export const slashCommands: SlashCommand[] = [
  {
    name: "page",
    description: "Crée une sous-page et l’ouvre",
    opensModal: true,
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      return {
        newText: beforeCommand + afterCursor,
        newCursorPosition: beforeCommand.length,
      };
    },
  },
  {
    name: "image",
    description: "Ajouter des images depuis votre appareil",
    opensModal: true,
    execute: (currentText, cursorPosition, commandStart) => ({
      newText: currentText.slice(0, commandStart) + currentText.slice(cursorPosition),
      newCursorPosition: commandStart,
    }),
  },
  {
    name: "planificateur",
    description: "Lier un planificateur (données live)",
    opensModal: true,
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      return {
        newText: beforeCommand + afterCursor,
        newCursorPosition: beforeCommand.length,
      };
    },
  },
  {
    name: "scrape",
    description: "Scrape une URL",
    opensModal: true,
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      return {
        newText: beforeCommand + afterCursor,
        newCursorPosition: beforeCommand.length,
      };
    },
  },
  {
    name: "date",
    description: "Insère la date du jour",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
      };
    },
  },
  {
    name: "time",
    description: "Insère l'heure actuelle",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
      };
    },
  },
  {
    name: "divider",
    description: "Insère une ligne de séparation",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = "\n---\n";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
      };
    },
  },
  {
    name: "code",
    description: "Insère un bloc de code",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const leadingNewline = beforeCommand && !beforeCommand.endsWith("\n") ? "\n" : "";
      const insertedText = leadingNewline + "```\n\n```\n";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + leadingNewline.length + 4,
      };
    },
  },
  {
    name: "quote",
    description: "Insère une citation",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = "> ";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
      };
    },
  },
  {
    name: "list",
    description: "Insère une liste à puces",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = "- ";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
      };
    },
  },
  {
    name: "checkbox",
    description: "Insère une case à cocher",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = "- [ ] ";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
      };
    },
  },
];
