import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import type {
  ActiveFile,
  AiSettings,
  AutosaveSettings,
  CanvasSettings,
  CssSnippetFile,
  CssSnippetSettings,
  DebugSettings,
  EditorBehaviorSettings,
  FileDisplaySettings,
  FrontmatterPillSettings,
  PluginCatalog,
  PluginSettings,
  SettingsDragState,
  SettingsTab,
  ThemePreset,
  TidbitSettings,
  TidbitShortcutStatus,
  VaultAppearanceSettings,
  VaultThemeCalloutSettings,
  VaultThemeOptions,
} from "../lib/app-types";
import {
  defaultAiBaseUrl,
  defaultFrontmatterPillHeader,
  defaultTidbitGlobalShortcut,
  defaultTidbitPathPattern,
  defaultVaultAssetDirectory,
} from "../lib/defaults";
import {
  defaultCssSnippetDirectory,
  defaultNewTabFile,
  maximumCalendarPreviewDelayMs,
  maximumGlassOpacity,
  minimumCalendarPreviewDelayMs,
  minimumGlassOpacity,
  normalizeAiSettings,
  normalizeCanvasSettings,
  normalizeCssSnippetSettings,
  normalizeEditorBehaviorSettings,
  normalizePluginSettings,
  normalizeVaultAppearanceSettings,
  isRunningOnMacOs,
} from "../lib/settings";
import { ThemeBuilderPanel } from "./ThemeBuilderPanel";

// ponytail: App still owns settings draft state; replace this wide prop bag only when settings state moves with it.
type SettingsDialogProps = {
  activeFile: ActiveFile | null;
  aiDraft: AiSettings;
  aiModelOptions: () => string[];
  aiModelsLoading: boolean;
  aiTestStatus: "success" | "error" | null;
  aiTesting: boolean;
  applyThemePreset: (preset: ThemePreset) => void;
  autosaveDraft: AutosaveSettings;
  chooseNewTabFile: () => void | Promise<void>;
  closeSettings: () => void;
  cssSnippetDraft: CssSnippetSettings;
  cssSnippetFiles: CssSnippetFile[];
  debugDraft: DebugSettings;
  editorBehaviorDraft: EditorBehaviorSettings;
  fileDisplayDraft: FileDisplaySettings;
  frontmatterPillDraft: FrontmatterPillSettings;
  moveSettingsDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  newTabFileDraft: string;
  normalizedCanvasDraft: CanvasSettings;
  normalizedVaultAppearanceDraft: VaultAppearanceSettings;
  pluginCatalog: PluginCatalog;
  pluginDraft: PluginSettings;
  refreshAiModels: () => Promise<void>;
  refreshCssSnippets: (vaultRoot: string, settings: CssSnippetSettings) => Promise<void>;
  refreshPlugins: (vaultRoot: string, settings: PluginSettings) => Promise<void>;
  requestTidbitShortcutAccessibilityPermission: () => boolean | Promise<boolean>;
  resetThemeDraft: () => void;
  revertSettingsDraft: () => void;
  saveVaultSettings: () => void | Promise<void>;
  selectedThemePresetIdDraft: string | null;
  setAutosaveDraft: Dispatch<SetStateAction<AutosaveSettings>>;
  setCanvasDraft: Dispatch<SetStateAction<CanvasSettings>>;
  setCssSnippetDraft: Dispatch<SetStateAction<CssSnippetSettings>>;
  setDebugDraft: Dispatch<SetStateAction<DebugSettings>>;
  setEditorBehaviorDraft: Dispatch<SetStateAction<EditorBehaviorSettings>>;
  setFileDisplayDraft: Dispatch<SetStateAction<FileDisplaySettings>>;
  setFrontmatterPillDraft: Dispatch<SetStateAction<FrontmatterPillSettings>>;
  setNewTabFileDraft: Dispatch<SetStateAction<string>>;
  setPluginDraft: Dispatch<SetStateAction<PluginSettings>>;
  setSettingsDraft: Dispatch<SetStateAction<string>>;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setThemeCalloutDraft: Dispatch<SetStateAction<VaultThemeCalloutSettings>>;
  setThemeOptionsDraft: Dispatch<SetStateAction<VaultThemeOptions>>;
  setTidbitDraft: Dispatch<SetStateAction<TidbitSettings>>;
  setVaultAppearanceDraft: Dispatch<SetStateAction<VaultAppearanceSettings>>;
  settingsCardStyle: CSSProperties;
  settingsDraft: string;
  settingsDragging: SettingsDragState | null;
  settingsHaveChanges: () => boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  shortcutFromKeyboardEvent: (event: KeyboardEvent<HTMLInputElement>) => string;
  startSettingsDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  stopSettingsDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  testAiConnection: () => void | Promise<void>;
  themeCalloutDraft: VaultThemeCalloutSettings;
  themeDraft: Record<string, string>;
  themeOptionsDraft: VaultThemeOptions;
  tidbitDraft: TidbitSettings;
  updateAiDraft: (nextSettings: AiSettings) => void;
  updateThemeDraftToken: (token: string, value: string) => void;
  vaultRoot: string;
};

