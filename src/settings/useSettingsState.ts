import { useState } from "react";
import { defaultVaultAssetDirectory } from "../lib/defaults";
import type {
  AiSettings,
  AutosaveSettings,
  CanvasSettings,
  CssSnippetContent,
  CssSnippetFile,
  CssSnippetSettings,
  DebugSettings,
  EditorBehaviorSettings,
  FileDisplaySettings,
  FrontmatterPillSettings,
  PluginCatalog,
  PluginSettings,
  PluginStyleContent,
  SettingsDragState,
  SettingsTab,
  TidbitSettings,
  VaultAppearanceSettings,
  VaultSettings,
  VaultThemeCalloutSettings,
  VaultThemeOptions,
} from "../lib/app-types";
import {
  defaultAiSettings,
  defaultAutosaveSettings,
  defaultCanvasSettings,
  defaultCssSnippetSettings,
  defaultDebugSettings,
  defaultEditorBehaviorSettings,
  defaultFileDisplaySettings,
  defaultFrontmatterPillSettings,
  defaultNewTabFile,
  defaultPluginSettings,
  defaultStarredFiles,
  defaultTidbitSettings,
  defaultVaultAppearanceSettings,
} from "../lib/settings";
import {
  defaultThemeCalloutSettings,
  defaultThemeOptions,
} from "./theme-options";

export function useSettingsState() {
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>({
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
  const [settingsDraft, setSettingsDraft] = useState(defaultVaultAssetDirectory);
  const [newTabFileDraft, setNewTabFileDraft] = useState(defaultNewTabFile);
  const [frontmatterPillDraft, setFrontmatterPillDraft] = useState<FrontmatterPillSettings>(
    defaultFrontmatterPillSettings,
  );
  const [editorBehaviorDraft, setEditorBehaviorDraft] = useState<EditorBehaviorSettings>(
    defaultEditorBehaviorSettings,
  );
  const [editorBehavior, setEditorBehavior] = useState<EditorBehaviorSettings>(
    defaultEditorBehaviorSettings,
  );
  const [fileDisplayDraft, setFileDisplayDraft] =
    useState<FileDisplaySettings>(defaultFileDisplaySettings);
  const [autosaveDraft, setAutosaveDraft] = useState<AutosaveSettings>(defaultAutosaveSettings);
  const [autosaveSettings, setAutosaveSettings] =
    useState<AutosaveSettings>(defaultAutosaveSettings);
  const [tidbitDraft, setTidbitDraft] = useState<TidbitSettings>(defaultTidbitSettings);
  const [tidbitSettings, setTidbitSettings] = useState<TidbitSettings>(defaultTidbitSettings);
  const [debugDraft, setDebugDraft] = useState<DebugSettings>(defaultDebugSettings);
  const [vaultAppearanceDraft, setVaultAppearanceDraft] =
    useState<VaultAppearanceSettings>(defaultVaultAppearanceSettings);
  const [cssSnippetDraft, setCssSnippetDraft] =
    useState<CssSnippetSettings>(defaultCssSnippetSettings);
  const [cssSnippetFiles, setCssSnippetFiles] = useState<CssSnippetFile[]>([]);
  const [cssSnippetContents, setCssSnippetContents] = useState<CssSnippetContent[]>([]);
  const [pluginDraft, setPluginDraft] = useState<PluginSettings>(defaultPluginSettings);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>({ plugins: [], errors: [] });
  const [pluginStyles, setPluginStyles] = useState<PluginStyleContent[]>([]);
  const [aiDraft, setAiDraft] = useState<AiSettings>(defaultAiSettings);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState<"success" | "error" | null>(null);
  const [canvasDraft, setCanvasDraft] = useState<CanvasSettings>(defaultCanvasSettings);
  const [selectedThemePresetIdDraft, setSelectedThemePresetIdDraft] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<Record<string, string>>({});
  const [themeOptionsDraft, setThemeOptionsDraft] =
    useState<VaultThemeOptions>(defaultThemeOptions);
  const [themeCalloutDraft, setThemeCalloutDraft] =
    useState<VaultThemeCalloutSettings>(defaultThemeCalloutSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("main");
  const [settingsOffset, setSettingsOffset] = useState({ x: 0, y: 0 });
  const [settingsDragging, setSettingsDragging] = useState<SettingsDragState | null>(null);

  return {
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
  };
}
