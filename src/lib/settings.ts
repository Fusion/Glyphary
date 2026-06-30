/**
 * Vault settings defaults and normalizers.
 *
 * Responsibilities:
 * - Provide one canonical source for frontend defaults that also appear in
 *   persisted `.glyphary/config.json` data.
 * - Sanitize user-editable settings before they influence rendering, storage,
 *   plugins, shortcuts, or filesystem paths.
 *
 * Contracts:
 * - Normalizers must be tolerant of missing and hand-edited settings files.
 * - Equality helpers compare normalized values so callers can avoid rewriting
 *   settings when only invalid or default-equivalent data changed.
 * - Browser-only helpers are intentionally small; the rest of this module stays
 *   pure enough for direct unit coverage through the frontend logic barrel.
 */

import {
  defaultAiBaseUrl,
  defaultAiModel,
  defaultFrontmatterPillHeader,
  defaultTidbitGlobalShortcut,
  defaultTidbitPathPattern,
} from "./defaults.js";
import { isMacOsPlatform } from "./platform.js";
import type {
  AiSettings,
  AppearanceMode,
  AutosaveSettings,
  CanvasSettings,
  CssSnippetSettings,
  DebugSettings,
  EditorBehaviorSettings,
  FileDisplaySettings,
  FrontmatterPillSettings,
  PersistedWorkspace,
  PluginSettings,
  TidbitSettings,
  VaultAppearanceSettings,
} from "./app-types.js";

export const workspaceStorageKey = "glyphary.workspace";
export const appearanceStorageKey = "glyphary.appearance";
export const closedDrawerWidth = 48;
export const workspaceResizeHandleWidth = 10;
export const defaultCssSnippetDirectory = "_snippets_";
export const defaultGlassOpacity = 0.58;
export const minimumGlassOpacity = 0.24;
export const maximumGlassOpacity = 0.9;
export const minimumCanvasNodeBorderWidth = 0;
export const maximumCanvasNodeBorderWidth = 6;
export const minimumCanvasEdgeThickness = 0.5;
export const maximumCanvasEdgeThickness = 8;
export const minimumCalendarPreviewDelayMs = 0;
export const maximumCalendarPreviewDelayMs = 5000;

export const defaultFrontmatterPillSettings: FrontmatterPillSettings = {
  enabled: true,
  headerName: defaultFrontmatterPillHeader,
};

export const defaultEditorBehaviorSettings: EditorBehaviorSettings = {
  calendarPreviewDelayMs: 2000,
  vimMode: false,
};

export const defaultFileDisplaySettings: FileDisplaySettings = {
  showFilesInFolderTree: false,
  showFolderTreeBackground: false,
  showFilePreviewsInFolderTree: true,
  showImagesInFilePreviews: true,
  baseCardImageLayout: "side",
  showDotfiles: false,
};

export const defaultAutosaveSettings: AutosaveSettings = {
  enabled: true,
};

export const defaultDebugSettings: DebugSettings = {
  enabled: false,
};

export const defaultTidbitSettings: TidbitSettings = {
  pathPattern: defaultTidbitPathPattern,
  globalShortcutEnabled: false,
  globalShortcut: defaultTidbitGlobalShortcut,
};

export const defaultVaultAppearanceSettings: VaultAppearanceSettings = {
  glassEffect: false,
  glassOpacity: defaultGlassOpacity,
  statusBarVisible: true,
  sectionCorners: "rounded",
  workspaceMargin: "comfortable",
  uiFontWeight: "regular",
};

export const defaultCanvasSettings: CanvasSettings = {
  nodeBorderWidth: 1,
  edgeThickness: 2.5,
  edgeStyle: "curved",
  showGrid: true,
  showNavigationPreview: true,
  snapToGrid: false,
};

export const defaultCssSnippetSettings: CssSnippetSettings = {
  directory: defaultCssSnippetDirectory,
  enabled: [],
};

export const defaultPluginSettings: PluginSettings = {
  enabled: [],
};

export const defaultAiSettings: AiSettings = {
  enabled: false,
  baseUrl: defaultAiBaseUrl,
  model: defaultAiModel,
  apiKey: "",
};
export const defaultNewTabFile = "";
export const defaultStarredFiles: string[] = [];

