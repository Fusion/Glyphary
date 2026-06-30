import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { useEditor } from "@tiptap/react";
import { baseTitle, isBasePath } from "./base/base";
import {
  canvasTitle,
  isCanvasPath,
  type CanvasCommandAction,
  type CanvasCommandRequest,
} from "./CanvasView";
import {
  aiBuilderEffectiveTaskQueries,
  maxAiBuilderVaultFileChars,
  maxAiBuilderVaultFiles,
  maxAiBuilderVaultSnippetsPerFile,
  maxAiBuilderVaultTasks,
  aiBuilderPromptRequestsTaskContext,
  aiBuilderPromptRequestsVaultContext,
  aiBuilderVaultContextText,
  aiBuilderVaultQueries,
} from "./lib/ai-builder";
import {
  calendarDateKey,
  calendarDayRelativePath,
  calendarDayTitle,
  calendarPathDateKey,
  monthTitle,
  sameCalendarDate,
} from "./lib/calendar";
import {
  clampResizableDrawerWidth,
  findTabAcrossSplitGroups,
  recentFilesWithOpenedFile,
  remainingGroupAfterSplitPaneClose,
  splitHasDirtyTabs,
  tabIdForFile,
  tabsAfterClose,
} from "./lib/tabs";
import {
  cleanVaultAssetReference,
  displayPath,
  displayVaultRelativePath,
  fileNameWithoutMarkdownExtension,
  parentDirectory,
} from "./lib/paths";
import {
  defaultExcalidrawDirectory,
  defaultDrawerOpen,
  defaultInspectorDrawerWidth,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  defaultVaultDrawerWidth,
  emptyCalloutMarkdown,
  emptyCollapseMarkdown,
  emptyColumnsMarkdown,
  emptyHtmlBlockMarkdown,
  emptyTableMarkdown,
  initialMarkdown,
  minEditorWorkspaceWidth,
  minResizableDrawerWidth,
  weekdayLabels,
} from "./lib/defaults";
import {
  defaultMetaDelimiter,
  composeMarkdown,
  markdownHeadings,
  splitMetaHeader,
  type MarkdownParts,
  type TocEntry,
} from "./lib/markdown";
import {
  excalidrawFileNameForTitle,
  fileNameForDroppedImage,
  isSupportedImageFile,
} from "./lib/assets";
import { expandDateTemplate } from "./lib/dates";
import { isMacOsPlatform, isWindowsPlatform } from "./lib/platform";
import {
  defaultAutosaveSettings,
  defaultCanvasSettings,
  defaultCssSnippetSettings,
  defaultDebugSettings,
  defaultEditorBehaviorSettings,
  defaultFileDisplaySettings,
  defaultFrontmatterPillSettings,
  defaultPluginSettings,
  defaultTidbitSettings,
  defaultVaultAppearanceSettings,
  closedDrawerWidth,
  defaultAiSettings,
  defaultNewTabFile,
  defaultStarredFiles,
  isRunningOnMacOs,
  keyboardEventMatchesShortcut,
  normalizeAiSettings,
  normalizeAutosaveSettings,
  normalizeCanvasSettings,
  normalizeCssSnippetSettings,
  normalizeDebugSettings,
  normalizeEditorBehaviorSettings,
  normalizeFileDisplaySettings,
  normalizeFrontmatterPillSettings,
  normalizeNewTabFile,
  normalizePluginSettings,
  normalizeStarredFiles,
  normalizeTidbitSettings,
  normalizeVaultAppearanceSettings,
  readPersistedAppearance,
  readPersistedWorkspace,
  resolveAppearance,
  sameAiSettings,
  sameAutosaveSettings,
  sameCanvasSettings,
  sameCssSnippetSettings,
  sameDebugSettings,
  sameEditorBehaviorSettings,
  sameFileDisplaySettings,
  sameFrontmatterPillSettings,
  sameNewTabFile,
  samePluginSettings,
  sameTidbitSettings,
  sameVaultAppearanceSettings,
  shortcutFromKeyboardEvent,
  workspaceResizeHandleWidth,
  writePersistedAppearance,
  writePersistedWorkspace,
} from "./lib/settings";
import { richLinkMarkdown } from "./lib/rich-links";
import { jumpToHeadingInEditor } from "./editor/code-block-renderers";
import {
  alignCurrentTableColumn,
  currentCursorContext,
  currentSelectionText,
  formatSelectionWithMark,
  insertMarkdownAtCursor,
  selectedGalleryImages,
} from "./editor/commands";
import { EditorPane, type ToolbarAction } from "./editor/EditorPane";
import { CanvasMarkdownPreview } from "./canvas/CanvasNodes";
import {
  useWikiLinkState,
  wikiLinkDisplayName,
} from "./app-state/wikilinks";
import {
  clearEditorContent,
  createEditorGroups,
  createEmptyEditorGroups,
  createUntitledTab,
  hasNoOpenDocumentTabs,
  joinVaultAssetPath,
  joinVaultImagePath,
  pageNameForFileName,
  setEditorMarkdownContent,
  tabTitle,
} from "./app-state/documents";
import {
  commandPaletteSelectionPluginKey,
  isEditorReady,
  usePageSearch,
  type PageSearchMatch,
} from "./search/page-search";
import { visibleVaultSearchResults } from "./search/vault-search";
import {
  ExcalidrawCreateDialog,
  ExcalidrawDialog,
  emptyExcalidrawScene,
  excalidrawPreviewRefreshEvent,
  excalidrawSceneToSvgMarkup,
  isExcalidrawTarget,
  parseExcalidrawScene,
  restoredExcalidrawScene,
  type ExcalidrawDialogState,
} from "./excalidraw/editor";
import { createGlypharyEditorOptions } from "./editor/editor-options";
import {
  commandPalettePlaceholder,
  commandPaletteScopeTitle,
  filterCommandPaletteCommands,
  isCommandPaletteMenuCommand,
  selectedCommandPaletteCommand,
  shouldReportCommandPaletteStatus,
  type CommandPaletteCommand,
  type CommandPaletteScope,
} from "./command-palette/commands";
import { CommandPaletteDialog } from "./command-palette/CommandPaletteDialog";
import {
  activeFileWithRelativePath,
  rebasePathAfterDirectoryRename,
  relativePathFileName,
} from "./vault/file-flow";
import {
  folderActionDialogLabel,
  folderActionDialogTitle,
  folderActionInitialValue,
  isMoveAction,
  vaultEntryPath,
} from "./vault/file-actions";
import { VaultContextMenu } from "./vault/VaultContextMenu";
import { TreeFilePreview, VaultFolderTree } from "./vault/VaultFolderTree";
import { FolderIcon, VaultFileIcon } from "./vault/VaultIcons";
import {
  allowVaultAssets,
  createCanvasInDirectory,
  createDirectoryInDirectory,
  createExcalidrawFile,
  createNoteInDirectory,
  createVaultMarkdownFile,
  deleteVaultFile,
  listVaultDir,
  listVaultMarkdownFiles,
  moveVaultDirectory,
  moveVaultFile,
  openCalendarDayFile,
  openDirectoryShadowFile,
  readVaultFile,
  readVaultSettings,
  renameVaultDirectory,
  renameVaultFile,
  searchVaultFiles,
  writeVaultFile,
  writeVaultSettings,
} from "./vault/persistence";
import {
  taskResultPresentation,
  taskSearchPattern,
  visibleVaultTaskResults,
} from "./tasks/vault-tasks";
import { renderToolbarIcon } from "./toolbar-icons";
import packageJson from "../package.json";
import type {
  ActiveFile,
  AiBuilderHistoryAsset,
  AiBuilderHistoryStore,
  AiBuilderHistoryTurn,
  AiConnectionTestResponse,
  AiModelListResponse,
  AiPageBuilderAssetRequest,
  AiPageBuilderResponse,
  AiSettings,
  AiTransformResponse,
  AppearanceMode,
  CssSnippetContent,
  CssSnippetFile,
  DocumentTab,
  DrawerItem,
  EditorGroupId,
  EditorGroupState,
  FolderActionDialogState,
  FolderActionKind,
  FolderContextMenuState,
  OpenedFile,
  PersistedWorkspace,
  PluginCatalog,
  PluginCommandManifest,
  PluginManifest,
  PluginStyleContent,
  PluginWasmCommand,
  RenamedDirectory,
  ResizeSide,
  SavedAsset,
  SearchMode,
  SearchResult,
  TaskFilter,
  TaskSort,
  ThemePreset,
  VaultDrawerItem,
  VaultEntry,
  VaultIndexedFile,
  VaultSettings,
} from "./lib/app-types";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useSettingsState } from "./settings/useSettingsState";
import {
  calloutIconGlyph,
  defaultThemeCalloutSettings,
  defaultThemeOptions,
  normalizeThemeCalloutSettings,
  normalizeThemeOptions,
  normalizeThemePresetId,
  normalizeThemeTokens,
  sameThemeCalloutSettings,
  sameThemeOptions,
  sameThemeTokens,
} from "./settings/theme-options";
import "./App.css";

const codeLanguages = [
  { label: "Plain text", value: "" },
  { label: "Python", value: "python" },
  { label: "Shell", value: "sh" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "JSON", value: "json" },
  { label: "Rust", value: "rust" },
  { label: "SQL", value: "sql" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "Markdown", value: "markdown" },
];

const currentAppVersion = packageJson.version;
const githubLatestReleaseApiUrl =
  "https://api.github.com/repos/glyphary/glyphary/releases/latest";

function releaseNotificationFromGitHubRelease(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const release = value as Record<string, unknown>;
  const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
  const url = typeof release.html_url === "string" ? release.html_url : "";

  if (!tagName || !url) {
    return null;
  }

  return {
    name:
      typeof release.name === "string" && release.name.trim()
        ? release.name.trim()
        : tagName,
    notes:
      typeof release.body === "string" && release.body.trim()
        ? release.body.trim()
        : "No release notes were published for this release.",
    publishedAt: typeof release.published_at === "string" ? release.published_at : "",
    tagName,
    url,
  } satisfies ReleaseNotification;
}

function normalizedReleaseVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function remoteSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

type TableContextMenuState = {
  groupId: EditorGroupId;
  x: number;
  y: number;
};

type ReleaseNotification = {
  name: string;
  notes: string;
  publishedAt: string;
  tagName: string;
  url: string;
};

type ImagePreviewState = {
  src: string;
  alt: string;
};

type CalendarDayPreviewState = {
  dateKey: string;
  markdown: string;
  relativePath: string;
  title: string;
  x: number;
  y: number;
};

type AiReviewState = {
  title: string;
  output: string;
  applyMode: "replace-selection" | "insert-below-selection" | "insert-at-cursor";
  aiBuilderHistoryKey?: string;
  aiBuilderTurnId?: string;
  aiBuilderReplaceTurnId?: string;
};

type AiPageBuilderAssetReviewState = {
  prompt: string;
  historyKey: string;
  replaceTurnId?: string;
  markdown: string;
  assets: AiPageBuilderAssetRequest[];
};

const aiPageBuilderMarkdownContextLimit = 12000;
const maxAiBuilderHistoryTurnsPerFile = 20;
const maxAiBuilderPromptHistoryTurns = 5;
const calendarPreviewWidth = 320;
const calendarPreviewHeight = 260;

type WasmPluginResponse =
  | {
      id: string;
      ok: true;
      output: string;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

type RichLinkMetadata = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
};

function moveSelectableIndex(currentIndex: number, itemCount: number, delta: -1 | 1) {
  if (itemCount <= 0) {
    return 0;
  }

  return (currentIndex + delta + itemCount) % itemCount;
}

