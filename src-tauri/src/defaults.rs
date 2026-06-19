//! Shared backend constants and default values.
//!
//! Responsibilities:
//! - Define vault defaults, size limits, manifest/runtime strings, and allowlists.
//! - Implement `Default` for settings models in one place.
//! - Expose serde default callbacks used by `models.rs`.
//!
//! Contracts:
//! - Defaults here must match the frontend defaults and documented vault layout.
//! - Allowlists are backend enforcement points; widening them changes what users
//!   can persist or load from a vault.
//! - Values are crate-local so external callers cannot depend on them as API.
use super::*;

pub(crate) const SEARCH_RESULT_LIMIT: usize = 200;
pub(crate) const MAX_ASSET_BYTES: usize = 50 * 1024 * 1024;
pub(crate) const MAX_RICH_LINK_HTML_BYTES: u64 = 2 * 1024 * 1024;
pub(crate) const RICH_LINK_IMAGE_SCAN_BYTES: usize = 160 * 1024;
pub(crate) const DEFAULT_ASSET_DIRECTORY: &str = "_assets_";
pub(crate) const DEFAULT_FRONTMATTER_PILL_HEADER: &str = "tags";
pub(crate) const DEFAULT_TIDBIT_PATH_PATTERN: &str =
    "__transit__/Objects/tidbit-{{date:YYYY-mm-DD-hh-mm-ss}}.md";
pub(crate) const DEFAULT_CSS_SNIPPET_DIRECTORY: &str = "_snippets_";
pub(crate) const DEFAULT_GLASS_OPACITY: f64 = 0.58;
pub(crate) const MIN_GLASS_OPACITY: f64 = 0.24;
pub(crate) const MAX_GLASS_OPACITY: f64 = 0.9;
pub(crate) const DEFAULT_CANVAS_NODE_BORDER_WIDTH: f64 = 1.0;
pub(crate) const MIN_CANVAS_NODE_BORDER_WIDTH: f64 = 0.0;
pub(crate) const MAX_CANVAS_NODE_BORDER_WIDTH: f64 = 6.0;
pub(crate) const DEFAULT_CANVAS_EDGE_THICKNESS: f64 = 2.5;
pub(crate) const MIN_CANVAS_EDGE_THICKNESS: f64 = 0.5;
pub(crate) const MAX_CANVAS_EDGE_THICKNESS: f64 = 8.0;
pub(crate) const DEFAULT_CANVAS_EDGE_STYLE: &str = "curved";
pub(crate) const CANVAS_EDGE_STYLE_ALLOWLIST: &[&str] = &["curved", "straight", "stepped"];
pub(crate) const PLUGIN_DIRECTORY: &str = ".glyphary/plugins";
pub(crate) const PLUGIN_MANIFEST_FILE: &str = "plugin.json";
pub(crate) const DEFAULT_AI_BASE_URL: &str = "https://api.openai.com/v1";
pub(crate) const DEFAULT_AI_MODEL: &str = "gpt-5.5";
// Current v1 plugin runtime: a pure WASM transform loaded by the frontend worker.
// Native/Extism/component runtimes should get their own manifest value.
pub(crate) const PLUGIN_RUNTIME_WASM_TRANSFORM_V1: &str = "glyphary-wasm-transform@1";
pub(crate) const SETTINGS_DIRECTORY_NAME: &str = ".glyphary";
pub(crate) const SETTINGS_CONFIG_FILE_NAME: &str = "config.json";
pub(crate) const AI_BUILDER_HISTORY_FILE_NAME: &str = "ai-builder-history.json";
pub(crate) const THEME_TOKEN_ALLOWLIST: &[&str] = &[
    "--glyphary-accent",
    "--glyphary-accent-text",
    "--glyphary-app-bg",
    "--glyphary-border",
    "--glyphary-border-soft",
    "--glyphary-border-strong",
    "--glyphary-callout-background",
    "--glyphary-callout-border-width",
    "--glyphary-callout-icon-size",
    "--glyphary-callout-info-color",
    "--glyphary-callout-note-color",
    "--glyphary-callout-padding",
    "--glyphary-callout-radius",
    "--glyphary-callout-title-transform",
    "--glyphary-callout-tip-color",
    "--glyphary-callout-warning-color",
    "--glyphary-code-bg",
    "--glyphary-code-font-size",
    "--glyphary-code-tab-size",
    "--glyphary-code-text",
    "--glyphary-block-gap",
    "--glyphary-border-width",
    "--glyphary-column-gap",
    "--glyphary-editor-text",
    "--glyphary-editor-font-size",
    "--glyphary-editor-line-height",
    "--glyphary-editor-max-width",
    "--glyphary-editor-padding-x",
    "--glyphary-editor-padding-y",
    "--glyphary-focus",
    "--glyphary-font-editor",
    "--glyphary-font-mono",
    "--glyphary-font-ui",
    "--glyphary-heading",
    "--glyphary-heading-h1-size",
    "--glyphary-heading-h2-size",
    "--glyphary-hover",
    "--glyphary-mono-text",
    "--glyphary-muted",
    "--glyphary-muted-strong",
    "--glyphary-quote-border",
    "--glyphary-quote-text",
    "--glyphary-radius-lg",
    "--glyphary-radius-md",
    "--glyphary-radius-sm",
    "--glyphary-selection",
    "--glyphary-shadow",
    "--glyphary-shadow-strong",
    "--glyphary-surface",
    "--glyphary-surface-muted",
    "--glyphary-table-border",
    "--glyphary-text",
    "--glyphary-text-soft",
    "--syntax-blue",
    "--syntax-green",
    "--syntax-muted",
    "--syntax-orange",
    "--syntax-purple",
    "--syntax-red",
    "--syntax-yellow",
];
pub(crate) const THEME_CALLOUT_STYLE_ALLOWLIST: &[&str] =
    &["plain", "striped", "card", "compact", "obsidian"];