export function readPersistedWorkspace() {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;

    if (typeof parsed.vaultRoot !== "string" || !parsed.vaultRoot) {
      return null;
    }

    const readFiles = (files: unknown) =>
      Array.isArray(files)
        ? files
            .filter(
              (file): file is PersistedWorkspace["recentFiles"][number] =>
                file &&
                typeof file.name === "string" &&
                typeof file.relativePath === "string",
            )
            .slice(0, 20)
        : [];

    return {
      vaultRoot: parsed.vaultRoot,
      currentDir: typeof parsed.currentDir === "string" ? parsed.currentDir : "",
      activeFile:
        parsed.activeFile &&
        typeof parsed.activeFile.name === "string" &&
        typeof parsed.activeFile.relativePath === "string"
          ? {
              name: parsed.activeFile.name,
              relativePath: parsed.activeFile.relativePath,
            }
          : null,
      openFiles: readFiles(parsed.openFiles),
      recentFiles: readFiles(parsed.recentFiles),
    };
  } catch {
    return null;
  }
}

export function writePersistedWorkspace(workspace: PersistedWorkspace) {
  window.localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
}

export function readPersistedAppearance(): AppearanceMode {
  const stored = window.localStorage.getItem(appearanceStorageKey);

  return stored === "light" || stored === "dark" || stored === "auto"
    ? stored
    : "auto";
}

export function writePersistedAppearance(appearance: AppearanceMode) {
  window.localStorage.setItem(appearanceStorageKey, appearance);
}

function sameNormalizedSettings<Settings, Normalized>(
  normalize: (settings: Settings | undefined | null) => Normalized,
  left: Settings | undefined | null,
  right: Settings | undefined | null,
) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function normalizeFrontmatterPillSettings(
  settings: FrontmatterPillSettings | undefined | null,
) {
  return {
    enabled: settings?.enabled ?? defaultFrontmatterPillSettings.enabled,
    headerName:
      settings?.headerName?.trim() || defaultFrontmatterPillSettings.headerName,
  };
}

export function sameFrontmatterPillSettings(
  left: FrontmatterPillSettings | undefined | null,
  right: FrontmatterPillSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeFrontmatterPillSettings, left, right);
}

export function normalizeEditorBehaviorSettings(
  settings: EditorBehaviorSettings | undefined | null,
) {
  const delay = Number(settings?.calendarPreviewDelayMs);

  return {
    calendarPreviewDelayMs: Number.isFinite(delay)
      ? Math.min(
          maximumCalendarPreviewDelayMs,
          Math.max(minimumCalendarPreviewDelayMs, Math.round(delay)),
        )
      : defaultEditorBehaviorSettings.calendarPreviewDelayMs,
    vimMode: settings?.vimMode ?? defaultEditorBehaviorSettings.vimMode,
  };
}

export function sameEditorBehaviorSettings(
  left: EditorBehaviorSettings | undefined | null,
  right: EditorBehaviorSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeEditorBehaviorSettings, left, right);
}

export function normalizeFileDisplaySettings(
  settings: FileDisplaySettings | undefined | null,
): FileDisplaySettings {
  const baseCardImageLayout: FileDisplaySettings["baseCardImageLayout"] =
    settings?.baseCardImageLayout === "top" ? "top" : "side";

  return {
    showFilesInFolderTree:
      settings?.showFilesInFolderTree ?? defaultFileDisplaySettings.showFilesInFolderTree,
    showFolderTreeBackground:
      settings?.showFolderTreeBackground ??
      defaultFileDisplaySettings.showFolderTreeBackground,
    showFilePreviewsInFolderTree:
      settings?.showFilePreviewsInFolderTree ??
      defaultFileDisplaySettings.showFilePreviewsInFolderTree,
    showImagesInFilePreviews:
      settings?.showImagesInFilePreviews ?? defaultFileDisplaySettings.showImagesInFilePreviews,
    baseCardImageLayout,
    showDotfiles: settings?.showDotfiles ?? defaultFileDisplaySettings.showDotfiles,
  };
}

export function sameFileDisplaySettings(
  left: FileDisplaySettings | undefined | null,
  right: FileDisplaySettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeFileDisplaySettings, left, right);
}

export function normalizeAutosaveSettings(settings: AutosaveSettings | undefined | null) {
  return {
    enabled: settings?.enabled ?? defaultAutosaveSettings.enabled,
  };
}

export function sameAutosaveSettings(
  left: AutosaveSettings | undefined | null,
  right: AutosaveSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeAutosaveSettings, left, right);
}

export function normalizeDebugSettings(settings: DebugSettings | undefined | null) {
  return {
    enabled: settings?.enabled ?? defaultDebugSettings.enabled,
  };
}

export function sameDebugSettings(
  left: DebugSettings | undefined | null,
  right: DebugSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeDebugSettings, left, right);
}

export function normalizeTidbitSettings(settings: TidbitSettings | undefined | null) {
  return {
    pathPattern: settings?.pathPattern?.trim() || defaultTidbitSettings.pathPattern,
    globalShortcutEnabled:
      settings?.globalShortcutEnabled ?? defaultTidbitSettings.globalShortcutEnabled,
    globalShortcut: settings?.globalShortcut?.trim() || defaultTidbitSettings.globalShortcut,
  };
}

