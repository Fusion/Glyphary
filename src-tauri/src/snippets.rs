//! CSS snippet discovery and loading.
//!
//! Responsibilities:
//! - Validate the vault-relative snippet directory and approved `.css` names.
//! - List available snippets for Settings.
//! - Read only user-enabled snippet files for injection by the frontend.
//!
//! Contracts:
//! - Snippets are passive CSS text; this module does not interpret selectors or
//!   apply styles.
//! - Enabled names must be simple filenames, never paths.
//! - Missing enabled files are ignored so deleting a snippet does not break
//!   vault startup.
use super::*;

pub(crate) fn clean_css_snippet_settings(
    settings: CssSnippetSettings,
) -> Result<CssSnippetSettings, String> {
    let directory = clean_relative(settings.directory.trim())?;
    let directory = directory
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");

    if directory.is_empty() {
        return Err("CSS snippet directory cannot be empty".into());
    }

    let mut enabled = Vec::new();

    for name in settings.enabled {
        let name = clean_css_snippet_name(&name)?;

        if !enabled.contains(&name) {
            enabled.push(name);
        }
    }

    enabled.sort();

    Ok(CssSnippetSettings { directory, enabled })
}
pub(crate) fn clean_css_snippet_name(name: &str) -> Result<String, String> {
    let name = name.trim();

    if name.is_empty()
        || name.len() > 120
        || Path::new(name).components().count() != 1
        || !name.ends_with(".css")
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ' ')
        })
    {
        return Err("CSS snippet name must be a simple .css file name".into());
    }

    Ok(name.into())
}
#[tauri::command]
pub(crate) fn list_css_snippets(
    root: String,
    directory: String,
) -> Result<Vec<CssSnippetFile>, String> {
    let root = vault_root(&root)?;
    let directory = clean_relative(&directory)?;
    let snippets_dir = root.join(&directory);

    if !snippets_dir.exists() {
        return Ok(Vec::new());
    }

    if !snippets_dir.is_dir() {
        return Err("CSS snippet path is not a directory".into());
    }

    let mut snippets = Vec::new();

    for entry in fs::read_dir(&snippets_dir)
        .map_err(|err| format!("Could not read CSS snippet directory: {err}"))?
    {
        let entry = entry.map_err(|err| format!("Could not read CSS snippet entry: {err}"))?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let Some(name) = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };

        if clean_css_snippet_name(&name).is_err() {
            continue;
        }

        snippets.push(CssSnippetFile {
            relative_path: relative_string(&root, &path)?,
            name,
        });
    }

    snippets.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    Ok(snippets)
}
#[tauri::command]
pub(crate) fn read_css_snippets(
    root: String,
    directory: String,
    enabled: Vec<String>,
) -> Result<Vec<CssSnippetContent>, String> {
    let root = vault_root(&root)?;
    let directory = clean_relative(&directory)?;
    let snippets_dir = root.join(&directory);
    let mut snippets = Vec::new();

    for name in enabled {
        let name = clean_css_snippet_name(&name)?;
        let path = snippets_dir.join(&name);

        if !path.starts_with(&root) {
            return Err("CSS snippet path escapes the vault".into());
        }

        if !path.exists() {
            continue;
        }

        if !path.is_file() {
            return Err(format!("CSS snippet is not a file: {name}"));
        }

        let content = fs::read_to_string(&path)
            .map_err(|err| format!("Could not read CSS snippet {name}: {err}"))?;

        if content.len() > 200_000 {
            return Err(format!("CSS snippet is too large: {name}"));
        }

        snippets.push(CssSnippetContent { name, content });
    }

    Ok(snippets)
}
