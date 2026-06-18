/**
 * Shared frontend data shapes for Glyphary.
 *
 * Responsibilities:
 * - Name the DTOs returned by Tauri commands and the serializable editor state
 *   passed between App-level features.
 * - Keep React-free contracts in one place so App.tsx can focus on orchestration
 *   and rendering.
 *
 * Contracts:
 * - These types describe frontend expectations, not validation. Values loaded
 *   from disk or localStorage must still pass through normalizers before use.
 * - Relative paths are vault-relative unless the field name explicitly says
 *   otherwise.
 */

import type { MarkdownParts } from "./markdown.js";
import type { SplitGroupId } from "./tabs.js";

export type VaultEntry = {
  name: string;
  relativePath: string;
  isDir: boolean;
};

export type OpenedFile = {
  name: string;
  relativePath: string;
  content: string;
};

export type VaultIndexedFile = {
  name: string;
  relativePath: string;
};

export type RenamedDirectory = {
  name: string;
  relativePath: string;
};

export type SavedAsset = {
  fileName: string;
  relativePath: string;
};

export type CssSnippetFile = {
  name: string;
  relativePath: string;
};

export type CssSnippetContent = {
  name: string;
  content: string;
};

export type CssSnippetSettings = {
  directory: string;
  enabled: string[];
};

export type PluginSettings = {
  enabled: string[];
};

export type PluginWasmCommand = {
  module: string;
  input: "selection" | "document";
  output: "replaceSelection" | "insertAtCursor" | "replaceDocument";
  timeoutMs: number;
};

export type PluginCommandManifest = {
  id: string;
  title: string;
  description?: string;
  insertMarkdown?: string | null;
  template?: string | null;
  wasm?: PluginWasmCommand | null;
};

export type PluginManifest = {
  id: string;
  name: string;
  runtime: "glyphary-wasm-transform@1";
  version?: string;
  description?: string;
  permissions: string[];
  commands: PluginCommandManifest[];
  styles: string[];
};

export type PluginCatalog = {
  plugins: PluginManifest[];
  errors: string[];
};

export type PluginStyleContent = {
  pluginId: string;
  name: string;
  content: string;
};

export type VaultThemeSettings = {
  presetId?: string | null;
  callouts?: VaultThemeCalloutSettings | null;
  tokens: Record<string, string>;
  options?: VaultThemeOptions | null;
};

export type CalloutKind = "note" | "info" | "tip" | "warning";
export type CalloutStyle = "plain" | "striped" | "card" | "compact" | "obsidian";
export type CalloutIconName = "info" | "sparkles" | "alert" | "check" | "quote" | "none";

export type VaultThemeCalloutSettings = {
  style: CalloutStyle;
  icons: Record<CalloutKind, CalloutIconName>;
};

export type VaultThemeOptions = {
  colorfulHeadings: boolean;
  headingUnderlines: boolean;
  headingAnchors: boolean;
  richCallouts: boolean;
};

export type FrontmatterPillSettings = {
  enabled: boolean;
  headerName: string;
};

export type EditorBehaviorSettings = {
  vimMode: boolean;
};

export type FileDisplaySettings = {
  showDotfiles: boolean;
};

export type AutosaveSettings = {
  enabled: boolean;
};

export type DebugSettings = {
  enabled: boolean;
};

export type TidbitSettings = {
  pathPattern: string;
  globalShortcutEnabled: boolean;
  globalShortcut: string;
};

export type TidbitShortcutStatus = {
  shortcut: string | null;
  registered: boolean;
};

export type VaultAppearanceSettings = {
  glassEffect: boolean;
  glassOpacity: number;
  statusBarVisible: boolean;
  sectionCorners: "rounded" | "square";
  workspaceMargin: "compact" | "comfortable" | "spacious";
};

export type SettingsDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export type VaultSettings = {
  assetDirectory: string;
  frontmatterPills?: FrontmatterPillSettings | null;
  files?: FileDisplaySettings | null;
  autosave?: AutosaveSettings | null;
  tidbits?: TidbitSettings | null;
  editor?: EditorBehaviorSettings | null;
  appearance?: VaultAppearanceSettings | null;
  debug?: DebugSettings | null;
  cssSnippets?: CssSnippetSettings | null;
  plugins?: PluginSettings | null;
  theme?: VaultThemeSettings | null;
};

export type ActiveFile = {
  name: string;
  relativePath: string;
};

export type DocumentTab = {
  id: string;
  activeFile: ActiveFile | null;
  pageName: string;
  metaHeader: string;
  metaDelimiter: MarkdownParts["metaDelimiter"];
  markdown: string;
  markdownDraft: string;
  dirty: boolean;
};

export type EditorGroupId = SplitGroupId;

export type EditorGroupState = {
  id: EditorGroupId;
  tabs: DocumentTab[];
  activeTabId: string;
};

export type SearchResult = {
  relativePath: string;
  lineNumber?: number;
  lineText?: string;
  isContentMatch: boolean;
};

export type WikiLinkPickerState = {
  target: string;
  candidates: VaultIndexedFile[];
  x: number;
  y: number;
};

export type SearchMode = "filename" | "content";
export type AppearanceMode = "auto" | "light" | "dark";
export type SettingsTab = "main" | "appearance" | "plugins" | "debug";
export type DrawerItem = "source" | "toc" | "calendar";
export type VaultDrawerItem = "files" | "search" | "recent";
export type ResizeSide = "vault" | "drawer";

export type FolderContextMenuState = {
  entry: VaultEntry;
  x: number;
  y: number;
};

export type FolderActionKind =
  | "create-note"
  | "create-folder"
  | "rename"
  | "move-folder"
  | "move-file"
  | "delete-file";

export type FolderActionDialogState = {
  action: FolderActionKind;
  entry: VaultEntry;
  value: string;
};

export type VaultFolderTreeNodeState = {
  children: VaultEntry[];
  error: string | null;
  loaded: boolean;
  loading: boolean;
};

export type VaultFolderTreeProps = {
  root: string;
  selectedPath: string;
  movingEntry?: VaultEntry | null;
  onSelect: (relativePath: string) => void;
  onStatus: (message: string) => void;
};

export type PersistedWorkspace = {
  vaultRoot: string;
  currentDir: string;
  activeFile: ActiveFile | null;
  recentFiles: ActiveFile[];
};

export type ThemeTokenControl = {
  label: string;
  token: string;
  kind?: "color" | "value";
  placeholder?: string;
};

export type ThemeTokenGroup = {
  title: string;
  controls: ThemeTokenControl[];
};

export type ThemePreset = {
  id: string;
  name: string;
  description: string;
  tokens: Record<string, string>;
};
