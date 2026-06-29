// Responsibilities:
// - Keep command palette types and scope helpers out of App.
// - Share the small filtering/selection rules used by the palette UI.
// Contracts:
// - Menu commands stay open after running; leaf commands close the palette.
// - Filtering is case-insensitive across title and description.

export type CommandPaletteScope = "root" | "ai" | "insert" | "format" | "table";

export type CommandPaletteCommand = {
  id: string;
  title: string;
  description: string;
  run: () => void | Promise<void>;
};

export function commandPaletteScopeTitle(
  scope: CommandPaletteScope,
  activeDocumentIsCanvas: boolean,
) {
  if (scope === "ai") {
    return "AI commands";
  }

  if (scope === "insert") {
    return activeDocumentIsCanvas ? "Canvas insert commands" : "Insert commands";
  }

  if (scope === "format") {
    return "Format commands";
  }

  if (scope === "table") {
    return "Table commands";
  }

  return "";
}

export function commandPalettePlaceholder(
  scope: CommandPaletteScope,
  activeDocumentIsCanvas: boolean,
) {
  if (scope === "ai") {
    return "Type an AI command...";
  }

  if (scope === "insert") {
    return activeDocumentIsCanvas
      ? "Type a canvas insert command..."
      : "Type an insert command...";
  }

  if (scope === "format") {
    return "Type a format command...";
  }

  if (scope === "table") {
    return "Type a table command...";
  }

  return "Type a command...";
}

export function filterCommandPaletteCommands(
  commands: CommandPaletteCommand[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return commands;
  }

  return commands.filter((command) =>
    `${command.title} ${command.description}`.toLowerCase().includes(normalizedQuery),
  );
}

export function selectedCommandPaletteCommand(
  commands: CommandPaletteCommand[],
  selectedIndex: number,
) {
  return commands[Math.min(selectedIndex, commands.length - 1)] ?? null;
}

export function isCommandPaletteMenuCommand(command: CommandPaletteCommand) {
  return (
    command.id === "ai-menu" ||
    command.id === "insert-menu" ||
    command.id === "format-menu" ||
    command.id === "table-menu"
  );
}

export function shouldReportCommandPaletteStatus(command: CommandPaletteCommand) {
  return (
    command.id !== "insert-rich-link" &&
    command.id !== "insert-excalidraw" &&
    command.id !== "create-tidbit" &&
    !command.id.startsWith("format-") &&
    !command.id.startsWith("ai-")
  );
}