export function SettingsDialog(props: SettingsDialogProps) {
  const {
    activeFile,
    aiDraft,
    aiModelOptions,
    aiModelsLoading,
    aiTestStatus,
    aiTesting,
    applyThemePreset,
    autosaveDraft,
    chooseNewTabFile,
    closeSettings,
    cssSnippetDraft,
    cssSnippetFiles,
    debugDraft,
    editorBehaviorDraft,
    fileDisplayDraft,
    frontmatterPillDraft,
    moveSettingsDrag,
    newTabFileDraft,
    normalizedCanvasDraft,
    normalizedVaultAppearanceDraft,
    pluginCatalog,
    pluginDraft,
    refreshAiModels,
    refreshCssSnippets,
    refreshPlugins,
    requestTidbitShortcutAccessibilityPermission,
    resetThemeDraft,
    revertSettingsDraft,
    saveVaultSettings,
    selectedThemePresetIdDraft,
    setAutosaveDraft,
    setCanvasDraft,
    setCssSnippetDraft,
    setDebugDraft,
    setEditorBehaviorDraft,
    setFileDisplayDraft,
    setFrontmatterPillDraft,
    setNewTabFileDraft,
    setPluginDraft,
    setSettingsDraft,
    setSettingsTab,
    setStatus,
    setThemeCalloutDraft,
    setThemeOptionsDraft,
    setTidbitDraft,
    setVaultAppearanceDraft,
    settingsCardStyle,
    settingsDraft,
    settingsDragging,
    settingsHaveChanges,
    settingsOpen,
    settingsTab,
    shortcutFromKeyboardEvent,
    startSettingsDrag,
    stopSettingsDrag,
    testAiConnection,
    themeCalloutDraft,
    themeDraft,
    themeOptionsDraft,
    tidbitDraft,
    updateAiDraft,
    updateThemeDraftToken,
    vaultRoot,
  } = props;

  if (!settingsOpen) {
    return null;
  }

  return (
      <div className="settings-screen" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-card" style={settingsCardStyle}>
          <div
            className={settingsDragging ? "settings-header dragging" : "settings-header"}
            onPointerCancel={stopSettingsDrag}
            onPointerDown={startSettingsDrag}
            onPointerMove={moveSettingsDrag}
            onPointerUp={stopSettingsDrag}
          >
            <div>
              <h2>Settings</h2>
              <span>{vaultRoot ? "Current vault" : "No vault open"}</span>
            </div>
            <button
              className="inline-action"
              type="button"
              aria-label="Close settings"
              onClick={closeSettings}
            >
              Close
            </button>
          </div>
          <div className="settings-panel">
            <div className="settings-tabs" role="tablist" aria-label="Settings groups">
              <button
                className={settingsTab === "main" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={settingsTab === "main"}
                onClick={() => setSettingsTab("main")}
              >
                Main
              </button>
              <button
                className={settingsTab === "appearance" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={settingsTab === "appearance"}
                onClick={() => setSettingsTab("appearance")}
              >
                Appearance
              </button>
              <button
                className={settingsTab === "canvas" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={settingsTab === "canvas"}
                onClick={() => setSettingsTab("canvas")}
              >
                Canvas
              </button>
              <button
                className={settingsTab === "plugins" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={settingsTab === "plugins"}
                onClick={() => setSettingsTab("plugins")}
              >
                Plugins
              </button>
              <button
                className={settingsTab === "ai" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={settingsTab === "ai"}
                onClick={() => setSettingsTab("ai")}
              >
                AI
              </button>
              <button
                className={settingsTab === "debug" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={settingsTab === "debug"}
                onClick={() => setSettingsTab("debug")}
              >
                Debug
              </button>
            </div>
            {settingsTab === "main" ? (
              <div className="settings-tab-panel" role="tabpanel" aria-label="Main settings">
                <section className="settings-section" aria-label="Vault settings">
                  <h3>Vault</h3>
                  <label>
                    <span>Asset directory</span>
                    <input
                      disabled={!vaultRoot}
                      value={settingsDraft}
                      onChange={(event) => setSettingsDraft(event.currentTarget.value)}
                      placeholder={defaultVaultAssetDirectory}
                    />
                  </label>
                  <label>
                    <span>New Tab</span>
                    <div className="shortcut-capture-control">
                      <input
                        disabled={!vaultRoot}
                        value={newTabFileDraft}
                        onChange={(event) => setNewTabFileDraft(event.currentTarget.value)}
                        placeholder="No file selected"
                      />
                      <button
                        type="button"
                        disabled={!vaultRoot}
                        onClick={() => void chooseNewTabFile()}
                      >
                        Choose...
                      </button>
                      <button
                        type="button"
                        disabled={!vaultRoot || !activeFile}
                        onClick={() => setNewTabFileDraft(activeFile?.relativePath ?? "")}
                      >
                        Current
                      </button>
                      <button
                        type="button"
                        disabled={!vaultRoot || !newTabFileDraft}
                        onClick={() => setNewTabFileDraft(defaultNewTabFile)}
                      >
                        Clear
                      </button>
                    </div>
                    <small>Cmd+T opens this vault file in the active pane.</small>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={fileDisplayDraft.showDotfiles}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;

                        setFileDisplayDraft((settings) => ({
                          ...settings,
                          showDotfiles: checked,
                        }));
                      }}
                    />
                    <span>Show dotfiles and dot folders</span>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={fileDisplayDraft.showFilesInFolderTree}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;

                        setFileDisplayDraft((settings) => ({
                          ...settings,
                          showFilesInFolderTree: checked,
                        }));
                      }}
                    />
                    <span>Show files in folder trees</span>
                  </label>
                  <label className="settings-check-control settings-sub-check-control">
                    <input
                      checked={fileDisplayDraft.showFolderTreeBackground}
                      disabled={!vaultRoot || !fileDisplayDraft.showFilesInFolderTree}
                      type="checkbox"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;

                        setFileDisplayDraft((settings) => ({
                          ...settings,
                          showFolderTreeBackground: checked,
                        }));
                      }}
                    />
                    <span>Show folder tree background</span>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={fileDisplayDraft.showFilePreviewsInFolderTree}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;

                        setFileDisplayDraft((settings) => ({
                          ...settings,
                          showFilePreviewsInFolderTree: checked,
                        }));
                      }}
                    />
                    <span>Show file previews</span>
                  </label>
                  <label className="settings-check-control settings-sub-check-control">
                    <input
                      checked={fileDisplayDraft.showImagesInFilePreviews}
                      disabled={!vaultRoot || !fileDisplayDraft.showFilePreviewsInFolderTree}
                      type="checkbox"
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;

                        setFileDisplayDraft((settings) => ({
                          ...settings,
                          showImagesInFilePreviews: checked,
                        }));
                      }}
                    />
                    <span>Show images in file previews</span>
                  </label>
                  <label>
                    <span>Base card image layout</span>
                    <select
                      disabled={!vaultRoot}
                      value={fileDisplayDraft.baseCardImageLayout}
                      onChange={(event) => {
                        const baseCardImageLayout =
                          event.currentTarget.value === "top" ? "top" : "side";

                        setFileDisplayDraft((settings) => ({
                          ...settings,
                          baseCardImageLayout,
                        }));
                      }}
                    >
                      <option value="side">Side</option>
                      <option value="top">Top</option>
                    </select>
                  </label>
                  <label>
                    <span>Tidbit path pattern</span>
                    <input
                      disabled={!vaultRoot}
                      value={tidbitDraft.pathPattern}
                      onChange={(event) => {
                        const pathPattern = event.currentTarget.value;

                        setTidbitDraft((settings) => ({
                          ...settings,
                          pathPattern,
                        }));
                      }}
                      placeholder={defaultTidbitPathPattern}
                    />
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={tidbitDraft.globalShortcutEnabled}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const globalShortcutEnabled = event.currentTarget.checked;

                        setTidbitDraft((settings) => ({
                          ...settings,
                          globalShortcutEnabled,
                        }));

                        if (globalShortcutEnabled) {
                          void requestTidbitShortcutAccessibilityPermission();
                          setStatus("Save Settings to activate global tidbit capture");
                        }
                      }}
                    />
                    <span>Enable global tidbit capture shortcut</span>
                  </label>
                  <label>
                    <span>Global tidbit shortcut</span>
                    <div className="shortcut-capture-control">
                      <input
                        aria-describedby="global-tidbit-shortcut-hint"
                        disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled}
                        readOnly
                        value={tidbitDraft.globalShortcut}
                        onKeyDown={(event) => {
                          const globalShortcut = shortcutFromKeyboardEvent(event);

                          event.preventDefault();
                          event.stopPropagation();

                          if (!globalShortcut) {
                            return;
                          }

                          setTidbitDraft((settings) => ({
                            ...settings,
                            globalShortcut,
                          }));
                        }}
                        placeholder={defaultTidbitGlobalShortcut}
                      />
                      <button
                        type="button"
                        disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled}
                        onClick={() =>
                          setTidbitDraft((settings) => ({
                            ...settings,
                            globalShortcut: defaultTidbitGlobalShortcut,
                          }))
                        }
                      >
                        Reset
                      </button>
                    </div>
                    <small id="global-tidbit-shortcut-hint">
                      Focus the field and press the shortcut you want to use. Save Settings to activate it.
                    </small>
                  </label>
                </section>
                <section className="settings-section" aria-label="Metadata settings">
                  <div className="settings-section-header">
                    <div>
                      <h3>Metadata</h3>
                      <p>Choose whether a frontmatter list is shown as pills above the editor.</p>
                    </div>
                  </div>
                  <label className="settings-check-control">
                    <input
                      checked={frontmatterPillDraft.enabled}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;

                        setFrontmatterPillDraft((settings) => ({
                          ...settings,
                          enabled,
                        }));
                      }}
                    />
                    <span>Show frontmatter pills</span>
                  </label>
                  <label>
                    <span>Pill header name</span>
                    <input
                      disabled={!vaultRoot || !frontmatterPillDraft.enabled}
                      value={frontmatterPillDraft.headerName}
                      onChange={(event) => {
                        const headerName = event.currentTarget.value;

                        setFrontmatterPillDraft((settings) => ({
                          ...settings,
                          headerName,
                        }));
                      }}
                      placeholder={defaultFrontmatterPillHeader}
                    />
                  </label>
                </section>
                <section className="settings-section" aria-label="Editor settings">
                  <div className="settings-section-header">
                    <div>
                      <h3>Editor</h3>
                      <p>Choose editor input behavior for this vault.</p>
                    </div>
                  </div>
                  <label className="settings-check-control">
                    <input
                      checked={editorBehaviorDraft.vimMode}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) =>
                        setEditorBehaviorDraft((settings) => ({
                          ...settings,
                          vimMode: event.currentTarget.checked,
                        }))
                      }
                    />
                    <span>Use Vim keybindings</span>
                  </label>
                  <label>
                    <span>Calendar preview delay</span>
                    <input
                      disabled={!vaultRoot}
                      type="number"
                      min={minimumCalendarPreviewDelayMs}
                      max={maximumCalendarPreviewDelayMs}
                      step={100}
                      value={editorBehaviorDraft.calendarPreviewDelayMs}
                      onChange={(event) => {
                        const calendarPreviewDelayMs = Number(event.currentTarget.value);

                        setEditorBehaviorDraft((settings) =>
                          normalizeEditorBehaviorSettings({
                            ...settings,
                            calendarPreviewDelayMs,
                          }),
                        );
                      }}
                    />
                    <small>Milliseconds to wait before showing calendar note previews.</small>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={autosaveDraft.enabled}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) =>
                        setAutosaveDraft({
                          enabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>Autosave current page once per minute</span>
                  </label>
                </section>
              </div>
            ) : null}
            {settingsTab === "canvas" ? (
              <div className="settings-tab-panel" role="tabpanel" aria-label="Canvas settings">
                <section className="settings-section" aria-label="Canvas rendering settings">
                  <div className="settings-section-header">
                    <div>
                      <h3>Canvas</h3>
                      <p>Tune JSON Canvas rendering and interaction for this vault.</p>
                    </div>
                  </div>
                  <label className="settings-range-control">
                    <span>
                      Node border thickness
                      <strong>{normalizedCanvasDraft.nodeBorderWidth.toFixed(1)}px</strong>
                    </span>
                    <input
                      aria-label="Canvas node border thickness"
                      disabled={!vaultRoot}
                      max="6"
                      min="0"
                      step="0.5"
                      type="range"
                      value={normalizedCanvasDraft.nodeBorderWidth}
                      onChange={(event) => {
                        const nodeBorderWidth = Number(event.currentTarget.value);
                        setCanvasDraft((settings) => ({
                          ...normalizeCanvasSettings(settings),
                          nodeBorderWidth,
                        }));
                      }}
                    />
                  </label>
                  <label className="settings-range-control">
                    <span>
                      Edge thickness
                      <strong>{normalizedCanvasDraft.edgeThickness.toFixed(1)}px</strong>
                    </span>
                    <input
                      aria-label="Canvas edge thickness"
                      disabled={!vaultRoot}
                      max="8"
                      min="0.5"
                      step="0.5"
                      type="range"
                      value={normalizedCanvasDraft.edgeThickness}
                      onChange={(event) => {
                        const edgeThickness = Number(event.currentTarget.value);
                        setCanvasDraft((settings) => ({
                          ...normalizeCanvasSettings(settings),
                          edgeThickness,
                        }));
                      }}
                    />
                  </label>
                  <label className="settings-field compact-field">
                    <span>Edge style</span>
                    <select
                      disabled={!vaultRoot}
                      value={normalizedCanvasDraft.edgeStyle}
                      onChange={(event) => {
                        const edgeStyle = event.currentTarget
                          .value as CanvasSettings["edgeStyle"];
                        setCanvasDraft((settings) => ({
                          ...normalizeCanvasSettings(settings),
                          edgeStyle,
                        }));
                      }}
                    >
                      <option value="curved">Curved</option>
                      <option value="straight">Straight</option>
                      <option value="stepped">Stepped</option>
                    </select>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={normalizedCanvasDraft.showGrid}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const showGrid = event.currentTarget.checked;
                        setCanvasDraft((settings) => ({
                          ...normalizeCanvasSettings(settings),
                          showGrid,
                        }));
                      }}
                    />
                    <span>Show canvas grid</span>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={normalizedCanvasDraft.snapToGrid}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const snapToGrid = event.currentTarget.checked;
                        setCanvasDraft((settings) => ({
                          ...normalizeCanvasSettings(settings),
                          snapToGrid,
                        }));
                      }}
                    />
                    <span>Snap moved nodes to grid</span>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={normalizedCanvasDraft.showNavigationPreview}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const showNavigationPreview = event.currentTarget.checked;
                        setCanvasDraft((settings) => ({
                          ...normalizeCanvasSettings(settings),
                          showNavigationPreview,
                        }));
                      }}
                    />
                    <span>Show preview/navigation box</span>
                  </label>
                </section>
              </div>
            ) : null}
            {settingsTab === "plugins" ? (
              <div className="settings-tab-panel" role="tabpanel" aria-label="Plugin settings">
                <section className="settings-section" aria-label="Plugin settings">
                  <div className="settings-section-header">
                    <div>
                      <h3>Plugins</h3>
                      <p>Enable vault plugins discovered under .glyphary/plugins.</p>
                    </div>
                    <button
                      className="inline-action"
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => {
                        void refreshPlugins(vaultRoot, pluginDraft).catch((error) => {
                          setStatus(error instanceof Error ? error.message : String(error));
                        });
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="plugin-list">
                    {pluginCatalog.plugins.length > 0 ? (
                      pluginCatalog.plugins.map((plugin) => {
                        const checked = pluginDraft.enabled.includes(plugin.id);

                        return (
                          <label className="settings-check-control plugin-control" key={plugin.id}>
                            <input
                              checked={checked}
                              disabled={!vaultRoot}
                              type="checkbox"
                              onChange={(event) => {
                                const enabled = event.currentTarget.checked;
                                const nextSettings = normalizePluginSettings({
                                  enabled: enabled
                                    ? [...pluginDraft.enabled, plugin.id]
                                    : pluginDraft.enabled.filter((id) => id !== plugin.id),
                                });

                                setPluginDraft(nextSettings);
                                void refreshPlugins(vaultRoot, nextSettings).catch((error) => {
                                  setStatus(error instanceof Error ? error.message : String(error));
                                });
                              }}
                            />
                            <span>
                              <strong>{plugin.name}</strong>
                              <small>
                                {plugin.commands.length} command
                                {plugin.commands.length === 1 ? "" : "s"}
                                {plugin.styles.length > 0
                                  ? ` / ${plugin.styles.length} stylesheet${
                                      plugin.styles.length === 1 ? "" : "s"
                                    }`
                                  : ""}
                              </small>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="settings-note">No plugins found.</p>
                    )}
                  </div>
                  {pluginCatalog.errors.length > 0 ? (
                    <div className="plugin-errors">
                      {pluginCatalog.errors.map((error) => (
                        <p key={error}>{error}</p>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
            {settingsTab === "ai" ? (
              <div className="settings-tab-panel" role="tabpanel" aria-label="AI settings">
                <section className="settings-section" aria-label="AI provider settings">
                  <div className="settings-section-header">
                    <div>
                      <h3>AI</h3>
                      <p>Connect Glyphary to an OpenAI-compatible backend with your own key.</p>
                    </div>
                  </div>
                  <label className="settings-check-control">
                    <input
                      checked={aiDraft.enabled}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;

                        updateAiDraft({
                          ...normalizeAiSettings(aiDraft),
                          enabled,
                        });
                      }}
                    />
                    <span>Enable AI commands</span>
                  </label>
                  <label>
                    <span>Base URL</span>
                    <input
                      disabled={!vaultRoot || !aiDraft.enabled}
                      value={aiDraft.baseUrl}
                      onChange={(event) => {
                        const baseUrl = event.currentTarget.value;

                        updateAiDraft({
                          ...normalizeAiSettings(aiDraft),
                          baseUrl,
                        });
                      }}
                      placeholder={defaultAiBaseUrl}
                    />
                  </label>
                  <label>
                    <span>Model</span>
                    <select
                      disabled={!vaultRoot || !aiDraft.enabled}
                      value={aiDraft.model}
                      onChange={(event) => {
                        const model = event.currentTarget.value;

                        updateAiDraft({
                          ...normalizeAiSettings(aiDraft),
                          model,
                        });
                      }}
                    >
                      {aiModelOptions().map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>API key</span>
                    <input
                      disabled={!vaultRoot || !aiDraft.enabled}
                      type="password"
                      value={aiDraft.apiKey}
                      onChange={(event) => {
                        const apiKey = event.currentTarget.value;

                        updateAiDraft({
                          ...normalizeAiSettings(aiDraft),
                          apiKey,
                        });
                      }}
                      placeholder="sk-..."
                    />
                    <small>The key is saved in this vault's .glyphary/config.json.</small>
                  </label>
                  <div className="settings-inline-actions">
                    <button
                      className="settings-inline-action"
                      disabled={
                        !vaultRoot ||
                        !aiDraft.enabled ||
                        !normalizeAiSettings(aiDraft).apiKey ||
                        aiModelsLoading
                      }
                      type="button"
                      onClick={() => void refreshAiModels()}
                    >
                      {aiModelsLoading ? "Refreshing..." : "Refresh Models"}
                    </button>
                    <button
                      className="settings-inline-action"
                      disabled={
                        !vaultRoot ||
                        !aiDraft.enabled ||
                        !normalizeAiSettings(aiDraft).apiKey ||
                        aiTesting
                      }
                      type="button"
                      onClick={() => void testAiConnection()}
                    >
                      {aiTesting ? "Testing..." : "Test API"}
                    </button>
                    <span
                      className={`ai-test-indicator${
                        aiTestStatus ? ` ${aiTestStatus}` : ""
                      }`}
                      aria-label={
                        aiTestStatus === "success"
                          ? "AI API test passed"
                          : aiTestStatus === "error"
                            ? "AI API test failed"
                            : "AI API not tested"
                      }
                      role="status"
                      title={
                        aiTestStatus === "success"
                          ? "AI API test passed"
                          : aiTestStatus === "error"
                            ? "AI API test failed"
                            : "AI API not tested"
                      }
                    />
                  </div>
                </section>
              </div>
            ) : null}
            {settingsTab === "debug" ? (
              <div className="settings-tab-panel" role="tabpanel" aria-label="Debug settings">
                <section className="settings-section" aria-label="Debug mode settings">
                  <div className="settings-section-header">
                    <div>
                      <h3>Debug</h3>
                      <p>Reveal diagnostic controls that are useful while troubleshooting the app.</p>
                    </div>
                  </div>
                  <label className="settings-check-control">
                    <input
                      checked={debugDraft.enabled}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) =>
                        setDebugDraft({
                          enabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>Enable debug mode</span>
                  </label>
                </section>
                {debugDraft.enabled ? (
                  <section
                    className="settings-section"
                    aria-label="Global tidbit shortcut diagnostics"
                  >
                    <div className="settings-section-header">
                      <div>
                        <h3>Global Shortcut Diagnostics</h3>
                        <p>Use these controls only when macOS shortcut capture needs inspection.</p>
                      </div>
                    </div>
                    <div className="settings-inline-actions">
                      <button
                        className="settings-inline-action"
                        type="button"
                        disabled={
                          !vaultRoot ||
                          !tidbitDraft.globalShortcutEnabled ||
                          !isRunningOnMacOs()
                        }
                        onClick={() => void requestTidbitShortcutAccessibilityPermission()}
                      >
                        Request Permission
                      </button>
                      <button
                        className="settings-inline-action"
                        type="button"
                        disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled || !isTauri()}
                        onClick={() =>
                          void invoke("test_tidbit_global_shortcut_event").catch((error) => {
                            setStatus(error instanceof Error ? error.message : String(error));
                          })
                        }
                      >
                        Test Capture Event
                      </button>
                      <button
                        className="settings-inline-action"
                        type="button"
                        disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled || !isTauri()}
                        onClick={() =>
                          void invoke<TidbitShortcutStatus>("tidbit_global_shortcut_status")
                            .then((shortcutStatus) => {
                              setStatus(
                                shortcutStatus.shortcut
                                  ? `Tidbit shortcut ${shortcutStatus.shortcut} is ${
                                      shortcutStatus.registered ? "registered" : "not registered"
                                    }`
                                  : "No tidbit shortcut is registered",
                              );
                            })
                            .catch((error) => {
                              setStatus(error instanceof Error ? error.message : String(error));
                            })
                        }
                      >
                        Check Shortcut
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
            {settingsTab === "appearance" ? (
              <div className="settings-tab-panel" role="tabpanel" aria-label="Appearance settings">
                <section className="settings-section" aria-label="Window appearance">
                  <div className="settings-section-header">
                    <div>
                      <h3>Window</h3>
                      <p>Choose whether the app window uses a translucent native material.</p>
                    </div>
                  </div>
                  <label className="settings-check-control">
                    <input
                      checked={normalizedVaultAppearanceDraft.glassEffect}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const glassEffect = event.currentTarget.checked;
                        setVaultAppearanceDraft((settings) => ({
                          ...normalizeVaultAppearanceSettings(settings),
                          glassEffect,
                        }));
                      }}
                    />
                    <span>Use glass window effect</span>
                  </label>
                  <label className="settings-range-control">
                    <span>
                      Glass opacity
                      <strong>
                        {Math.round(normalizedVaultAppearanceDraft.glassOpacity * 100)}%
                      </strong>
                    </span>
                    <input
                      aria-label="Glass opacity"
                      disabled={!vaultRoot || !normalizedVaultAppearanceDraft.glassEffect}
                      max={maximumGlassOpacity}
                      min={minimumGlassOpacity}
                      step="0.01"
                      type="range"
                      value={normalizedVaultAppearanceDraft.glassOpacity}
                      onChange={(event) => {
                        const glassOpacity = Number(event.currentTarget.value);
                        setVaultAppearanceDraft((settings) => ({
                          ...normalizeVaultAppearanceSettings(settings),
                          glassOpacity,
                        }));
                      }}
                    />
                    <small>
                      Lower values reveal more of the native window material through every
                      drawer and editor layer.
                    </small>
                  </label>
                </section>
                <section className="settings-section" aria-label="Layout appearance">
                  <div className="settings-section-header">
                    <div>
                      <h3>Layout</h3>
                      <p>Control chrome density and the spacing around the workspace.</p>
                    </div>
                  </div>
                  <label className="settings-check-control">
                    <input
                      checked={normalizedVaultAppearanceDraft.statusBarVisible}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const statusBarVisible = event.currentTarget.checked;
                        setVaultAppearanceDraft((settings) => ({
                          ...normalizeVaultAppearanceSettings(settings),
                          statusBarVisible,
                        }));
                      }}
                    />
                    <span>Show status bar</span>
                  </label>
                  <label className="settings-check-control">
                    <input
                      checked={normalizedVaultAppearanceDraft.sectionCorners === "rounded"}
                      disabled={!vaultRoot}
                      type="checkbox"
                      onChange={(event) => {
                        const sectionCorners = event.currentTarget.checked
                          ? "rounded"
                          : "square";
                        setVaultAppearanceDraft((settings) => ({
                          ...normalizeVaultAppearanceSettings(settings),
                          sectionCorners,
                        }));
                      }}
                    />
                    <span>Use rounded section corners</span>
                  </label>
                  <label className="settings-field compact-field">
                    <span>Workspace margins</span>
                    <select
                      disabled={!vaultRoot}
                      value={normalizedVaultAppearanceDraft.workspaceMargin}
                      onChange={(event) => {
                        const workspaceMargin = event.currentTarget
                          .value as VaultAppearanceSettings["workspaceMargin"];
                        setVaultAppearanceDraft((settings) => ({
                          ...normalizeVaultAppearanceSettings(settings),
                          workspaceMargin,
                        }));
                      }}
                    >
                      <option value="compact">Flush</option>
                      <option value="comfortable">Comfortable</option>
                      <option value="spacious">Roomy</option>
                    </select>
                  </label>
                  <label className="settings-field compact-field">
                    <span>UI text weight</span>
                    <select
                      disabled={!vaultRoot}
                      value={normalizedVaultAppearanceDraft.uiFontWeight}
                      onChange={(event) => {
                        const uiFontWeight = event.currentTarget
                          .value as VaultAppearanceSettings["uiFontWeight"];
                        setVaultAppearanceDraft((settings) => ({
                          ...normalizeVaultAppearanceSettings(settings),
                          uiFontWeight,
                        }));
                      }}
                    >
                      <option value="regular">Regular</option>
                      <option value="medium">Medium</option>
                      <option value="bold">Bold</option>
                    </select>
                  </label>
                </section>
                <ThemeBuilderPanel
                  selectedThemePresetIdDraft={selectedThemePresetIdDraft}
                  themeCalloutDraft={themeCalloutDraft}
                  themeDraft={themeDraft}
                  themeOptionsDraft={themeOptionsDraft}
                  vaultRoot={vaultRoot}
                  onApplyThemePreset={applyThemePreset}
                  onResetThemeDraft={resetThemeDraft}
                  onSetThemeCalloutDraft={setThemeCalloutDraft}
                  onSetThemeOptionsDraft={setThemeOptionsDraft}
                  onUpdateThemeDraftToken={updateThemeDraftToken}
                />
                <section className="settings-section" aria-label="CSS snippets">
                  <div className="settings-section-header">
                    <div>
                      <h3>CSS Snippets</h3>
                      <p>Load only approved .css files from a vault-relative directory.</p>
                    </div>
                    <button
                      className="inline-action"
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => {
                        void refreshCssSnippets(vaultRoot, cssSnippetDraft).catch((error) => {
                          setStatus(error instanceof Error ? error.message : String(error));
                        });
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                  <label>
                    <span>Snippets directory</span>
                    <input
                      disabled={!vaultRoot}
                      value={cssSnippetDraft.directory}
                      onBlur={() => {
                        void refreshCssSnippets(vaultRoot, cssSnippetDraft).catch((error) => {
                          setStatus(error instanceof Error ? error.message : String(error));
                        });
                      }}
                      onChange={(event) => {
                        const directory = event.currentTarget.value;

                        setCssSnippetDraft((settings) => ({
                          ...settings,
                          directory,
                        }));
                      }}
                      placeholder={defaultCssSnippetDirectory}
                    />
                  </label>
                  <div className="css-snippet-list">
                    {cssSnippetFiles.length > 0 ? (
                      cssSnippetFiles.map((snippet) => {
                        const checked = cssSnippetDraft.enabled.includes(snippet.name);

                        return (
                          <label className="settings-check-control" key={snippet.name}>
                            <input
                              checked={checked}
                              disabled={!vaultRoot}
                              type="checkbox"
                              onChange={(event) => {
                                const enabled = event.currentTarget.checked;
                                const nextSettings = normalizeCssSnippetSettings({
                                  ...cssSnippetDraft,
                                  enabled: enabled
                                    ? [...cssSnippetDraft.enabled, snippet.name]
                                    : cssSnippetDraft.enabled.filter((name) => name !== snippet.name),
                                });

                                setCssSnippetDraft(nextSettings);
                                void refreshCssSnippets(vaultRoot, nextSettings).catch((error) => {
                                  setStatus(error instanceof Error ? error.message : String(error));
                                });
                              }}
                            />
                            <span>{snippet.name}</span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="settings-note">No CSS snippets found.</p>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
            <div className="settings-actions">
              <button
                className="inline-action"
                disabled={!vaultRoot || !settingsHaveChanges()}
                type="button"
                onClick={revertSettingsDraft}
              >
                Revert
              </button>
              <button
                className="inline-action"
                disabled={!vaultRoot || !settingsHaveChanges()}
                type="button"
                onClick={saveVaultSettings}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
