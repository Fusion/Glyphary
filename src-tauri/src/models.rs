//! Shared backend data models.
//!
//! Responsibilities:
//! - Define the serde shapes exchanged between Tauri commands and the React UI.
//! - Keep model-specific serialization rules near the fields they affect.
//! - Provide lightweight helper methods that serde uses to omit default values.
//!
//! Contracts:
//! - These types are crate-local DTOs, not a stable plugin or public Rust API.
//! - Fields are `pub(crate)` so sibling command modules can construct responses
//!   without routing everything back through `lib.rs`.
//! - Defaults live in `defaults.rs`; model fields reference those defaults by
//!   explicit module path so ownership stays clear.
use super::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultEntry {
    pub(crate) name: String,
    pub(crate) relative_path: String,
    pub(crate) is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenedFile {
    pub(crate) name: String,
    pub(crate) relative_path: String,
    pub(crate) content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedAsset {
    pub(crate) file_name: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenamedDirectory {
    pub(crate) name: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultSettings {
    #[serde(default = "crate::defaults::default_asset_directory")]
    pub(crate) asset_directory: String,
    #[serde(default)]
    pub(crate) frontmatter_pills: FrontmatterPillSettings,
    #[serde(default)]
    pub(crate) files: FileDisplaySettings,
    #[serde(default)]
    pub(crate) autosave: AutosaveSettings,
    #[serde(default)]
    pub(crate) tidbits: TidbitSettings,
    #[serde(default)]
    pub(crate) editor: EditorSettings,
    #[serde(default)]
    pub(crate) appearance: AppearanceSettings,
    #[serde(default)]
    pub(crate) debug: DebugSettings,
    #[serde(default)]
    pub(crate) css_snippets: CssSnippetSettings,
    #[serde(default)]
    pub(crate) plugins: PluginSettings,
    #[serde(default)]
    pub(crate) ai: AiSettings,
    #[serde(default)]
    pub(crate) canvas: CanvasSettings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) theme: Option<VaultTheme>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorSettings {
    pub(crate) vim_mode: bool,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileDisplaySettings {
    pub(crate) show_dotfiles: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutosaveSettings {
    pub(crate) enabled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DebugSettings {
    pub(crate) enabled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TidbitSettings {
    #[serde(default = "crate::defaults::default_tidbit_path_pattern")]
    pub(crate) path_pattern: String,
    #[serde(default)]
    pub(crate) global_shortcut_enabled: bool,
    #[serde(default = "crate::defaults::default_tidbit_global_shortcut")]
    pub(crate) global_shortcut: String,
}

#[derive(Default)]
pub(crate) struct TidbitShortcutState {
    pub(crate) registered_shortcut: Mutex<Option<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TidbitShortcutStatus {
    pub(crate) shortcut: Option<String>,
    pub(crate) registered: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppearanceSettings {
    pub(crate) glass_effect: bool,
    #[serde(default = "crate::defaults::default_glass_opacity")]
    pub(crate) glass_opacity: f64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CanvasSettings {
    #[serde(default = "crate::defaults::default_canvas_node_border_width")]
    pub(crate) node_border_width: f64,
    #[serde(default = "crate::defaults::default_canvas_edge_thickness")]
    pub(crate) edge_thickness: f64,
    #[serde(default = "crate::defaults::default_canvas_edge_style")]
    pub(crate) edge_style: String,
    #[serde(default = "crate::defaults::default_canvas_show_grid")]
    pub(crate) show_grid: bool,
    #[serde(default = "crate::defaults::default_canvas_show_navigation_preview")]
    pub(crate) show_navigation_preview: bool,
    #[serde(default)]
    pub(crate) snap_to_grid: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CssSnippetSettings {
    #[serde(default = "crate::defaults::default_css_snippet_directory")]
    pub(crate) directory: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) enabled: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FrontmatterPillSettings {
    pub(crate) enabled: bool,
    pub(crate) header_name: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultTheme {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) preset_id: Option<String>,
    #[serde(default, skip_serializing_if = "VaultThemeCallouts::is_default")]
    pub(crate) callouts: VaultThemeCallouts,
    #[serde(default, skip_serializing_if = "VaultThemeOptions::is_default")]
    pub(crate) options: VaultThemeOptions,
    #[serde(default)]
    pub(crate) tokens: HashMap<String, String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultThemeCallouts {
    #[serde(default = "crate::defaults::default_callout_style")]
    pub(crate) style: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub(crate) icons: HashMap<String, String>,
}

impl VaultThemeCallouts {
    pub(crate) fn is_default(callouts: &Self) -> bool {
        callouts == &Self::default()
    }
}

#[derive(Debug, Deserialize, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultThemeOptions {
    pub(crate) colorful_headings: bool,
    pub(crate) heading_underlines: bool,
    pub(crate) heading_anchors: bool,
    pub(crate) rich_callouts: bool,
}

impl VaultThemeOptions {
    pub(crate) fn is_default(options: &Self) -> bool {
        options == &Self::default()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchResult {
    pub(crate) relative_path: String,
    pub(crate) line_number: Option<usize>,
    pub(crate) line_text: Option<String>,
    pub(crate) is_content_match: bool,
    pub(crate) modified_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VaultIndexedFile {
    pub(crate) name: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CssSnippetFile {
    pub(crate) name: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CssSnippetContent {
    pub(crate) name: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginSettings {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) enabled: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiSettings {
    #[serde(default)]
    pub(crate) enabled: bool,
    #[serde(default = "crate::defaults::default_ai_base_url")]
    pub(crate) base_url: String,
    #[serde(default = "crate::defaults::default_ai_model")]
    pub(crate) model: String,
    #[serde(default)]
    pub(crate) api_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiTransformRequest {
    pub(crate) settings: AiSettings,
    pub(crate) instruction: String,
    pub(crate) input: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiTransformResponse {
    pub(crate) output: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiBuilderHistoryStore {
    #[serde(default)]
    pub(crate) entries: HashMap<String, Vec<AiBuilderHistoryTurn>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiBuilderHistoryTurn {
    pub(crate) id: String,
    pub(crate) prompt: String,
    pub(crate) markdown: String,
    #[serde(default)]
    pub(crate) assets: Vec<AiBuilderHistoryAsset>,
    pub(crate) timestamp_ms: i64,
    #[serde(default)]
    pub(crate) applied: bool,
    #[serde(default)]
    pub(crate) superseded: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) replaced_by_turn_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiBuilderHistoryAsset {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) file_name: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiModelListResponse {
    pub(crate) models: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConnectionTestResponse {
    pub(crate) message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginManifest {
    pub(crate) id: String,
    pub(crate) name: String,
    // Runtime is intentionally separate from the plugin package version. It
    // lets future runtimes coexist without guessing from command shape.
    #[serde(default)]
    pub(crate) runtime: String,
    #[serde(default)]
    pub(crate) version: String,
    #[serde(default)]
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) permissions: Vec<String>,
    #[serde(default)]
    pub(crate) commands: Vec<PluginCommandManifest>,
    #[serde(default)]
    pub(crate) styles: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginCommandManifest {
    pub(crate) id: String,
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) insert_markdown: Option<String>,
    #[serde(default)]
    pub(crate) template: Option<String>,
    #[serde(default)]
    pub(crate) wasm: Option<PluginWasmCommand>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginWasmCommand {
    pub(crate) module: String,
    #[serde(default = "crate::defaults::default_plugin_wasm_input")]
    pub(crate) input: String,
    #[serde(default = "crate::defaults::default_plugin_wasm_output")]
    pub(crate) output: String,
    #[serde(default = "crate::defaults::default_plugin_wasm_timeout_ms")]
    pub(crate) timeout_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginCatalog {
    pub(crate) plugins: Vec<PluginManifest>,
    pub(crate) errors: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginStyleContent {
    pub(crate) plugin_id: String,
    pub(crate) name: String,
    pub(crate) content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RichLinkMetadata {
    pub(crate) url: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) image: String,
    pub(crate) site_name: String,
}
