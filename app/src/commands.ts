export interface SlashCommand {
  name: string;
  description: string;
  execute: (currentText: string, cursorPosition: number, commandStart: number) => {
    newText: string;
    newCursorPosition: number;
  };
}

export const slashCommands: SlashCommand[] = [
  {
    name: "hello",
    description: "Insère Hello,World!",
    execute: (currentText, cursorPosition, commandStart) => {
      const beforeCommand = currentText.slice(0, commandStart);
      const afterCursor = currentText.slice(cursorPosition);
      const insertedText = "Hello,World!";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + insertedText.length,
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
      const insertedText = "```\n\n```";
      return {
        newText: beforeCommand + insertedText + afterCursor,
        newCursorPosition: beforeCommand.length + 4, // Position after ```\n
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