function App() {
  // The active editor group is mirrored into these top-level document fields
  // because drawers, toolbar state, save commands, and native menu events all
  // operate on "the current document" regardless of which split pane owns it.
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [markdownDraft, setMarkdownDraft] = useState(initialMarkdown);
  const [editorFocused, setEditorFocused] = useState(false);
  const [editorStateVersion, setEditorStateVersion] = useState(0);
  const [vaultRoot, setVaultRoot] = useState("");
  const {
    aiDraft,
    aiModels,
    aiModelsLoading,
    aiTestStatus,
    aiTesting,
    autosaveDraft,
    autosaveSettings,
    canvasDraft,
    cssSnippetContents,
    cssSnippetDraft,
    cssSnippetFiles,
    debugDraft,
    editorBehavior,
    editorBehaviorDraft,
    fileDisplayDraft,
    frontmatterPillDraft,
    newTabFileDraft,
    pluginCatalog,
    pluginDraft,
    pluginStyles,
    selectedThemePresetIdDraft,
    setAiDraft,
    setAiModels,
    setAiModelsLoading,
    setAiTestStatus,
    setAiTesting,
    setAutosaveDraft,
    setAutosaveSettings,
    setCanvasDraft,
    setCssSnippetContents,
    setCssSnippetDraft,
    setCssSnippetFiles,
    setDebugDraft,
    setEditorBehavior,
    setEditorBehaviorDraft,
    setFileDisplayDraft,
    setFrontmatterPillDraft,
    setNewTabFileDraft,
    setPluginCatalog,
    setPluginDraft,
    setPluginStyles,
    setSelectedThemePresetIdDraft,
    setSettingsDraft,
    setSettingsDragging,
    setSettingsOffset,
    setSettingsOpen,
    setSettingsTab,
    setThemeCalloutDraft,
    setThemeDraft,
    setThemeOptionsDraft,
    setTidbitDraft,
    setTidbitSettings,
    setVaultAppearanceDraft,
    setVaultSettings,
    settingsDraft,
    settingsDragging,
    settingsOffset,
    settingsOpen,
    settingsTab,
    themeCalloutDraft,
    themeDraft,
    themeOptionsDraft,
    tidbitDraft,
    tidbitSettings,
    vaultAppearanceDraft,
    vaultSettings,
  } = useSettingsState();
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiSubmittingTitle, setAiSubmittingTitle] = useState("");
  const [currentDir, setCurrentDir] = useState("");
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [editorGroups, setEditorGroups] =
    useState<Record<EditorGroupId, EditorGroupState>>(createEditorGroups);
  const [activeGroupId, setActiveGroupId] = useState<EditorGroupId>("primary");
  const [splitOpen, setSplitOpen] = useState(false);
  const [pageName, setPageName] = useState("Untitled note");
  const [metaHeader, setMetaHeader] = useState("");
  const [metaDelimiter, setMetaDelimiter] =
    useState<MarkdownParts["metaDelimiter"]>(defaultMetaDelimiter);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [pageNameEditing, setPageNameEditing] = useState(false);
  const [documentDisplayMode, setDocumentDisplayMode] = useState<"edit" | "view">("edit");
  const [appearance, setAppearance] = useState<AppearanceMode>(readPersistedAppearance);
  const [resolvedAppearance, setResolvedAppearance] = useState(() =>
    resolveAppearance(readPersistedAppearance()),
  );
  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(defaultVaultDrawerOpen);
  const [vaultDrawerWidth, setVaultDrawerWidth] = useState(defaultVaultDrawerWidth);
  const [vaultDrawerItem, setVaultDrawerItem] = useState<VaultDrawerItem>("files");
  const [drawerOpen, setDrawerOpen] = useState(defaultDrawerOpen);
  const [inspectorDrawerWidth, setInspectorDrawerWidth] = useState(
    defaultInspectorDrawerWidth,
  );
  const [drawerItem, setDrawerItem] = useState<DrawerItem>("source");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarNoteDateKeys, setCalendarNoteDateKeys] = useState<string[]>([]);
  const [calendarDayPreview, setCalendarDayPreview] =
    useState<CalendarDayPreviewState | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteScope, setCommandPaletteScope] =
    useState<CommandPaletteScope>("root");
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteSelectedIndex, setCommandPaletteSelectedIndex] = useState(0);
  const [canvasCommandRequest, setCanvasCommandRequest] =
    useState<CanvasCommandRequest | null>(null);
  const [richLinkDialogOpen, setRichLinkDialogOpen] = useState(false);
  const [richLinkUrlDraft, setRichLinkUrlDraft] = useState("");
  const [richLinkSubmitting, setRichLinkSubmitting] = useState(false);
  const [releaseNotification, setReleaseNotification] =
    useState<ReleaseNotification | null>(null);
  const [aiReview, setAiReview] = useState<AiReviewState | null>(null);
  const [aiPageBuilderOpen, setAiPageBuilderOpen] = useState(false);
  const [aiPageBuilderPrompt, setAiPageBuilderPrompt] = useState("");
  const [aiPageBuilderReplaceTurnId, setAiPageBuilderReplaceTurnId] = useState<string | null>(
    null,
  );
  const [aiPageBuilderAssetReview, setAiPageBuilderAssetReview] =
    useState<AiPageBuilderAssetReviewState | null>(null);
  const [aiPageBuilderImportingAssets, setAiPageBuilderImportingAssets] = useState(false);
  const [aiBuilderHistory, setAiBuilderHistory] = useState<AiBuilderHistoryStore>({
    entries: {},
  });
  const [excalidrawCreateDialogOpen, setExcalidrawCreateDialogOpen] = useState(false);
  const [excalidrawCreateNameDraft, setExcalidrawCreateNameDraft] = useState("Drawing");
  const [excalidrawCreateSubmitting, setExcalidrawCreateSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("filename");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("incomplete");
  const [taskResults, setTaskResults] = useState<SearchResult[]>([]);
  const [tasksSearching, setTasksSearching] = useState(false);
  const [taskListQuery, setTaskListQuery] = useState("");
  const [taskSort, setTaskSort] = useState<TaskSort>("name");
  const [recentFiles, setRecentFiles] = useState<ActiveFile[]>([]);
  const {
    addFileToWikiLinkIndex,
    closeWikiLinkSearch,
    filteredWikiLinkFiles,
    openWikiLinkSearch: openWikiLinkSearchState,
    openWikiLinkSearchRef,
    openWikiLinkTargetRef,
    removeFileFromWikiLinkIndex,
    replaceFileInWikiLinkIndex,
    resolveWikiLinkTarget,
    resolveWikiLinkTargetRef,
    selectedWikiLinkFile,
    selectedWikiLinkSearchIndex,
    setWikiLinkIndexAndRef,
    setWikiLinkPicker,
    setWikiLinkPickerSelectedIndex,
    setWikiLinkSearchQuery,
    setWikiLinkSearchSelectedIndex,
    wikiLinkIndexVersion,
    wikiLinkPicker,
    wikiLinkPickerSelectedIndex,
    wikiLinkSearchInputRef,
    wikiLinkSearchOpen,
    wikiLinkSearchQuery,
  } = useWikiLinkState();
  const [excalidrawDialog, setExcalidrawDialog] = useState<ExcalidrawDialogState | null>(null);
  const [excalidrawDirty, setExcalidrawDirty] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
  const [folderActionDialog, setFolderActionDialog] = useState<FolderActionDialogState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No vault open");
  const hideDuplicateDocumentActions =
    isMacOsPlatform(window.navigator.platform, window.navigator.userAgent) ||
    isWindowsPlatform(window.navigator.platform, window.navigator.userAgent);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calendarPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calendarPreviewRequestId = useRef(0);
  const activeFileRef = useRef<ActiveFile | null>(null);
  const currentDirRef = useRef("");
  const recentFilesRef = useRef<ActiveFile[]>([]);
  const aiBuilderHistoryRef = useRef<AiBuilderHistoryStore>({ entries: {} });
  const suppressDirectoryClickRef = useRef(false);
  const editorGroupsRef = useRef<Record<EditorGroupId, EditorGroupState>>(editorGroups);
  const activeGroupIdRef = useRef<EditorGroupId>("primary");
  const activeEditorRef = useRef<Editor | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const commandPaletteSelectionRef = useRef<{
    editor: Editor;
    ranges: PageSearchMatch[];
    selection: unknown;
  } | null>(null);
  const canvasCommandRequestIdRef = useRef(0);
  // Keyboard navigation moves a virtual selection through scrollable results;
  // this ref lets the selected option be kept visible without stealing focus.
  const commandPaletteResultsRef = useRef<HTMLDivElement | null>(null);
  const richLinkInputRef = useRef<HTMLInputElement | null>(null);
  const excalidrawCreateInputRef = useRef<HTMLInputElement | null>(null);
  const pageNameRef = useRef("Untitled note");
  const metaHeaderRef = useRef("");
  const metaDelimiterRef = useRef<MarkdownParts["metaDelimiter"]>(defaultMetaDelimiter);
  const hydratingEditor = useRef<Record<EditorGroupId, boolean>>({
    primary: false,
    secondary: false,
  });
  // Native menu handlers are registered once. Refs keep those listeners pointed
  // at the latest React closures without re-registering Tauri events on every
  // render.
  const openVaultRef = useRef<() => void | Promise<void>>(() => undefined);
  const saveCurrentFileRef = useRef<() => void | Promise<void>>(() => undefined);
  const closeActiveDocumentTabRef = useRef<() => void>(() => undefined);
  const openTidbitCaptureWindowRef = useRef<() => void | Promise<void>>(() => undefined);
  const openCapturedTidbitRef = useRef<(file: OpenedFile) => void | Promise<void>>(
    () => undefined,
  );
  const resetDocumentRef = useRef<() => void>(() => undefined);
  const openConfiguredNewTabRef = useRef<() => void>(() => undefined);
  const openPageSearchRef = useRef<() => void>(() => undefined);
  const openExcalidrawDrawingRef = useRef<(target: string) => void>(() => undefined);
  const loadExcalidrawPreviewRef = useRef<(target: string) => Promise<string>>(async () => "");
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const excalidrawSceneRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState | Partial<AppState>;
    files: BinaryFiles;
  }>({
    elements: [],
    appState: {},
    files: {},
  });
  const vaultRootRef = useRef("");
  const vaultSettingsRef = useRef<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
    newTabFile: defaultNewTabFile,
    starredFiles: defaultStarredFiles,
    frontmatterPills: defaultFrontmatterPillSettings,
    files: defaultFileDisplaySettings,
    autosave: defaultAutosaveSettings,
    tidbits: defaultTidbitSettings,
    editor: defaultEditorBehaviorSettings,
    appearance: defaultVaultAppearanceSettings,
    debug: defaultDebugSettings,
    cssSnippets: defaultCssSnippetSettings,
    plugins: defaultPluginSettings,
    ai: defaultAiSettings,
    canvas: defaultCanvasSettings,
    theme: null,
  });
  // Track only properties we applied from the theme builder so switching vaults
  // or resetting a theme can remove stale inline CSS variables.
  const appliedThemeTokensRef = useRef<Set<string>>(new Set());
  const windowGlassPreviewAppliedRef = useRef(false);
  const restoredWorkspace = useRef(false);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    currentDirRef.current = currentDir;
  }, [currentDir]);

  useEffect(() => {
    recentFilesRef.current = recentFiles;
  }, [recentFiles]);

  useEffect(() => {
    aiBuilderHistoryRef.current = aiBuilderHistory;
  }, [aiBuilderHistory]);

  useEffect(() => {
    editorGroupsRef.current = editorGroups;
  }, [editorGroups]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    pageNameRef.current = pageName;
  }, [pageName]);

  useEffect(() => {
    metaHeaderRef.current = metaHeader;
  }, [metaHeader]);

  useEffect(() => {
    metaDelimiterRef.current = metaDelimiter;
  }, [metaDelimiter]);

  useEffect(() => {
    vaultRootRef.current = vaultRoot;
  }, [vaultRoot]);

  useEffect(() => {
    vaultSettingsRef.current = vaultSettings;
  }, [vaultSettings]);

  async function requestTidbitShortcutAccessibilityPermission() {
    if (!isTauri() || !isRunningOnMacOs()) {
      return true;
    }

    try {
      if (await checkAccessibilityPermission()) {
        setStatus("macOS Accessibility permission already granted for global tidbit capture");
        return true;
      }

      await requestAccessibilityPermission();

      if (await checkAccessibilityPermission()) {
        setStatus("macOS Accessibility permission granted for global tidbit capture");
        return true;
      }

      setStatus(
        "Grant Glyphary Accessibility permission in macOS System Settings, then save settings again",
      );
      return false;
    } catch (error) {
      setStatus(
        `Could not request macOS Accessibility permission: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void listen<OpenedFile>("tidbit-capture-created", (event) => {
      void openCapturedTidbitRef.current(event.payload);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      removeListener = unlisten;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void listen<string>("tidbit-global-shortcut", (event) => {
      setStatus(
        event.payload === "test"
          ? "Received tidbit shortcut test event"
          : "Received global tidbit shortcut event",
      );
      void openTidbitCaptureWindowRef.current();
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      removeListener = unlisten;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    const settings = normalizeTidbitSettings(tidbitSettings);

    if (!isTauri() || !vaultRoot || !settings.globalShortcutEnabled) {
      return;
    }

    let registeredShortcut: string | null = null;
    let cancelled = false;

    async function registerTidbitShortcut() {
      const registered = await invoke<boolean>("register_tidbit_global_shortcut", {
        shortcut: settings.globalShortcut,
      });

      if (!registered) {
        setStatus(
          `Could not register tidbit shortcut ${settings.globalShortcut}. It may already be used by macOS or another app.`,
        );
        return;
      }

      if (!cancelled) {
        registeredShortcut = settings.globalShortcut;
        setStatus(`Registered global tidbit shortcut ${settings.globalShortcut}`);
      } else {
        void invoke("unregister_tidbit_global_shortcut");
      }
    }

    void registerTidbitShortcut().catch((error) => {
      setStatus(
        `Could not register tidbit shortcut ${settings.globalShortcut}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return () => {
      cancelled = true;

      if (registeredShortcut) {
        void invoke("unregister_tidbit_global_shortcut");
      }
    };
  }, [
    vaultRoot,
    tidbitSettings.pathPattern,
    tidbitSettings.globalShortcut,
    tidbitSettings.globalShortcutEnabled,
  ]);

  useEffect(() => {
    const previousTokens = appliedThemeTokensRef.current;
    const nextTokens = normalizeThemeTokens(themeDraft);

    // Apply the draft directly to :root for live preview; saving still goes
    // through the vault settings command so the preview can be reverted.
    for (const token of previousTokens) {
      if (!(token in nextTokens)) {
        document.documentElement.style.removeProperty(token);
      }
    }

    for (const [token, value] of Object.entries(nextTokens)) {
      document.documentElement.style.setProperty(token, value);
    }

    appliedThemeTokensRef.current = new Set(Object.keys(nextTokens));
  }, [themeDraft]);

  useEffect(() => {
    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncResolvedAppearance = () => {
      setResolvedAppearance(resolveAppearance(appearance));
    };

    syncResolvedAppearance();

    if (appearance !== "auto") {
      return;
    }

    colorSchemeQuery.addEventListener("change", syncResolvedAppearance);

    return () => {
      colorSchemeQuery.removeEventListener("change", syncResolvedAppearance);
    };
  }, [appearance]);

  useEffect(() => {
    const targets = [document.documentElement, document.body];

    document.documentElement.dataset.theme = appearance;
    document.documentElement.dataset.resolvedTheme = resolvedAppearance;
    document.documentElement.style.colorScheme =
      appearance === "auto" ? "light dark" : appearance;

    for (const target of targets) {
      target.classList.toggle("theme-light", resolvedAppearance === "light");
      target.classList.toggle("theme-dark", resolvedAppearance === "dark");
    }

    writePersistedAppearance(appearance);
  }, [appearance, resolvedAppearance]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void getCurrentWindow().setTheme(resolvedAppearance);
  }, [resolvedAppearance]);

  useEffect(() => {
    document.documentElement.dataset.windowGlass = vaultAppearanceDraft.glassEffect
      ? "enabled"
      : "disabled";
    document.documentElement.style.setProperty(
      "--glyphary-glass-opacity",
      String(normalizeVaultAppearanceSettings(vaultAppearanceDraft).glassOpacity),
    );
  }, [vaultAppearanceDraft.glassEffect, vaultAppearanceDraft.glassOpacity]);

  useEffect(() => {
    const shouldReportPreview = windowGlassPreviewAppliedRef.current;
    windowGlassPreviewAppliedRef.current = true;

    if (!isTauri()) {
      if (shouldReportPreview) {
        setStatus(
          vaultAppearanceDraft.glassEffect
            ? "Previewing glass window effect"
            : "Disabled glass window effect preview",
        );
      }
      return;
    }

    void invoke<boolean>("set_window_glass_effect", {
      enabled: vaultAppearanceDraft.glassEffect,
    })
      .then((applied) => {
        if (shouldReportPreview) {
          setStatus(
            applied
              ? "Previewing glass window effect"
              : "Disabled glass window effect preview",
          );
        }
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
  }, [vaultAppearanceDraft.glassEffect]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
      }
      if (calendarPreviewTimer.current) {
        clearTimeout(calendarPreviewTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const suppressNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", suppressNativeContextMenu);
    return () => {
      window.removeEventListener("contextmenu", suppressNativeContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!folderContextMenu) {
      return;
    }

    const closeMenu = () => setFolderContextMenu(null);
    const closeMenuOnPrimaryPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        closeMenu();
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", closeMenuOnPrimaryPointerDown);
    window.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenuOnPrimaryPointerDown);
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [folderContextMenu]);

  useEffect(() => {
    if (!tableContextMenu) {
      return;
    }

    const closeMenu = () => setTableContextMenu(null);
    const closeMenuOnPrimaryPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        closeMenu();
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", closeMenuOnPrimaryPointerDown);
    window.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenuOnPrimaryPointerDown);
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [tableContextMenu]);

  function syncEditorState(nextEditor: Editor) {
    if (!isEditorReady(nextEditor)) {
      return;
    }

    // Selection moves can change active marks/nodes without changing any
    // stored toolbar-specific state. This version tick forces the toolbar to
    // re-read editor.isActive(...) as the cursor moves through the document.
    setEditorStateVersion((version) => version + 1);
  }

  function updateThemeDraftToken(token: string, value: string) {
    setThemeDraft((tokens) => ({
      ...tokens,
      [token]: value,
    }));
    setSelectedThemePresetIdDraft(null);
  }

  function applyThemePreset(preset: ThemePreset) {
    setSelectedThemePresetIdDraft(preset.id);
    setThemeDraft(normalizeThemeTokens(preset.tokens));
    setStatus(`Previewing theme template: ${preset.name}. Save Settings to keep it.`);
  }

  function savedThemeTokens() {
    return normalizeThemeTokens(vaultSettings.theme?.tokens);
  }

  function savedThemePresetId() {
    return normalizeThemePresetId(vaultSettings.theme?.presetId);
  }

  function savedThemeOptions() {
    return normalizeThemeOptions(vaultSettings.theme?.options);
  }

  function savedThemeCalloutSettings() {
    return normalizeThemeCalloutSettings(vaultSettings.theme?.callouts);
  }

  function savedFrontmatterPillSettings() {
    return normalizeFrontmatterPillSettings(vaultSettings.frontmatterPills);
  }

  function savedEditorBehaviorSettings() {
    return normalizeEditorBehaviorSettings(vaultSettings.editor);
  }

  function savedFileDisplaySettings() {
    return normalizeFileDisplaySettings(vaultSettings.files);
  }

  function savedAutosaveSettings() {
    return normalizeAutosaveSettings(vaultSettings.autosave);
  }

  function savedTidbitSettings() {
    return normalizeTidbitSettings(vaultSettings.tidbits);
  }

  function savedVaultAppearanceSettings() {
    return normalizeVaultAppearanceSettings(vaultSettings.appearance);
  }

  function savedDebugSettings() {
    return normalizeDebugSettings(vaultSettings.debug);
  }

  function savedCssSnippetSettings() {
    return normalizeCssSnippetSettings(vaultSettings.cssSnippets);
  }

  function savedPluginSettings() {
    return normalizePluginSettings(vaultSettings.plugins);
  }

  function savedAiSettings() {
    return normalizeAiSettings(vaultSettings.ai);
  }

  function savedCanvasSettings() {
    return normalizeCanvasSettings(vaultSettings.canvas);
  }

  function savedNewTabFile() {
    return normalizeNewTabFile(vaultSettings.newTabFile);
  }

  function vaultRelativeFileFromSelection(selected: string) {
    // The dialog returns an absolute native path; settings store portable
    // vault-relative paths so the config remains usable if the vault moves.
    const root = vaultRootRef.current
      .split(/[\\/]+/)
      .filter(Boolean)
      .join("/");
    const file = selected
      .split(/[\\/]+/)
      .filter(Boolean)
      .join("/");

    return root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : "";
  }

  async function chooseNewTabFile() {
    if (!vaultRootRef.current) {
      return;
    }

    const selected = await open({
      defaultPath: vaultRootRef.current,
      directory: false,
      multiple: false,
      title: "Choose New Tab File",
    });

    if (typeof selected !== "string") {
      return;
    }

    const relative = vaultRelativeFileFromSelection(selected);

    if (!relative) {
      setStatus("Choose a file inside the current vault");
      return;
    }

    setNewTabFileDraft(relative);
  }

  function updateAiDraft(nextSettings: AiSettings) {
    setAiTestStatus(null);
    setAiDraft(nextSettings);
  }

  function settingsHaveChanges() {
    return (
      settingsDraft !== vaultSettings.assetDirectory ||
      !sameNewTabFile(newTabFileDraft, savedNewTabFile()) ||
      !sameFrontmatterPillSettings(frontmatterPillDraft, savedFrontmatterPillSettings()) ||
      !sameEditorBehaviorSettings(editorBehaviorDraft, savedEditorBehaviorSettings()) ||
      !sameFileDisplaySettings(fileDisplayDraft, savedFileDisplaySettings()) ||
      !sameAutosaveSettings(autosaveDraft, savedAutosaveSettings()) ||
      !sameTidbitSettings(tidbitDraft, savedTidbitSettings()) ||
      !sameVaultAppearanceSettings(vaultAppearanceDraft, savedVaultAppearanceSettings()) ||
      !sameDebugSettings(debugDraft, savedDebugSettings()) ||
      !sameCssSnippetSettings(cssSnippetDraft, savedCssSnippetSettings()) ||
      !samePluginSettings(pluginDraft, savedPluginSettings()) ||
      !sameAiSettings(aiDraft, savedAiSettings()) ||
      !sameCanvasSettings(canvasDraft, savedCanvasSettings()) ||
      selectedThemePresetIdDraft !== savedThemePresetId() ||
      !sameThemeTokens(themeDraft, savedThemeTokens()) ||
      !sameThemeOptions(themeOptionsDraft, savedThemeOptions()) ||
      !sameThemeCalloutSettings(themeCalloutDraft, savedThemeCalloutSettings())
    );
  }

  function resetThemeDraft() {
    setSelectedThemePresetIdDraft(null);
    setThemeDraft({});
    setThemeOptionsDraft(defaultThemeOptions);
    setThemeCalloutDraft(defaultThemeCalloutSettings);
    setStatus("Reset theme preview");
  }

  function revertSettingsDraft() {
    const savedCssSnippets = savedCssSnippetSettings();
    const savedPlugins = savedPluginSettings();
    const savedAi = savedAiSettings();
    const savedCanvas = savedCanvasSettings();

    setSettingsDraft(vaultSettings.assetDirectory);
    setNewTabFileDraft(savedNewTabFile());
    setFrontmatterPillDraft(savedFrontmatterPillSettings());
    setEditorBehaviorDraft(savedEditorBehaviorSettings());
    setFileDisplayDraft(savedFileDisplaySettings());
    setAutosaveDraft(savedAutosaveSettings());
    setTidbitDraft(savedTidbitSettings());
    setVaultAppearanceDraft(savedVaultAppearanceSettings());
    setDebugDraft(savedDebugSettings());
    setCssSnippetDraft(savedCssSnippets);
    setPluginDraft(savedPlugins);
    setAiDraft(savedAi);
    setCanvasDraft(savedCanvas);
    setAiTestStatus(null);
    setSelectedThemePresetIdDraft(savedThemePresetId());
    setThemeDraft(savedThemeTokens());
    setThemeOptionsDraft(savedThemeOptions());
    setThemeCalloutDraft(savedThemeCalloutSettings());
    void refreshCssSnippets(vaultRoot, savedCssSnippets).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
    void refreshPlugins(vaultRoot, savedPlugins).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
    setStatus("Reverted settings preview");
  }

  function openSettings() {
    setSettingsOffset({ x: 0, y: 0 });
    setSettingsDragging(null);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsDragging(null);
    setSettingsOpen(false);
  }

  function clampSettingsOffset(x: number, y: number) {
    const margin = 28;
    const maxX = Math.max(0, window.innerWidth / 2 - margin);
    const maxY = Math.max(0, window.innerHeight / 2 - margin);

    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  function settingsDragStartedOnControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea"));
  }

  function startSettingsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || settingsDragStartedOnControl(event.target)) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setSettingsDragging({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: settingsOffset.x,
      originY: settingsOffset.y,
    });
  }

  function moveSettingsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!settingsDragging || settingsDragging.pointerId !== event.pointerId) {
      return;
    }

    setSettingsOffset(
      clampSettingsOffset(
        settingsDragging.originX + event.clientX - settingsDragging.startX,
        settingsDragging.originY + event.clientY - settingsDragging.startY,
      ),
    );
  }

  function stopSettingsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (settingsDragging?.pointerId === event.pointerId) {
      setSettingsDragging(null);
    }
  }

  function editorForGroup(groupId: EditorGroupId) {
    const groupEditor = groupId === "primary" ? primaryEditor : secondaryEditor;

    return isEditorReady(groupEditor) ? groupEditor : null;
  }

  function setEditorGroupsAndRef(nextGroups: Record<EditorGroupId, EditorGroupState>) {
    // Tiptap callbacks can fire before React state has committed. The ref is
    // the synchronous source of truth for cross-pane tab operations.
    editorGroupsRef.current = nextGroups;
    setEditorGroups(nextGroups);
  }

  function fileBackedTabs(groups = editorGroupsRef.current) {
    const seen = new Set<string>();

    return (["primary", "secondary"] as const).flatMap((groupId) =>
      groups[groupId].tabs
        .map((tab) => tab.activeFile)
        .filter((file): file is ActiveFile => Boolean(file))
        .filter((file) => {
          if (seen.has(file.relativePath)) {
            return false;
          }

          seen.add(file.relativePath);
          return true;
        }),
    );
  }

  function updateGroupTab(
    groupId: EditorGroupId,
    tabId: string,
    patch: Partial<DocumentTab>,
  ) {
    if (!tabId) {
      return;
    }

    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: editorGroupsRef.current[groupId].tabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...patch } : tab,
        ),
      },
    };

    setEditorGroupsAndRef(nextGroups);
  }

  function updateActiveTab(patch: Partial<DocumentTab>) {
    const groupId = activeGroupIdRef.current;
    const tabId = editorGroupsRef.current[groupId].activeTabId;

    if (!tabId) {
      return;
    }

    updateGroupTab(groupId, tabId, patch);
  }

  function hasActiveDocumentTab() {
    const group = editorGroupsRef.current[activeGroupIdRef.current];

    return group.tabs.some((tab) => tab.id === group.activeTabId);
  }

  function replaceEditorGroupsWithPrimaryTab(tab: DocumentTab) {
    const nextGroups = createEditorGroups(tab);

    activeGroupIdRef.current = "primary";
    setActiveGroupId("primary");
    setSplitOpen(false);
    setEditorGroupsAndRef(nextGroups);
    persistWorkspace({ openFiles: fileBackedTabs(nextGroups) });
  }

  function clearActiveDocument() {
    activeFileRef.current = null;
    pageNameRef.current = "";
    metaHeaderRef.current = "";
    metaDelimiterRef.current = defaultMetaDelimiter;
    setActiveFile(null);
    setPageName("");
    setMetaHeader("");
    setMetaDelimiter(defaultMetaDelimiter);
    setMarkdown("");
    setMarkdownDraft("");
    setDirty(false);
    setPageNameEditing(false);
    clearEditorContent(primaryEditor);
    clearEditorContent(secondaryEditor);
  }

  function addTabToGroup(tab: DocumentTab, groupId = activeGroupIdRef.current) {
    const nextTabs = [...editorGroupsRef.current[groupId].tabs, tab];
    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: nextTabs,
        activeTabId: tab.id,
      },
    };

    setEditorGroupsAndRef(nextGroups);
    persistWorkspace({ openFiles: fileBackedTabs(nextGroups) });
  }

  function findOpenFileTab(relativePath: string) {
    return findTabAcrossSplitGroups(editorGroupsRef.current, tabIdForFile(relativePath));
  }

  function currentDocumentSnapshot(groupId = activeGroupIdRef.current): Partial<DocumentTab> {
    const group = editorGroupsRef.current[groupId];
    const tab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);
    const groupEditor = editorForGroup(groupId);
    const nextMarkdown =
      !tab
        ? initialMarkdown
        : tab.kind !== "markdown"
        ? tab.markdown
        : groupEditor?.getMarkdown() ?? tab?.markdown ?? initialMarkdown;
    const isActiveGroup = groupId === activeGroupIdRef.current;

    // Inactive panes do not update the top-level mirrors, so their snapshot has
    // to be read from the owning tab plus the editor instance if it exists.
    return {
      activeFile: isActiveGroup ? activeFileRef.current : tab?.activeFile ?? null,
      pageName: isActiveGroup ? pageNameRef.current : tab?.pageName ?? "Untitled note",
      metaHeader: isActiveGroup ? metaHeaderRef.current : tab?.metaHeader ?? "",
      metaDelimiter: isActiveGroup
        ? metaDelimiterRef.current
        : tab?.metaDelimiter ?? defaultMetaDelimiter,
      markdown: nextMarkdown,
      markdownDraft: isActiveGroup ? markdownDraft : tab?.markdownDraft ?? nextMarkdown,
      dirty: isActiveGroup ? dirty : tab?.dirty ?? false,
    };
  }

  function snapshotActiveTab(groupId = activeGroupIdRef.current) {
    const tabId = editorGroupsRef.current[groupId].activeTabId;
    updateGroupTab(groupId, tabId, currentDocumentSnapshot(groupId));
  }

  function setActiveDocumentDirty(nextDirty: boolean) {
    setDirty(nextDirty);
    updateActiveTab({ dirty: nextDirty });
  }

  function activateEditorGroup(groupId: EditorGroupId) {
    if (activeGroupIdRef.current === groupId) {
      return;
    }

    snapshotActiveTab();
    activeGroupIdRef.current = groupId;
    setActiveGroupId(groupId);
    const group = editorGroupsRef.current[groupId];
    const tab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);

    if (tab) {
      hydrateDocumentTab(tab, groupId);
    }
  }

  function hydrateDocumentTab(
    tab: DocumentTab,
    groupId = activeGroupIdRef.current,
    options: { revealInVaultDrawer?: boolean } = {},
  ) {
    const groupEditor = editorForGroup(groupId);

    if (!groupEditor && tab.kind === "markdown") {
      return;
    }

    hydratingEditor.current[groupId] = true;
    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        activeTabId: tab.id,
      },
    };

    setEditorGroupsAndRef(nextGroups);

    if (groupId === activeGroupIdRef.current) {
      activeFileRef.current = tab.activeFile;
      pageNameRef.current = tab.pageName;
      metaHeaderRef.current = tab.metaHeader;
      metaDelimiterRef.current = tab.metaDelimiter;
    }

    if (groupId !== activeGroupIdRef.current) {
      // Loading an inactive split pane should update its editor content, but
      // must not move drawers, toolbar state, or persisted workspace focus.
      if (groupEditor && tab.kind === "markdown") {
        setEditorMarkdownContent(groupEditor, tab.markdown);
      }
      window.setTimeout(() => {
        hydratingEditor.current[groupId] = false;
      }, 0);
      return;
    }

    setActiveFile(tab.activeFile);
    setPageName(tab.pageName);
    setMetaHeader(tab.metaHeader);
    setMetaDelimiter(tab.metaDelimiter);
    setMarkdown(tab.markdown);
    setMarkdownDraft(tab.markdownDraft);
    setDirty(tab.dirty);
    setPageNameEditing(false);
    if (groupEditor && tab.kind === "markdown") {
      setEditorMarkdownContent(groupEditor, tab.markdown);
    }
    if (options.revealInVaultDrawer !== false) {
      void revealFileInVaultDrawer(tab.activeFile);
    }
    if (groupEditor) {
      syncEditorState(groupEditor);
    }
    window.setTimeout(() => {
      hydratingEditor.current[groupId] = false;
    }, 0);
  }

  function hydrateDocumentTabAfterCommit(tab: DocumentTab, groupId = activeGroupIdRef.current) {
    // Closing a tab removes focused DOM while Tiptap hydration mutates the
    // editor view. Defer survivor hydration until React has committed the tab
    // removal so WebKit never sees both operations in the same click turn.
    window.requestAnimationFrame(() => {
      const group = editorGroupsRef.current[groupId];
      const activeTab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);

      if (activeTab?.id === tab.id) {
        hydrateDocumentTab(activeTab, groupId);
      }
    });
  }

  function createDocumentTabFromFile(file: OpenedFile): DocumentTab {
    // Canvas tabs keep the raw JSON in the same content fields used by
    // Markdown tabs, but they bypass frontmatter parsing and Tiptap hydration.
    if (isCanvasPath(file.relativePath)) {
      return {
        id: tabIdForFile(file.relativePath),
        kind: "canvas",
        activeFile: {
          name: file.name,
          relativePath: file.relativePath,
        },
        pageName: canvasTitle(file.name),
        metaHeader: "",
        metaDelimiter: defaultMetaDelimiter,
        markdown: file.content,
        markdownDraft: file.content,
        dirty: false,
      };
    }

    if (isBasePath(file.relativePath)) {
      return {
        id: tabIdForFile(file.relativePath),
        kind: "base",
        activeFile: {
          name: file.name,
          relativePath: file.relativePath,
        },
        pageName: baseTitle(file.name),
        metaHeader: "",
        metaDelimiter: defaultMetaDelimiter,
        markdown: file.content,
        markdownDraft: file.content,
        dirty: false,
      };
    }

    const parts = splitMetaHeader(file.content);

    return {
      id: tabIdForFile(file.relativePath),
      kind: "markdown",
      activeFile: {
        name: file.name,
        relativePath: file.relativePath,
      },
      pageName: fileNameWithoutMarkdownExtension(file.name),
      metaHeader: parts.metaHeader,
      metaDelimiter: parts.metaDelimiter,
      markdown: parts.body,
      markdownDraft: parts.body,
      dirty: false,
    };
  }

  function switchToDocumentTab(tabId: string, groupId = activeGroupIdRef.current) {
    const tab = editorGroupsRef.current[groupId].tabs.find(
      (documentTab) => documentTab.id === tabId,
    );

    if (!tab) {
      return;
    }

    snapshotActiveTab();
    activeGroupIdRef.current = groupId;
    setActiveGroupId(groupId);
    hydrateDocumentTab(tab, groupId);
    if (tab.activeFile) {
      persistActiveFile(tab.activeFile);
      setStatus(`Switched to ${tab.activeFile.relativePath}`);
    } else {
      persistActiveFile(null);
      setStatus(`Switched to ${tabTitle(tab)}`);
    }
  }

  function closeDocumentTab(tabId: string, groupId = activeGroupIdRef.current) {
    const tabs = editorGroupsRef.current[groupId].tabs;
    const tab = tabs.find((documentTab) => documentTab.id === tabId);

    if (!tab) {
      return;
    }

    if (tab.dirty) {
      setStatus(`Save ${tabTitle(tab)} before closing its tab`);
      return;
    }

    if (tabs.length === 1) {
      if (!splitOpen) {
        activeGroupIdRef.current = "primary";
        setActiveGroupId("primary");
        setEditorGroupsAndRef(createEmptyEditorGroups());
        clearActiveDocument();
        persistActiveFile(null);
        setStatus(`Closed ${tabTitle(tab)}; no document open`);
        return;
      }

      const promotedGroup = remainingGroupAfterSplitPaneClose(editorGroupsRef.current, groupId);

      if (!promotedGroup) {
        setStatus("Keep at least one document tab open");
        return;
      }

      const nextGroups = createEditorGroups(promotedGroup.activeTab);
      nextGroups.primary = promotedGroup.primaryGroup;

      // Closing the final tab in a split pane removes the pane. If the primary
      // pane is the one being closed, the secondary group is promoted so the
      // rest of the app never has to handle a secondary-only editor layout.
      activeGroupIdRef.current = "primary";
      setActiveGroupId("primary");
      setSplitOpen(false);
      setEditorGroupsAndRef(nextGroups);
      hydrateDocumentTabAfterCommit(promotedGroup.activeTab, "primary");
      persistActiveFile(promotedGroup.activeTab.activeFile);
      setStatus(`Closed ${tabTitle(tab)} and unsplit editor`);
      return;
    }

    const closeResult = tabsAfterClose(tabs, editorGroupsRef.current[groupId].activeTabId, tabId);

    if (!closeResult || !closeResult.nextActiveTab) {
      setStatus("Keep at least one document tab open");
      return;
    }

    setEditorGroupsAndRef({
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: closeResult.nextTabs,
        activeTabId: closeResult.nextActiveTabId,
      },
    });

    if (!closeResult.wasActiveTab) {
      persistWorkspace({ openFiles: fileBackedTabs() });
      setStatus(`Closed ${tabTitle(tab)}`);
      return;
    }

    activeGroupIdRef.current = groupId;
    setActiveGroupId(groupId);
    hydrateDocumentTabAfterCommit(closeResult.nextActiveTab, groupId);
    persistActiveFile(closeResult.nextActiveTab.activeFile);
    setStatus(`Closed ${tabTitle(tab)}`);
  }

  function insertVaultImage(fileName: string) {
    const groupEditor = editorForGroup(activeGroupIdRef.current);

    if (!groupEditor) {
      return;
    }

    groupEditor
      .chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: {
          src: joinVaultImagePath(vaultRootRef.current, fileName),
          alt: fileName,
          vaultTarget: fileName,
        },
      })
      .run();
  }

  function excalidrawDrawingDirectory() {
    const assetDirectory =
      vaultSettingsRef.current.assetDirectory.trim() || defaultVaultAssetDirectory;

    if (assetDirectory === defaultVaultAssetDirectory) {
      return defaultExcalidrawDirectory;
    }

    return `${assetDirectory.replace(/\/+$/, "")}/drawings`;
  }

  async function loadExcalidrawPreview(target: string) {
    const root = vaultRootRef.current;

    if (!root || !isExcalidrawTarget(target)) {
      return "";
    }

    const file = await readVaultFile(root, target);

    return excalidrawSceneToSvgMarkup(parseExcalidrawScene(file.content));
  }

  async function openExcalidrawDrawing(target: string) {
    const root = vaultRootRef.current;

    if (!root || !isExcalidrawTarget(target)) {
      setStatus("Open a vault before editing drawings");
      return;
    }

    try {
      const file = await readVaultFile(root, target);
      const scene = parseExcalidrawScene(file.content);
      const restored = await restoredExcalidrawScene(scene);

      excalidrawApiRef.current = null;
      excalidrawSceneRef.current = {
        elements: restored.elements,
        appState: restored.appState,
        files: restored.files,
      };
      setExcalidrawDirty(false);
      setExcalidrawDialog({
        relativePath: file.relativePath,
        name: file.name,
        initialData: {
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
        },
      });
      setStatus(`Editing drawing ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveExcalidrawDrawing() {
    if (!vaultRootRef.current || !excalidrawDialog) {
      return;
    }

    try {
      const { serializeAsJSON } = await import("@excalidraw/excalidraw");
      const api = excalidrawApiRef.current;
      const elements = api?.getSceneElementsIncludingDeleted() ?? excalidrawSceneRef.current.elements;
      const visibleElementCount =
        api?.getSceneElements().length ?? elements.filter((element) => !element.isDeleted).length;
      const appState = api?.getAppState() ?? excalidrawSceneRef.current.appState;
      const files = api?.getFiles() ?? excalidrawSceneRef.current.files;
      const content = serializeAsJSON(elements, appState, files, "local");

      await writeVaultFile(vaultRootRef.current, excalidrawDialog.relativePath, content);
      window.dispatchEvent(
        new CustomEvent(excalidrawPreviewRefreshEvent, {
          detail: { target: excalidrawDialog.relativePath },
        }),
      );
      setExcalidrawDirty(false);
      setExcalidrawDialog((dialog) =>
        dialog
          ? {
              ...dialog,
              initialData: {
                elements,
                appState,
                files,
              },
            }
          : dialog,
      );
      setStatus(
        `Saved drawing ${excalidrawDialog.relativePath} (${visibleElementCount} visible element${
          visibleElementCount === 1 ? "" : "s"
        })`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function closeExcalidrawDialog() {
    if (excalidrawDirty && !window.confirm("Close drawing without saving changes?")) {
      return;
    }

    excalidrawApiRef.current = null;
    setExcalidrawDialog(null);
    setExcalidrawDirty(false);
  }

  function openExcalidrawCreateDialog() {
    if (!vaultRoot || !editor) {
      setStatus("Open a vault file before inserting a drawing");
      return;
    }

    setExcalidrawCreateNameDraft("Drawing");
    setExcalidrawCreateDialogOpen(true);
  }

  async function insertExcalidrawDrawing() {
    if (!vaultRoot || !editor || excalidrawCreateSubmitting) {
      return;
    }

    try {
      setExcalidrawCreateSubmitting(true);
      const relative = `${excalidrawDrawingDirectory()}/${excalidrawFileNameForTitle(
        excalidrawCreateNameDraft,
      )}`;
      const file = await createExcalidrawFile(
        vaultRoot,
        relative,
        JSON.stringify(emptyExcalidrawScene(), null, 2),
      );

      insertMarkdownAtCursor(editor, `![[${file.relativePath}]]`);
      await loadEntries(vaultRoot, currentDir);
      setExcalidrawCreateDialogOpen(false);
      await openExcalidrawDrawing(file.relativePath);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setExcalidrawCreateSubmitting(false);
    }
  }

  openExcalidrawDrawingRef.current = (target: string) => {
    void openExcalidrawDrawing(target);
  };
  loadExcalidrawPreviewRef.current = loadExcalidrawPreview;

  async function importImageFiles(files: File[]) {
    if (!vaultRootRef.current || !activeFileRef.current) {
      setStatus("Open a vault file before adding images");
      return;
    }

    try {
      let imported = 0;

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const saved = await invoke<SavedAsset>("save_vault_asset", {
          root: vaultRootRef.current,
          assetDirectory: defaultVaultImageDirectory,
          fileName: fileNameForDroppedImage(file),
          bytes: Array.from(new Uint8Array(buffer)),
        });

        insertVaultImage(saved.fileName);
        imported += 1;
      }

      setStatus(
        `Added ${imported} image${imported === 1 ? "" : "s"} to ${defaultVaultImageDirectory}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function queueImageImport(files: FileList | File[] | null | undefined) {
    const images = Array.from(files ?? []).filter(isSupportedImageFile);

    if (images.length === 0) {
      return false;
    }

    void importImageFiles(images);
    return true;
  }

  function createEditorOptions(groupId: EditorGroupId) {
    return createGlypharyEditorOptions({
      activateEditorGroup,
      getActiveFileName: () => activeFileRef.current?.name ?? null,
      getActiveGroupId: () => activeGroupIdRef.current,
      getEditorGroup: () => editorGroupsRef.current[groupId],
      groupId,
      isHydrating: () => hydratingEditor.current[groupId],
      loadExcalidrawPreview: (target) => loadExcalidrawPreviewRef.current(target),
      openExcalidrawDrawing: (target) => openExcalidrawDrawingRef.current(target),
      openWikiLinkSearch: () => openWikiLinkSearchRef.current(),
      queueImageImport,
      resolveVaultAssetSrc: (target) =>
        joinVaultAssetPath(
          vaultRootRef.current,
          vaultSettingsRef.current.assetDirectory,
          target,
        ),
      resolveVaultImageSrc: (target) => joinVaultImagePath(vaultRootRef.current, target),
      resolveWikiLinkTarget: (target) => resolveWikiLinkTargetRef.current(target),
      setDirty,
      setEditorFocused,
      setMarkdown,
      setMarkdownDraft,
      setStatus,
      syncEditorState,
      updateGroupTab,
      vimMode: editorBehavior.vimMode,
    });
  }

  const primaryEditor = useEditor(createEditorOptions("primary"), [editorBehavior.vimMode]);
  const secondaryEditor = useEditor(createEditorOptions("secondary"), [editorBehavior.vimMode]);
  const activeEditor = activeGroupId === "secondary" ? secondaryEditor : primaryEditor;
  const editor = isEditorReady(activeEditor) ? activeEditor : null;
  const activeDocumentTab =
    editorGroups[activeGroupId]?.tabs.find(
      (tab) => tab.id === editorGroups[activeGroupId]?.activeTabId,
    ) ?? null;
  const activeDocumentIsCanvas = activeDocumentTab?.kind === "canvas";
  const activeDocumentIsBase = activeDocumentTab?.kind === "base";
  const activeDocumentIsMarkdown = activeDocumentTab?.kind === "markdown";
  const starredFiles = useMemo(
    () => normalizeStarredFiles(vaultSettings.starredFiles),
    [vaultSettings.starredFiles],
  );
  const starredFileEntries = useMemo(
    () =>
      starredFiles.map((relativePath) => ({
        name: relativePath.split("/").at(-1) ?? relativePath,
        relativePath,
      })),
    [starredFiles],
  );
  const activeMarkdownFilePath =
    activeDocumentTab?.kind === "markdown"
      ? activeDocumentTab.activeFile?.relativePath ?? ""
      : "";
  const activeNoteStarred = activeMarkdownFilePath
    ? starredFiles.includes(activeMarkdownFilePath)
    : false;
  activeEditorRef.current = editor;

  function captureCommandPaletteSelection() {
    const targetEditor = activeEditorRef.current;

    if (!targetEditor) {
      commandPaletteSelectionRef.current = null;
      return;
    }

    const selection = targetEditor.state.selection;
    commandPaletteSelectionRef.current = {
      editor: targetEditor,
      ranges: selection.empty
        ? []
        : selection.ranges.map((range) => ({
            from: range.$from.pos,
            to: range.$to.pos,
          })),
      selection: selection.toJSON(),
    };
  }

  function restoreCommandPaletteSelection() {
    const saved = commandPaletteSelectionRef.current;

    if (!saved || !isEditorReady(saved.editor)) {
      return;
    }

    try {
      const selection = Selection.fromJSON(saved.editor.state.doc, saved.selection);
      saved.editor.view.dispatch(saved.editor.state.tr.setSelection(selection));
      saved.editor.view.focus();
    } catch {
      commandPaletteSelectionRef.current = null;
    }
  }

  const pageSearch = usePageSearch({
    activeDocumentIsCanvas: !activeDocumentIsMarkdown,
    editor,
    markdown,
    primaryEditor,
    secondaryEditor,
    setStatus,
  });

  openPageSearchRef.current = pageSearch.openSearch;

  useEffect(() => {
    const saved = commandPaletteSelectionRef.current;

    [primaryEditor, secondaryEditor].forEach((targetEditor) => {
      if (!isEditorReady(targetEditor)) {
        return;
      }

      const state =
        commandPaletteOpen && saved?.editor === targetEditor
          ? { ranges: saved.ranges }
          : { ranges: [] };

      targetEditor.view.dispatch(
        targetEditor.state.tr.setMeta(commandPaletteSelectionPluginKey, state),
      );
    });
  }, [commandPaletteOpen, primaryEditor, secondaryEditor]);

  useEffect(() => {
    [primaryEditor, secondaryEditor].forEach((targetEditor) => {
      if (isEditorReady(targetEditor)) {
        targetEditor.view.dispatch(
          targetEditor.state.tr.setMeta("glypharyWikilinkIndexVersion", wikiLinkIndexVersion),
        );
      }
    });
  }, [primaryEditor, secondaryEditor, wikiLinkIndexVersion]);

  useEffect(() => {
    const editors = [primaryEditor, secondaryEditor].filter((value): value is Editor =>
      isEditorReady(value),
    );
    const cleanups = editors.map((targetEditor) => {
      const root = targetEditor.view.dom;
      const handleClick = (event: MouseEvent) => {
        const target = event.target;

        if (!(target instanceof HTMLElement)) {
          return;
        }

        const wikiLink = target.closest<HTMLElement>("[data-wikilink-target]");

        if (wikiLink && root.contains(wikiLink)) {
          event.preventDefault();
          event.stopPropagation();
          openWikiLinkTargetRef.current(wikiLink.dataset.wikilinkTarget ?? "", event);
          return;
        }

        const button = target.closest<HTMLButtonElement>(
          "[data-toc-entry-id], [data-toc-edit], [data-mermaid-edit]",
        );

        if (!button || !root.contains(button)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (button.dataset.tocEdit) {
          const widget = button.closest<HTMLElement>("[data-toc-block-position]");
          const blockPosition = Number(widget?.dataset.tocBlockPosition);

          if (Number.isFinite(blockPosition)) {
            targetEditor.chain().focus().setTextSelection(blockPosition + 1).run();
          } else {
            targetEditor.commands.focus();
          }
          return;
        }

        if (button.dataset.mermaidEdit) {
          const widget = button.closest<HTMLElement>("[data-mermaid-block-position]");
          const blockPosition = Number(widget?.dataset.mermaidBlockPosition);

          if (Number.isFinite(blockPosition)) {
            targetEditor.chain().focus().setTextSelection(blockPosition + 1).run();
          } else {
            targetEditor.commands.focus();
          }
          return;
        }

        const entryId = button.dataset.tocEntryId;
        const entry = markdownHeadings(targetEditor.getMarkdown()).find(
          (candidate) => candidate.id === entryId,
        );

        if (entry) {
          jumpToHeadingInEditor(targetEditor, entry, setStatus);
        }
      };

      root.addEventListener("click", handleClick);

      return () => root.removeEventListener("click", handleClick);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [primaryEditor, secondaryEditor]);

  useEffect(() => {
    if (!isEditorReady(primaryEditor)) {
      return;
    }

    const tab = editorGroupsRef.current.primary.tabs.find(
      (documentTab) => documentTab.id === editorGroupsRef.current.primary.activeTabId,
    );

    if (tab) {
      hydrateDocumentTab(tab, "primary");
    }
  }, [primaryEditor]);

  useEffect(() => {
    if (!isEditorReady(secondaryEditor) || editorGroupsRef.current.secondary.tabs.length === 0) {
      return;
    }

    const tab = editorGroupsRef.current.secondary.tabs.find(
      (documentTab) => documentTab.id === editorGroupsRef.current.secondary.activeTabId,
    );

    if (tab) {
      hydrateDocumentTab(tab, "secondary");
    }
  }, [secondaryEditor]);

  useEffect(() => {
    if (!isEditorReady(primaryEditor) || restoredWorkspace.current || !isTauri()) {
      return;
    }

    // Restore only after the primary editor exists; hydrating before Tiptap is
    // ready would update React state but leave the editor document stale.
    restoredWorkspace.current = true;
    const persisted = readPersistedWorkspace();

    if (!persisted) {
      return;
    }

    const workspace = persisted;

    async function restoreWorkspace() {
      try {
        setStatus("Restoring previous vault");
        vaultRootRef.current = workspace.vaultRoot;
        setVaultRoot(workspace.vaultRoot);
        setVaultDrawerOpen(true);
        setVaultDrawerItem("files");
        setDrawerOpen(false);
        recentFilesRef.current = workspace.recentFiles;
        setRecentFiles(workspace.recentFiles);
        await loadVaultSettings(workspace.vaultRoot);
        await loadAiBuilderHistory(workspace.vaultRoot);
        setCurrentDir(workspace.currentDir);
        setSearchQuery("");
        setSearchResults([]);
        setTaskResults([]);
        await loadEntries(workspace.vaultRoot, workspace.currentDir);
        await rebuildWikiLinkIndex(workspace.vaultRoot);

        if (workspace.openFiles.length > 0) {
          const tabs: DocumentTab[] = [];

          for (const persistedFile of workspace.openFiles) {
            try {
              tabs.push(
                createDocumentTabFromFile(
                  await readVaultFile(workspace.vaultRoot, persistedFile.relativePath),
                ),
              );
            } catch {
              // Missing files are skipped so one stale path does not block
              // restoring the rest of the workspace.
            }
          }

          if (tabs.length > 0) {
            const activePath = workspace.activeFile?.relativePath;
            const activeTab =
              tabs.find((tab) => tab.activeFile?.relativePath === activePath) ?? tabs[0];
            const nextGroups = createEmptyEditorGroups();

            nextGroups.primary = {
              id: "primary",
              tabs,
              activeTabId: activeTab.id,
            };
            activeGroupIdRef.current = "primary";
            setActiveGroupId("primary");
            setSplitOpen(false);
            setEditorGroupsAndRef(nextGroups);
            hydrateDocumentTab(activeTab, "primary");
            setStatus(`Restored ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`);
            return;
          }
        }

        if (workspace.activeFile) {
          const file = await readVaultFile(
            workspace.vaultRoot,
            workspace.activeFile.relativePath,
          );
          const tab = createDocumentTabFromFile(file);

          replaceEditorGroupsWithPrimaryTab(tab);
          hydrateDocumentTab(tab, "primary");
          setStatus(`Restored ${file.relativePath}`);
          return;
        }

        const tab = createUntitledTab();

        replaceEditorGroupsWithPrimaryTab(tab);
        hydrateDocumentTab(tab, "primary");
        setStatus(`Restored vault ${workspace.vaultRoot}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    restoreWorkspace();
  }, [primaryEditor]);

  const stats = useMemo(() => {
    const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    const characters = markdown.length;

    return { words, characters };
  }, [markdown]);

  const tableOfContents = useMemo(() => markdownHeadings(markdown), [markdown]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);

      return date;
    });
  }, [calendarMonth]);

  const calendarNoteDateKeySet = useMemo(
    () => new Set(calendarNoteDateKeys),
    [calendarNoteDateKeys],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCalendarNoteDateKeys() {
      if (!vaultRoot) {
        setCalendarNoteDateKeys([]);
        return;
      }

      try {
        const files = await invoke<string[]>("list_calendar_day_files", {
          root: vaultRoot,
        });
        // The backend returns every calendar file; the UI only needs markers
        // for the currently visible month grid.
        const visibleDateKeys = new Set(calendarDays.map(calendarDateKey));
        const existing = files
          .map(calendarPathDateKey)
          .filter((dateKey): dateKey is string => !!dateKey && visibleDateKeys.has(dateKey));

        if (!cancelled) {
          setCalendarNoteDateKeys(existing);
        }
      } catch (error) {
        if (!cancelled) {
          setCalendarNoteDateKeys([]);
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadCalendarNoteDateKeys();

    return () => {
      cancelled = true;
    };
  }, [calendarDays, vaultRoot]);

  function clearCalendarPreviewTimer() {
    if (calendarPreviewTimer.current) {
      clearTimeout(calendarPreviewTimer.current);
      calendarPreviewTimer.current = null;
    }
  }

  function closeCalendarDayPreview() {
    clearCalendarPreviewTimer();
    calendarPreviewRequestId.current += 1;
    setCalendarDayPreview(null);
  }

  function calendarPreviewPosition(event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>) {
    const x =
      event.clientX + 14 + calendarPreviewWidth <= window.innerWidth
        ? event.clientX + 14
        : Math.max(12, event.clientX - calendarPreviewWidth - 14);
    const y =
      event.clientY + 14 + calendarPreviewHeight <= window.innerHeight
        ? event.clientY + 14
        : Math.max(12, event.clientY - calendarPreviewHeight - 14);

    return { x, y };
  }

  function scheduleCalendarDayPreview(
    date: Date,
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) {
    const dateKey = calendarDateKey(date);
    const position = calendarPreviewPosition(event);

    clearCalendarPreviewTimer();
    setCalendarDayPreview(null);

    if (!vaultRootRef.current) {
      return;
    }

    const relativePath = calendarDayRelativePath(date);
    const title = calendarDayTitle(date);
    const hasExistingNote = calendarNoteDateKeySet.has(dateKey);

    calendarPreviewTimer.current = setTimeout(() => {
      const requestId = calendarPreviewRequestId.current + 1;
      calendarPreviewRequestId.current = requestId;
      calendarPreviewTimer.current = null;

      if (!hasExistingNote) {
        setCalendarDayPreview({
          dateKey,
          markdown: "No calendar note yet. Double-click this day to create it.",
          relativePath,
          title,
          ...position,
        });
        return;
      }

      void readVaultFile(vaultRootRef.current, relativePath)
        .then((file) => {
          if (calendarPreviewRequestId.current !== requestId) {
            return;
          }

          setCalendarDayPreview({
            dateKey,
            markdown: file.content,
            relativePath,
            title,
            ...position,
          });
        })
        .catch((error) => {
          if (calendarPreviewRequestId.current === requestId) {
            setStatus(error instanceof Error ? error.message : String(error));
          }
        });
    }, editorBehavior.calendarPreviewDelayMs);
  }

  function moveCalendarDayPreview(
    date: Date,
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) {
    const dateKey = calendarDateKey(date);
    const position = calendarPreviewPosition(event);

    if (calendarDayPreview?.dateKey === dateKey) {
      setCalendarDayPreview((preview) => (preview ? { ...preview, ...position } : preview));
      return;
    }

    if (!calendarPreviewTimer.current) {
      scheduleCalendarDayPreview(date, event);
    }
  }

  useEffect(() => {
    if (!calendarDayPreview) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCalendarDayPreview();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeCalendarDayPreview);
    window.addEventListener("scroll", closeCalendarDayPreview, true);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeCalendarDayPreview);
      window.removeEventListener("scroll", closeCalendarDayPreview, true);
    };
  }, [calendarDayPreview]);

  const toolbarActions: ToolbarAction[] = useMemo(() => {
    if (!editor) {
      return [];
    }

    return [
      {
        label: "B",
        title: "Bold",
        isActive: () => editorFocused && editor.isActive("bold"),
        run: () => editor.chain().focus().toggleBold().run(),
      },
      {
        label: "I",
        title: "Italic",
        isActive: () => editorFocused && editor.isActive("italic"),
        run: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        label: "H1",
        title: "Heading 1",
        isActive: () => editorFocused && editor.isActive("heading", { level: 1 }),
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        label: "H2",
        title: "Heading 2",
        isActive: () => editorFocused && editor.isActive("heading", { level: 2 }),
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "UL",
        icon: "bullet-list",
        title: "Bullet list",
        isActive: () => editorFocused && editor.isActive("bulletList"),
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        label: "OL",
        icon: "ordered-list",
        title: "Ordered list",
        isActive: () => editorFocused && editor.isActive("orderedList"),
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Tasks",
        icon: "task-list",
        title: "Task list",
        isActive: () => editorFocused && editor.isActive("taskList"),
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        label: "Quote",
        icon: "quote",
        title: "Blockquote",
        isActive: () => editorFocused && editor.isActive("blockquote"),
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        label: "Code",
        icon: "code",
        title: "Code block",
        isActive: () => editorFocused && editor.isActive("codeBlock"),
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        label: "HTML",
        icon: "html",
        title: "Insert HTML block",
        isActive: () => false,
        run: () => insertHtmlBlock(),
      },
      {
        label: "Mermaid",
        icon: "code",
        title: "Insert Mermaid diagram",
        isActive: () => false,
        run: () => insertMermaidDiagram(),
      },
      {
        label: "Table",
        icon: "table",
        title: "Insert table",
        isActive: () => false,
        run: () => appendTable(),
      },
      {
        label: "Cols",
        icon: "columns",
        title: "Insert columns",
        isActive: () => false,
        run: () => appendColumns(),
      },
      {
        label: "Callout",
        icon: "callout",
        title: "Insert callout",
        isActive: () => editorFocused && editor.isActive("callout"),
        run: () => appendCallout(),
      },
    ];
  }, [editor, editorFocused, editorStateVersion, markdown]);

  function setActivePageName(nextPageName: string) {
    pageNameRef.current = nextPageName;
    setPageName(nextPageName);
    updateActiveTab({ pageName: nextPageName });
  }

  function markPageNameDirty() {
    setActiveDocumentDirty(true);
    if (activeFileRef.current) {
      setStatus(`Unsaved changes in ${activeFileRef.current.name}`);
    } else {
      setStatus("Unsaved changes in untitled note");
    }
  }

  function finishPageNameEdit() {
    const activeFile = activeFileRef.current;

    if (!pageNameRef.current.trim() && activeFileRef.current) {
      setActivePageName(fileNameWithoutMarkdownExtension(activeFileRef.current.name));
    }

    setPageNameEditing(false);

    if (
      activeFile &&
      pageNameRef.current.trim() &&
      pageNameRef.current.trim() !== fileNameWithoutMarkdownExtension(activeFile.name)
    ) {
      void saveCurrentFileRef.current();
    }
  }

  function setActiveMetaHeader(
    nextMetaHeader: string,
    nextMetaDelimiter = metaDelimiterRef.current,
  ) {
    metaHeaderRef.current = nextMetaHeader;
    metaDelimiterRef.current = nextMetaDelimiter;
    setMetaHeader(nextMetaHeader);
    setMetaDelimiter(nextMetaDelimiter);
    updateActiveTab({
      metaHeader: nextMetaHeader,
      metaDelimiter: nextMetaDelimiter,
    });
  }

  function setEditorBody(content: string, clean: boolean) {
    if (!editor) {
      return;
    }

    hydratingEditor.current[activeGroupIdRef.current] = clean;
    setEditorMarkdownContent(editor, content);
    setMarkdown(content);
    setMarkdownDraft(content);
    updateActiveTab({
      markdown: content,
      markdownDraft: content,
      dirty: !clean,
    });

    if (clean) {
      setActiveDocumentDirty(false);
      window.setTimeout(() => {
        hydratingEditor.current[activeGroupIdRef.current] = false;
      }, 0);
    } else {
      setActiveDocumentDirty(true);
      setStatus(
        activeFileRef.current
          ? `Unsaved changes in ${activeFileRef.current.name}`
          : "Unsaved changes in untitled note",
      );
    }
  }

  function aiBuilderHistoryKeyForFile(file: ActiveFile | null) {
    return file?.relativePath ?? null;
  }

  function activeAiBuilderHistoryKey() {
    return aiBuilderHistoryKeyForFile(activeFileRef.current);
  }

  function activeAiBuilderHistoryTurns() {
    const key = activeAiBuilderHistoryKey();

    return key ? (aiBuilderHistory.entries[key] ?? []) : [];
  }

  function aiBuilderHistoryContext() {
    const turns = activeAiBuilderHistoryTurns().slice(0, maxAiBuilderPromptHistoryTurns);

    if (turns.length === 0) {
      return "(none)";
    }

    return turns
      .map((turn, index) =>
        [
          `Turn ${turns.length - index}:`,
          `User: ${turn.prompt}`,
          "Assistant markdown:",
          turn.markdown,
        ].join("\n"),
      )
      .join("\n\n");
  }

  function selectedAiBuilderReplacementTurn() {
    if (!aiPageBuilderReplaceTurnId) {
      return null;
    }

    return (
      activeAiBuilderHistoryTurns().find((turn) => turn.id === aiPageBuilderReplaceTurnId) ?? null
    );
  }

  function aiBuilderMarkedBlockPattern(turnId: string) {
    const escapedTurnId = escapeRegExp(turnId);

    return new RegExp(
      `<!--\\s*glyphary-ai-builder:start\\s+${escapedTurnId}\\s*-->[\\s\\S]*?<!--\\s*glyphary-ai-builder:end\\s+${escapedTurnId}\\s*-->`,
    );
  }

  function hasAiBuilderMarkedBlock(turnId: string) {
    return aiBuilderMarkedBlockPattern(turnId).test(markdown);
  }

  function latestReplaceableAiBuilderTurn() {
    return (
      activeAiBuilderHistoryTurns().find(
        (turn) => turn.applied && !turn.superseded && hasAiBuilderMarkedBlock(turn.id),
      ) ?? null
    );
  }

  function clearActiveAiBuilderHistory() {
    const key = activeAiBuilderHistoryKey();

    if (!key) {
      setStatus("Open a saved vault file before clearing AI Builder history");
      return;
    }

    const nextHistory = {
      entries: {
        ...aiBuilderHistoryRef.current.entries,
        [key]: [],
      },
    };

    persistAiBuilderHistory(nextHistory);
    setAiPageBuilderReplaceTurnId(null);
    setStatus("Cleared AI Builder history for this file");
  }

  async function loadAiBuilderHistory(root: string) {
    try {
      const history = await invoke<AiBuilderHistoryStore>("read_ai_builder_history", { root });
      const normalized = { entries: history.entries ?? {} };

      aiBuilderHistoryRef.current = normalized;
      setAiBuilderHistory(normalized);
    } catch (error) {
      aiBuilderHistoryRef.current = { entries: {} };
      setAiBuilderHistory({ entries: {} });
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function persistAiBuilderHistory(nextHistory: AiBuilderHistoryStore) {
    const root = vaultRootRef.current;

    if (!root) {
      return;
    }

    aiBuilderHistoryRef.current = nextHistory;
    setAiBuilderHistory(nextHistory);
    void invoke<AiBuilderHistoryStore>("write_ai_builder_history", {
      root,
      history: nextHistory,
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
  }

  function upsertAiBuilderHistoryTurn(key: string, turn: AiBuilderHistoryTurn) {
    const current = aiBuilderHistoryRef.current;
    const currentTurns = current.entries[key] ?? [];
    const nextTurns = [turn, ...currentTurns.filter((entry) => entry.id !== turn.id)].slice(
      0,
      maxAiBuilderHistoryTurnsPerFile,
    );
    const nextHistory = {
      entries: {
        ...current.entries,
        [key]: nextTurns,
      },
    };

    persistAiBuilderHistory(nextHistory);
  }

  function updateAiBuilderHistoryTurn(
    key: string,
    turnId: string,
    patch: Partial<AiBuilderHistoryTurn>,
  ) {
    const current = aiBuilderHistoryRef.current;
    const currentTurns = current.entries[key] ?? [];
    const nextTurns = currentTurns.map((turn) =>
      turn.id === turnId ? { ...turn, ...patch } : turn,
    );
    const nextHistory = {
      entries: {
        ...current.entries,
        [key]: nextTurns,
      },
    };

    persistAiBuilderHistory(nextHistory);
  }

  function moveAiBuilderHistoryKey(previousKey: string, nextKey: string) {
    if (previousKey === nextKey) {
      return;
    }

    const current = aiBuilderHistoryRef.current;
    const previousTurns = current.entries[previousKey] ?? [];

    if (previousTurns.length === 0) {
      return;
    }

    persistAiBuilderHistory({
      entries: {
        ...current.entries,
        [previousKey]: [],
        [nextKey]: previousTurns,
      },
    });
  }

  function createAiBuilderHistoryTurn(
    prompt: string,
    markdown: string,
    assets: AiBuilderHistoryAsset[] = [],
  ): AiBuilderHistoryTurn {
    const timestampMs = Date.now();

    return {
      id: `ai-builder-${timestampMs}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      markdown,
      assets,
      timestampMs,
      applied: false,
    };
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function aiBuilderStartMarker(turnId: string) {
    return `<!-- glyphary-ai-builder:start ${turnId} -->`;
  }

  function aiBuilderEndMarker(turnId: string) {
    return `<!-- glyphary-ai-builder:end ${turnId} -->`;
  }

  function wrapAiBuilderMarkdown(turnId: string, output: string) {
    // Plain HTML comments give us invisible anchors in rendered Markdown while
    // remaining portable source text for Obsidian-style tools and sync.
    const normalized = normalizeAiMarkdownForApply(output).trim();

    return `${aiBuilderStartMarker(turnId)}\n\n${normalized}\n\n${aiBuilderEndMarker(turnId)}`;
  }

  function replaceAiBuilderMarkedBlock(
    sourceMarkdown: string,
    replaceTurnId: string,
    nextTurnId: string,
    output: string,
  ) {
    const pattern = aiBuilderMarkedBlockPattern(replaceTurnId);

    if (!pattern.test(sourceMarkdown)) {
      return null;
    }

    return sourceMarkdown.replace(pattern, wrapAiBuilderMarkdown(nextTurnId, output));
  }

  function aiReviewOutputForInsertion(review: AiReviewState, output: string) {
    if (!review.aiBuilderTurnId) {
      return normalizeAiMarkdownForApply(output);
    }

    return wrapAiBuilderMarkdown(review.aiBuilderTurnId, output);
  }

  function markAiBuilderReviewApplied(review: AiReviewState, replaced: boolean) {
    if (!review.aiBuilderHistoryKey || !review.aiBuilderTurnId) {
      return;
    }

    updateAiBuilderHistoryTurn(review.aiBuilderHistoryKey, review.aiBuilderTurnId, {
      applied: true,
    });

    if (replaced && review.aiBuilderReplaceTurnId) {
      updateAiBuilderHistoryTurn(review.aiBuilderHistoryKey, review.aiBuilderReplaceTurnId, {
        superseded: true,
        replacedByTurnId: review.aiBuilderTurnId,
      });
    }
  }

  async function aiBuilderSearchVaultNotes(request: string) {
    if (!vaultRootRef.current || !aiBuilderPromptRequestsVaultContext(request)) {
      return [];
    }

    const queries = aiBuilderVaultQueries(request);
    const groupedResults = new Map<string, SearchResult[]>();

    // The model never receives arbitrary vault access. Glyphary first performs
    // bounded local searches, then sends only the matching snippets/excerpts.
    for (const query of queries) {
      const results = await searchVaultFiles(vaultRootRef.current, escapeRegExp(query), {
        includeContent: true,
        markdownOnly: true,
        excludeDotPaths: true,
      });

      for (const result of results) {
        const current = groupedResults.get(result.relativePath) ?? [];

        if (current.length < maxAiBuilderVaultSnippetsPerFile) {
          current.push(result);
        }

        groupedResults.set(result.relativePath, current);
      }
    }

    const files = Array.from(groupedResults.entries()).slice(0, maxAiBuilderVaultFiles);

    return Promise.all(
      files.map(async ([relativePath, snippets]) => {
        const file = await readVaultFile(vaultRootRef.current, relativePath);
        const parts = splitMetaHeader(file.content);

        return {
          relativePath,
          snippets,
          excerpt: parts.body.trim().slice(0, maxAiBuilderVaultFileChars),
        };
      }),
    );
  }

  async function aiBuilderSearchVaultTasks(request: string, queries: string[]) {
    if (!vaultRootRef.current || !aiBuilderPromptRequestsTaskContext(request)) {
      return [];
    }

    const results = await searchVaultFiles(vaultRootRef.current, taskSearchPattern("incomplete"), {
      includeContent: true,
      markdownOnly: true,
      excludeDotPaths: true,
    });
    const loweredQueries = aiBuilderEffectiveTaskQueries(queries);

    return results
      .filter((result) => result.isContentMatch)
      .filter((result) => {
        if (loweredQueries.length === 0) {
          return true;
        }

        const searchable = `${result.relativePath} ${result.lineText ?? ""}`.toLowerCase();

        return loweredQueries.some((query) => searchable.includes(query));
      })
      .slice(0, maxAiBuilderVaultTasks);
  }

  async function aiBuilderVaultContext(request: string) {
    const queries = aiBuilderVaultQueries(request);
    const [notes, tasks] = await Promise.all([
      aiBuilderSearchVaultNotes(request),
      aiBuilderSearchVaultTasks(request, queries),
    ]);

    return aiBuilderVaultContextText(
      queries,
      notes,
      tasks,
      aiBuilderPromptRequestsVaultContext(request),
    );
  }

  function persistWorkspace(next: Partial<PersistedWorkspace>) {
    const nextVaultRoot = next.vaultRoot ?? vaultRoot;

    if (!nextVaultRoot) {
      return;
    }

    writePersistedWorkspace({
      vaultRoot: nextVaultRoot,
      currentDir: next.currentDir ?? currentDir,
      activeFile: next.activeFile === undefined ? activeFile : next.activeFile,
      openFiles: next.openFiles ?? fileBackedTabs(),
      recentFiles: next.recentFiles ?? recentFilesRef.current,
    });
  }

  function recordRecentFile(file: ActiveFile) {
    const nextRecentFiles = recentFilesWithOpenedFile(recentFilesRef.current, file);

    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);
    return nextRecentFiles;
  }

  function persistActiveFile(file: ActiveFile | null) {
    persistWorkspace({
      activeFile: file,
      recentFiles: file ? recordRecentFile(file) : recentFilesRef.current,
    });
  }

  function samePathList(left: string[], right: string[]) {
    return left.length === right.length && left.every((path, index) => path === right[index]);
  }

  async function persistStarredFiles(nextFiles: string[]) {
    const previousSettings = vaultSettingsRef.current;
    const starredFiles = normalizeStarredFiles(nextFiles);
    const nextSettings = {
      ...previousSettings,
      starredFiles,
    };

    if (samePathList(starredFiles, normalizeStarredFiles(previousSettings.starredFiles))) {
      return true;
    }

    vaultSettingsRef.current = nextSettings;
    setVaultSettings(nextSettings);

    if (!vaultRootRef.current || !isTauri()) {
      return true;
    }

    try {
      const saved = await writeVaultSettings(vaultRootRef.current, nextSettings);
      const committedSettings = {
        ...nextSettings,
        ...saved,
        starredFiles: normalizeStarredFiles(saved.starredFiles),
      };

      vaultSettingsRef.current = committedSettings;
      setVaultSettings(committedSettings);
      return true;
    } catch (error) {
      vaultSettingsRef.current = previousSettings;
      setVaultSettings(previousSettings);
      setStatus(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function toggleActiveNoteStar() {
    if (!activeMarkdownFilePath) {
      setStatus("Open a Markdown note before starring it");
      return;
    }

    const current = normalizeStarredFiles(vaultSettingsRef.current.starredFiles);
    const next = current.includes(activeMarkdownFilePath)
      ? current.filter((path) => path !== activeMarkdownFilePath)
      : [activeMarkdownFilePath, ...current];

    if (await persistStarredFiles(next)) {
      setStatus(
        current.includes(activeMarkdownFilePath)
          ? `Unstarred ${activeMarkdownFilePath}`
          : `Starred ${activeMarkdownFilePath}`,
      );
    }
  }

  async function updateStarredFiles(mapper: (path: string) => string | null) {
    const current = normalizeStarredFiles(vaultSettingsRef.current.starredFiles);
    const next = current.map(mapper).filter((path): path is string => Boolean(path));

    await persistStarredFiles(next);
  }

  async function loadEntries(root: string, relative: string) {
    const nextEntries = await listVaultDir(root, relative);

    setEntries(nextEntries);
  }

  async function revealFileInVaultDrawer(file: ActiveFile | null) {
    const root = vaultRootRef.current;

    if (!root || !file) {
      return;
    }

    const fileDirectory = parentDirectory(file.relativePath);

    setVaultDrawerItem("files");
    setCurrentDir(fileDirectory);
    persistWorkspace({
      currentDir: fileDirectory,
      activeFile: file,
    });

    try {
      await loadEntries(root, fileDirectory);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function rebuildWikiLinkIndex(root: string) {
    if (!isTauri()) {
      setWikiLinkIndexAndRef([]);
      return;
    }

    setStatus("Indexing...");
    const files = await listVaultMarkdownFiles(root);

    setWikiLinkIndexAndRef(files);
  }

  function openWikiLinkSearch() {
    openWikiLinkSearchState(Boolean(vaultRootRef.current));
  }

  function handleWikiLinkSearchKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWikiLinkSearch();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setWikiLinkSearchSelectedIndex((index) =>
        moveSelectableIndex(index, filteredWikiLinkFiles.length, 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setWikiLinkSearchSelectedIndex((index) =>
        moveSelectableIndex(index, filteredWikiLinkFiles.length, -1),
      );
      return;
    }

    if (event.key === "Enter" && selectedWikiLinkFile) {
      event.preventDefault();
      insertWikiLinkSelection(selectedWikiLinkFile);
    }
  }

  function insertWikiLinkSelection(file: VaultIndexedFile) {
    if (!editor) {
      return;
    }

    const label = wikiLinkDisplayName(file);
    const { state } = editor;
    const beforeCursor = state.doc.textBetween(
      Math.max(0, state.selection.from - 2),
      state.selection.from,
    );
    const insertion = beforeCursor === "[[" ? `${label}]]` : `[[${label}]]`;

    // Completing a wikilink is plain text editing. Running the fragment through
    // Markdown insertion can split the link across paragraphs.
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        dispatch?.(tr.insertText(insertion));
        return true;
      })
      .run();
    closeWikiLinkSearch();
  }

  function openWikiLinkTarget(
    target: string,
    event?: MouseEvent | ReactMouseEvent<HTMLElement>,
  ) {
    const resolution = resolveWikiLinkTarget(target);

    if (resolution.candidates.length === 0) {
      setStatus(`No note found for [[${target}]]`);
      return;
    }

    if (resolution.candidates.length === 1) {
      void openFile(resolution.candidates[0].relativePath);
      return;
    }

    const x =
      "clientX" in (event ?? {})
        ? (event as MouseEvent | ReactMouseEvent<HTMLElement>).clientX
        : window.innerWidth / 2;
    const y =
      "clientY" in (event ?? {})
        ? (event as MouseEvent | ReactMouseEvent<HTMLElement>).clientY
        : window.innerHeight / 2;

    setWikiLinkPicker({
      target,
      candidates: resolution.candidates,
      x,
      y,
    });
    setWikiLinkPickerSelectedIndex(0);
    setStatus(`Choose one of ${resolution.candidates.length} notes for [[${target}]]`);
  }

  function openWikiLinkPickerSelection(file: VaultIndexedFile) {
    setWikiLinkPicker(null);
    setWikiLinkPickerSelectedIndex(0);
    void openFile(file.relativePath);
  }

  resolveWikiLinkTargetRef.current = resolveWikiLinkTarget;
  openWikiLinkSearchRef.current = openWikiLinkSearch;
  openWikiLinkTargetRef.current = openWikiLinkTarget;

  async function refreshCssSnippets(
    root = vaultRoot,
    settings = cssSnippetDraft,
  ) {
    if (!root || !isTauri()) {
      setCssSnippetFiles([]);
      setCssSnippetContents([]);
      return;
    }

    const normalizedSettings = normalizeCssSnippetSettings(settings);
    const [files, contents] = await Promise.all([
      invoke<CssSnippetFile[]>("list_css_snippets", {
        root,
        directory: normalizedSettings.directory,
      }),
      invoke<CssSnippetContent[]>("read_css_snippets", {
        root,
        directory: normalizedSettings.directory,
        enabled: normalizedSettings.enabled,
      }),
    ]);

    setCssSnippetFiles(files);
    setCssSnippetContents(contents);
  }

  async function refreshPlugins(root = vaultRoot, settings = pluginDraft) {
    if (!root || !isTauri()) {
      setPluginCatalog({ plugins: [], errors: [] });
      setPluginStyles([]);
      return;
    }

    const normalizedSettings = normalizePluginSettings(settings);
    // Discovery and style loading are separate backend calls by design: invalid
    // plugins remain visible as catalog errors, while only enabled plugins may
    // inject CSS into the running editor.
    const [catalog, styles] = await Promise.all([
      invoke<PluginCatalog>("list_vault_plugins", { root }),
      invoke<PluginStyleContent[]>("read_plugin_styles", {
        root,
        enabled: normalizedSettings.enabled,
      }),
    ]);

    setPluginCatalog(catalog);
    setPluginStyles(styles);
  }

  async function loadVaultSettings(root: string) {
    const settings = isTauri()
      ? await readVaultSettings(root)
        : {
          assetDirectory: defaultVaultAssetDirectory,
          newTabFile: defaultNewTabFile,
          starredFiles: defaultStarredFiles,
          frontmatterPills: defaultFrontmatterPillSettings,
          files: defaultFileDisplaySettings,
          autosave: defaultAutosaveSettings,
          tidbits: defaultTidbitSettings,
          editor: defaultEditorBehaviorSettings,
          appearance: defaultVaultAppearanceSettings,
          debug: defaultDebugSettings,
          cssSnippets: defaultCssSnippetSettings,
          plugins: defaultPluginSettings,
          ai: defaultAiSettings,
          canvas: defaultCanvasSettings,
          theme: null,
    };
    const themeTokens = normalizeThemeTokens(settings.theme?.tokens);
    const themePresetId = normalizeThemePresetId(settings.theme?.presetId);
    const themeOptions = normalizeThemeOptions(settings.theme?.options);
    const themeCallouts = normalizeThemeCalloutSettings(settings.theme?.callouts);
    const frontmatterPills = normalizeFrontmatterPillSettings(settings.frontmatterPills);
    const editorSettings = normalizeEditorBehaviorSettings(settings.editor);
    const fileDisplaySettings = normalizeFileDisplaySettings(settings.files);
    const autosave = normalizeAutosaveSettings(settings.autosave);
    const tidbits = normalizeTidbitSettings(settings.tidbits);
    const vaultAppearanceSettings = normalizeVaultAppearanceSettings(settings.appearance);
    const debug = normalizeDebugSettings(settings.debug);
    const cssSnippets = normalizeCssSnippetSettings(settings.cssSnippets);
    const plugins = normalizePluginSettings(settings.plugins);
    const ai = normalizeAiSettings(settings.ai);
    const canvas = normalizeCanvasSettings(settings.canvas);
    const newTabFile = normalizeNewTabFile(settings.newTabFile);
    const starredFiles = normalizeStarredFiles(settings.starredFiles);

    const normalizedSettings = {
      ...settings,
      newTabFile,
      starredFiles,
      frontmatterPills,
      files: fileDisplaySettings,
      autosave,
      tidbits,
      editor: editorSettings,
      appearance: vaultAppearanceSettings,
      debug,
      cssSnippets,
      plugins,
      ai,
      canvas,
      theme:
        Object.keys(themeTokens).length > 0 ||
        !sameThemeOptions(themeOptions, defaultThemeOptions) ||
        !sameThemeCalloutSettings(themeCallouts, defaultThemeCalloutSettings)
          ? {
              presetId: themePresetId,
              callouts: themeCallouts,
              tokens: themeTokens,
              options: themeOptions,
            }
          : null,
    };

    vaultSettingsRef.current = normalizedSettings;
    setVaultSettings(normalizedSettings);
    setSettingsDraft(settings.assetDirectory);
    setNewTabFileDraft(newTabFile);
    setFrontmatterPillDraft(frontmatterPills);
    setEditorBehaviorDraft(editorSettings);
    setEditorBehavior(editorSettings);
    setFileDisplayDraft(fileDisplaySettings);
    setAutosaveDraft(autosave);
    setAutosaveSettings(autosave);
    setTidbitDraft(tidbits);
    setTidbitSettings(tidbits);
    setVaultAppearanceDraft(vaultAppearanceSettings);
    setDebugDraft(debug);
    setCssSnippetDraft(cssSnippets);
    setPluginDraft(plugins);
    setAiDraft(ai);
    setCanvasDraft(canvas);
    setAiTestStatus(null);
    setSelectedThemePresetIdDraft(themePresetId);
    setThemeDraft(themeTokens);
    setThemeOptionsDraft(themeOptions);
    setThemeCalloutDraft(themeCallouts);

    if (isTauri()) {
      // Tauri's asset protocol is deny-by-default. Re-allow the configured
      // asset directory whenever a vault is opened or settings change.
      await allowVaultAssets(root, settings.assetDirectory);
      await allowVaultAssets(root, defaultVaultImageDirectory);
    }

    await refreshCssSnippets(root, cssSnippets);
    await refreshPlugins(root, plugins);

    return settings;
  }

  async function saveVaultSettings() {
    if (!vaultRoot) {
      return;
    }

    try {
      const settings = await writeVaultSettings(vaultRoot, {
          assetDirectory: settingsDraft,
          newTabFile: normalizeNewTabFile(newTabFileDraft),
          starredFiles: normalizeStarredFiles(vaultSettingsRef.current.starredFiles),
          frontmatterPills: normalizeFrontmatterPillSettings(frontmatterPillDraft),
          files: normalizeFileDisplaySettings(fileDisplayDraft),
          autosave: normalizeAutosaveSettings(autosaveDraft),
          tidbits: normalizeTidbitSettings(tidbitDraft),
          editor: normalizeEditorBehaviorSettings(editorBehaviorDraft),
          appearance: normalizeVaultAppearanceSettings(vaultAppearanceDraft),
          debug: normalizeDebugSettings(debugDraft),
          cssSnippets: normalizeCssSnippetSettings(cssSnippetDraft),
          plugins: normalizePluginSettings(pluginDraft),
          ai: normalizeAiSettings(aiDraft),
          canvas: normalizeCanvasSettings(canvasDraft),
          theme:
            Object.keys(normalizeThemeTokens(themeDraft)).length > 0 ||
            !sameThemeOptions(themeOptionsDraft, defaultThemeOptions) ||
            !sameThemeCalloutSettings(themeCalloutDraft, defaultThemeCalloutSettings)
            ? {
                presetId: selectedThemePresetIdDraft,
                callouts: normalizeThemeCalloutSettings(themeCalloutDraft),
                tokens: normalizeThemeTokens(themeDraft),
                options: normalizeThemeOptions(themeOptionsDraft),
              }
            : null,
      });
      const themeTokens = normalizeThemeTokens(settings.theme?.tokens);
      const themePresetId = normalizeThemePresetId(settings.theme?.presetId);
      const themeOptions = normalizeThemeOptions(settings.theme?.options);
      const themeCallouts = normalizeThemeCalloutSettings(settings.theme?.callouts);
      const frontmatterPills = normalizeFrontmatterPillSettings(settings.frontmatterPills);
      const editorSettings = normalizeEditorBehaviorSettings(settings.editor);
      const fileDisplaySettings = normalizeFileDisplaySettings(settings.files);
      const autosave = normalizeAutosaveSettings(settings.autosave);
      const tidbits = normalizeTidbitSettings(settings.tidbits);
      const vaultAppearanceSettings = normalizeVaultAppearanceSettings(settings.appearance);
      const debug = normalizeDebugSettings(settings.debug);
      const cssSnippets = normalizeCssSnippetSettings(settings.cssSnippets);
      const plugins = normalizePluginSettings(settings.plugins);
      const ai = normalizeAiSettings(settings.ai);
      const canvas = normalizeCanvasSettings(settings.canvas);
      const newTabFile = normalizeNewTabFile(settings.newTabFile);
      const starredFiles = normalizeStarredFiles(settings.starredFiles);
      const normalizedSettings = {
        ...settings,
        newTabFile,
        starredFiles,
        frontmatterPills,
        files: fileDisplaySettings,
        autosave,
        tidbits,
        editor: editorSettings,
        appearance: vaultAppearanceSettings,
        debug,
        cssSnippets,
        plugins,
        ai,
        canvas,
        theme:
          Object.keys(themeTokens).length > 0 ||
          !sameThemeOptions(themeOptions, defaultThemeOptions) ||
          !sameThemeCalloutSettings(themeCallouts, defaultThemeCalloutSettings)
            ? {
                presetId: themePresetId,
                callouts: themeCallouts,
                tokens: themeTokens,
                options: themeOptions,
              }
            : null,
      };

      snapshotActiveTab("primary");
      if (splitOpen) {
        snapshotActiveTab("secondary");
      }
      vaultSettingsRef.current = normalizedSettings;
      setVaultSettings(normalizedSettings);
      setSettingsDraft(settings.assetDirectory);
      setNewTabFileDraft(newTabFile);
      setFrontmatterPillDraft(frontmatterPills);
      setEditorBehaviorDraft(editorSettings);
      setEditorBehavior(editorSettings);
      setFileDisplayDraft(fileDisplaySettings);
      setAutosaveDraft(autosave);
      setAutosaveSettings(autosave);
      setTidbitDraft(tidbits);
      setTidbitSettings(tidbits);
      setVaultAppearanceDraft(vaultAppearanceSettings);
      setDebugDraft(debug);
      setCssSnippetDraft(cssSnippets);
      setPluginDraft(plugins);
      setAiDraft(ai);
      setCanvasDraft(canvas);
      setAiTestStatus(null);
      setSelectedThemePresetIdDraft(themePresetId);
      setThemeDraft(themeTokens);
      setThemeOptionsDraft(themeOptions);
      setThemeCalloutDraft(themeCallouts);
      await allowVaultAssets(vaultRoot, settings.assetDirectory);
      await allowVaultAssets(vaultRoot, defaultVaultImageDirectory);
      await refreshCssSnippets(vaultRoot, cssSnippets);
      await refreshPlugins(vaultRoot, plugins);
      await loadEntries(vaultRoot, currentDir);
      setStatus("Saved vault settings");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveCurrentFile() {
    if (!vaultRoot || !activeFileRef.current || !dirty) {
      return;
    }

    const groupId = activeGroupIdRef.current;
    const activeTab = editorGroupsRef.current[groupId].tabs.find(
      (tab) => tab.id === editorGroupsRef.current[groupId].activeTabId,
    );

    if (activeTab?.kind === "markdown" && !editor) {
      return;
    }

    let file = activeFileRef.current;
    const requestedName = pageNameRef.current.trim();

    if (
      activeTab?.kind === "markdown" &&
      requestedName &&
      requestedName !== fileNameWithoutMarkdownExtension(file.name)
    ) {
      // The displayed page name is the rename source of truth. Renaming first
      // lets the subsequent write target the new path and keeps tab IDs stable
      // with the file-relative-path convention.
      const previousTabId = editorGroupsRef.current[groupId].activeTabId;
      const previousRelativePath = file.relativePath;
      const renamed = await renameVaultFile(vaultRoot, file.relativePath, requestedName);

      file = {
        name: renamed.name,
        relativePath: renamed.relativePath,
      };
      const nextTabId = tabIdForFile(file.relativePath);

      activeFileRef.current = file;
      setActiveFile(file);
      setActivePageName(fileNameWithoutMarkdownExtension(file.name));
      const renamedTabs = editorGroupsRef.current[groupId].tabs.map((tab) =>
        tab.id === previousTabId
          ? {
              ...tab,
              id: nextTabId,
              activeFile: file,
              pageName: fileNameWithoutMarkdownExtension(file.name),
            }
          : tab,
      );
      const nextGroups = {
        ...editorGroupsRef.current,
        [groupId]: {
          ...editorGroupsRef.current[groupId],
          tabs: renamedTabs,
          activeTabId: nextTabId,
        },
      };

      setEditorGroupsAndRef(nextGroups);
      persistActiveFile(file);
      replaceFileInWikiLinkIndex(previousRelativePath, file);
      moveAiBuilderHistoryKey(previousRelativePath, file.relativePath);
      await updateStarredFiles((path) =>
        path === previousRelativePath ? file.relativePath : path,
      );
      await loadEntries(vaultRoot, currentDir);
    }

    const content =
      activeTab?.kind !== "markdown"
        ? markdownDraft
        : composeMarkdown(
            metaHeaderRef.current,
            metaDelimiterRef.current,
            editor?.getMarkdown() ?? "",
          );

    await writeVaultFile(vaultRoot, file.relativePath, content);
    const savedMarkdown =
      activeTab?.kind !== "markdown" ? markdownDraft : editor?.getMarkdown() ?? "";
    const savedDraft = markdownDraft;
    const activeTabIdForGroup = editorGroupsRef.current[groupId].activeTabId;
    const savedTabs = editorGroupsRef.current[groupId].tabs.map((tab) =>
      tab.id === activeTabIdForGroup
        ? {
            ...tab,
            activeFile: file,
            pageName:
              activeTab?.kind === "canvas"
                ? canvasTitle(file.name)
                : activeTab?.kind === "base"
                  ? baseTitle(file.name)
                  : fileNameWithoutMarkdownExtension(file.name),
            metaHeader: metaHeaderRef.current,
            metaDelimiter: metaDelimiterRef.current,
            markdown: savedMarkdown,
            markdownDraft: savedDraft,
            dirty: false,
          }
        : tab,
    );
    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: savedTabs,
      },
    };

    setEditorGroupsAndRef(nextGroups);
    setDirty(false);
    setStatus(`Saved ${file.name}`);
  }

  useEffect(() => {
    saveCurrentFileRef.current = saveCurrentFile;
  });

  useEffect(() => {
    if (!vaultRoot || !autosaveSettings.enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      void saveCurrentFileRef.current();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [vaultRoot, autosaveSettings.enabled]);

  async function openVault() {
    try {
      await saveCurrentFile();
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Vault",
      });

      if (typeof selected !== "string") {
        return;
      }

      vaultRootRef.current = selected;
      setVaultRoot(selected);
      setVaultDrawerOpen(true);
      setVaultDrawerItem("files");
      setDrawerOpen(false);
      recentFilesRef.current = [];
      setRecentFiles([]);
      await loadVaultSettings(selected);
      await loadAiBuilderHistory(selected);
      setCurrentDir("");
      const tab = createUntitledTab();

      replaceEditorGroupsWithPrimaryTab(tab);
      hydrateDocumentTab(tab, "primary");
      setSearchQuery("");
      setSearchResults([]);
      setTaskResults([]);
      await loadEntries(selected, "");
      setWikiLinkIndexAndRef([]);
      await rebuildWikiLinkIndex(selected);
      persistWorkspace({
        vaultRoot: selected,
        currentDir: "",
        activeFile: null,
        recentFiles: [],
      });
      setStatus(`Opened vault ${selected}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  openVaultRef.current = openVault;
  saveCurrentFileRef.current = saveCurrentFile;
  openConfiguredNewTabRef.current = openConfiguredNewTab;
  closeActiveDocumentTabRef.current = () => {
    const groupId = activeGroupIdRef.current;
    const activeTabId = editorGroupsRef.current[groupId]?.activeTabId;

    if (activeTabId) {
      closeDocumentTab(activeTabId, groupId);
    }
  };

  useEffect(() => {
    const handleGlobalSaveShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "s") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      void saveCurrentFileRef.current();
    };
    const handleGlobalCommandPaletteShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "p") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      if (!hasActiveDocumentTab()) {
        setStatus("Open or create a note before using the command palette");
        return;
      }

      setCommandPaletteScope("root");
      setCommandPaletteQuery("");
      setCommandPaletteSelectedIndex(0);
      captureCommandPaletteSelection();
      setCommandPaletteOpen(true);
    };
    const handleGlobalPageSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "f") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      openPageSearchRef.current();
    };
    const handleGlobalCloseTabShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "w") {
        return;
      }

      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      event.preventDefault();
      closeActiveDocumentTabRef.current();
    };
    const handleGlobalNewTabShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "t") {
        return;
      }

      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      event.preventDefault();
      openConfiguredNewTabRef.current();
    };

    window.addEventListener("keydown", handleGlobalSaveShortcut);
    window.addEventListener("keydown", handleGlobalCommandPaletteShortcut);
    window.addEventListener("keydown", handleGlobalPageSearchShortcut, { capture: true });
    window.addEventListener("keydown", handleGlobalNewTabShortcut, { capture: true });
    window.addEventListener("keydown", handleGlobalCloseTabShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleGlobalSaveShortcut);
      window.removeEventListener("keydown", handleGlobalCommandPaletteShortcut);
      window.removeEventListener("keydown", handleGlobalPageSearchShortcut, { capture: true });
      window.removeEventListener("keydown", handleGlobalNewTabShortcut, { capture: true });
      window.removeEventListener("keydown", handleGlobalCloseTabShortcut, { capture: true });
    };
  }, []);

  useEffect(() => {
    const settings = normalizeTidbitSettings(tidbitSettings);

    if (!settings.globalShortcutEnabled) {
      return;
    }

    const handleFocusedTidbitShortcut = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        (target instanceof Element && target.closest(".shortcut-capture-control")) ||
        !keyboardEventMatchesShortcut(event, settings.globalShortcut)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void openTidbitCaptureWindowRef.current();
    };

    window.addEventListener("keydown", handleFocusedTidbitShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleFocusedTidbitShortcut, { capture: true });
    };
  }, [tidbitSettings.globalShortcut, tidbitSettings.globalShortcutEnabled]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const closeSettingsOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
      }
    };

    window.addEventListener("keydown", closeSettingsOnEscape);

    return () => window.removeEventListener("keydown", closeSettingsOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    if (!imagePreview) {
      return;
    }

    const closeImagePreviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setImagePreview(null);
      }
    };

    window.addEventListener("keydown", closeImagePreviewOnEscape);

    return () => window.removeEventListener("keydown", closeImagePreviewOnEscape);
  }, [imagePreview]);

  useEffect(() => {
    if (!aiReview) {
      return;
    }

    const closeAiReviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAiReview(null);
      }
    };

    window.addEventListener("keydown", closeAiReviewOnEscape);

    return () => window.removeEventListener("keydown", closeAiReviewOnEscape);
  }, [aiReview]);

  useEffect(() => {
    if (!aiPageBuilderOpen) {
      return;
    }

    const closeAiPageBuilderOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAiPageBuilderOpen(false);
      }
    };

    window.addEventListener("keydown", closeAiPageBuilderOnEscape);

    return () => window.removeEventListener("keydown", closeAiPageBuilderOnEscape);
  }, [aiPageBuilderOpen]);

  useEffect(() => {
    if (!aiPageBuilderAssetReview) {
      return;
    }

    const closeAiPageBuilderAssetReviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAiPageBuilderAssetReview(null);
      }
    };

    window.addEventListener("keydown", closeAiPageBuilderAssetReviewOnEscape);

    return () =>
      window.removeEventListener("keydown", closeAiPageBuilderAssetReviewOnEscape);
  }, [aiPageBuilderAssetReview]);

  useEffect(() => {
    if (!releaseNotification) {
      return;
    }

    const closeReleaseNotificationOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReleaseNotification(null);
      }
    };

    window.addEventListener("keydown", closeReleaseNotificationOnEscape);

    return () =>
      window.removeEventListener("keydown", closeReleaseNotificationOnEscape);
  }, [releaseNotification]);

  useEffect(() => {
    let cancelled = false;

    async function checkForReleaseUpdate() {
      try {
        const response = await fetch(githubLatestReleaseApiUrl, {
          headers: { Accept: "application/vnd.github+json" },
        });

        if (!response.ok) {
          return;
        }

        const latestRelease = releaseNotificationFromGitHubRelease(
          await response.json(),
        );

        if (
          !cancelled &&
          latestRelease &&
          normalizedReleaseVersion(latestRelease.tagName) !==
            normalizedReleaseVersion(currentAppVersion)
        ) {
          setReleaseNotification(latestRelease);
        }
      } catch {
        // Update checks should never interrupt local-first editing.
      }
    }

    void checkForReleaseUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    commandPaletteInputRef.current?.focus();
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!wikiLinkSearchOpen) {
      return;
    }

    wikiLinkSearchInputRef.current?.focus();
  }, [wikiLinkSearchOpen]);

  useEffect(() => {
    if (!richLinkDialogOpen) {
      return;
    }

    richLinkInputRef.current?.focus();
  }, [richLinkDialogOpen]);

  useEffect(() => {
    if (!excalidrawCreateDialogOpen) {
      return;
    }

    excalidrawCreateInputRef.current?.focus();
    excalidrawCreateInputRef.current?.select();
  }, [excalidrawCreateDialogOpen]);

  useEffect(() => {
    if (!wikiLinkPicker) {
      return;
    }

    const closePicker = () => {
      setWikiLinkPicker(null);
      setWikiLinkPickerSelectedIndex(0);
    };
    const handlePickerKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setWikiLinkPickerSelectedIndex((index) =>
          moveSelectableIndex(index, wikiLinkPicker.candidates.length, 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setWikiLinkPickerSelectedIndex((index) =>
          moveSelectableIndex(index, wikiLinkPicker.candidates.length, -1),
        );
        return;
      }

      if (event.key === "Enter") {
        const selectedFile =
          wikiLinkPicker.candidates[
            Math.min(wikiLinkPickerSelectedIndex, wikiLinkPicker.candidates.length - 1)
          ] ?? null;

        if (!selectedFile) {
          return;
        }

        event.preventDefault();
        openWikiLinkPickerSelection(selectedFile);
      }
    };

    window.addEventListener("pointerdown", closePicker);
    window.addEventListener("keydown", handlePickerKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closePicker);
      window.removeEventListener("keydown", handlePickerKeyDown);
    };
  }, [wikiLinkPicker, wikiLinkPickerSelectedIndex]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisteners: Array<() => void> = [];

    // Native macOS menus live in Rust, but all document state lives here. The
    // bridge is event-based so menu commands and in-window buttons share the
    // same save/open/new code paths.
    listen("open-vault-requested", () => {
      void openVaultRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("save-requested", () => {
      void saveCurrentFileRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("new-document-requested", () => {
      resetDocumentRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("new-tab-requested", () => {
      openConfiguredNewTabRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen<AppearanceMode>("appearance-requested", (event) => {
      if (event.payload === "auto" || event.payload === "light" || event.payload === "dark") {
        setAppearance(event.payload);
      }
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("settings-requested", openSettings)
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  async function openFile(
    relativePath: string,
    options: { revealInVaultDrawer?: boolean } = {},
  ) {
    if (!vaultRoot) {
      return;
    }

    try {
      snapshotActiveTab();
      const existing = findOpenFileTab(relativePath);

      if (existing) {
        // Avoid two editable copies of the same file. Switching to the existing
        // tab prevents divergent dirty states for one vault path.
        activeGroupIdRef.current = existing.groupId;
        setActiveGroupId(existing.groupId);
        hydrateDocumentTab(existing.tab, existing.groupId, options);
        persistActiveFile(existing.tab.activeFile);
        setStatus(
          `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
        );
        return;
      }

      const file = await readVaultFile(vaultRoot, relativePath);
      const tab = createDocumentTabFromFile(file);

      if (hasNoOpenDocumentTabs(editorGroupsRef.current)) {
        replaceEditorGroupsWithPrimaryTab(tab);
      } else {
        addTabToGroup(tab);
      }
      hydrateDocumentTab(tab, activeGroupIdRef.current, options);
      persistActiveFile(tab.activeFile);
      setStatus(`Opened ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function openConfiguredNewTab() {
    if (!vaultRootRef.current) {
      setStatus("Open a vault before opening a new tab");
      return;
    }

    const relativePath = normalizeNewTabFile(vaultSettingsRef.current.newTabFile);

    if (!relativePath) {
      setStatus("Configure a new tab note in Settings");
      return;
    }

    // Cmd+T uses the saved setting, not the draft currently open in Settings.
    void openFile(relativePath);
  }

  async function openCalendarDay(date: Date) {
    if (!vaultRoot) {
      setStatus("Open a vault before opening calendar notes");
      return;
    }

    const relativePath = calendarDayRelativePath(date);
    const existing = findOpenFileTab(relativePath);

    snapshotActiveTab();

    if (existing) {
      activeGroupIdRef.current = existing.groupId;
      setActiveGroupId(existing.groupId);
      hydrateDocumentTab(existing.tab, existing.groupId);
      persistActiveFile(existing.tab.activeFile);
      await revealFileInVaultDrawer(existing.tab.activeFile);
      setStatus(
        `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
      );
      return;
    }

    try {
      const file = await openCalendarDayFile(
        vaultRoot,
        relativePath,
        calendarDayTitle(date),
      );
      const tab = createDocumentTabFromFile(file);

      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await revealFileInVaultDrawer(tab.activeFile);
      setCalendarNoteDateKeys((dateKeys) =>
        dateKeys.includes(calendarDateKey(date)) ? dateKeys : [...dateKeys, calendarDateKey(date)],
      );
      setStatus(`Opened calendar note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openDirectoryShadow(relativePath: string) {
    if (!vaultRoot) {
      return;
    }

    try {
      snapshotActiveTab();
      const file = await openDirectoryShadowFile(vaultRoot, relativePath);
      const existing = findOpenFileTab(file.relativePath);

      if (existing) {
        activeGroupIdRef.current = existing.groupId;
        setActiveGroupId(existing.groupId);
        hydrateDocumentTab(existing.tab, existing.groupId);
        persistActiveFile(existing.tab.activeFile);
        setStatus(
          `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
        );
        return;
      }

      const tab = createDocumentTabFromFile(file);

      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      setStatus(`Opened directory note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function applyRenamedDirectoryToOpenState(
    oldDirectory: VaultEntry,
    newDirectory: RenamedDirectory,
  ) {
    const rebaseFile = (file: ActiveFile | null) => {
      if (!file) {
        return null;
      }

      const nextPath = rebasePathAfterDirectoryRename(file.relativePath, oldDirectory, newDirectory);
      return nextPath === file.relativePath ? file : activeFileWithRelativePath(nextPath);
    };
    const nextGroups = Object.fromEntries(
      (Object.entries(editorGroupsRef.current) as Array<[EditorGroupId, EditorGroupState]>).map(
        ([groupId, group]) => {
          let nextActiveTabId = group.activeTabId;
          const nextTabs = group.tabs.map((tab) => {
            const nextActiveFile = rebaseFile(tab.activeFile);

            if (!nextActiveFile || nextActiveFile === tab.activeFile) {
              return tab;
            }

            const nextId = tabIdForFile(nextActiveFile.relativePath);

            if (tab.id === group.activeTabId) {
              nextActiveTabId = nextId;
            }

            return {
              ...tab,
              id: nextId,
              activeFile: nextActiveFile,
              pageName: pageNameForFileName(nextActiveFile.name),
            };
          });

          return [
            groupId,
            {
              ...group,
              tabs: nextTabs,
              activeTabId: nextActiveTabId,
            },
          ];
        },
      ),
    ) as Record<EditorGroupId, EditorGroupState>;
    const nextActiveFile = rebaseFile(activeFileRef.current);
    const nextRecentFiles = recentFilesRef.current.map((file) => rebaseFile(file) ?? file);
    const nextCurrentDir = rebasePathAfterDirectoryRename(
      currentDir,
      oldDirectory,
      newDirectory,
    );

    setEditorGroupsAndRef(nextGroups);
    activeFileRef.current = nextActiveFile;
    setActiveFile(nextActiveFile);
    if (nextActiveFile) {
      setPageName(pageNameForFileName(nextActiveFile.name));
    }
    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);
    setCurrentDir(nextCurrentDir);
    persistWorkspace({
      currentDir: nextCurrentDir,
      activeFile: nextActiveFile,
      recentFiles: nextRecentFiles,
    });
  }

  function replaceOpenFilePath(oldRelativePath: string, movedFile: ActiveFile) {
    const nextId = tabIdForFile(movedFile.relativePath);
    let nextActiveFile = activeFileRef.current;
    const nextGroups = Object.fromEntries(
      (Object.entries(editorGroupsRef.current) as Array<[EditorGroupId, EditorGroupState]>).map(
        ([groupId, group]) => {
          let nextActiveTabId = group.activeTabId;
          const nextTabs = group.tabs.map((tab) => {
            if (tab.activeFile?.relativePath !== oldRelativePath) {
              return tab;
            }

            if (tab.id === group.activeTabId) {
              nextActiveTabId = nextId;
            }

            return {
              ...tab,
              id: nextId,
              activeFile: movedFile,
              pageName: pageNameForFileName(movedFile.name),
            };
          });

          return [
            groupId,
            {
              ...group,
              tabs: nextTabs,
              activeTabId: nextActiveTabId,
            },
          ];
        },
      ),
    ) as Record<EditorGroupId, EditorGroupState>;
    const nextRecentFiles = recentFilesRef.current.map((file) =>
      file.relativePath === oldRelativePath ? movedFile : file,
    );

    if (nextActiveFile?.relativePath === oldRelativePath) {
      nextActiveFile = movedFile;
      activeFileRef.current = movedFile;
      setActiveFile(movedFile);
      setPageName(pageNameForFileName(movedFile.name));
    }

    setEditorGroupsAndRef(nextGroups);
    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);
    persistWorkspace({
      activeFile: nextActiveFile,
      recentFiles: nextRecentFiles,
    });
  }

  function removeDeletedFileFromOpenState(relativePath: string) {
    const removeFromGroup = (group: EditorGroupState) => {
      const removedIndex = group.tabs.findIndex(
        (tab) => tab.activeFile?.relativePath === relativePath,
      );

      if (removedIndex === -1) {
        return { group, removedActive: false };
      }

      const nextTabs = group.tabs.filter((tab) => tab.activeFile?.relativePath !== relativePath);
      const removedActive = group.tabs[removedIndex].id === group.activeTabId;
      const activeTabId =
        removedActive && nextTabs.length > 0
          ? nextTabs[Math.min(removedIndex, nextTabs.length - 1)].id
          : group.activeTabId;

      return {
        group: {
          ...group,
          tabs: nextTabs,
          activeTabId,
        },
        removedActive,
      };
    };
    const primary = removeFromGroup(editorGroupsRef.current.primary);
    const secondary = removeFromGroup(editorGroupsRef.current.secondary);
    let nextGroups: Record<EditorGroupId, EditorGroupState> = {
      primary: primary.group,
      secondary: secondary.group,
    };
    let nextSplitOpen = splitOpen;
    let nextActiveGroupId = activeGroupIdRef.current;

    if (!splitOpen && nextGroups.primary.tabs.length === 0) {
      const tab = createUntitledTab();
      nextGroups = createEditorGroups(tab);
      nextActiveGroupId = "primary";
    } else if (
      splitOpen &&
      nextGroups.primary.tabs.length === 0 &&
      nextGroups.secondary.tabs.length > 0
    ) {
      const promotedPrimary: EditorGroupState = {
        ...nextGroups.secondary,
        id: "primary",
      };

      nextGroups = {
        primary: promotedPrimary,
        secondary: {
          id: "secondary",
          tabs: [],
          activeTabId: "",
        },
      };
      nextSplitOpen = false;
      nextActiveGroupId = "primary";
    } else if (splitOpen && nextGroups.secondary.tabs.length === 0) {
      nextGroups = {
        primary: nextGroups.primary,
        secondary: {
          id: "secondary",
          tabs: [],
          activeTabId: "",
        },
      };
      nextSplitOpen = false;
      nextActiveGroupId = "primary";
    }

    const activeGroup = nextGroups[nextActiveGroupId];
    const activeTab = activeGroup.tabs.find((tab) => tab.id === activeGroup.activeTabId)
      ?? activeGroup.tabs[0];
    const nextRecentFiles = recentFilesRef.current.filter(
      (file) => file.relativePath !== relativePath,
    );

    setSplitOpen(nextSplitOpen);
    activeGroupIdRef.current = nextActiveGroupId;
    setActiveGroupId(nextActiveGroupId);
    setEditorGroupsAndRef(nextGroups);
    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);

    if (activeTab) {
      hydrateDocumentTab(activeTab, nextActiveGroupId);
      persistWorkspace({
        activeFile: activeTab.activeFile,
        recentFiles: nextRecentFiles,
      });
    }
  }

  function handleFolderContextMenu(
    entry: VaultEntry,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    suppressDirectoryClickRef.current = true;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }
    setFolderContextMenu({
      entry,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function currentDirectoryEntry(): VaultEntry {
    return {
      name: currentDir ? relativePathFileName(currentDir) : "Vault root",
      relativePath: currentDir,
      isDir: true,
    };
  }

  function handleVaultListContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setFolderContextMenu({
      entry: currentDirectoryEntry(),
      x: event.clientX,
      y: event.clientY,
      createOnly: true,
    });
  }

  function openFolderActionDialog(action: FolderActionKind, entry: VaultEntry) {
    setFolderContextMenu(null);
    setFolderActionDialog({
      action,
      entry,
      value: folderActionInitialValue(action, entry),
    });
  }

  async function createNoteFromFolderMenu(entry: VaultEntry, noteName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!noteName?.trim()) {
      return;
    }

    try {
      const file = await createNoteInDirectory(vaultRoot, entry.relativePath, noteName);
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createCanvasFromFolderMenu(entry: VaultEntry, canvasName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!canvasName?.trim()) {
      return;
    }

    try {
      const file = await createCanvasInDirectory(vaultRoot, entry.relativePath, canvasName);
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created canvas ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createFolderFromFolderMenu(entry: VaultEntry, directoryName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!directoryName?.trim()) {
      return;
    }

    try {
      const directory = await createDirectoryInDirectory(
        vaultRoot,
        entry.relativePath,
        directoryName,
      );

      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created folder ${directory.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameFolderFromFolderMenu(entry: VaultEntry, nextName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!nextName?.trim()) {
      return;
    }

    try {
      const renamed = await renameVaultDirectory(vaultRoot, entry.relativePath, nextName);

      applyRenamedDirectoryToOpenState(entry, renamed);
      await updateStarredFiles((path) =>
        path === entry.relativePath || path.startsWith(`${entry.relativePath}/`)
          ? `${renamed.relativePath}${path.slice(entry.relativePath.length)}`
          : path,
      );
      await loadEntries(
        vaultRoot,
        rebasePathAfterDirectoryRename(currentDir, entry, renamed),
      );
      await rebuildWikiLinkIndex(vaultRoot);
      setStatus(`Renamed folder ${entry.name} to ${renamed.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameFileFromContextMenu(entry: VaultEntry, nextName: string) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    if (!nextName?.trim()) {
      return;
    }

    try {
      snapshotActiveTab();
      const renamed = await renameVaultFile(vaultRoot, entry.relativePath, nextName);
      const renamedFile = {
        name: renamed.name,
        relativePath: renamed.relativePath,
      };

      replaceOpenFilePath(entry.relativePath, renamedFile);
      replaceFileInWikiLinkIndex(entry.relativePath, renamedFile);
      moveAiBuilderHistoryKey(entry.relativePath, renamedFile.relativePath);
      await updateStarredFiles((path) =>
        path === entry.relativePath ? renamedFile.relativePath : path,
      );
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Renamed ${entry.name} to ${renamed.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveFolderFromContextMenu(entry: VaultEntry, destinationDirectory: string) {
    if (!vaultRoot || !entry.isDir) {
      return;
    }

    if (!destinationDirectory?.trim()) {
      return;
    }

    try {
      snapshotActiveTab();
      const moved = await moveVaultDirectory(
        vaultRoot,
        entry.relativePath,
        destinationDirectory,
      );
      const nextCurrentDir = rebasePathAfterDirectoryRename(currentDir, entry, moved);

      applyRenamedDirectoryToOpenState(entry, moved);
      await updateStarredFiles((path) =>
        path === entry.relativePath || path.startsWith(`${entry.relativePath}/`)
          ? `${moved.relativePath}${path.slice(entry.relativePath.length)}`
          : path,
      );
      await loadEntries(vaultRoot, nextCurrentDir);
      await rebuildWikiLinkIndex(vaultRoot);
      setStatus(`Moved folder ${entry.name} to ${moved.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveFileFromContextMenu(entry: VaultEntry, destinationDirectory: string) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    try {
      snapshotActiveTab();
      const moved = await moveVaultFile(vaultRoot, entry.relativePath, destinationDirectory);
      const movedFile = {
        name: moved.name,
        relativePath: moved.relativePath,
      };

      replaceOpenFilePath(entry.relativePath, movedFile);
      replaceFileInWikiLinkIndex(entry.relativePath, movedFile);
      await updateStarredFiles((path) =>
        path === entry.relativePath ? movedFile.relativePath : path,
      );
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Moved ${entry.name} to ${moved.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteFileFromContextMenu(entry: VaultEntry) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    try {
      snapshotActiveTab();
      await deleteVaultFile(vaultRoot, entry.relativePath);

      removeDeletedFileFromOpenState(entry.relativePath);
      removeFileFromWikiLinkIndex(entry.relativePath);
      await updateStarredFiles((path) => (path === entry.relativePath ? null : path));
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Deleted ${entry.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function revealEntryFromContextMenu(entry: VaultEntry) {
    if (!vaultRoot) {
      return;
    }

    setFolderContextMenu(null);

    try {
      await revealItemInDir(vaultEntryPath(vaultRoot, entry.relativePath));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitFolderActionDialog(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!folderActionDialog) {
      return;
    }

    const value = folderActionDialog.value.trim();

    if (
      folderActionDialog.action !== "delete-file" &&
      !isMoveAction(folderActionDialog.action) &&
      !value
    ) {
      return;
    }

    const { action, entry } = folderActionDialog;

    setFolderActionDialog(null);

    if (action === "create-note") {
      await createNoteFromFolderMenu(entry, value);
    } else if (action === "create-canvas") {
      await createCanvasFromFolderMenu(entry, value);
    } else if (action === "create-folder") {
      await createFolderFromFolderMenu(entry, value);
    } else if (action === "move-folder") {
      await moveFolderFromContextMenu(entry, value);
    } else if (action === "rename-file") {
      await renameFileFromContextMenu(entry, value);
    } else if (action === "move-file") {
      await moveFileFromContextMenu(entry, value);
    } else if (action === "delete-file") {
      await deleteFileFromContextMenu(entry);
    } else {
      await renameFolderFromFolderMenu(entry, value);
    }
  }

  async function enterDirectory(relativePath: string) {
    if (!vaultRoot) {
      return;
    }

    try {
      snapshotActiveTab();
      setCurrentDir(relativePath);
      await loadEntries(vaultRoot, relativePath);
      persistWorkspace({ currentDir: relativePath });
      setStatus(`Browsing ${displayPath(relativePath)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function goBack() {
    if (!vaultRoot || !currentDir) {
      return;
    }

    await enterDirectory(parentDirectory(currentDir));
  }

  function cancelPendingDirectoryClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  }

  function handleVaultEntryMouseDown(entry: VaultEntry, event: ReactMouseEvent<HTMLButtonElement>) {
    if (entry.isDir && event.button !== 0) {
      suppressDirectoryClickRef.current = true;
      cancelPendingDirectoryClick();
    }
  }

  function handleDirectoryClick(entry: VaultEntry, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0 || suppressDirectoryClickRef.current) {
      suppressDirectoryClickRef.current = false;
      cancelPendingDirectoryClick();
      return;
    }

    cancelPendingDirectoryClick();
    clickTimer.current = setTimeout(() => {
      enterDirectory(entry.relativePath);
    }, 180);
  }

  function handleDirectoryDoubleClick(entry: VaultEntry) {
    cancelPendingDirectoryClick();

    openDirectoryShadow(entry.relativePath);
  }

  function handleEditorContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    targetEditor: Editor | null,
    groupId: EditorGroupId,
  ) {
    const target = event.target instanceof HTMLElement ? event.target : null;

    if (!targetEditor || !target?.closest("table")) {
      return;
    }

    event.preventDefault();
    activateEditorGroup(groupId);

    const position = targetEditor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });

    if (position) {
      targetEditor.commands.setTextSelection(position.pos);
    }

    if (
      targetEditor.isActive("table") ||
      targetEditor.isActive("tableCell") ||
      targetEditor.isActive("tableHeader")
    ) {
      setTableContextMenu({ groupId, x: event.clientX, y: event.clientY });
    }
  }

  function resetDocument() {
    snapshotActiveTab();
    const tab = createUntitledTab();

    addTabToGroup(tab);
    hydrateDocumentTab(tab);
    persistActiveFile(null);
    setStatus("New unsaved document");
  }

  resetDocumentRef.current = resetDocument;

  function applyMarkdown() {
    const activeTab = editorGroupsRef.current[activeGroupIdRef.current].tabs.find(
      (tab) => tab.id === editorGroupsRef.current[activeGroupIdRef.current].activeTabId,
    );

    if (activeTab?.kind !== "markdown") {
      setMarkdown(markdownDraft);
      updateActiveTab({
        markdown: markdownDraft,
        markdownDraft,
        dirty: true,
      });
      setActiveDocumentDirty(true);
      setStatus(`Unsaved changes in ${activeFileRef.current?.name ?? "document"}`);
      return;
    }

    const parts = splitMetaHeader(markdownDraft);

    // Source edits may include frontmatter pasted by hand. Split it back out so
    // the WYSIWYG body and metadata editor keep their separate responsibilities.
    if (parts.metaHeader) {
      setActiveMetaHeader(parts.metaHeader, parts.metaDelimiter);
    }

    setEditorBody(parts.body, false);
  }

  function updateCanvasDocument(groupId: EditorGroupId, nextContent: string) {
    const group = editorGroupsRef.current[groupId];
    const tab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);

    if (tab?.kind !== "canvas") {
      return;
    }

    updateGroupTab(groupId, tab.id, {
      markdown: nextContent,
      markdownDraft: nextContent,
      dirty: true,
    });

    if (groupId === activeGroupIdRef.current) {
      setMarkdown(nextContent);
      setMarkdownDraft(nextContent);
      setDirty(true);
    }

    setStatus(`Unsaved canvas changes in ${tab.activeFile?.name ?? "canvas"}`);
  }

  function appendTable() {
    if (!editor) {
      return;
    }

    setEditorBody(`${markdown.trimEnd()}\n\n${emptyTableMarkdown}`, false);
  }

  function appendColumns() {
    if (!editor) {
      return;
    }

    editor.chain().focus().insertContent(emptyColumnsMarkdown, { contentType: "markdown" }).run();
  }

  function formatSelectionAsKeyboardKey() {
    formatSelectionWithMark(editor, "keyboardKey", "a keyboard key", setStatus);
  }

  function wrapSelectedImagesInGallery() {
    if (!editor) {
      return;
    }

    const { images, from, to } = selectedGalleryImages(editor);

    if (images.length === 0) {
      setStatus("Select one or more images before creating a gallery");
      return;
    }

    const galleryMarkdown = `::: gallery\n${images.join("\n\n")}\n:::`;

    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, galleryMarkdown, { contentType: "markdown" })
      .run();
    setStatus(`Created gallery with ${images.length} image${images.length === 1 ? "" : "s"}`);
  }

  function appendCallout() {
    if (!editor) {
      return;
    }

    setEditorBody(`${markdown.trimEnd()}\n\n${emptyCalloutMarkdown}`, false);
  }

  function insertCollapseBlock() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(emptyCollapseMarkdown, { contentType: "markdown" })
      .run();
  }

  function insertHtmlBlock() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(emptyHtmlBlockMarkdown, { contentType: "markdown" })
      .run();
  }

  function insertMermaidDiagram() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent("```mermaid\nflowchart TD\n  A[Start] --> B[Done]\n```", {
        contentType: "markdown",
      })
      .run();
  }

  function aiModelOptions() {
    return Array.from(
      new Set([normalizeAiSettings(aiDraft).model, ...aiModels].filter(Boolean)),
    );
  }

  async function refreshAiModels() {
    const settings = normalizeAiSettings(aiDraft);

    if (!settings.enabled) {
      setStatus("Enable AI commands before fetching models");
      return;
    }

    if (!settings.apiKey) {
      setStatus("Add an AI API key before fetching models");
      return;
    }

    try {
      setAiModelsLoading(true);
      setStatus("Fetching AI models");
      const response = await invoke<AiModelListResponse>("list_ai_models", { settings });

      setAiModels(response.models);
      if (!response.models.includes(settings.model)) {
        updateAiDraft({
          ...normalizeAiSettings(aiDraft),
          model: response.models[0] ?? settings.model,
        });
      }
      setStatus(`Fetched ${response.models.length} AI models`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiModelsLoading(false);
    }
  }

  async function testAiConnection() {
    const settings = normalizeAiSettings(aiDraft);

    if (!settings.enabled) {
      setStatus("Enable AI commands before testing the API");
      setAiTestStatus("error");
      return;
    }

    if (!settings.apiKey) {
      setStatus("Add an AI API key before testing the API");
      setAiTestStatus("error");
      return;
    }

    try {
      setAiTesting(true);
      setAiTestStatus(null);
      setStatus("Testing AI API");
      const response = await invoke<AiConnectionTestResponse>("test_ai_connection", {
        settings,
      });

      setAiTestStatus("success");
      setStatus(response.message);
    } catch (error) {
      setAiTestStatus("error");
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiTesting(false);
    }
  }

  async function runAiTextCommand(
    title: string,
    instruction: string,
    input: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    if (!editor) {
      return false;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before running AI commands");
      return false;
    }

    if (!input) {
      setStatus("Provide text before running this AI command");
      return false;
    }

    const settings = savedAiSettings();

    if (!settings.enabled) {
      setStatus("Enable AI commands in Settings before using this command");
      return false;
    }

    try {
      setAiSubmitting(true);
      setAiSubmittingTitle(title);
      setStatus(`Running ${title}`);
      const response = await invoke<AiTransformResponse>("run_ai_transform", {
        request: {
          settings,
          instruction,
          input,
        },
      });

      setAiReview({
        title,
        output: normalizeAiMarkdownForApply(response.output),
        applyMode,
      });
      setStatus(`Review ${title} result`);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setAiSubmitting(false);
      setAiSubmittingTitle("");
    }
  }

  async function runAiSelectionCommand(
    title: string,
    instruction: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    const input = currentSelectionText(editor).trim();

    if (!input) {
      setStatus("Select text before running this AI command");
      return;
    }

    await runAiTextCommand(title, instruction, input, applyMode);
  }

  async function runAiSelectionOrDocumentCommand(
    title: string,
    instruction: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    const input = (currentSelectionText(editor).trim() || markdown.trim()).trim();

    if (!input) {
      setStatus("Write or select text before running this AI command");
      return;
    }

    await runAiTextCommand(title, instruction, input, applyMode);
  }

  async function runAiContinueWritingCommand() {
    const input = currentCursorContext(editor);

    await runAiTextCommand(
      "AI: Continue writing",
      "Continue writing from [[CURSOR]] using the surrounding note as context. Return only the Markdown text that should be inserted at the cursor. Do not repeat existing text.",
      input,
      "insert-at-cursor",
    );
  }

  function stripJsonCodeFence(value: string) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    return fenced ? fenced[1].trim() : trimmed;
  }

  function parseAiPageBuilderResponse(output: string): AiPageBuilderResponse {
    try {
      const parsed = JSON.parse(stripJsonCodeFence(output)) as Partial<AiPageBuilderResponse>;
      const markdown = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
      const assets = Array.isArray(parsed.assets)
        ? parsed.assets
            .map((asset, index) => ({
              id:
                typeof asset?.id === "string" && asset.id.trim()
                  ? asset.id.trim()
                  : `asset-${index + 1}`,
              label:
                typeof asset?.label === "string" && asset.label.trim()
                  ? asset.label.trim()
                  : `Asset ${index + 1}`,
              suggestedName:
                typeof asset?.suggestedName === "string" && asset.suggestedName.trim()
                  ? asset.suggestedName.trim()
                  : `AI asset ${index + 1}.png`,
              url: typeof asset?.url === "string" && asset.url.trim() ? asset.url.trim() : null,
              domain:
                typeof asset?.domain === "string" && asset.domain.trim()
                  ? asset.domain.trim()
                  : null,
            }))
            .filter((asset) => asset.id && asset.suggestedName)
        : [];

      if (markdown) {
        return { markdown, assets };
      }
    } catch {
      // Older or noncompliant providers may ignore the JSON format request.
      // Treat their response as plain Markdown so the builder still remains usable.
    }

    return {
      markdown: output.trim(),
      assets: [],
    };
  }

  function pageBuilderAssetDomain(asset: AiPageBuilderAssetRequest) {
    const value = asset.domain?.trim();

    if (!value) {
      return "";
    }

    try {
      return new URL(value.includes("://") ? value : `https://${value}`).hostname;
    } catch {
      return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    }
  }

  function pageBuilderAssetCandidateUrls(asset: AiPageBuilderAssetRequest) {
    const urls = new Set<string>();

    if (asset.url?.trim()) {
      urls.add(asset.url.trim());
    }

    const domain = pageBuilderAssetDomain(asset);

    if (domain) {
      urls.add(`https://logo.clearbit.com/${encodeURIComponent(domain)}`);
      urls.add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);
    }

    return Array.from(urls);
  }

  function replaceAiPageBuilderAssetPlaceholders(
    markdown: string,
    replacements: Map<string, SavedAsset>,
  ) {
    const replacedMarkdown = Array.from(replacements.entries()).reduce(
      (nextMarkdown, [id, saved]) => {
        const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const vaultImageMarkdown = `![[${saved.fileName}]]`;

        // Models often put asset placeholders in normal image markdown, e.g.
        // `![Logo]({{asset:logo}})`. A vault image token is already complete
        // image syntax, so replace the whole wrapper instead of creating the
        // invalid nested form `![Logo](![[logo.png]])`.
        return nextMarkdown
          .replace(
            new RegExp(
              `!\\[[^\\]\\n]*\\]\\(\\s*\\{\\{asset:${escapedId}\\}\\}\\s*\\)`,
              "g",
            ),
            vaultImageMarkdown,
          )
          .replace(new RegExp(`\\{\\{asset:${escapedId}\\}\\}`, "g"), vaultImageMarkdown);
      },
      markdown,
    );

    return normalizeAiMarkdownForApply(replacedMarkdown);
  }

  function normalizeMalformedVaultImageMarkdown(markdown: string) {
    return markdown.replace(
      /!\[[^\]\n]*\]\(\s*([^)]+?)\s*\)/g,
      (match, rawHref: string) => {
        let decodedHref = rawHref.trim();

        try {
          decodedHref = decodeURIComponent(decodedHref);
        } catch {
          return match;
        }

        const nestedVaultImage = decodedHref.match(/^!\[\[([^\]\n]+)\]\]$/);

        if (!nestedVaultImage) {
          return match;
        }

        const vaultTarget = cleanVaultAssetReference(nestedVaultImage[1]);

        return vaultTarget ? `![[${vaultTarget}]]` : match;
      },
    );
  }

  function normalizeAiMarkdownForApply(markdown: string) {
    // Keep malformed AI-generated vault image markdown out of saved notes.
    // `![Alt](![[image.png]])` may be easy for a model to produce, but the
    // portable vault-image form is the standalone Obsidian/Glyphary token.
    return normalizeMalformedVaultImageMarkdown(markdown);
  }

  function openAiPageBuilder() {
    if (!editor) {
      return;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before using AI Page Builder");
      return;
    }

    if (!savedAiSettings().enabled) {
      setStatus("Enable AI commands in Settings before using AI Page Builder");
      return;
    }

    setAiPageBuilderPrompt("");
    setAiPageBuilderReplaceTurnId(latestReplaceableAiBuilderTurn()?.id ?? null);
    setAiPageBuilderOpen(true);
  }

  function aiPageBuilderContext(
    request: string,
    replacementTurn: AiBuilderHistoryTurn | null,
    vaultContext: string,
  ) {
    const selectedText = currentSelectionText(editor).trim();
    const markdownExcerpt =
      markdown.length > aiPageBuilderMarkdownContextLimit
        ? `${markdown.slice(0, aiPageBuilderMarkdownContextLimit)}\n\n[...note truncated...]`
        : markdown;

    // The builder prompt is intentionally explicit about Glyphary's block
    // dialect. That makes generated sections usable in the editor instead of
    // generic Markdown that loses callouts, columns, galleries, or HTML blocks.
    return [
      "User request:",
      request.trim(),
      "",
      "Current note:",
      `Title: ${pageNameRef.current || "Untitled note"}`,
      `Vault-relative file: ${activeFileRef.current?.relativePath ?? "(unsaved note)"}`,
      "",
      "Frontmatter:",
      metaHeaderRef.current.trim() || "(none)",
      "",
      "Selected text:",
      selectedText || "(none)",
      "",
      "Recent AI Builder conversation for this file:",
      aiBuilderHistoryContext(),
      "",
      "Replacement target:",
      replacementTurn
        ? [
            `Turn id: ${replacementTurn.id}`,
            `Original request: ${replacementTurn.prompt}`,
            "Previously applied markdown:",
            replacementTurn.markdown,
          ].join("\n")
        : "(none)",
      "",
      "Vault retrieval context:",
      vaultContext,
      "",
      "Cursor context:",
      currentCursorContext(editor),
      "",
      "Current Markdown excerpt:",
      markdownExcerpt.trim() || "(empty)",
    ].join("\n");
  }

  async function runAiPageBuilder() {
    const request = aiPageBuilderPrompt.trim();

    if (!request) {
      setStatus("Describe what AI Page Builder should create");
      return;
    }

    const settings = savedAiSettings();

    if (!settings.enabled) {
      setStatus("Enable AI commands in Settings before using AI Page Builder");
      return;
    }

    try {
      const historyKey = activeAiBuilderHistoryKey();
      const replacementTurn = selectedAiBuilderReplacementTurn();
      const replaceTurnId = replacementTurn?.id ?? null;
      setAiSubmitting(true);
      setAiSubmittingTitle("AI: Page Builder");
      setStatus("Gathering vault context for AI: Page Builder");
      const vaultContext = await aiBuilderVaultContext(request);
      setStatus("Running AI: Page Builder");
      const response = await invoke<AiTransformResponse>("run_ai_transform", {
        request: {
          settings,
          instruction: [
            "Build a useful Glyphary page section from the user's request and page context.",
            "Return only valid JSON with this shape: {\"markdown\":\"...\",\"assets\":[{\"id\":\"stable-placeholder-id\",\"label\":\"Human label\",\"suggestedName\":\"file-name.png\",\"url\":\"https://... optional direct image URL\",\"domain\":\"example.com optional brand domain\"}]}",
            "In markdown, reference every generated asset with a placeholder exactly like {{asset:stable-placeholder-id}}. Glyphary will replace those placeholders after importing approved assets.",
            "Prefer Glyphary-native Markdown blocks when they fit: ::: callout, ::: columns, ::: gallery, ::: collapse, ```toc, Markdown tables, task lists, wikilinks like [[Page Name]], and vault images like ![[image.png]].",
            "Use raw HTML only when Markdown or Glyphary block syntax cannot express the requested layout.",
            "When using raw HTML, do not include scripts, iframes, event handlers, external stylesheets, data URLs, or remote executable content.",
            "If the user asks for logos or remote images, add asset entries instead of inventing local file paths. Prefer a direct image URL when known; otherwise include the brand domain.",
            "Do not wrap the JSON in a code fence.",
            "If the request is underspecified, choose a practical structure and keep the result editable.",
            "If a replacement target is provided, produce the complete replacement for that prior block, not a patch or diff.",
            "If vault retrieval context is provided, use it as source material for summaries, task tables, and cross-note answers. Cite source notes with [[Note Name]] links and do not imply a vault-wide search was exhaustive beyond the provided local results.",
          ].join("\n"),
          input: aiPageBuilderContext(request, replacementTurn, vaultContext),
        },
      });
      const builderResponse = parseAiPageBuilderResponse(response.output);
      const normalizedMarkdown = normalizeAiMarkdownForApply(builderResponse.markdown);

      if (builderResponse.assets.length > 0) {
        setAiPageBuilderAssetReview({
          ...builderResponse,
          prompt: request,
          historyKey: historyKey ?? "",
          replaceTurnId: replaceTurnId ?? undefined,
          markdown: normalizedMarkdown,
        });
        setStatus(`Review ${builderResponse.assets.length} requested asset import`);
      } else {
        const turn = historyKey
          ? createAiBuilderHistoryTurn(request, normalizedMarkdown)
          : null;

        if (historyKey && turn) {
          upsertAiBuilderHistoryTurn(historyKey, turn);
        }

        setAiReview({
          title: "AI: Page Builder",
          output: normalizedMarkdown,
          applyMode: "insert-at-cursor",
          aiBuilderHistoryKey: historyKey ?? undefined,
          aiBuilderTurnId: turn?.id,
          aiBuilderReplaceTurnId: replaceTurnId ?? undefined,
        });
        setStatus("Review AI: Page Builder result");
      }

      setAiPageBuilderOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiSubmitting(false);
      setAiSubmittingTitle("");
    }
  }

  async function importAiPageBuilderAssets() {
    if (!vaultRootRef.current || !aiPageBuilderAssetReview) {
      return;
    }

    try {
      setAiPageBuilderImportingAssets(true);
      setStatus("Importing AI Page Builder assets");
      const replacements = new Map<string, SavedAsset>();
      const importedAssets: AiBuilderHistoryAsset[] = [];

      for (const asset of aiPageBuilderAssetReview.assets) {
        const candidateUrls = pageBuilderAssetCandidateUrls(asset);
        let saved: SavedAsset | null = null;
        let lastError = "No image URL or brand domain was provided";

        // Brand logo resolution is intentionally best-effort and explicit:
        // direct URLs win, domain logo services are fallbacks, and failures keep
        // the placeholder out of the document instead of silently inserting a
        // broken local image reference.
        for (const url of candidateUrls) {
          try {
            saved = await invoke<SavedAsset>("import_remote_vault_image_asset", {
              root: vaultRootRef.current,
              assetDirectory: defaultVaultImageDirectory,
              fileName: asset.suggestedName,
              url,
            });
            break;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
        }

        if (!saved) {
          throw new Error(`Could not import ${asset.label}: ${lastError}`);
        }

        replacements.set(asset.id, saved);
        importedAssets.push({
          id: asset.id,
          label: asset.label,
          fileName: saved.fileName,
          relativePath: saved.relativePath,
        });
      }
      const output = replaceAiPageBuilderAssetPlaceholders(
        aiPageBuilderAssetReview.markdown,
        replacements,
      );
      const historyKey = aiPageBuilderAssetReview.historyKey || null;
      const turn = historyKey
        ? createAiBuilderHistoryTurn(aiPageBuilderAssetReview.prompt, output, importedAssets)
        : null;

      if (historyKey && turn) {
        upsertAiBuilderHistoryTurn(historyKey, turn);
      }

      setAiReview({
        title: "AI: Page Builder",
        output,
        applyMode: "insert-at-cursor",
        aiBuilderHistoryKey: historyKey ?? undefined,
        aiBuilderTurnId: turn?.id,
        aiBuilderReplaceTurnId: aiPageBuilderAssetReview.replaceTurnId,
      });
      setAiPageBuilderAssetReview(null);
      setStatus(
        `Imported ${replacements.size} AI Page Builder asset${
          replacements.size === 1 ? "" : "s"
        }`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiPageBuilderImportingAssets(false);
    }
  }

  function replaceSelectionWithAiOutput(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .insertContent(content, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Applied AI result");
  }

  function insertAiOutputBelowSelection(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .setTextSelection(editor.state.selection.to)
      .insertContent(`\n\n${content}`, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Inserted AI result");
  }

  function insertAiOutputAtCursor(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .insertContent(content, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Inserted AI result");
  }

  function replacePreviousAiBuilderOutput(review: AiReviewState) {
    if (!editor || !review.aiBuilderReplaceTurnId || !review.aiBuilderTurnId) {
      return;
    }

    const nextMarkdown = replaceAiBuilderMarkedBlock(
      editor.getMarkdown(),
      review.aiBuilderReplaceTurnId,
      review.aiBuilderTurnId,
      review.output,
    );

    if (!nextMarkdown) {
      editor
        .chain()
        .focus()
        .insertContent(aiReviewOutputForInsertion(review, review.output), {
          contentType: "markdown",
        })
        .run();
      markAiBuilderReviewApplied(review, false);
      setAiReview(null);
      setStatus("Could not find previous AI Builder block; inserted result at cursor");
      return;
    }

    setEditorBody(nextMarkdown, false);
    markAiBuilderReviewApplied(review, true);
    setAiReview(null);
    setStatus("Replaced AI Builder result");
  }

  async function copyAiOutput(output: string) {
    await window.navigator.clipboard.writeText(output);
    setStatus("Copied AI result");
  }

  function runWasmPluginTransform(
    pluginId: string,
    commandId: string,
    wasm: PluginWasmCommand,
    bytes: Uint8Array,
    input: string,
  ) {
    return new Promise<string>((resolve, reject) => {
      // Each command run gets a fresh worker and WASM instance. That keeps
      // plugin memory isolated and lets the timeout terminate stuck transforms.
      const worker = new Worker(new URL("./pluginWorker.ts", import.meta.url), {
        type: "module",
      });
      const requestId = `${pluginId}:${commandId}:${Date.now()}`;
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error(`Plugin ${pluginId}/${commandId} exceeded ${wasm.timeoutMs}ms`));
      }, wasm.timeoutMs);

      worker.onmessage = (event: MessageEvent<WasmPluginResponse>) => {
        if (event.data.id !== requestId) {
          return;
        }

        window.clearTimeout(timeout);
        worker.terminate();

        if (event.data.ok) {
          resolve(event.data.output);
        } else {
          reject(new Error(event.data.error));
        }
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage({
        id: requestId,
        bytes,
        input,
      });
    });
  }

  async function runPluginCommand(plugin: PluginManifest, command: PluginCommandManifest) {
    if (!editor) {
      return;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before running plugin commands");
      return;
    }

    try {
      if (command.insertMarkdown) {
        insertMarkdownAtCursor(editor, command.insertMarkdown);
        setStatus(`Ran plugin command: ${command.title}`);
        return;
      }

      if (command.template) {
        const template = await invoke<string>("read_plugin_template", {
          root: vaultRoot,
          pluginId: plugin.id,
          template: command.template,
        });

        insertMarkdownAtCursor(editor, template);
        setStatus(`Inserted template from ${plugin.name}`);
        return;
      }

      if (command.wasm) {
        const wasmBytes = await invoke<number[]>("read_plugin_wasm", {
          root: vaultRoot,
          pluginId: plugin.id,
          module: command.wasm.module,
        });
        const input =
          command.wasm.input === "document" ? editor.getMarkdown() : currentSelectionText(editor);
        const output = await runWasmPluginTransform(
          plugin.id,
          command.id,
          command.wasm,
          new Uint8Array(wasmBytes),
          input,
        );

        if (command.wasm.output === "replaceDocument") {
          setEditorBody(output, false);
        } else if (command.wasm.output === "insertAtCursor") {
          // Insert-at-cursor should append after a selection rather than replace
          // it, so collapse the selection to its end before writing Markdown.
          editor.chain().focus().setTextSelection(editor.state.selection.to).run();
          insertMarkdownAtCursor(editor, output);
        } else {
          insertMarkdownAtCursor(editor, output);
        }

        setStatus(`Ran WASM plugin command: ${command.title}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function appendTableOfContentsBlock() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent("```toc\n```", { contentType: "markdown" })
      .run();
  }

  async function createTidbit() {
    if (!vaultRoot) {
      setStatus("Open a vault before creating a tidbit");
      return;
    }

    try {
      const relative = expandDateTemplate(tidbitSettings.pathPattern);
      const file = await createVaultMarkdownFile(vaultRoot, relative);
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created tidbit ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openTidbitCaptureWindow() {
    const root = vaultRootRef.current;
    const settings = normalizeTidbitSettings(vaultSettingsRef.current.tidbits);

    if (!root) {
      setStatus("Open a vault before using global tidbit capture");
      return;
    }

    if (!settings.globalShortcutEnabled) {
      setStatus("Enable global tidbit capture in Settings before using its shortcut");
      return;
    }

    try {
      const context = {
        root,
        pathPattern: settings.pathPattern,
      };
      const captureAppearance = normalizeVaultAppearanceSettings(
        vaultSettingsRef.current.appearance,
      );
      const existing = await WebviewWindow.getByLabel("tidbit-capture");

      if (existing) {
        await existing.emit("tidbit-capture-context", context);
        await existing.show();
        await existing.setFocus();
        setStatus("Opened tidbit capture");
        return;
      }

      const params = new URLSearchParams({
        view: "tidbit-capture",
        root,
        pathPattern: settings.pathPattern,
      });
      const captureWindow = new WebviewWindow("tidbit-capture", {
        url: `index.html?${params.toString()}`,
        title: "New Tidbit",
        width: 640,
        height: 460,
        minWidth: 460,
        minHeight: 320,
        center: true,
        focus: true,
        resizable: true,
        skipTaskbar: true,
        transparent: captureAppearance.glassEffect,
      });

      captureWindow.once("tauri://created", () => {
        void captureWindow.emit("tidbit-capture-context", context);
        void captureWindow.show();
        void captureWindow.setFocus();
        setStatus("Opened tidbit capture");
      });
      captureWindow.once("tauri://error", (event) => {
        setStatus(`Could not open tidbit capture: ${String(event.payload)}`);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openCapturedTidbit(file: OpenedFile) {
    const root = vaultRootRef.current;

    if (!root) {
      return;
    }

    const tab = createDocumentTabFromFile(file);

    snapshotActiveTab();
    addTabToGroup(tab);
    hydrateDocumentTab(tab);
    persistActiveFile(tab.activeFile);
    addFileToWikiLinkIndex(file);
    await loadEntries(root, currentDirRef.current);
    setStatus(`Created tidbit ${file.relativePath}`);
  }

  openTidbitCaptureWindowRef.current = openTidbitCaptureWindow;
  openCapturedTidbitRef.current = openCapturedTidbit;

  function openRichLinkDialog() {
    if (!editor) {
      return;
    }

    setRichLinkUrlDraft("");
    setRichLinkDialogOpen(true);
  }

  async function insertRichLinkFromUrl(url: string) {
    const trimmedUrl = url.trim();

    if (!editor || !trimmedUrl) {
      return;
    }

    try {
      setRichLinkSubmitting(true);
      setStatus("Fetching rich link metadata");
      const metadata = isTauri()
        ? await invoke<RichLinkMetadata>("fetch_rich_link_metadata", { url: trimmedUrl })
        : {
            url: trimmedUrl,
            title: trimmedUrl,
            description: "",
            image: "",
            siteName: "",
          };

      setEditorBody(`${markdown.trimEnd()}\n\n${richLinkMarkdown(metadata)}`, false);
      setRichLinkDialogOpen(false);
      setRichLinkUrlDraft("");
      setStatus(`Inserted rich link ${metadata.title || metadata.url}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRichLinkSubmitting(false);
    }
  }

  const cursorInsideTable =
    activeDocumentIsMarkdown &&
    !!editor &&
    (editor.isActive("table") ||
      editor.isActive("tableCell") ||
      editor.isActive("tableHeader"));
  // Table mutations are only valid while the current selection is inside a
  // table, so the entire submenu is contextual rather than always searchable.
  const tableCommandPaletteCommands: CommandPaletteCommand[] = cursorInsideTable
    ? [
        {
          id: "table-add-row-after",
          title: "Add row after",
          description: "Insert a table row below the current row",
          run: () => {
            editor.chain().focus().addRowAfter().run();
          },
        },
        {
          id: "table-delete-row",
          title: "Delete row",
          description: "Remove the current table row",
          run: () => {
            editor.chain().focus().deleteRow().run();
          },
        },
        {
          id: "table-add-column-after",
          title: "Add column after",
          description: "Insert a table column to the right",
          run: () => {
            editor.chain().focus().addColumnAfter().run();
          },
        },
        {
          id: "table-delete-column",
          title: "Delete column",
          description: "Remove the current table column",
          run: () => {
            editor.chain().focus().deleteColumn().run();
          },
        },
        {
          id: "table-delete-table",
          title: "Delete table",
          description: "Remove the current table",
          run: () => {
            editor.chain().focus().deleteTable().run();
          },
        },
      ]
    : [];
  const enabledPluginIds = new Set(pluginDraft.enabled);
  // Palette entries are derived from the validated catalog but gated by the
  // unsaved draft, so enabling a plugin previews its commands before Save.
  const pluginCommandPaletteCommands: CommandPaletteCommand[] = pluginCatalog.plugins
    .filter((plugin) => enabledPluginIds.has(plugin.id))
    .flatMap((plugin) =>
      plugin.commands.map((command) => ({
        id: `plugin:${plugin.id}:${command.id}`,
        title: command.title,
        description: command.description || `${plugin.name} plugin command`,
        run: () => runPluginCommand(plugin, command),
      })),
    );
  // AI commands use saved vault settings, not the unsaved settings draft. That
  // prevents palette actions from using an API key or model the user has not
  // explicitly saved for this vault.
  const aiCommandPaletteCommands: CommandPaletteCommand[] = savedAiSettings().enabled
    ? [
        {
          id: "ai-page-builder",
          title: "AI: Page Builder",
          description: "Build a note section from a prompt and current context",
          run: openAiPageBuilder,
        },
        {
          id: "ai-improve-writing-selection",
          title: "AI: Improve writing",
          description: "Clean up grammar, clarity, and flow while preserving meaning",
          run: () =>
            runAiSelectionCommand(
              "AI: Improve writing",
              "Improve the selected Markdown for grammar, clarity, and flow while preserving its meaning, tone, structure, and important details. Return only the improved Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-fix-spelling-grammar-selection",
          title: "AI: Fix spelling and grammar",
          description: "Apply a light spelling and grammar edit to the selection",
          run: () =>
            runAiSelectionCommand(
              "AI: Fix spelling and grammar",
              "Fix spelling, punctuation, and grammar in the selected Markdown. Keep wording changes minimal and preserve the original structure. Return only the corrected Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-shorten-selection",
          title: "AI: Shorten selection",
          description: "Compress the selected text without losing key points",
          run: () =>
            runAiSelectionCommand(
              "AI: Shorten selection",
              "Shorten the selected Markdown while preserving the essential meaning and important details. Return only the shortened Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-expand-selection",
          title: "AI: Expand selection",
          description: "Elaborate terse notes into fuller Markdown prose",
          run: () =>
            runAiSelectionCommand(
              "AI: Expand selection",
              "Expand the selected Markdown into clearer, fuller writing. Preserve the original meaning, avoid inventing unsupported facts, and return only the expanded Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-formal-selection",
          title: "AI: Make selection more formal",
          description: "Rewrite the selection in a more formal tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more formal",
              "Rewrite the selected Markdown in a more formal tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-casual-selection",
          title: "AI: Make selection more casual",
          description: "Rewrite the selection in a more casual tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more casual",
              "Rewrite the selected Markdown in a more casual, natural tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-direct-selection",
          title: "AI: Make selection more direct",
          description: "Rewrite the selection to be clearer and more direct",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more direct",
              "Rewrite the selected Markdown to be more direct and concise while preserving meaning and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-polished-selection",
          title: "AI: Polish selection",
          description: "Rewrite the selection with a more polished tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Polish selection",
              "Rewrite the selected Markdown with a polished, professional tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-summarize-selection",
          title: "AI: Summarize selection",
          description: "Create a concise Markdown summary of the selected text",
          run: () =>
            runAiSelectionCommand(
              "AI: Summarize selection",
              "Summarize the selected Markdown concisely. Use Markdown bullets if that makes the result easier to scan.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-extract-tasks-selection",
          title: "AI: Extract tasks from selection",
          description: "Turn the selected text into Markdown task items",
          run: () =>
            runAiSelectionCommand(
              "AI: Extract tasks from selection",
              "Extract concrete action items from the selected Markdown. Return only Markdown task list items using '- [ ]'.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-create-outline-selection",
          title: "AI: Create outline",
          description: "Turn the selected text into Markdown headings and bullets",
          run: () =>
            runAiSelectionCommand(
              "AI: Create outline",
              "Turn the selected Markdown into a useful outline with Markdown headings and bullets. Preserve important ideas and ordering. Return only the outline.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-generate-title",
          title: "AI: Generate title",
          description: "Suggest a concise title from the selection or current note",
          run: () =>
            runAiSelectionOrDocumentCommand(
              "AI: Generate title",
              "Suggest one concise, specific title for this note or selected Markdown. Return only the title text with no quotes, prefix, or explanation.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-continue-writing",
          title: "AI: Continue writing",
          description: "Continue from the cursor using the surrounding note as context",
          run: runAiContinueWritingCommand,
        },
        {
          id: "ai-explain-selection",
          title: "AI: Explain selection",
          description: "Explain the selected concept in simpler terms",
          run: () =>
            runAiSelectionCommand(
              "AI: Explain selection",
              "Explain the selected Markdown in simpler terms for a reader who is new to the topic. Preserve important nuance and return only Markdown.",
              "insert-below-selection",
            ),
        },
      ]
    : [];
  function requestCanvasCommand(action: CanvasCommandAction) {
    canvasCommandRequestIdRef.current += 1;
    setCanvasCommandRequest({
      id: canvasCommandRequestIdRef.current,
      action,
    });
  }

  const canvasInsertCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "canvas-add-card",
      title: "Add Card",
      description: "Insert a new editable canvas card",
      run: () => requestCanvasCommand("card"),
    },
    {
      id: "canvas-add-note-from-vault",
      title: "Add Note From Vault",
      description: "Insert a Markdown note node selected from the vault",
      run: () => requestCanvasCommand("note"),
    },
    {
      id: "canvas-add-media-from-vault",
      title: "Add Media From Vault",
      description: "Insert an image, video, or audio node selected from the vault",
      run: () => requestCanvasCommand("media"),
    },
    {
      id: "canvas-add-web-page",
      title: "Add Web Page",
      description: "Insert a web page node",
      run: () => requestCanvasCommand("web"),
    },
    {
      id: "canvas-create-group",
      title: "Create Group",
      description: "Insert a visual grouping region",
      run: () => requestCanvasCommand("group"),
    },
  ];
  // Insert commands are grouped for density, but they remain ordinary commands
  // once the user enters the submenu so fuzzy search and keyboard behavior stay
  // identical to the root palette.
  const insertCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "insert-rich-link",
      title: "Insert rich link",
      description: "Fetch a URL preview and insert a rich link card",
      run: openRichLinkDialog,
    },
    {
      id: "insert-excalidraw",
      title: "Insert Excalidraw drawing",
      description: "Create and embed an editable vault drawing",
      run: openExcalidrawCreateDialog,
    },
    {
      id: "insert-columns",
      title: "Insert columns",
      description: "Add a two-column Markdown container",
      run: appendColumns,
    },
    {
      id: "gallery-layout",
      title: "Gallery layout",
      description: "Arrange selected images into a visual gallery",
      run: wrapSelectedImagesInGallery,
    },
    {
      id: "insert-callout",
      title: "Insert callout",
      description: "Add a note callout block",
      run: appendCallout,
    },
    {
      id: "insert-collapse",
      title: "Insert collapse",
      description: "Add an expandable details block",
      run: insertCollapseBlock,
    },
    {
      id: "insert-html-block",
      title: "Insert HTML block",
      description: "Add a sanitized raw HTML block",
      run: insertHtmlBlock,
    },
    {
      id: "insert-mermaid-diagram",
      title: "Insert Mermaid diagram",
      description: "Add a rendered Mermaid diagram block",
      run: insertMermaidDiagram,
    },
    {
      id: "insert-table-of-contents",
      title: "Insert table of contents",
      description: "Add a rendered table of contents block",
      run: appendTableOfContentsBlock,
    },
  ];
  const activeInsertCommandPaletteCommands = activeDocumentIsCanvas
    ? canvasInsertCommandPaletteCommands
    : activeDocumentIsMarkdown
      ? insertCommandPaletteCommands
      : [];
  const openInsertCommandPalette = () => {
    setCommandPaletteScope("insert");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
  };
  const formatCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "format-strikethrough",
      title: "Strikethrough",
      description: "Wrap selected text in ~~ delimiters",
      run: () => formatSelectionWithMark(editor, "strike", "strikethrough", setStatus),
    },
    {
      id: "format-highlight",
      title: "Highlight",
      description: "Wrap selected text in == delimiters",
      run: () => formatSelectionWithMark(editor, "highlight", "a highlight", setStatus),
    },
    {
      id: "format-superscript",
      title: "Superscript",
      description: "Wrap selected text in ^ delimiters",
      run: () => formatSelectionWithMark(editor, "superscript", "superscript", setStatus),
    },
    {
      id: "format-subscript",
      title: "Subscript",
      description: "Wrap selected text in ~ delimiters",
      run: () => formatSelectionWithMark(editor, "subscript", "subscript", setStatus),
    },
    {
      id: "format-keyboard",
      title: "Keyboard",
      description: "Wrap selected text in <kbd> tags",
      run: formatSelectionAsKeyboardKey,
    },
  ];
  const openFormatCommandPalette = () => {
    setCommandPaletteScope("format");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
  };
  const canvasCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "insert-menu",
      title: "Insert ...",
      description: "Open canvas insert commands",
      run: openInsertCommandPalette,
    },
  ];
  const editorCommandPaletteCommands: CommandPaletteCommand[] = [
    // Table editing is contextual enough that the palette keeps it close to
    // the cursor state instead of permanently crowding the formatting toolbar.
    ...(tableCommandPaletteCommands.length > 0
      ? [
          {
            id: "table-menu",
            title: "Table ...",
            description: "Open table editing commands",
            run: () => {
              setCommandPaletteScope("table");
              setCommandPaletteQuery("");
              setCommandPaletteSelectedIndex(0);
              window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
            },
          },
        ]
      : []),
    ...(activeMarkdownFilePath
      ? [
          {
            id: activeNoteStarred ? "unstar-note" : "star-note",
            title: activeNoteStarred ? "Unstar Note" : "Star Note",
            description: activeNoteStarred
              ? "Remove the current note from Starred"
              : "Add the current note to Starred",
            run: toggleActiveNoteStar,
          },
        ]
      : []),
    {
      id: "create-tidbit",
      title: "Create Tidbit",
      description: "Create a fast note from the vault tidbit path pattern",
      run: createTidbit,
    },
    ...(aiCommandPaletteCommands.length > 0
      ? [
          {
            id: "ai-menu",
            title: "AI ...",
            description: "Open AI writing commands",
            run: () => {
              setCommandPaletteScope("ai");
              setCommandPaletteQuery("");
              setCommandPaletteSelectedIndex(0);
              window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
            },
          },
        ]
      : []),
    {
      id: "insert-menu",
      title: "Insert ...",
      description: "Open insert commands",
      run: openInsertCommandPalette,
    },
    {
      id: "format-menu",
      title: "Format ...",
      description: "Open selection formatting commands",
      run: openFormatCommandPalette,
    },
    ...pluginCommandPaletteCommands,
  ];
  const commandPaletteCommands = activeDocumentTab
    ? activeDocumentIsCanvas
      ? canvasCommandPaletteCommands
      : activeDocumentIsMarkdown
        ? editorCommandPaletteCommands
        : []
    : [];
  // All scopes share the same filtering, selection, and rendering pipeline.
  // Adding a new grouped menu should usually mean adding one command list here
  // and a root "Name ..." command that switches to that scope.
  const activeCommandPaletteCommands =
    commandPaletteScope === "ai" && activeDocumentIsMarkdown
      ? aiCommandPaletteCommands
      : commandPaletteScope === "insert"
        ? activeInsertCommandPaletteCommands
        : commandPaletteScope === "format" && activeDocumentIsMarkdown
          ? formatCommandPaletteCommands
        : commandPaletteScope === "table" && activeDocumentIsMarkdown
          ? tableCommandPaletteCommands
          : commandPaletteCommands;
  const activeCommandPaletteScopeTitle = commandPaletteScopeTitle(
    commandPaletteScope,
    activeDocumentIsCanvas,
  );
  const activeCommandPalettePlaceholder = commandPalettePlaceholder(
    commandPaletteScope,
    activeDocumentIsCanvas,
  );
  const filteredCommandPaletteCommands = filterCommandPaletteCommands(
    activeCommandPaletteCommands,
    commandPaletteQuery,
  );
  const selectedPaletteCommand = selectedCommandPaletteCommand(
    filteredCommandPaletteCommands,
    commandPaletteSelectedIndex,
  );

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    // Filtering or changing scopes can shrink the visible command list while
    // preserving the old index; clamp it before reading the active command.
    setCommandPaletteSelectedIndex((index) =>
      Math.min(index, Math.max(filteredCommandPaletteCommands.length - 1, 0)),
    );
  }, [commandPaletteOpen, filteredCommandPaletteCommands.length]);

  useEffect(() => {
    if (!commandPaletteOpen || !selectedPaletteCommand) {
      return;
    }

    const results = commandPaletteResultsRef.current;
    const activeOption = document.getElementById(
      `command-palette-${selectedPaletteCommand.id}`,
    );

    if (results?.contains(activeOption)) {
      activeOption?.scrollIntoView({ block: "nearest" });
    }
  }, [commandPaletteOpen, commandPaletteSelectedIndex, selectedPaletteCommand]);

  function closeCommandPalette() {
    restoreCommandPaletteSelection();
    setCommandPaletteOpen(false);
    setCommandPaletteScope("root");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    commandPaletteSelectionRef.current = null;
  }

  function handleCommandPaletteKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      // Escape follows the same hierarchy as Alfred-style palettes: first back
      // out of the submenu, then close the dialog from the root.
      if (commandPaletteScope !== "root") {
        setCommandPaletteScope("root");
        setCommandPaletteQuery("");
        setCommandPaletteSelectedIndex(0);
        return;
      }

      closeCommandPalette();
      return;
    }

    if (
      event.key === "Backspace" &&
      commandPaletteScope !== "root" &&
      commandPaletteQuery.length === 0
    ) {
      event.preventDefault();
      setCommandPaletteScope("root");
      setCommandPaletteSelectedIndex(0);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandPaletteSelectedIndex((index) =>
        moveSelectableIndex(index, filteredCommandPaletteCommands.length, 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandPaletteSelectedIndex((index) =>
        moveSelectableIndex(index, filteredCommandPaletteCommands.length, -1),
      );
      return;
    }

    if (event.key === "Enter" && selectedPaletteCommand) {
      event.preventDefault();
      runCommandPaletteCommand(selectedPaletteCommand);
    }
  }

  async function runCommandPaletteCommand(command: CommandPaletteCommand) {
    // Submenu commands are navigational; closing here would make selecting
    // "AI ...", "Insert ...", or "Table ..." look like a no-op.
    if (isCommandPaletteMenuCommand(command)) {
      await command.run();
      return;
    }

    closeCommandPalette();
    await command.run();
    setEditorFocused(true);
    if (shouldReportCommandPaletteStatus(command)) {
      setStatus(command.title);
    }
  }

  function jumpToHeading(entry: TocEntry) {
    jumpToHeadingInEditor(editor, entry, setStatus);
  }

  function toggleDrawerItem(item: DrawerItem) {
    if (drawerItem === item) {
      setDrawerOpen((open) => !open);
      return;
    }

    setDrawerItem(item);
    setDrawerOpen(true);
  }

  function toggleVaultDrawerItem(item: VaultDrawerItem) {
    if (vaultDrawerItem === item) {
      setVaultDrawerOpen((open) => !open);
      return;
    }

    setVaultDrawerItem(item);
    setVaultDrawerOpen(true);
  }

  function vaultDrawerTitle() {
    if (vaultDrawerItem === "files") {
      return "Files";
    }

    if (vaultDrawerItem === "recent") {
      return "Recent";
    }

    if (vaultDrawerItem === "starred") {
      return "Starred";
    }

    if (vaultDrawerItem === "tasks") {
      return "Tasks";
    }

    return "Search";
  }

  function vaultDrawerSubtitle() {
    if (vaultDrawerItem === "files") {
      return vaultRoot
        ? displayVaultRelativePath(activeFile?.relativePath ?? currentDir, vaultRoot)
        : "No vault selected";
    }

    if (vaultDrawerItem === "recent") {
      return vaultRoot ? "Recently opened files" : "Open a vault";
    }

    if (vaultDrawerItem === "starred") {
      return vaultRoot ? "Starred notes" : "Open a vault";
    }

    if (vaultDrawerItem === "tasks") {
      return vaultRoot ? "Markdown task list items" : "Open a vault";
    }

    return "Find in vault";
  }

  const visibleTaskResults = useMemo(
    () => visibleVaultTaskResults(taskResults, taskListQuery, taskSort),
    [taskListQuery, taskResults, taskSort],
  );

  const visibleSearchResults = useMemo(
    () => visibleVaultSearchResults(searchResults),
    [searchResults],
  );

  async function refreshTasks(filter = taskFilter) {
    if (!vaultRoot) {
      setTaskResults([]);
      return;
    }

    try {
      setTasksSearching(true);
      const results = await searchVaultFiles(vaultRoot, taskSearchPattern(filter), {
        includeContent: true,
        markdownOnly: true,
        excludeDotPaths: true,
      });

      // Filename hits are not useful in this view; task navigation is based on
      // the exact Markdown task lines returned by content search.
      const contentResults = results.filter((result) => result.isContentMatch);
      setTaskResults(contentResults);
      setStatus(
        `Found ${contentResults.length} task${contentResults.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTasksSearching(false);
    }
  }

  async function searchVault() {
    const query = searchQuery.trim();

    if (!vaultRoot || !query) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const results = await searchVaultFiles(vaultRoot, query, {
        includeContent: searchMode === "content",
        markdownOnly: true,
      });

      setSearchResults(results);
      setStatus(`Found ${results.length} result${results.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  async function openSearchResult(result: SearchResult) {
    await openFile(result.relativePath, { revealInVaultDrawer: false });
  }

  useEffect(() => {
    if (vaultDrawerItem !== "tasks") {
      return;
    }

    void refreshTasks(taskFilter);
  }, [vaultDrawerItem, vaultRoot, taskFilter]);

  function openImagePreviewFromEditor(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLImageElement) || (!target.currentSrc && !target.src)) {
      return;
    }

    // Use the rendered image URL as the source of truth; vault images, normal
    // markdown images, and gallery images have already been resolved by the
    // image node renderer by the time the user double-clicks.
    event.preventDefault();
    event.stopPropagation();
    setImagePreview({
      src: target.currentSrc || target.src,
      alt: target.alt || target.title || "Image preview",
    });
  }

  async function openRemoteImageSourceFromEditor(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    const remoteSource = target.getAttribute("data-remote-source") ?? "";
    const url = remoteSourceUrl(remoteSource);

    if (!url) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      if (isTauri()) {
        await openUrl(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Failed to open remote image source", error);
      setStatus("Could not open remote image source.");
    }
  }

  function workspaceWidth() {
    return workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  function totalResizeHandleWidth() {
    return (
      (vaultDrawerOpen ? workspaceResizeHandleWidth : 0) +
      (drawerOpen ? workspaceResizeHandleWidth : 0)
    );
  }

  function resizeDrawerTo(side: ResizeSide, requestedWidth: number) {
    if (side === "vault") {
      setVaultDrawerWidth(
        clampResizableDrawerWidth(
          requestedWidth,
          workspaceWidth(),
          drawerOpen ? inspectorDrawerWidth : closedDrawerWidth,
          totalResizeHandleWidth(),
        ),
      );
      return;
    }

    setInspectorDrawerWidth(
      clampResizableDrawerWidth(
        requestedWidth,
        workspaceWidth(),
        vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth,
        totalResizeHandleWidth(),
      ),
    );
  }

  function beginWorkspaceResize(side: ResizeSide, event: ReactPointerEvent<HTMLDivElement>) {
    if ((side === "vault" && !vaultDrawerOpen) || (side === "drawer" && !drawerOpen)) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startVaultWidth = vaultDrawerWidth;
    const startInspectorWidth = inspectorDrawerWidth;
    const startWorkspaceWidth = workspaceWidth();
    const startHandleWidth = totalResizeHandleWidth();
    document.body.classList.add("workspace-resizing");

    // Pointer capture on the tiny separator is brittle once the cursor leaves
    // the handle, so document-level listeners own the drag until pointerup.
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;

      if (side === "vault") {
        setVaultDrawerWidth(
          clampResizableDrawerWidth(
            startVaultWidth + delta,
            startWorkspaceWidth,
            drawerOpen ? startInspectorWidth : closedDrawerWidth,
            startHandleWidth,
          ),
        );
        return;
      }

      setInspectorDrawerWidth(
        clampResizableDrawerWidth(
          startInspectorWidth - delta,
          startWorkspaceWidth,
          vaultDrawerOpen ? startVaultWidth : closedDrawerWidth,
          startHandleWidth,
        ),
      );
    };

    const stopResize = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
      document.body.classList.remove("workspace-resizing");
      setStatus("Resized workspace drawers");
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
  }

  function handleResizeKey(side: ResizeSide, event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 24;

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    if (side === "vault") {
      resizeDrawerTo(
        "vault",
        vaultDrawerWidth + (event.key === "ArrowRight" ? step : -step),
      );
      return;
    }

    resizeDrawerTo(
      "drawer",
      inspectorDrawerWidth + (event.key === "ArrowLeft" ? step : -step),
    );
  }

  function toggleSplitEditor() {
    if (splitOpen) {
      const secondaryDirty = splitHasDirtyTabs(editorGroupsRef.current.secondary.tabs);

      if (secondaryDirty) {
        setStatus("Save secondary split tabs before closing the split");
        return;
      }

      const nextGroups = {
        ...editorGroupsRef.current,
        secondary: {
          id: "secondary" as const,
          tabs: [],
          activeTabId: "",
        },
      };

      setEditorGroupsAndRef(nextGroups);
      activeGroupIdRef.current = "primary";
      setActiveGroupId("primary");
      setSplitOpen(false);
      const primaryTab = nextGroups.primary.tabs.find(
        (tab) => tab.id === nextGroups.primary.activeTabId,
      );

      if (primaryTab) {
        hydrateDocumentTab(primaryTab, "primary");
      }
      setStatus("Closed split editor");
      return;
    }

    const secondaryTab =
      editorGroupsRef.current.secondary.tabs.find(
        (tab) => tab.id === editorGroupsRef.current.secondary.activeTabId,
      ) ?? createUntitledTab();
    const nextGroups = {
      ...editorGroupsRef.current,
      secondary: {
        id: "secondary" as const,
        tabs:
          editorGroupsRef.current.secondary.tabs.length > 0
            ? editorGroupsRef.current.secondary.tabs
            : [secondaryTab],
        activeTabId: secondaryTab.id,
      },
    };

    setEditorGroupsAndRef(nextGroups);
    setSplitOpen(true);

    if (secondaryEditor) {
      // The secondary Tiptap instance already exists even while hidden; hydrate
      // it immediately so opening the split does not show stale content.
      hydrateDocumentTab(secondaryTab, "secondary");
    }

    setStatus("Opened split editor");
  }

  function editorPaneFor(groupId: EditorGroupId, groupEditor: Editor | null) {
    return (
      <EditorPane
        activeFile={activeFile}
        activeGroupId={activeGroupId}
        canvasCommandRequest={canvasCommandRequest}
        canvasSettings={canvasDraft}
        documentDisplayMode={documentDisplayMode}
        group={editorGroups[groupId]}
        groupEditor={groupEditor}
        groupId={groupId}
        markdown={markdown}
        metaHeader={metaHeader}
        metadataOpen={metadataOpen}
        onActivateGroup={activateEditorGroup}
        onCanvasChange={updateCanvasDocument}
        onCloseTab={closeDocumentTab}
        onEditorContextMenu={handleEditorContextMenu}
        onFinishPageNameEdit={finishPageNameEdit}
        onMarkPageNameDirty={markPageNameDirty}
        onMetaHeaderChange={setActiveMetaHeader}
        onOpenFile={openFile}
        onOpenImagePreview={openImagePreviewFromEditor}
        onOpenRemoteImageSource={openRemoteImageSourceFromEditor}
        onPageNameChange={setActivePageName}
        onSetActiveDocumentDirty={setActiveDocumentDirty}
        onSetEditorFocused={setEditorFocused}
        onSetPageNameEditing={setPageNameEditing}
        onSetStatus={setStatus}
        onSwitchTab={switchToDocumentTab}
        pageName={pageName}
        pageNameEditing={pageNameEditing}
        pageSearch={pageSearch}
        setMetadataOpen={setMetadataOpen}
        toolbarActions={toolbarActions}
        vaultRoot={vaultRoot}
        vaultSettings={vaultSettings}
      />
    );
  }

  const workspaceStyle = {
    "--vault-width": `${vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth}px`,
    "--drawer-width": `${drawerOpen ? inspectorDrawerWidth : closedDrawerWidth}px`,
    "--vault-resizer-width": vaultDrawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
    "--drawer-resizer-width": drawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
  } as CSSProperties;
  const normalizedVaultAppearanceDraft =
    normalizeVaultAppearanceSettings(vaultAppearanceDraft);
  const normalizedCanvasDraft = normalizeCanvasSettings(canvasDraft);

  const appShellClassName = [
    "app-shell",
    themeOptionsDraft.colorfulHeadings ? "theme-colorful-headings" : null,
    themeOptionsDraft.headingUnderlines ? "theme-heading-underlines" : null,
    themeOptionsDraft.headingAnchors ? "theme-heading-anchors" : null,
    themeOptionsDraft.richCallouts ? "theme-rich-callouts" : null,
    `callout-style-${themeCalloutDraft.style}`,
    `section-corners-${normalizedVaultAppearanceDraft.sectionCorners}`,
    `workspace-margin-${normalizedVaultAppearanceDraft.workspaceMargin}`,
    `ui-weight-${normalizedVaultAppearanceDraft.uiFontWeight}`,
  ]
    .filter(Boolean)
    .join(" ");
  const appShellStyle = {
    "--glyphary-callout-note-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.note)}"`,
    "--glyphary-callout-info-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.info)}"`,
    "--glyphary-callout-tip-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.tip)}"`,
    "--glyphary-callout-warning-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.warning)}"`,
    "--vault-width": `${vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth}px`,
    "--drawer-width": `${drawerOpen ? inspectorDrawerWidth : closedDrawerWidth}px`,
    "--vault-resizer-width": vaultDrawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
    "--drawer-resizer-width": drawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
  } as CSSProperties;
  const settingsCardStyle = {
    transform: `translate(${settingsOffset.x}px, ${settingsOffset.y}px)`,
  } as CSSProperties;
  const aiBuilderHistoryTurns = activeAiBuilderHistoryTurns();
  const tableContextEditor = tableContextMenu
    ? editorForGroup(tableContextMenu.groupId)
    : null;

  return (
    <main className={appShellClassName} style={appShellStyle}>
      {cssSnippetContents.map((snippet) => (
        <style data-glyphary-css-snippet={snippet.name} key={snippet.name}>
          {snippet.content}
        </style>
      ))}
      {pluginStyles.map((style) => (
        // Plugin styles are read through the backend manifest allowlist; the
        // data attributes make any injected sheet easy to identify in DevTools.
        <style
          data-glyphary-plugin={style.pluginId}
          data-glyphary-plugin-style={style.name}
          key={`${style.pluginId}:${style.name}`}
        >
          {style.content}
        </style>
      ))}
      <datalist id="code-language-options">
        {codeLanguages.map((language) => (
          <option key={language.value || "plain"} value={language.value}>
            {language.label}
          </option>
        ))}
      </datalist>
      <header className="titlebar">
        <div className="app-actions">
          {!hideDuplicateDocumentActions ? (
            <div className="file-menu">
              <button className="secondary-action" type="button">
                File
              </button>
              <div className="file-menu-popover">
                <button type="button" onClick={openVault}>
                  Open Vault...
                </button>
                <button disabled={!activeFile || !dirty} type="button" onClick={saveCurrentFile}>
                  Save
                </button>
                <button type="button" onClick={resetDocument}>
                  New
                </button>
                <button type="button" onClick={openSettings}>
                  Settings...
                </button>
              </div>
            </div>
          ) : null}
        <button
            className="secondary-action icon-action"
            disabled={!activeFile || !dirty}
            type="button"
            onClick={saveCurrentFile}
            aria-label="Save"
            title="Save"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M5 4.5h11.2L19 7.3v12.2H5z" />
              <path d="M8 4.5v5h7v-5" />
              <path d="M8 19.5v-6h8v6" />
            </svg>
          </button>
          <button
            className="secondary-action icon-action"
            type="button"
            onClick={toggleSplitEditor}
            aria-label={splitOpen ? "Unsplit editor" : "Split editor"}
            title={splitOpen ? "Unsplit Editor" : "Split Editor"}
          >
            {splitOpen ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M9 5v14" />
                <path d="m15.5 9-3 3 3 3" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M12 5v14" />
              </svg>
            )}
          </button>
          {!hideDuplicateDocumentActions ? (
            <button className="secondary-action" type="button" onClick={resetDocument}>
              New
            </button>
          ) : null}
          <div className="view-mode-control" role="group" aria-label="Document display mode">
            <button
              className={documentDisplayMode === "view" ? "view-mode-button active" : "view-mode-button"}
              type="button"
              aria-label="View mode"
              aria-pressed={documentDisplayMode === "view"}
              title="View Mode"
              onClick={() => setDocumentDisplayMode("view")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            </button>
            <button
              className={documentDisplayMode === "edit" ? "view-mode-button active" : "view-mode-button"}
              type="button"
              aria-label="Edit mode"
              aria-pressed={documentDisplayMode === "edit"}
              title="Edit Mode"
              onClick={() => setDocumentDisplayMode("edit")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M5 19h4.2L18.5 9.7a2 2 0 0 0-2.8-2.8L6.4 16.2Z" />
                <path d="m14.4 8.2 1.4 1.4" />
              </svg>
            </button>
          </div>
          <div className="appearance-control" role="group" aria-label="App style">
            <button
              className={appearance === "auto" ? "appearance-button active" : "appearance-button"}
              type="button"
              aria-label="Auto style"
              aria-pressed={appearance === "auto"}
              title="Auto Style"
              onClick={() => setAppearance("auto")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5.5" />
                <path d="M12 6.5v11" />
                <path d="M12 3.5v1.3" />
                <path d="M12 19.2v1.3" />
                <path d="M4.8 12H3.5" />
                <path d="M20.5 12h-1.3" />
              </svg>
            </button>
            <button
              className={appearance === "light" ? "appearance-button active" : "appearance-button"}
              type="button"
              aria-label="Light style"
              aria-pressed={appearance === "light"}
              title="Light Style"
              onClick={() => setAppearance("light")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4.6" />
                <path d="M12 3v2" />
                <path d="M12 19v2" />
                <path d="M4.2 4.2 5.6 5.6" />
                <path d="m18.4 18.4 1.4 1.4" />
                <path d="M3 12h2" />
                <path d="M19 12h2" />
                <path d="m4.2 19.8 1.4-1.4" />
                <path d="m18.4 5.6 1.4-1.4" />
              </svg>
            </button>
            <button
              className={appearance === "dark" ? "appearance-button active" : "appearance-button"}
              type="button"
              aria-label="Dark style"
              aria-pressed={appearance === "dark"}
              title="Dark Style"
              onClick={() => setAppearance("dark")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M18.5 15.2A7 7 0 0 1 8.8 5.5 7.3 7.3 0 1 0 18.5 15.2Z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {vaultRoot ? (
      <section
        ref={workspaceRef}
        className={[
          "workspace with-vault",
          vaultDrawerOpen ? "vault-drawer-open" : "vault-drawer-closed",
          drawerOpen ? "drawer-open" : "drawer-closed",
        ].join(" ")}
        aria-label="Editor workspace"
        style={workspaceStyle}
      >
        <aside className="vault-pane" aria-label="Vault drawer">
          <div className="vault-rail" aria-label="Vault drawer items">
            <button
              className={vaultDrawerItem === "files" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "files"
                  ? "Close files drawer"
                  : "Open files drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "files" ? "Close Files" : "Open Files"}
              onClick={() => toggleVaultDrawerItem("files")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3.5 6.5h6.2l2 2h8.8v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
                <path d="M2.5 9.5h19" />
              </svg>
            </button>
            <button
              className={vaultDrawerItem === "search" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "search"
                  ? "Close search drawer"
                  : "Open search drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "search" ? "Close Search" : "Open Search"}
              onClick={() => toggleVaultDrawerItem("search")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="5.8" />
                <path d="m15 15 4.5 4.5" />
              </svg>
            </button>
            <button
              className={vaultDrawerItem === "recent" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "recent"
                  ? "Close recent files drawer"
                  : "Open recent files drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "recent" ? "Close Recent" : "Open Recent"}
              onClick={() => toggleVaultDrawerItem("recent")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 5.5v5h5" />
                <path d="M4.5 10.2a7.5 7.5 0 1 0 2.2-5.1" />
                <path d="M12 7.5v5l3.2 1.9" />
              </svg>
            </button>
            <button
              className={vaultDrawerItem === "starred" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "starred"
                  ? "Close starred notes drawer"
                  : "Open starred notes drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "starred" ? "Close Starred" : "Open Starred"}
              onClick={() => toggleVaultDrawerItem("starred")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m12 4.4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" />
              </svg>
            </button>
            <button
              className={vaultDrawerItem === "tasks" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "tasks"
                  ? "Close tasks drawer"
                  : "Open tasks drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "tasks" ? "Close Tasks" : "Open Tasks"}
              onClick={() => toggleVaultDrawerItem("tasks")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 6h11" />
                <path d="M9 12h11" />
                <path d="M9 18h11" />
                <path d="m3.7 6 1.1 1.1L7 4.8" />
                <rect x="3.3" y="10.7" width="3.4" height="3.4" rx="0.7" />
                <rect x="3.3" y="16.7" width="3.4" height="3.4" rx="0.7" />
              </svg>
            </button>
          </div>
          {vaultDrawerOpen ? (
            <div className="vault-content">
              <div className="vault-header">
                <div>
                  <h2>{vaultDrawerTitle()}</h2>
                  <p>{vaultDrawerSubtitle()}</p>
                </div>
                <div className="vault-header-actions">
                  {vaultDrawerItem === "files" ? (
                    <button
                      className="inline-action"
                      disabled={!vaultRoot || !currentDir}
                      type="button"
                      onClick={goBack}
                    >
                      Back
                    </button>
                  ) : null}
                </div>
              </div>
              {vaultDrawerItem === "files" ? (
                <>
                  <div className="vault-path">
                    {displayVaultRelativePath(activeFile?.relativePath ?? currentDir, vaultRoot)}
                  </div>
                  <div
                    className="vault-list"
                    role="list"
                    onContextMenu={handleVaultListContextMenu}
                  >
                    {vaultRoot && savedFileDisplaySettings().showFilesInFolderTree ? (
                      <VaultFolderTree
                        activeFilePath={activeFile?.relativePath}
                        hideHeader
                        root={vaultRoot}
                        selectedPath={currentDir}
                        showFilePreviews={savedFileDisplaySettings().showFilePreviewsInFolderTree}
                        showPreviewImages={savedFileDisplaySettings().showImagesInFilePreviews}
                        showFiles
                        onEntryContextMenu={handleFolderContextMenu}
                        onFileOpen={(relativePath) => openFile(relativePath)}
                        onSelect={(relativePath) => enterDirectory(relativePath)}
                        onStatus={setStatus}
                      />
                    ) : (
                      entries.map((entry) => (
                        <button
                          className={
                            activeFile?.relativePath === entry.relativePath
                              ? "vault-entry active"
                              : "vault-entry"
                          }
                          key={entry.relativePath}
                          onMouseDown={(event) => handleVaultEntryMouseDown(entry, event)}
                          onClick={(event) => {
                            if (entry.isDir) {
                              handleDirectoryClick(entry, event);
                            }
                          }}
                          onDoubleClick={() => {
                            if (entry.isDir) {
                              handleDirectoryDoubleClick(entry);
                            } else {
                              openFile(entry.relativePath);
                            }
                          }}
                          onContextMenu={(event) => handleFolderContextMenu(entry, event)}
                          type="button"
                        >
                          {entry.isDir ? <FolderIcon /> : <VaultFileIcon relativePath={entry.relativePath} />}
                          <span className="vault-entry-text">
                            <strong>{entry.name}</strong>
                            {!entry.isDir && savedFileDisplaySettings().showFilePreviewsInFolderTree ? (
                              <TreeFilePreview
                                root={vaultRoot}
                                relativePath={entry.relativePath}
                                showImage={savedFileDisplaySettings().showImagesInFilePreviews}
                              />
                            ) : null}
                          </span>
                        </button>
                      ))
                    )}
                    {vaultRoot && !savedFileDisplaySettings().showFilesInFolderTree && entries.length === 0 ? (
                      <p className="empty-vault">This directory is empty.</p>
                    ) : null}
                  </div>
                </>
              ) : vaultDrawerItem === "recent" ? (
                <div className="vault-list recent-list" role="list" aria-label="Recently opened files">
                  {recentFiles.map((file) => (
                    <button
                      className={
                        activeFile?.relativePath === file.relativePath
                          ? "vault-entry recent-entry active"
                          : "vault-entry recent-entry"
                      }
                      key={file.relativePath}
                      type="button"
                      onClick={() => openFile(file.relativePath)}
                    >
                      <VaultFileIcon relativePath={file.relativePath} />
                      <span className="recent-entry-text">
                        <strong>{file.name}</strong>
                        <em>{file.relativePath}</em>
                      </span>
                    </button>
                  ))}
                  {vaultRoot && recentFiles.length === 0 ? (
                    <p className="empty-vault">No recently opened files yet.</p>
                  ) : null}
                  {!vaultRoot ? (
                    <p className="empty-vault">Open a vault to track recent files.</p>
                  ) : null}
                </div>
              ) : vaultDrawerItem === "starred" ? (
                <div className="vault-list recent-list" role="list" aria-label="Starred notes">
                  {starredFileEntries.map((file) => (
                    <button
                      className={
                        activeFile?.relativePath === file.relativePath
                          ? "vault-entry recent-entry active"
                          : "vault-entry recent-entry"
                      }
                      key={file.relativePath}
                      type="button"
                      onClick={() => openFile(file.relativePath)}
                    >
                      <VaultFileIcon relativePath={file.relativePath} />
                      <span className="recent-entry-text">
                        <strong>{file.name}</strong>
                        <em>{file.relativePath}</em>
                      </span>
                    </button>
                  ))}
                  {vaultRoot && starredFileEntries.length === 0 ? (
                    <p className="empty-vault">No starred notes yet.</p>
                  ) : null}
                  {!vaultRoot ? (
                    <p className="empty-vault">Open a vault to star notes.</p>
                  ) : null}
                </div>
              ) : vaultDrawerItem === "tasks" ? (
                <div className="vault-tasks" role="region" aria-label="Vault tasks">
                  <div className="task-options" aria-label="Task filter">
                    <button
                      className={taskFilter === "incomplete" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setTaskFilter("incomplete")}
                    >
                      Open
                    </button>
                    <button
                      className={taskFilter === "complete" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setTaskFilter("complete")}
                    >
                      Done
                    </button>
                    <button
                      className={taskFilter === "all" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setTaskFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className="task-refresh-button"
                      disabled={!vaultRoot || tasksSearching}
                      type="button"
                      title="Refresh tasks"
                      aria-label="Refresh tasks"
                      onClick={() => refreshTasks(taskFilter)}
                    >
                      {tasksSearching ? "..." : renderToolbarIcon("refresh")}
                    </button>
                  </div>
                  <div className="task-list-tools">
                    <label>
                      <span>Find</span>
                      <input
                        disabled={!vaultRoot}
                        value={taskListQuery}
                        onChange={(event) => setTaskListQuery(event.currentTarget.value)}
                        placeholder="Filter tasks"
                      />
                    </label>
                    <label>
                      <span>Sort</span>
                      <select
                        disabled={!vaultRoot}
                        value={taskSort}
                        onChange={(event) => setTaskSort(event.currentTarget.value as TaskSort)}
                      >
                        <option value="name">Name</option>
                        <option value="date">Date</option>
                      </select>
                    </label>
                  </div>
                  {visibleTaskResults.length > 0 ? (
                    <div className="task-results" role="list" aria-label="Task results">
                      {visibleTaskResults.map((result, index) => {
                        const task = taskResultPresentation(result.lineText);

                        return (
                          <button
                            key={`${result.relativePath}-${result.lineNumber ?? "task"}-${index}`}
                            type="button"
                            onClick={() => openSearchResult(result)}
                          >
                            <span
                              className={
                                task.completed
                                  ? "task-result-icon completed"
                                  : "task-result-icon"
                              }
                            >
                              {renderToolbarIcon(task.completed ? "task-done" : "task-open")}
                            </span>
                            <span className="task-result-text">
                              <strong>{task.label}</strong>
                              <span>
                                {result.relativePath}
                                {result.lineNumber ? `:${result.lineNumber}` : ""}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : vaultRoot ? (
                    <p className="empty-vault">
                      {tasksSearching
                        ? "Searching tasks..."
                        : taskResults.length > 0
                          ? "No tasks match this filter."
                          : "No matching tasks found."}
                    </p>
                  ) : (
                    <p className="empty-vault">Open a vault to list Markdown tasks.</p>
                  )}
                </div>
              ) : (
                <div className="vault-search" role="search">
                  <label>
                    <span>Search</span>
                    <input
                      disabled={!vaultRoot}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          searchVault();
                        }
                      }}
                      placeholder="Find in vault"
                    />
                  </label>
                  <div className="search-options" aria-label="Search mode">
                    <button
                      className={searchMode === "filename" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setSearchMode("filename")}
                    >
                      Names
                    </button>
                    <button
                      className={searchMode === "content" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setSearchMode("content")}
                    >
                      Content
                    </button>
                    <button
                      disabled={!vaultRoot || !searchQuery.trim() || searching}
                      type="button"
                      onClick={searchVault}
                    >
                      {searching ? "..." : "Go"}
                    </button>
                  </div>
                  {visibleSearchResults.length > 0 ? (
                    <div className="search-results" role="list" aria-label="Search results">
                      {visibleSearchResults.map(({ matchCount, result }, index) => (
                        <button
                          key={`${result.relativePath}-${result.lineNumber ?? "name"}-${index}`}
                          type="button"
                          onClick={() => openSearchResult(result)}
                        >
                          <strong>{result.relativePath}</strong>
                          <span>
                            {matchCount === 1 ? "1 match" : `${matchCount} matches`}
                          </span>
                          {result.lineText ? <em>{result.lineText}</em> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <div
          className={vaultDrawerOpen ? "workspace-resizer vault-resizer" : "workspace-resizer hidden"}
          role="separator"
          aria-label="Resize vault drawer"
          aria-orientation="vertical"
          aria-valuemin={minResizableDrawerWidth}
          aria-valuemax={Math.max(
            minResizableDrawerWidth,
            workspaceWidth() -
              (drawerOpen ? inspectorDrawerWidth : closedDrawerWidth) -
              totalResizeHandleWidth() -
              minEditorWorkspaceWidth,
          )}
          aria-valuenow={vaultDrawerWidth}
          tabIndex={vaultDrawerOpen ? 0 : -1}
          onKeyDown={(event) => handleResizeKey("vault", event)}
          onPointerDown={(event) => beginWorkspaceResize("vault", event)}
        />

        <div className={splitOpen ? "editor-groups split" : "editor-groups"}>
          {editorPaneFor("primary", primaryEditor)}
          {splitOpen ? editorPaneFor("secondary", secondaryEditor) : null}
        </div>

        <div
          className={drawerOpen ? "workspace-resizer drawer-resizer" : "workspace-resizer hidden"}
          role="separator"
          aria-label="Resize inspector drawer"
          aria-orientation="vertical"
          aria-valuemin={minResizableDrawerWidth}
          aria-valuemax={Math.max(
            minResizableDrawerWidth,
            workspaceWidth() -
              (vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth) -
              totalResizeHandleWidth() -
              minEditorWorkspaceWidth,
          )}
          aria-valuenow={inspectorDrawerWidth}
          tabIndex={drawerOpen ? 0 : -1}
          onKeyDown={(event) => handleResizeKey("drawer", event)}
          onPointerDown={(event) => beginWorkspaceResize("drawer", event)}
        />

        <aside className="drawer-pane" aria-label="Inspector drawer">
          <div className="drawer-rail" aria-label="Drawer items">
            <button
              className={drawerItem === "source" && drawerOpen ? "drawer-tab active" : "drawer-tab"}
              type="button"
              aria-label={
                drawerOpen && drawerItem === "source"
                  ? "Close source drawer"
                  : "Open source drawer"
              }
              title={drawerOpen && drawerItem === "source" ? "Close Source" : "Open Source"}
              onClick={() => toggleDrawerItem("source")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m8.5 8-4 4 4 4" />
                <path d="m15.5 8 4 4-4 4" />
                <path d="m13 5.5-2 13" />
              </svg>
            </button>
            <button
              className={drawerItem === "toc" && drawerOpen ? "drawer-tab active" : "drawer-tab"}
              type="button"
              aria-label={
                drawerOpen && drawerItem === "toc"
                  ? "Close table of contents drawer"
                  : "Open table of contents drawer"
              }
              title={drawerOpen && drawerItem === "toc" ? "Close TOC" : "Open TOC"}
              onClick={() => toggleDrawerItem("toc")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 6.5h11" />
                <path d="M9 12h11" />
                <path d="M9 17.5h11" />
                <circle cx="4.5" cy="6.5" r="1.1" />
                <circle cx="4.5" cy="12" r="1.1" />
                <circle cx="4.5" cy="17.5" r="1.1" />
              </svg>
            </button>
            <button
              className={drawerItem === "calendar" && drawerOpen ? "drawer-tab active" : "drawer-tab"}
              type="button"
              aria-label={
                drawerOpen && drawerItem === "calendar"
                  ? "Close calendar drawer"
                  : "Open calendar drawer"
              }
              title={drawerOpen && drawerItem === "calendar" ? "Close Calendar" : "Open Calendar"}
              onClick={() => toggleDrawerItem("calendar")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="5.5" width="16" height="15" rx="2" />
                <path d="M8 3.5v4" />
                <path d="M16 3.5v4" />
                <path d="M4 10h16" />
                <path d="M8 14h.1" />
                <path d="M12 14h.1" />
                <path d="M16 14h.1" />
                <path d="M8 17h.1" />
                <path d="M12 17h.1" />
              </svg>
            </button>
          </div>
          {drawerOpen ? (
            <div className="drawer-content">
              <div className="drawer-header">
                <div>
                  <h2>
                    {drawerItem === "source"
                      ? "Source"
                      : drawerItem === "toc"
                        ? "Contents"
                        : "Calendar"}
                  </h2>
                  <span>
                    {drawerItem === "source"
                      ? activeDocumentIsCanvas
                        ? "Canvas JSON source"
                        : activeDocumentIsBase
                          ? "Base definition and export"
                          : "Markdown source and export"
                      : drawerItem === "toc"
                        ? "Current document headings"
                        : "Monthly calendar notes"}
                  </span>
                </div>
                <button
                  className="inline-action"
                  type="button"
                  aria-label="Close drawer"
                  onClick={() => setDrawerOpen(false)}
                >
                  Close
                </button>
              </div>
              {drawerItem === "source" ? (
                <div className="drawer-panel source-panel">
                  <div className="markdown-import">
                    <div className="pane-header compact">
                      <h2>
                        {activeDocumentIsCanvas
                          ? "JSON Source"
                          : activeDocumentIsBase
                            ? "Base Source"
                            : "Source"}
                      </h2>
                      <button className="inline-action" type="button" onClick={applyMarkdown}>
                        Apply
                      </button>
                    </div>
                    <textarea
                      aria-label={
                        activeDocumentIsCanvas
                          ? "Canvas JSON source"
                          : activeDocumentIsBase
                            ? "Base definition source"
                            : "Markdown source"
                      }
                      value={markdownDraft}
                      onChange={(event) => {
                        const nextDraft = event.currentTarget.value;

                        setMarkdownDraft(nextDraft);
                        updateActiveTab({
                          markdownDraft: nextDraft,
                          dirty: true,
                        });
                        setActiveDocumentDirty(true);
                        setStatus(
                          activeFileRef.current
                            ? `Unsaved changes in ${activeFileRef.current.name}`
                            : "Unsaved changes in untitled note",
                        );
                      }}
                      spellCheck="false"
                    />
                  </div>
                  <div className="markdown-export">
                    <div className="pane-header">
                      <h2>{activeDocumentIsCanvas ? "Preview Source" : "Export"}</h2>
                      <span>
                        {dirty ? "Unsaved / " : ""}
                        {stats.words} words / {stats.characters} chars
                      </span>
                    </div>
                    <pre>{markdown}</pre>
                  </div>
                </div>
              ) : drawerItem === "toc" ? (
                <div className="drawer-panel toc-panel">
                  {tableOfContents.length > 0 ? (
                    <div className="toc-list" role="list" aria-label="Table of contents">
                      {tableOfContents.map((entry) => (
                        <button
                          className={`toc-entry level-${entry.level}`}
                          key={entry.id}
                          type="button"
                          onClick={() => jumpToHeading(entry)}
                        >
                          <span>H{entry.level}</span>
                          <strong>{entry.title}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-toc">No headings in this document.</p>
                  )}
                </div>
              ) : (
                <div className="drawer-panel calendar-panel">
                  <div className="calendar-toolbar">
                    <button
                      className="inline-action"
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1),
                        )
                      }
                    >
                      Prev
                    </button>
                    <strong>{monthTitle(calendarMonth)}</strong>
                    <button
                      className="inline-action"
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                  <div
                    className="calendar-grid"
                    key={`${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}`}
                    role="grid"
                    aria-label={monthTitle(calendarMonth)}
                  >
                    {weekdayLabels.map((weekday) => (
                      <span className="calendar-weekday" key={weekday}>
                        {weekday}
                      </span>
                    ))}
                    {calendarDays.map((date) => {
                      const inMonth = date.getMonth() === calendarMonth.getMonth();
                      const today = sameCalendarDate(date, new Date());
                      const hasNote = calendarNoteDateKeySet.has(calendarDateKey(date));

                      return (
                        <button
                          className={[
                            "calendar-day",
                            inMonth ? "" : "outside-month",
                            today ? "today" : "",
                            hasNote ? "has-note" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={date.toISOString()}
                          type="button"
                          onDoubleClick={() => openCalendarDay(date)}
                          onMouseEnter={(event) => scheduleCalendarDayPreview(date, event)}
                          onMouseLeave={closeCalendarDayPreview}
                          onMouseMove={(event) => moveCalendarDayPreview(date, event)}
                          onPointerEnter={(event) => scheduleCalendarDayPreview(date, event)}
                          onPointerLeave={closeCalendarDayPreview}
                          title={`Double-click to open ${calendarDayTitle(date)}`}
                        >
                          <span>{date.getDate()}</span>
                          {hasNote ? <i aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </section>
      ) : (
        <section className="vault-onboarding" aria-label="Open a vault">
          <div className="vault-onboarding-card">
            <div className="vault-onboarding-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M3.5 6.5h6.2l2 2h8.8v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
                <path d="M2.5 9.5h19" />
                <path d="M8 14h8" />
              </svg>
            </div>
            <div className="vault-onboarding-copy">
              <p className="vault-onboarding-kicker">Welcome to Glyphary</p>
              <h1>Choose a vault to begin.</h1>
              <p>
                Glyphary works directly with a folder of Markdown notes. Select your Obsidian
                vault, or any folder you want to use as a vault, and the file browser, search,
                daily notes, assets, and settings will be scoped to that location.
              </p>
            </div>
            <button className="primary-action vault-onboarding-action" type="button" onClick={openVault}>
              Select Vault Folder
            </button>
          </div>
        </section>
      )}
      {calendarDayPreview ? (
        <aside
          className="calendar-day-preview"
          style={{ left: calendarDayPreview.x, top: calendarDayPreview.y }}
          aria-label={`Preview ${calendarDayPreview.title}`}
        >
          <strong>{calendarDayPreview.title}</strong>
          <span>{calendarDayPreview.relativePath}</span>
          <CanvasMarkdownPreview markdown={calendarDayPreview.markdown} />
        </aside>
      ) : null}
      <SettingsDialog
        activeFile={activeFile}
        aiDraft={aiDraft}
        aiModelOptions={aiModelOptions}
        aiModelsLoading={aiModelsLoading}
        aiTestStatus={aiTestStatus}
        aiTesting={aiTesting}
        applyThemePreset={applyThemePreset}
        autosaveDraft={autosaveDraft}
        chooseNewTabFile={chooseNewTabFile}
        closeSettings={closeSettings}
        cssSnippetDraft={cssSnippetDraft}
        cssSnippetFiles={cssSnippetFiles}
        debugDraft={debugDraft}
        editorBehaviorDraft={editorBehaviorDraft}
        fileDisplayDraft={fileDisplayDraft}
        frontmatterPillDraft={frontmatterPillDraft}
        moveSettingsDrag={moveSettingsDrag}
        newTabFileDraft={newTabFileDraft}
        normalizedCanvasDraft={normalizedCanvasDraft}
        normalizedVaultAppearanceDraft={normalizedVaultAppearanceDraft}
        pluginCatalog={pluginCatalog}
        pluginDraft={pluginDraft}
        refreshAiModels={refreshAiModels}
        refreshCssSnippets={refreshCssSnippets}
        refreshPlugins={refreshPlugins}
        requestTidbitShortcutAccessibilityPermission={requestTidbitShortcutAccessibilityPermission}
        resetThemeDraft={resetThemeDraft}
        revertSettingsDraft={revertSettingsDraft}
        saveVaultSettings={saveVaultSettings}
        selectedThemePresetIdDraft={selectedThemePresetIdDraft}
        setAutosaveDraft={setAutosaveDraft}
        setCanvasDraft={setCanvasDraft}
        setCssSnippetDraft={setCssSnippetDraft}
        setDebugDraft={setDebugDraft}
        setEditorBehaviorDraft={setEditorBehaviorDraft}
        setFileDisplayDraft={setFileDisplayDraft}
        setFrontmatterPillDraft={setFrontmatterPillDraft}
        setNewTabFileDraft={setNewTabFileDraft}
        setPluginDraft={setPluginDraft}
        setSettingsDraft={setSettingsDraft}
        setSettingsTab={setSettingsTab}
        setStatus={setStatus}
        setThemeCalloutDraft={setThemeCalloutDraft}
        setThemeOptionsDraft={setThemeOptionsDraft}
        setTidbitDraft={setTidbitDraft}
        setVaultAppearanceDraft={setVaultAppearanceDraft}
        settingsCardStyle={settingsCardStyle}
        settingsDraft={settingsDraft}
        settingsDragging={settingsDragging}
        settingsHaveChanges={settingsHaveChanges}
        settingsOpen={settingsOpen}
        settingsTab={settingsTab}
        shortcutFromKeyboardEvent={shortcutFromKeyboardEvent}
        startSettingsDrag={startSettingsDrag}
        stopSettingsDrag={stopSettingsDrag}
        testAiConnection={testAiConnection}
        themeCalloutDraft={themeCalloutDraft}
        themeDraft={themeDraft}
        themeOptionsDraft={themeOptionsDraft}
        tidbitDraft={tidbitDraft}
        updateAiDraft={updateAiDraft}
        updateThemeDraftToken={updateThemeDraftToken}
        vaultRoot={vaultRoot}
      />
      <ExcalidrawDialog
        dialog={excalidrawDialog}
        onApi={(api) => {
          excalidrawApiRef.current = api;
        }}
        onChange={(elements, appState, files) => {
          excalidrawSceneRef.current = { elements, appState, files };
          setExcalidrawDirty(true);
        }}
        onClose={closeExcalidrawDialog}
        onSave={saveExcalidrawDrawing}
      />
      {imagePreview ? (
        <div
          className="image-preview-screen"
          role="presentation"
          onMouseDown={() => setImagePreview(null)}
        >
          <figure
            className="image-preview-card"
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="image-preview-close"
              type="button"
              aria-label="Close image preview"
              onClick={() => setImagePreview(null)}
            >
              Close
            </button>
            <img src={imagePreview.src} alt={imagePreview.alt} />
            {imagePreview.alt ? <figcaption>{imagePreview.alt}</figcaption> : null}
          </figure>
        </div>
      ) : null}
      {aiPageBuilderOpen ? (
        <div
          className="ai-builder-screen"
          role="presentation"
          onMouseDown={() => setAiPageBuilderOpen(false)}
        >
          <section
            className="ai-builder-card"
            role="dialog"
            aria-modal="true"
            aria-label="AI Page Builder"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>AI Page Builder</h2>
                <span>Describe the section to generate for this note.</span>
              </div>
              <button
                className="inline-action"
                type="button"
                onClick={() => setAiPageBuilderOpen(false)}
              >
                Cancel
              </button>
            </header>
            {aiBuilderHistoryTurns.length > 0 ? (
              <section className="ai-builder-history" aria-label="AI Builder history">
                <div className="ai-builder-history-header">
                  <span>History</span>
                  <button
                    className="inline-action"
                    type="button"
                    onClick={clearActiveAiBuilderHistory}
                  >
                    Clear
                  </button>
                </div>
                <div className="ai-builder-history-list">
                  {aiBuilderHistoryTurns.map((turn) => (
                    <article
                      className={`ai-builder-history-item${
                        aiPageBuilderReplaceTurnId === turn.id ? " selected" : ""
                      }`}
                      key={turn.id}
                    >
                      <div>
                        <strong>{turn.prompt}</strong>
                        <span>
                          {turn.superseded ? "Replaced" : turn.applied ? "Inserted" : "Generated"}
                        </span>
                      </div>
                      <p>{turn.markdown}</p>
                      {turn.applied && !turn.superseded ? (
                        <button
                          className="inline-action"
                          type="button"
                          onClick={() =>
                            setAiPageBuilderReplaceTurnId(
                              aiPageBuilderReplaceTurnId === turn.id ? null : turn.id,
                            )
                          }
                        >
                          {aiPageBuilderReplaceTurnId === turn.id ? "Replacing" : "Replace"}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {selectedAiBuilderReplacementTurn() ? (
              <p className="ai-builder-replace-note">
                The next result will replace the selected AI Builder block.
              </p>
            ) : null}
            <textarea
              autoFocus
              value={aiPageBuilderPrompt}
              placeholder="Build a two-column comparison with a warning callout..."
              onChange={(event) => {
                const { value } = event.currentTarget;

                setAiPageBuilderPrompt(value);
              }}
            />
            <footer>
              <button
                className="secondary-action"
                type="button"
                onClick={() => setAiPageBuilderOpen(false)}
              >
                Cancel
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={!aiPageBuilderPrompt.trim() || aiSubmitting}
                onClick={() => void runAiPageBuilder()}
              >
                Build
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {aiPageBuilderAssetReview ? (
        <div
          className="ai-builder-asset-screen"
          role="presentation"
          onMouseDown={() => setAiPageBuilderAssetReview(null)}
        >
          <section
            className="ai-builder-asset-card"
            role="dialog"
            aria-modal="true"
            aria-label="Review AI Page Builder assets"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>Review Assets</h2>
                <span>Remote images will be saved into {defaultVaultImageDirectory}.</span>
              </div>
              <button
                className="inline-action"
                type="button"
                onClick={() => setAiPageBuilderAssetReview(null)}
              >
                Cancel
              </button>
            </header>
            <div className="ai-builder-asset-list">
              {aiPageBuilderAssetReview.assets.map((asset) => {
                const candidateUrls = pageBuilderAssetCandidateUrls(asset);

                return (
                  <article className="ai-builder-asset-item" key={asset.id}>
                    <div>
                      <strong>{asset.label}</strong>
                      <span>{asset.suggestedName}</span>
                    </div>
                    <small>
                      {candidateUrls[0] ??
                        (asset.domain ? `domain: ${asset.domain}` : "No source provided")}
                    </small>
                  </article>
                );
              })}
            </div>
            <footer>
              <button
                className="secondary-action"
                type="button"
                onClick={() => setAiPageBuilderAssetReview(null)}
              >
                Cancel
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={aiPageBuilderImportingAssets}
                onClick={() => void importAiPageBuilderAssets()}
              >
                {aiPageBuilderImportingAssets ? "Importing..." : "Import Assets"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {aiReview ? (
        <div
          className="ai-review-screen"
          role="presentation"
          onMouseDown={() => setAiReview(null)}
        >
          <section
            className="ai-review-card"
            role="dialog"
            aria-modal="true"
            aria-label="Review AI result"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>{aiReview.title}</h2>
                <span>Review before applying to the current note.</span>
              </div>
              <button
                className="inline-action"
                type="button"
                onClick={() => setAiReview(null)}
              >
                Cancel
              </button>
            </header>
            <textarea readOnly value={aiReview.output} />
            <footer>
              <button
                className="secondary-action"
                type="button"
                onClick={() => void copyAiOutput(aiReview.output)}
              >
                Copy
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() =>
                  aiReview.aiBuilderReplaceTurnId
                    ? replacePreviousAiBuilderOutput(aiReview)
                    : insertAiOutputBelowSelection(aiReview.output)
                }
              >
                {aiReview.aiBuilderReplaceTurnId ? "Replace Previous" : "Insert Below"}
              </button>
              {aiReview.applyMode === "replace-selection" ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => replaceSelectionWithAiOutput(aiReview.output)}
                >
                  Replace Selection
                </button>
              ) : null}
              {aiReview.applyMode === "insert-at-cursor" && !aiReview.aiBuilderReplaceTurnId ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => insertAiOutputAtCursor(aiReview.output)}
                >
                  Insert at Cursor
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
      {aiSubmitting ? (
        <div className="ai-progress-screen" role="presentation">
          <section
            className="ai-progress-card"
            role="status"
            aria-live="polite"
            aria-label="AI command in progress"
          >
            <span className="ai-progress-spinner" aria-hidden="true" />
            <div>
              <h2>{aiSubmittingTitle || "AI command"}</h2>
              <p>Waiting for AI response...</p>
            </div>
          </section>
        </div>
      ) : null}
      <CommandPaletteDialog
        close={closeCommandPalette}
        commands={filteredCommandPaletteCommands}
        handleKeyDown={handleCommandPaletteKeyDown}
        inputRef={commandPaletteInputRef}
        onBack={() => {
          setCommandPaletteScope("root");
          setCommandPaletteQuery("");
          setCommandPaletteSelectedIndex(0);
          commandPaletteInputRef.current?.focus();
        }}
        onQueryChange={(nextQuery) => {
          setCommandPaletteQuery(nextQuery);
          setCommandPaletteSelectedIndex(0);
        }}
        onRunCommand={(command) => {
          void runCommandPaletteCommand(command);
        }}
        onSelectIndex={setCommandPaletteSelectedIndex}
        open={commandPaletteOpen}
        placeholder={activeCommandPalettePlaceholder}
        query={commandPaletteQuery}
        resultsRef={commandPaletteResultsRef}
        scope={commandPaletteScope}
        scopeTitle={activeCommandPaletteScopeTitle}
        selectedCommand={selectedPaletteCommand}
        selectedIndex={commandPaletteSelectedIndex}
      />
      {wikiLinkSearchOpen ? (
        <div
          className="wikilink-search-screen"
          role="presentation"
          onMouseDown={closeWikiLinkSearch}
        >
          <div
            className="wikilink-search-card"
            role="dialog"
            aria-modal="true"
            aria-label="Find page"
            onKeyDown={handleWikiLinkSearchKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              ref={wikiLinkSearchInputRef}
              aria-activedescendant={
                selectedWikiLinkFile
                  ? `wikilink-search-${selectedWikiLinkSearchIndex}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls="wikilink-search-results"
              aria-label="Find page"
              autoComplete="off"
              placeholder="Find page..."
              role="combobox"
              spellCheck="false"
              value={wikiLinkSearchQuery}
              onChange={(event) => {
                setWikiLinkSearchQuery(event.currentTarget.value);
                setWikiLinkSearchSelectedIndex(0);
              }}
            />
            <div
              className="wikilink-search-results"
              id="wikilink-search-results"
              role="listbox"
              aria-label="Matching pages"
            >
              {filteredWikiLinkFiles.length > 0 ? (
                filteredWikiLinkFiles.map((file, index) => (
                  <button
                    className={index === selectedWikiLinkSearchIndex ? "active" : ""}
                    id={`wikilink-search-${index}`}
                    key={file.relativePath}
                    type="button"
                    role="option"
                    aria-selected={index === selectedWikiLinkSearchIndex}
                    onClick={() => insertWikiLinkSelection(file)}
                    onMouseEnter={() => setWikiLinkSearchSelectedIndex(index)}
                  >
                    <span>{wikiLinkDisplayName(file)}</span>
                    <small>{file.relativePath}</small>
                  </button>
                ))
              ) : (
                <p>No matching pages</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <ExcalidrawCreateDialog
        inputRef={excalidrawCreateInputRef}
        name={excalidrawCreateNameDraft}
        onCancel={() => setExcalidrawCreateDialogOpen(false)}
        onCreate={() => {
          void insertExcalidrawDrawing();
        }}
        onNameChange={setExcalidrawCreateNameDraft}
        open={excalidrawCreateDialogOpen}
        submitting={excalidrawCreateSubmitting}
      />
      {richLinkDialogOpen ? (
        <div
          className="rich-link-dialog-screen"
          role="presentation"
          onMouseDown={() => {
            if (!richLinkSubmitting) {
              setRichLinkDialogOpen(false);
            }
          }}
        >
          <form
            className="rich-link-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="Insert rich link"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void insertRichLinkFromUrl(richLinkUrlDraft);
            }}
          >
            <div className="rich-link-dialog-header">
              <h2>Insert Rich Link</h2>
              <span>Paste a URL to fetch a preview card.</span>
            </div>
            <label>
              <span>URL</span>
              <input
                ref={richLinkInputRef}
                disabled={richLinkSubmitting}
                inputMode="url"
                placeholder="https://example.com/article"
                spellCheck="false"
                type="url"
                value={richLinkUrlDraft}
                onChange={(event) => setRichLinkUrlDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !richLinkSubmitting) {
                    event.preventDefault();
                    setRichLinkDialogOpen(false);
                  }
                }}
              />
            </label>
            <div className="rich-link-dialog-actions">
              <button
                className="inline-action"
                disabled={richLinkSubmitting}
                type="button"
                onClick={() => setRichLinkDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="inline-action"
                disabled={richLinkSubmitting || !richLinkUrlDraft.trim()}
                type="submit"
              >
                {richLinkSubmitting ? "Fetching..." : "Insert"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {releaseNotification ? (
        <div
          className="release-update-screen"
          role="presentation"
          onMouseDown={() => setReleaseNotification(null)}
        >
          <section
            className="release-update-card"
            role="dialog"
            aria-modal="true"
            aria-label="Glyphary update available"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="release-update-header">
              <h2>Glyphary {releaseNotification.tagName} is available</h2>
              <span>
                You are running {currentAppVersion}
                {releaseNotification.publishedAt
                  ? ` - Published ${new Date(
                      releaseNotification.publishedAt,
                    ).toLocaleDateString()}`
                  : ""}
              </span>
            </div>
            <div className="release-update-notes">
              <strong>{releaseNotification.name}</strong>
              <p>{releaseNotification.notes}</p>
            </div>
            <div className="release-update-actions">
              <button
                className="inline-action"
                type="button"
                onClick={() => setReleaseNotification(null)}
              >
                Later
              </button>
              <a
                className="inline-action"
                href={releaseNotification.url}
                rel="noreferrer"
                target="_blank"
                onClick={() => setReleaseNotification(null)}
              >
                Open Release
              </a>
            </div>
          </section>
        </div>
      ) : null}
      {wikiLinkPicker ? (
        <div
          className="wikilink-picker"
          style={{ left: wikiLinkPicker.x, top: wikiLinkPicker.y }}
          role="menu"
          aria-label={`Choose target for ${wikiLinkPicker.target}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {wikiLinkPicker.candidates.map((file, index) => (
            <button
              className={index === wikiLinkPickerSelectedIndex ? "active" : ""}
              key={file.relativePath}
              type="button"
              role="menuitem"
              onClick={() => openWikiLinkPickerSelection(file)}
              onMouseEnter={() => setWikiLinkPickerSelectedIndex(index)}
            >
              <span>{wikiLinkDisplayName(file)}</span>
              <small>{file.relativePath}</small>
            </button>
          ))}
        </div>
      ) : null}
      {tableContextMenu ? (
        <div
          className="table-context-menu"
          style={{ left: tableContextMenu.x, top: tableContextMenu.y }}
          role="menu"
          aria-label="Table actions"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {tableCommandPaletteCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              role="menuitem"
              onClick={() => {
                void command.run();
                setTableContextMenu(null);
              }}
            >
              {command.title}
            </button>
          ))}
          <div className="table-context-separator" role="separator" />
          <div className="table-context-submenu">
            <button type="button" role="menuitem" aria-haspopup="menu">
              Align column...
            </button>
            <div className="table-context-submenu-panel" role="menu" aria-label="Align column">
              {(["left", "center", "right"] as const).map((alignment) => (
                <button
                  key={alignment}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    alignCurrentTableColumn(tableContextEditor, alignment);
                    setTableContextMenu(null);
                  }}
                >
                  {alignment === "left"
                    ? "Left align"
                    : alignment === "center"
                      ? "Center align"
                      : "Right align"}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {folderContextMenu ? (
        <VaultContextMenu
          menu={folderContextMenu}
          isCanvasFile={isCanvasPath}
          onAction={openFolderActionDialog}
          onReveal={(entry) => void revealEntryFromContextMenu(entry)}
        />
      ) : null}
      {folderActionDialog ? (
        <div
          className="folder-action-dialog-screen"
          role="presentation"
          onMouseDown={() => setFolderActionDialog(null)}
        >
          <form
            className="folder-action-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label={folderActionDialogTitle(
              folderActionDialog.action,
              isCanvasPath(folderActionDialog.entry.relativePath),
            )}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => void submitFolderActionDialog(event)}
          >
            <div className="folder-action-dialog-header">
              <h2>
                {folderActionDialogTitle(
                  folderActionDialog.action,
                  isCanvasPath(folderActionDialog.entry.relativePath),
                )}
              </h2>
              <span>{folderActionDialog.entry.relativePath}</span>
            </div>
            {folderActionDialog.action === "delete-file" ? (
              <p className="folder-action-dialog-warning">
                Delete this file from the vault? This cannot be undone.
              </p>
            ) : isMoveAction(folderActionDialog.action) && vaultRoot ? (
              <VaultFolderTree
                key={`${folderActionDialog.action}:${folderActionDialog.entry.relativePath}`}
                root={vaultRoot}
                selectedPath={folderActionDialog.value}
                showFilePreviews={savedFileDisplaySettings().showFilePreviewsInFolderTree}
                showPreviewImages={savedFileDisplaySettings().showImagesInFilePreviews}
                showFiles={savedFileDisplaySettings().showFilesInFolderTree}
                movingEntry={
                  folderActionDialog.action === "move-folder" ? folderActionDialog.entry : null
                }
                onStatus={setStatus}
                onSelect={(relativePath) =>
                  setFolderActionDialog((dialog) =>
                    dialog ? { ...dialog, value: relativePath } : dialog,
                  )
                }
              />
            ) : (
              <label>
                <span>
                  {folderActionDialogLabel(
                    folderActionDialog.action,
                    isCanvasPath(folderActionDialog.entry.relativePath),
                  )}
                </span>
                <input
                  autoFocus
                  spellCheck="false"
                  value={folderActionDialog.value}
                  onChange={(event) => {
                    const value = event.currentTarget.value;

                    setFolderActionDialog((dialog) =>
                      dialog ? { ...dialog, value } : dialog,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setFolderActionDialog(null);
                    }
                  }}
                />
              </label>
            )}
            <div className="folder-action-dialog-actions">
              <button
                className="inline-action"
                type="button"
                onClick={() => setFolderActionDialog(null)}
              >
                Cancel
              </button>
              <button
                className="inline-action"
                disabled={
                  folderActionDialog.action !== "delete-file" &&
                  !isMoveAction(folderActionDialog.action) &&
                  !folderActionDialog.value.trim()
                }
                type="submit"
              >
                {folderActionDialogTitle(
                  folderActionDialog.action,
                  isCanvasPath(folderActionDialog.entry.relativePath),
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {normalizedVaultAppearanceDraft.statusBarVisible ? (
        <footer className="statusbar" key={status}>
          {status}
        </footer>
      ) : null}
    </main>
  );
}

export default App;
