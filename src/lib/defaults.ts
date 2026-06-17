/**
 * Shared frontend defaults and seed markdown.
 *
 * Responsibilities:
 * - Define UI defaults that are reused by the editor, settings, and tests.
 * - Keep markdown insertion seeds in one place so command palette behavior stays consistent.
 *
 * Contracts:
 * - Values here must stay aligned with Rust backend defaults where the backend persists them.
 * - These constants are pure data; do not add browser, Tauri, or editor side effects here.
 */

export const initialMarkdown = `# Untitled note

Open a vault from the File menu to browse and edit Markdown files.

- Single-click a directory to browse into it.
- Double-click a directory to open its shadow note.
- Double-click a file to open it in the editor.
`;

export const emptyTableMarkdown = `| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |
|  |  |  |`;

export const emptyColumnsMarkdown = `::: columns
::: column
Left column
:::

::: column
Right column
:::
:::`;

export const emptyCalloutMarkdown = `::: callout note "Note"
Callout content
:::`;

export const emptyCollapseMarkdown = `::: collapse More details
Hidden content
:::`;

export const defaultVaultAssetDirectory = "_assets_";
export const defaultVaultImageDirectory = "_assets_/images";
export const defaultExcalidrawDirectory = "_assets_/drawings";
export const defaultFrontmatterPillHeader = "tags";
export const defaultTidbitPathPattern =
  "__transit__/Objects/tidbit-{{date:YYYY-mm-DD-hh-mm-ss}}.md";
export const defaultTidbitGlobalShortcut = "CommandOrControl+Shift+Space";
export const defaultDrawerOpen = false;
export const defaultVaultDrawerOpen = true;
export const defaultVaultDrawerWidth = 320;
export const defaultInspectorDrawerWidth = 360;
export const minResizableDrawerWidth = 220;
export const minEditorWorkspaceWidth = 360;
export const maxRecentFiles = 20;
export const calendarDirectory = "Calendar";
export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