export function sameTidbitSettings(
  left: TidbitSettings | undefined | null,
  right: TidbitSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeTidbitSettings, left, right);
}

export function normalizeNewTabFile(value: string | undefined | null) {
  return value?.trim().replace(/^\/+/, "") ?? defaultNewTabFile;
}

export function sameNewTabFile(left: string | undefined | null, right: string | undefined | null) {
  return normalizeNewTabFile(left) === normalizeNewTabFile(right);
}

export function normalizeStarredFiles(files: string[] | undefined | null) {
  const seen = new Set<string>();

  return (files ?? [])
    .map((file) => normalizeNewTabFile(file))
    .filter((file) => !file.split(/[\\/]+/).some((part) => part === "." || part === ".."))
    .filter((file) => /\.(md|markdown)$/i.test(file))
    .filter((file) => {
      if (seen.has(file)) {
        return false;
      }

      seen.add(file);
      return true;
    });
}

export type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export function shortcutKeyFromEvent(event: ShortcutKeyboardEvent) {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape"].includes(event.key)) {
    return "";
  }

  if (event.code.startsWith("Key")) {
    return event.code.replace("Key", "").toUpperCase();
  }

  if (event.code.startsWith("Digit")) {
    return event.code.replace("Digit", "");
  }

  if (event.code.startsWith("F") && /^F\d{1,2}$/.test(event.code)) {
    return event.code;
  }

  const specialKeys: Record<string, string> = {
    Backspace: "Backspace",
    Delete: "Delete",
    Enter: "Enter",
    Equal: "Equal",
    Minus: "Minus",
    Period: "Period",
    Slash: "Slash",
    Space: "Space",
  };

  return specialKeys[event.code] ?? "";
}

export function shortcutFromKeyboardEvent(event: ShortcutKeyboardEvent) {
  const key = shortcutKeyFromEvent(event);

  if (!key) {
    return "";
  }

  const modifiers = isRunningOnMacOs()
    ? [
        event.metaKey ? "Command" : "",
        event.ctrlKey ? "Control" : "",
        event.altKey ? "Alt" : "",
        event.shiftKey ? "Shift" : "",
      ].filter(Boolean)
    : [
        event.metaKey || event.ctrlKey ? "CommandOrControl" : "",
        event.altKey ? "Alt" : "",
        event.shiftKey ? "Shift" : "",
      ].filter(Boolean);

  return [...modifiers, key].join("+");
}

export function keyboardEventMatchesShortcut(event: ShortcutKeyboardEvent, shortcut: string) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1);

  if (!key || shortcutKeyFromEvent(event).toUpperCase() !== key.toUpperCase()) {
    return false;
  }

  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toUpperCase()));
  const expectsCommandOrControl = [
    "COMMANDORCONTROL",
    "COMMANDORCTRL",
    "CMDORCONTROL",
    "CMDORCTRL",
  ].some((modifier) => modifiers.has(modifier));
  const expectsCommand = ["COMMAND", "CMD", "SUPER"].some((modifier) => modifiers.has(modifier));
  const expectsControl = ["CONTROL", "CTRL"].some((modifier) => modifiers.has(modifier));
  const expectsAlt = modifiers.has("ALT") || modifiers.has("OPTION");
  const expectsShift = modifiers.has("SHIFT");

  if (expectsCommandOrControl) {
    if (isRunningOnMacOs()) {
      if (!event.metaKey || event.ctrlKey) {
        return false;
      }
    } else if (!event.metaKey && !event.ctrlKey) {
      return false;
    }
  } else if (event.metaKey !== expectsCommand || event.ctrlKey !== expectsControl) {
    return false;
  }

  return event.altKey === expectsAlt && event.shiftKey === expectsShift;
}

export function isRunningOnMacOs() {
  return isMacOsPlatform(window.navigator.platform, window.navigator.userAgent);
}

export function normalizeVaultAppearanceSettings(
  settings: VaultAppearanceSettings | undefined | null,
) {
  const glassOpacity =
    typeof settings?.glassOpacity === "number" && Number.isFinite(settings.glassOpacity)
      ? Math.min(maximumGlassOpacity, Math.max(minimumGlassOpacity, settings.glassOpacity))
      : defaultVaultAppearanceSettings.glassOpacity;
  const sectionCorners =
    settings?.sectionCorners === "square" || settings?.sectionCorners === "rounded"
      ? settings.sectionCorners
      : defaultVaultAppearanceSettings.sectionCorners;
  const workspaceMargin =
    settings?.workspaceMargin === "compact" ||
    settings?.workspaceMargin === "comfortable" ||
    settings?.workspaceMargin === "spacious"
      ? settings.workspaceMargin
      : defaultVaultAppearanceSettings.workspaceMargin;
  const uiFontWeight =
    settings?.uiFontWeight === "regular" ||
    settings?.uiFontWeight === "medium" ||
    settings?.uiFontWeight === "bold"
      ? settings.uiFontWeight
      : defaultVaultAppearanceSettings.uiFontWeight;

  return {
    glassEffect: settings?.glassEffect ?? defaultVaultAppearanceSettings.glassEffect,
    glassOpacity,
    statusBarVisible:
      settings?.statusBarVisible ?? defaultVaultAppearanceSettings.statusBarVisible,
    sectionCorners,
    workspaceMargin,
    uiFontWeight,
  };
}

