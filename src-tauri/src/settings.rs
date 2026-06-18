//! Vault settings persistence.
//!
//! Responsibilities:
//! - Read and write `.glyphary/config.json` for the active vault.
//! - Normalize settings before they are returned to the frontend or persisted.
//! - Delegate specialized validation to path, theme, snippet, and plugin
//!   helpers.
//!
//! Contracts:
//! - Missing settings files return defaults and do not create files.
//! - Writes create `.glyphary/` only when persistence is requested.
//! - Persisted paths use forward slashes to keep vault configuration portable.
use super::*;

pub(crate) fn clean_settings(settings: VaultSettings) -> Result<VaultSettings, String> {
    let asset_directory = clean_settings_asset_directory(&settings.asset_directory)?;
    // Store settings with forward slashes even on Windows so .glyphary remains
    // portable and matches the frontend's markdown asset references.
    let asset_directory = asset_directory
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");

    let theme = clean_theme(settings.theme)?;
    let frontmatter_pills = clean_frontmatter_pill_settings(settings.frontmatter_pills)?;
    let tidbits = clean_tidbit_settings(settings.tidbits);
    let appearance = clean_appearance_settings(settings.appearance);
    let css_snippets = clean_css_snippet_settings(settings.css_snippets)?;
    let plugins = clean_plugin_settings(settings.plugins)?;

    if asset_directory.is_empty() {
        Err("Asset directory cannot be empty".into())
    } else {
        Ok(VaultSettings {
            asset_directory,
            frontmatter_pills,
            files: settings.files,
            autosave: settings.autosave,
            tidbits,
            editor: settings.editor,
            appearance,
            debug: settings.debug,
            css_snippets,
            plugins,
            theme,
        })
    }
}
pub(crate) fn clean_appearance_settings(settings: AppearanceSettings) -> AppearanceSettings {
    let glass_opacity = if settings.glass_opacity.is_finite() {
        settings
            .glass_opacity
            .clamp(MIN_GLASS_OPACITY, MAX_GLASS_OPACITY)
    } else {
        DEFAULT_GLASS_OPACITY
    };

    AppearanceSettings {
        glass_effect: settings.glass_effect,
        glass_opacity,
    }
}
pub(crate) fn clean_tidbit_settings(settings: TidbitSettings) -> TidbitSettings {
    let path_pattern = settings.path_pattern.trim();
    let global_shortcut = settings.global_shortcut.trim();

    TidbitSettings {
        path_pattern: if path_pattern.is_empty() {
            DEFAULT_TIDBIT_PATH_PATTERN.into()
        } else {
            path_pattern.into()
        },
        global_shortcut_enabled: settings.global_shortcut_enabled,
        global_shortcut: if global_shortcut.is_empty() {
            default_tidbit_global_shortcut()
        } else {
            global_shortcut.into()
        },
    }
}
pub(crate) fn clean_frontmatter_pill_settings(
    settings: FrontmatterPillSettings,
) -> Result<FrontmatterPillSettings, String> {
    let header_name = settings.header_name.trim();

    if header_name.is_empty() {
        return Err("Frontmatter pill header cannot be empty".into());
    }

    if header_name.len() > 64
        || !header_name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
    {
        return Err("Frontmatter pill header contains unsupported characters".into());
    }

    Ok(FrontmatterPillSettings {
        enabled: settings.enabled,
        header_name: header_name.to_string(),
    })
}
#[tauri::command]
pub(crate) fn read_vault_settings(root: String) -> Result<VaultSettings, String> {
    let root = vault_root(&root)?;
    let path = vault_settings_path(&root);

    if !path.exists() {
        return Ok(VaultSettings::default());
    }

    let content =
        fs::read_to_string(path).map_err(|err| format!("Could not read vault settings: {err}"))?;
    let settings = serde_json::from_str::<VaultSettings>(&content)
        .map_err(|err| format!("Could not parse vault settings: {err}"))?;

    clean_settings(settings)
}
#[tauri::command]
pub(crate) fn write_vault_settings(
    root: String,
    settings: VaultSettings,
) -> Result<VaultSettings, String> {
    let root = vault_root(&root)?;
    let settings = clean_settings(settings)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("Could not serialize vault settings: {err}"))?;
    let settings_path = vault_settings_path(&root);

    if let Some(settings_dir) = settings_path.parent() {
        fs::create_dir_all(settings_dir)
            .map_err(|err| format!("Could not create vault settings directory: {err}"))?;
    }

    fs::write(settings_path, format!("{content}\n"))
        .map_err(|err| format!("Could not write vault settings: {err}"))?;

    Ok(settings)
}