pub(crate) const THEME_CALLOUT_ICON_KEY_ALLOWLIST: &[&str] = &["note", "info", "tip", "warning"];
pub(crate) const THEME_CALLOUT_ICON_ALLOWLIST: &[&str] =
    &["info", "sparkles", "alert", "check", "quote", "none"];

pub(crate) fn default_asset_directory() -> String {
    DEFAULT_ASSET_DIRECTORY.into()
}

pub(crate) fn default_css_snippet_directory() -> String {
    DEFAULT_CSS_SNIPPET_DIRECTORY.into()
}

pub(crate) fn default_plugin_wasm_input() -> String {
    "selection".into()
}

pub(crate) fn default_plugin_wasm_output() -> String {
    "replaceSelection".into()
}

pub(crate) fn default_plugin_wasm_timeout_ms() -> u64 {
    750
}

pub(crate) fn default_tidbit_path_pattern() -> String {
    DEFAULT_TIDBIT_PATH_PATTERN.into()
}

pub(crate) fn default_tidbit_global_shortcut() -> String {
    "CommandOrControl+Shift+Space".into()
}

pub(crate) fn default_ai_base_url() -> String {
    DEFAULT_AI_BASE_URL.into()
}

pub(crate) fn default_ai_model() -> String {
    DEFAULT_AI_MODEL.into()
}

pub(crate) fn default_callout_style() -> String {
    "plain".into()
}

pub(crate) fn default_glass_opacity() -> f64 {
    DEFAULT_GLASS_OPACITY
}

pub(crate) fn default_status_bar_visible() -> bool {
    true
}

pub(crate) fn default_section_corners() -> String {
    "rounded".into()
}

pub(crate) fn default_workspace_margin() -> String {
    "comfortable".into()
}

pub(crate) fn default_ui_font_weight() -> String {
    "regular".into()
}

pub(crate) fn default_canvas_node_border_width() -> f64 {
    DEFAULT_CANVAS_NODE_BORDER_WIDTH
}

pub(crate) fn default_canvas_edge_thickness() -> f64 {
    DEFAULT_CANVAS_EDGE_THICKNESS
}

pub(crate) fn default_canvas_edge_style() -> String {
    DEFAULT_CANVAS_EDGE_STYLE.into()
}

pub(crate) fn default_canvas_show_grid() -> bool {
    true
}

pub(crate) fn default_canvas_show_navigation_preview() -> bool {
    true
}

pub(crate) fn default_callout_icons() -> HashMap<String, String> {
    HashMap::from([
        ("note".into(), "info".into()),
        ("info".into(), "info".into()),
        ("tip".into(), "sparkles".into()),
        ("warning".into(), "alert".into()),
    ])
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self {
            asset_directory: DEFAULT_ASSET_DIRECTORY.into(),
            frontmatter_pills: FrontmatterPillSettings::default(),
            files: FileDisplaySettings::default(),
            autosave: AutosaveSettings::default(),
            tidbits: TidbitSettings::default(),
            editor: EditorSettings::default(),
            appearance: AppearanceSettings::default(),
            debug: DebugSettings::default(),
            css_snippets: CssSnippetSettings::default(),
            plugins: PluginSettings::default(),
            ai: AiSettings::default(),
            canvas: CanvasSettings::default(),
            theme: None,
        }
    }
}

impl Default for FrontmatterPillSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            header_name: DEFAULT_FRONTMATTER_PILL_HEADER.into(),
        }
    }
}

impl Default for AutosaveSettings {
    fn default() -> Self {
        Self { enabled: true }
    }
}

impl Default for DebugSettings {
    fn default() -> Self {
        Self { enabled: false }
    }
}

impl Default for TidbitSettings {
    fn default() -> Self {
        Self {
            path_pattern: DEFAULT_TIDBIT_PATH_PATTERN.into(),
            global_shortcut_enabled: false,
            global_shortcut: default_tidbit_global_shortcut(),
        }
    }
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            glass_effect: false,
            glass_opacity: DEFAULT_GLASS_OPACITY,
            status_bar_visible: true,
            section_corners: default_section_corners(),
            workspace_margin: default_workspace_margin(),
            ui_font_weight: default_ui_font_weight(),
        }
    }
}

impl Default for CssSnippetSettings {
    fn default() -> Self {
        Self {
            directory: DEFAULT_CSS_SNIPPET_DIRECTORY.into(),
            enabled: Vec::new(),
        }
    }
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            base_url: DEFAULT_AI_BASE_URL.into(),
            model: DEFAULT_AI_MODEL.into(),
            api_key: String::new(),
        }
    }
}

impl Default for CanvasSettings {
    fn default() -> Self {
        Self {
            node_border_width: DEFAULT_CANVAS_NODE_BORDER_WIDTH,
            edge_thickness: DEFAULT_CANVAS_EDGE_THICKNESS,
            edge_style: DEFAULT_CANVAS_EDGE_STYLE.into(),
            show_grid: true,
            show_navigation_preview: true,
            snap_to_grid: false,
        }
    }
}

impl Default for VaultThemeCallouts {
    fn default() -> Self {
        Self {
            style: default_callout_style(),
            icons: default_callout_icons(),
        }
    }
}