export function sameVaultAppearanceSettings(
  left: VaultAppearanceSettings | undefined | null,
  right: VaultAppearanceSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeVaultAppearanceSettings, left, right);
}

export function normalizeCanvasSettings(settings: CanvasSettings | undefined | null) {
  const nodeBorderWidth =
    typeof settings?.nodeBorderWidth === "number" && Number.isFinite(settings.nodeBorderWidth)
      ? Math.min(
          maximumCanvasNodeBorderWidth,
          Math.max(minimumCanvasNodeBorderWidth, settings.nodeBorderWidth),
        )
      : defaultCanvasSettings.nodeBorderWidth;
  const edgeThickness =
    typeof settings?.edgeThickness === "number" && Number.isFinite(settings.edgeThickness)
      ? Math.min(
          maximumCanvasEdgeThickness,
          Math.max(minimumCanvasEdgeThickness, settings.edgeThickness),
        )
      : defaultCanvasSettings.edgeThickness;
  const edgeStyle =
    settings?.edgeStyle === "straight" ||
    settings?.edgeStyle === "curved" ||
    settings?.edgeStyle === "stepped"
      ? settings.edgeStyle
      : defaultCanvasSettings.edgeStyle;

  return {
    nodeBorderWidth,
    edgeThickness,
    edgeStyle,
    showGrid: settings?.showGrid ?? defaultCanvasSettings.showGrid,
    showNavigationPreview:
      settings?.showNavigationPreview ?? defaultCanvasSettings.showNavigationPreview,
    snapToGrid: settings?.snapToGrid ?? defaultCanvasSettings.snapToGrid,
  };
}

export function sameCanvasSettings(
  left: CanvasSettings | undefined | null,
  right: CanvasSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeCanvasSettings, left, right);
}

export function cleanCssSnippetFileName(name: string) {
  const cleanName = name.trim();

  return /^[A-Za-z0-9_. -]+\.css$/.test(cleanName) && !cleanName.includes("..")
    ? cleanName
    : null;
}

export function normalizeCssSnippetSettings(settings: CssSnippetSettings | undefined | null) {
  const enabled = Array.from(
    new Set(
      (settings?.enabled ?? [])
        .map((name) => cleanCssSnippetFileName(name))
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort();

  return {
    directory: settings?.directory?.trim() || defaultCssSnippetSettings.directory,
    enabled,
  };
}

export function sameCssSnippetSettings(
  left: CssSnippetSettings | undefined | null,
  right: CssSnippetSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeCssSnippetSettings, left, right);
}

export function cleanPluginId(id: string) {
  const cleanId = id.trim();

  return /^[A-Za-z0-9_-]{1,80}$/.test(cleanId) ? cleanId : null;
}

export function normalizePluginSettings(settings: PluginSettings | undefined | null) {
  const enabled = Array.from(
    new Set(
      (settings?.enabled ?? [])
        .map((id) => cleanPluginId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  ).sort();

  return { enabled };
}

export function samePluginSettings(
  left: PluginSettings | undefined | null,
  right: PluginSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizePluginSettings, left, right);
}

export function normalizeAiSettings(settings: AiSettings | undefined | null) {
  return {
    enabled: settings?.enabled ?? defaultAiSettings.enabled,
    baseUrl: settings?.baseUrl?.trim().replace(/\/+$/, "") || defaultAiSettings.baseUrl,
    model: settings?.model?.trim() || defaultAiSettings.model,
    apiKey: settings?.apiKey?.trim() || "",
  };
}

export function sameAiSettings(
  left: AiSettings | undefined | null,
  right: AiSettings | undefined | null,
) {
  return sameNormalizedSettings(normalizeAiSettings, left, right);
}

export function resolveAppearance(appearance: AppearanceMode): Exclude<AppearanceMode, "auto"> {
  if (appearance === "light" || appearance === "dark") {
    return appearance;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function cssColorToHex(value: string, fallback = "#000000") {
  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  if (!match) {
    return fallback;
  }

  return `#${[match[1], match[2], match[3]]
    .map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}
