use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    time::Duration,
};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultEntry {
    name: String,
    relative_path: String,
    is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedFile {
    name: String,
    relative_path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedAsset {
    file_name: String,
    relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenamedDirectory {
    name: String,
    relative_path: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultSettings {
    #[serde(default = "default_asset_directory")]
    asset_directory: String,
    #[serde(default)]
    frontmatter_pills: FrontmatterPillSettings,
    #[serde(default)]
    files: FileDisplaySettings,
    #[serde(default)]
    autosave: AutosaveSettings,
    #[serde(default)]
    tidbits: TidbitSettings,
    #[serde(default)]
    editor: EditorSettings,
    #[serde(default)]
    appearance: AppearanceSettings,
    #[serde(skip_serializing_if = "Option::is_none")]
    theme: Option<VaultTheme>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct EditorSettings {
    vim_mode: bool,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct FileDisplaySettings {
    show_dotfiles: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutosaveSettings {
    enabled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TidbitSettings {
    #[serde(default = "default_tidbit_path_pattern")]
    path_pattern: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppearanceSettings {
    glass_effect: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontmatterPillSettings {
    enabled: bool,
    header_name: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultTheme {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    preset_id: Option<String>,
    tokens: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    relative_path: String,
    line_number: Option<usize>,
    line_text: Option<String>,
    is_content_match: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RichLinkMetadata {
    url: String,
    title: String,
    description: String,
    image: String,
    site_name: String,
}

#[derive(Deserialize)]
struct RipgrepPath {
    text: String,
}

#[derive(Deserialize)]
struct RipgrepLines {
    text: String,
}

#[derive(Deserialize)]
struct RipgrepMatchData {
    path: RipgrepPath,
    lines: RipgrepLines,
    line_number: Option<usize>,
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "data")]
enum RipgrepEvent {
    #[serde(rename = "match")]
    Match(RipgrepMatchData),
    #[serde(other)]
    Other,
}

const SEARCH_RESULT_LIMIT: usize = 200;
const MAX_ASSET_BYTES: usize = 50 * 1024 * 1024;
const MAX_RICH_LINK_HTML_BYTES: u64 = 2 * 1024 * 1024;
const RICH_LINK_IMAGE_SCAN_BYTES: usize = 160 * 1024;
const DEFAULT_ASSET_DIRECTORY: &str = "_assets_";
const DEFAULT_FRONTMATTER_PILL_HEADER: &str = "tags";
const DEFAULT_TIDBIT_PATH_PATTERN: &str =
    "__transit__/Objects/tidbit-{{date:YYYY-mm-DD-hh-mm-ss}}.md";
const SETTINGS_FILE_NAME: &str = ".glyphary";
const THEME_TOKEN_ALLOWLIST: &[&str] = &[
    "--glyphary-accent",
    "--glyphary-accent-text",
    "--glyphary-app-bg",
    "--glyphary-border",
    "--glyphary-border-soft",
    "--glyphary-border-strong",
    "--glyphary-code-bg",
    "--glyphary-code-text",
    "--glyphary-editor-text",
    "--glyphary-focus",
    "--glyphary-heading",
    "--glyphary-hover",
    "--glyphary-mono-text",
    "--glyphary-muted",
    "--glyphary-muted-strong",
    "--glyphary-quote-border",
    "--glyphary-quote-text",
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
    "--syntax-yellow",
];

fn default_asset_directory() -> String {
    DEFAULT_ASSET_DIRECTORY.into()
}

fn default_tidbit_path_pattern() -> String {
    DEFAULT_TIDBIT_PATH_PATTERN.into()
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

impl Default for TidbitSettings {
    fn default() -> Self {
        Self {
            path_pattern: DEFAULT_TIDBIT_PATH_PATTERN.into(),
        }
    }
}

fn vault_root(root: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|err| format!("Could not read vault root: {err}"))?;

    if !root.is_dir() {
        return Err("Vault root must be a directory".into());
    }

    Ok(root)
}

fn clean_relative(relative: &str) -> Result<PathBuf, String> {
    // All frontend paths are vault-relative strings. Reject roots, prefixes,
    // and parent traversal before joining with the canonical vault root.
    let mut clean = PathBuf::new();

    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Path escapes the vault".into());
            }
        }
    }

    Ok(clean)
}

fn clean_settings_asset_directory(asset_directory: &str) -> Result<PathBuf, String> {
    let asset_directory = asset_directory.trim();

    if asset_directory.is_empty() {
        return Err("Asset directory cannot be empty".into());
    }

    clean_relative(asset_directory)
}

fn clean_settings(settings: VaultSettings) -> Result<VaultSettings, String> {
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
            appearance: settings.appearance,
            theme,
        })
    }
}

fn clean_tidbit_settings(settings: TidbitSettings) -> TidbitSettings {
    let path_pattern = settings.path_pattern.trim();

    TidbitSettings {
        path_pattern: if path_pattern.is_empty() {
            DEFAULT_TIDBIT_PATH_PATTERN.into()
        } else {
            path_pattern.into()
        },
    }
}

fn clean_frontmatter_pill_settings(
    settings: FrontmatterPillSettings,
) -> Result<FrontmatterPillSettings, String> {
    let header_name = settings.header_name.trim();

    if header_name.is_empty() {
        return Err("Frontmatter pill header cannot be empty".into());
    }

    if header_name.len() > 64
        || !header_name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.'))
    {
        return Err("Frontmatter pill header contains unsupported characters".into());
    }

    Ok(FrontmatterPillSettings {
        enabled: settings.enabled,
        header_name: header_name.to_string(),
    })
}

fn clean_theme(theme: Option<VaultTheme>) -> Result<Option<VaultTheme>, String> {
    let Some(theme) = theme else {
        return Ok(None);
    };
    let mut tokens = HashMap::new();
    let preset_id = theme
        .preset_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    for (key, value) in theme.tokens {
        if !THEME_TOKEN_ALLOWLIST.contains(&key.as_str()) {
            return Err(format!("Unsupported theme token: {key}"));
        }

        let value = value.trim();

        if value.is_empty() {
            continue;
        }

        if value.len() > 80 || !value.chars().all(is_safe_theme_value_char) {
            return Err(format!("Invalid theme value for {key}"));
        }

        tokens.insert(key, value.to_string());
    }

    if tokens.is_empty() {
        Ok(None)
    } else {
        Ok(Some(VaultTheme { preset_id, tokens }))
    }
}

fn is_safe_theme_value_char(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || matches!(
            character,
            '#' | '(' | ')' | ',' | '.' | '%' | '-' | ' ' | '\t'
        )
}

fn resolve_existing(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = vault_root(root)?;
    let relative = clean_relative(relative)?;
    let target = fs::canonicalize(root.join(relative))
        .map_err(|err| format!("Could not resolve vault path: {err}"))?;

    if !target.starts_with(&root) {
        return Err("Path escapes the vault".into());
    }

    Ok((root, target))
}

fn resolve_for_write(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = vault_root(root)?;
    let relative = clean_relative(relative)?;
    let target = root.join(relative);
    let parent = target
        .parent()
        .ok_or_else(|| "Target path has no parent".to_string())?;
    let parent = fs::canonicalize(parent)
        .map_err(|err| format!("Could not resolve target parent: {err}"))?;

    // The target may not exist yet, so the parent is the canonical boundary
    // check for writes and creates.
    if !parent.starts_with(&root) {
        return Err("Path escapes the vault".into());
    }

    Ok((root, target))
}

fn ensure_vault_parent_dirs(root: &Path, relative_parent: &Path) -> Result<PathBuf, String> {
    let mut current = root.to_path_buf();

    for component in relative_parent.components() {
        let Component::Normal(part) = component else {
            continue;
        };

        current.push(part);

        if current.exists() {
            let canonical = fs::canonicalize(&current)
                .map_err(|err| format!("Could not resolve target directory: {err}"))?;

            if !canonical.starts_with(root) {
                return Err("Path escapes the vault".into());
            }

            if !canonical.is_dir() {
                return Err("Target parent path is not a directory".into());
            }
        } else {
            fs::create_dir(&current)
                .map_err(|err| format!("Could not create target directory: {err}"))?;
        }
    }

    Ok(current)
}

fn relative_string(root: &Path, target: &Path) -> Result<String, String> {
    let relative = target
        .strip_prefix(root)
        .map_err(|_| "Path escapes the vault".to_string())?;

    Ok(relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

fn sanitize_asset_file_name(file_name: &str) -> String {
    let file_name = Path::new(file_name)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Pasted image.png".into());
    let mut clean = String::new();
    let mut previous_space = false;

    for character in file_name.chars() {
        let next =
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ' ') {
                character
            } else if character.is_whitespace() {
                ' '
            } else {
                '-'
            };

        if next == ' ' {
            if !previous_space {
                clean.push(next);
            }
            previous_space = true;
        } else {
            clean.push(next);
            previous_space = false;
        }
    }

    let clean = clean
        .trim_matches(|character: char| character == '.' || character == '-' || character == ' ')
        .to_string();

    if clean.is_empty() {
        "Pasted image.png".into()
    } else {
        clean
    }
}

fn sanitize_markdown_file_name(file_name: &str) -> Result<String, String> {
    let file_name = Path::new(file_name)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let without_extension = file_name
        .strip_suffix(".md")
        .or_else(|| file_name.strip_suffix(".markdown"))
        .unwrap_or(&file_name);
    let mut clean = String::new();
    let mut previous_space = false;

    for character in without_extension.chars() {
        let next =
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ' ') {
                character
            } else if character.is_whitespace() {
                ' '
            } else {
                '-'
            };

        if next == ' ' {
            if !previous_space {
                clean.push(next);
            }
            previous_space = true;
        } else {
            clean.push(next);
            previous_space = false;
        }
    }

    let clean = clean
        .trim_matches(|character: char| character == '.' || character == '-' || character == ' ')
        .to_string();

    if clean.is_empty() {
        Err("Page name cannot be empty".into())
    } else {
        Ok(format!("{clean}.md"))
    }
}

fn sanitize_directory_name(directory_name: &str) -> Result<String, String> {
    let directory_name = Path::new(directory_name)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut clean = String::new();
    let mut previous_space = false;

    for character in directory_name.chars() {
        let next =
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ' ') {
                character
            } else if character.is_whitespace() {
                ' '
            } else {
                '-'
            };

        if next == ' ' {
            if !previous_space {
                clean.push(next);
            }
            previous_space = true;
        } else {
            clean.push(next);
            previous_space = false;
        }
    }

    let clean = clean
        .trim_matches(|character: char| character == '.' || character == '-' || character == ' ')
        .to_string();

    if clean.is_empty() {
        Err("Folder name cannot be empty".into())
    } else {
        Ok(clean)
    }
}

fn shadow_note_path_for_directory(dir: &Path) -> Result<PathBuf, String> {
    let dir_name = dir
        .file_name()
        .ok_or_else(|| "Directory has no name".to_string())?
        .to_string_lossy()
        .into_owned();

    Ok(dir.join(format!("{dir_name}.md")))
}

fn unique_asset_path(asset_dir: &Path, file_name: &str) -> PathBuf {
    let candidate = asset_dir.join(file_name);

    if !candidate.exists() {
        return candidate;
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Pasted image".into());
    let extension = path
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();

    for suffix in 2.. {
        let candidate = asset_dir.join(format!("{stem} {suffix}{extension}"));

        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("unique asset path loop should return")
}

fn has_ripgrep() -> bool {
    Command::new("rg").arg("--version").output().is_ok()
}

fn normalize_preview(line: &str) -> String {
    line.trim().chars().take(220).collect()
}

fn push_search_result(results: &mut Vec<SearchResult>, result: SearchResult) {
    // Search is intended for navigation, not exhaustive indexing. A hard cap
    // keeps IPC payloads and drawer rendering predictable in large vaults.
    if results.len() < SEARCH_RESULT_LIMIT {
        results.push(result);
    }
}

fn walk_files(root: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|err| format!("Could not list directory: {err}"))? {
        let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Could not read file type: {err}"))?;
        let path = entry.path();

        if file_type.is_dir() {
            walk_files(root, &path, files)?;
        } else if file_type.is_file() && path.starts_with(root) {
            files.push(path);
        }
    }

    Ok(())
}

fn filename_matches(
    root: &Path,
    files: Vec<PathBuf>,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    let query = query.to_lowercase();
    let mut results = Vec::new();

    for file in files {
        let relative_path = relative_string(root, &file)?;

        if relative_path.to_lowercase().contains(&query) {
            push_search_result(
                &mut results,
                SearchResult {
                    relative_path,
                    line_number: None,
                    line_text: None,
                    is_content_match: false,
                },
            );
        }
    }

    Ok(results)
}

fn search_filenames_with_ripgrep(root: &Path, query: &str) -> Result<Vec<SearchResult>, String> {
    let output = Command::new("rg")
        .arg("--files")
        .arg("--color")
        .arg("never")
        .arg(root)
        .output()
        .map_err(|err| format!("Could not run rg: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let files = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(PathBuf::from)
        .collect();

    filename_matches(root, files, query)
}

fn search_content_with_ripgrep(root: &Path, query: &str) -> Result<Vec<SearchResult>, String> {
    let output = Command::new("rg")
        .arg("--json")
        .arg("--line-number")
        .arg("--ignore-case")
        .arg("--color")
        .arg("never")
        .arg("--")
        .arg(query)
        .arg(root)
        .output()
        .map_err(|err| format!("Could not run rg: {err}"))?;

    if !output.status.success() && output.status.code() != Some(1) {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let mut results = Vec::new();

    // rg --json preserves path, line text, and line number without parsing
    // terminal-oriented output. Unknown event types are deliberately ignored.
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Ok(event) = serde_json::from_str::<RipgrepEvent>(line) else {
            continue;
        };

        if let RipgrepEvent::Match(data) = event {
            let path = PathBuf::from(data.path.text);
            let relative_path = relative_string(root, &path)?;

            push_search_result(
                &mut results,
                SearchResult {
                    relative_path,
                    line_number: data.line_number,
                    line_text: Some(normalize_preview(&data.lines.text)),
                    is_content_match: true,
                },
            );
        }
    }

    Ok(results)
}

fn search_content_fallback(
    root: &Path,
    query: &str,
    files: &[PathBuf],
) -> Result<Vec<SearchResult>, String> {
    let query = query.to_lowercase();
    let mut results = Vec::new();

    for file in files {
        let Ok(content) = fs::read_to_string(file) else {
            continue;
        };

        for (index, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query) {
                push_search_result(
                    &mut results,
                    SearchResult {
                        relative_path: relative_string(root, file)?,
                        line_number: Some(index + 1),
                        line_text: Some(normalize_preview(line)),
                        is_content_match: true,
                    },
                );
            }
        }
    }

    Ok(results)
}

fn normalize_metadata_text(value: &str) -> String {
    decode_html_entities(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(500)
        .collect()
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn parse_html_attrs(tag: &str) -> HashMap<String, String> {
    // Rich-link previews only need attributes from already-located tags. This
    // small scanner avoids pulling in a full HTML parser while still handling
    // quoted, unquoted, and boolean-style attributes used by metadata tags.
    let bytes = tag.as_bytes();
    let mut attrs = HashMap::new();
    let mut index = 0;

    while index < bytes.len() {
        while index < bytes.len() && !bytes[index].is_ascii_alphabetic() {
            index += 1;
        }

        let name_start = index;
        while index < bytes.len()
            && (bytes[index].is_ascii_alphanumeric() || matches!(bytes[index], b':' | b'-' | b'_'))
        {
            index += 1;
        }

        if name_start == index {
            break;
        }

        let name = tag[name_start..index].to_ascii_lowercase();

        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }

        if index >= bytes.len() || bytes[index] != b'=' {
            attrs.insert(name, String::new());
            continue;
        }

        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }

        if index >= bytes.len() {
            attrs.insert(name, String::new());
            break;
        }

        let value = if matches!(bytes[index], b'"' | b'\'') {
            let quote = bytes[index];
            index += 1;
            let value_start = index;
            while index < bytes.len() && bytes[index] != quote {
                index += 1;
            }
            let value = tag[value_start..index].to_string();
            if index < bytes.len() {
                index += 1;
            }
            value
        } else {
            let value_start = index;
            while index < bytes.len()
                && !bytes[index].is_ascii_whitespace()
                && !matches!(bytes[index], b'>')
            {
                index += 1;
            }
            tag[value_start..index].to_string()
        };

        attrs.insert(name, decode_html_entities(&value));
    }

    attrs
}

fn find_meta_content(html: &str, key: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut search_from = 0;
    let wanted = key.to_ascii_lowercase();

    while let Some(offset) = lower[search_from..].find("<meta") {
        let start = search_from + offset;
        let Some(end_offset) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_offset + 1;
        let attrs = parse_html_attrs(&html[start..end]);
        let matches_key = attrs.get("property").is_some_and(|value| value.eq_ignore_ascii_case(&wanted))
            || attrs.get("name").is_some_and(|value| value.eq_ignore_ascii_case(&wanted));

        if matches_key {
            if let Some(content) = attrs.get("content").map(|value| normalize_metadata_text(value)) {
                if !content.is_empty() {
                    return Some(content);
                }
            }
        }

        search_from = end;
    }

    None
}

fn find_html_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let content_start = lower[start..].find('>')? + start + 1;
    let content_end = lower[content_start..].find("</title>")? + content_start;
    let title = normalize_metadata_text(&html[content_start..content_end]);

    (!title.is_empty()).then_some(title)
}

fn absolute_metadata_url(base_url: &str, value: &str) -> String {
    let value = value.trim();

    if value.is_empty() {
        return String::new();
    }

    if let Ok(url) = reqwest::Url::parse(value) {
        return url.to_string();
    }

    reqwest::Url::parse(base_url)
        .and_then(|base| base.join(value))
        .map(|url| url.to_string())
        .unwrap_or_else(|_| value.to_string())
}

fn first_srcset_url(srcset: &str) -> Option<String> {
    srcset
        .split(',')
        .filter_map(|candidate| candidate.split_whitespace().next())
        .find(|candidate| !candidate.is_empty())
        .map(str::to_string)
}

fn is_usable_rich_link_image(value: &str) -> bool {
    let value = value.trim();
    let lower = value.to_ascii_lowercase();

    !value.is_empty()
        && !lower.starts_with("data:")
        && !lower.starts_with("blob:")
        && !lower.ends_with(".svg")
}

fn find_first_page_image(html: &str, base_url: &str) -> Option<String> {
    // Page-image fallback is intentionally shallow: early content is likely to
    // contain the article/card image, while scanning an entire page increases
    // latency and the chance of picking navigation or tracking images.
    let scan_end = html
        .char_indices()
        .map(|(index, _)| index)
        .take_while(|index| *index <= RICH_LINK_IMAGE_SCAN_BYTES)
        .last()
        .unwrap_or(html.len());
    let html = &html[..scan_end];
    let lower = html.to_ascii_lowercase();
    let mut search_from = 0;

    while let Some(offset) = lower[search_from..].find("<img") {
        let start = search_from + offset;
        let Some(end_offset) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_offset + 1;
        let attrs = parse_html_attrs(&html[start..end]);
        let image = attrs
            .get("src")
            .or_else(|| attrs.get("data-src"))
            .or_else(|| attrs.get("data-original"))
            .cloned()
            .or_else(|| attrs.get("srcset").and_then(|value| first_srcset_url(value)));

        if let Some(image) = image {
            if is_usable_rich_link_image(&image) {
                return Some(absolute_metadata_url(base_url, &image));
            }
        }

        search_from = end;
    }

    None
}

fn extract_rich_link_metadata(url: &str, html: &str) -> RichLinkMetadata {
    // Prefer explicit social metadata. The page image fallback is a last resort
    // so an author-provided Open Graph/Twitter image wins over decorative body
    // images that happen to appear earlier in the HTML.
    let title = find_meta_content(html, "og:title")
        .or_else(|| find_meta_content(html, "twitter:title"))
        .or_else(|| find_html_title(html))
        .unwrap_or_else(|| url.to_string());
    let description = find_meta_content(html, "og:description")
        .or_else(|| find_meta_content(html, "twitter:description"))
        .or_else(|| find_meta_content(html, "description"))
        .unwrap_or_default();
    let image = find_meta_content(html, "og:image")
        .or_else(|| find_meta_content(html, "twitter:image"))
        .map(|image| absolute_metadata_url(url, &image))
        .or_else(|| find_first_page_image(html, url))
        .unwrap_or_default();
    let site_name = find_meta_content(html, "og:site_name").unwrap_or_default();

    RichLinkMetadata {
        url: url.to_string(),
        title,
        description,
        image,
        site_name,
    }
}

#[tauri::command]
fn list_vault_dir(root: String, relative: String) -> Result<Vec<VaultEntry>, String> {
    let (root, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let show_dotfiles = read_vault_settings(root.to_string_lossy().into_owned())?
        .files
        .show_dotfiles;
    let mut entries = fs::read_dir(&dir)
        .map_err(|err| format!("Could not list directory: {err}"))?
        .filter_map(|entry| match entry {
            Ok(entry) => {
                let name = entry.file_name().to_string_lossy().into_owned();

                // .glyphary is vault-local application state, not a user note.
                if name == SETTINGS_FILE_NAME || (!show_dotfiles && name.starts_with('.')) {
                    None
                } else {
                    Some(Ok(entry))
                }
            }
            other => Some(other),
        })
        .map(|entry| {
            let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
            let file_type = entry
                .file_type()
                .map_err(|err| format!("Could not read file type: {err}"))?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();

            Ok(VaultEntry {
                name,
                relative_path: relative_string(&root, &path)?,
                is_dir: file_type.is_dir(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn read_vault_file(root: String, relative: String) -> Result<OpenedFile, String> {
    let (root, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    let content =
        fs::read_to_string(&path).map_err(|err| format!("Could not read file as text: {err}"))?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| relative.clone());

    Ok(OpenedFile {
        name,
        relative_path: relative_string(&root, &path)?,
        content,
    })
}

#[tauri::command]
fn write_vault_file(root: String, relative: String, content: String) -> Result<(), String> {
    let (_, path) = resolve_for_write(&root, &relative)?;

    if path.exists() && !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    fs::write(path, content).map_err(|err| format!("Could not write file: {err}"))
}

#[tauri::command]
fn create_vault_markdown_file(root: String, relative: String) -> Result<OpenedFile, String> {
    let root_path = vault_root(&root)?;
    let clean_relative = clean_relative(&relative)?;

    if clean_relative.as_os_str().is_empty() {
        return Err("Tidbit path cannot be empty".into());
    }

    let file_name = clean_relative
        .file_name()
        .ok_or_else(|| "Tidbit path must include a file name".to_string())?
        .to_string_lossy()
        .into_owned();

    if !file_name.to_lowercase().ends_with(".md") {
        return Err("Tidbit path must end with .md".into());
    }

    let parent = clean_relative
        .parent()
        .ok_or_else(|| "Tidbit path has no parent".to_string())?;
    let parent = ensure_vault_parent_dirs(&root_path, parent)?;
    let path = parent.join(&file_name);

    if path.exists() {
        return Err("A file already exists at the tidbit path".into());
    }

    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|err| format!("Could not create tidbit: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}

#[tauri::command]
fn rename_vault_file(
    root: String,
    relative: String,
    next_name: String,
) -> Result<OpenedFile, String> {
    let (root_path, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    let next_name = sanitize_markdown_file_name(&next_name)?;
    let parent = path
        .parent()
        .ok_or_else(|| "File path has no parent".to_string())?;
    let next_path = parent.join(next_name);

    if path == next_path {
        return read_vault_file(root, relative);
    }

    if next_path.exists() {
        return Err("A file with that page name already exists".into());
    }

    let parent = fs::canonicalize(parent)
        .map_err(|err| format!("Could not resolve target parent: {err}"))?;

    if !parent.starts_with(&root_path) {
        return Err("Path escapes the vault".into());
    }

    fs::rename(&path, &next_path).map_err(|err| format!("Could not rename file: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &next_path)?,
    )
}

#[tauri::command]
fn move_vault_file(
    root: String,
    relative: String,
    destination_directory: String,
) -> Result<OpenedFile, String> {
    let (root_path, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    let (_, destination_dir) = resolve_existing(&root, &destination_directory)?;

    if !destination_dir.is_dir() {
        return Err("Destination path is not a directory".into());
    }

    let file_name = path
        .file_name()
        .ok_or_else(|| "File path has no name".to_string())?;
    let next_path = destination_dir.join(file_name);

    if path == next_path {
        return read_vault_file(root, relative);
    }

    if next_path.exists() {
        return Err("A file with that name already exists in the destination".into());
    }

    fs::rename(&path, &next_path).map_err(|err| format!("Could not move file: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &next_path)?,
    )
}

#[tauri::command]
fn delete_vault_file(root: String, relative: String) -> Result<(), String> {
    let (_, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    fs::remove_file(path).map_err(|err| format!("Could not delete file: {err}"))
}

#[tauri::command]
fn create_note_in_directory(
    root: String,
    relative: String,
    note_name: String,
) -> Result<OpenedFile, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let note_name = sanitize_markdown_file_name(&note_name)?;
    let path = dir.join(note_name);

    if path.exists() {
        return Err("A note with that name already exists in this folder".into());
    }

    fs::write(&path, "").map_err(|err| format!("Could not create note: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}

#[tauri::command]
fn create_directory_in_directory(
    root: String,
    relative: String,
    directory_name: String,
) -> Result<RenamedDirectory, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let directory_name = sanitize_directory_name(&directory_name)?;
    let path = dir.join(&directory_name);

    if path.exists() {
        return Err("A folder with that name already exists in this folder".into());
    }

    fs::create_dir(&path).map_err(|err| format!("Could not create folder: {err}"))?;

    Ok(RenamedDirectory {
        name: directory_name,
        relative_path: relative_string(&root_path, &path)?,
    })
}

#[tauri::command]
fn rename_vault_directory(
    root: String,
    relative: String,
    next_name: String,
) -> Result<RenamedDirectory, String> {
    if relative.trim().is_empty() {
        return Err("Cannot rename the vault root".into());
    }

    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let next_name = sanitize_directory_name(&next_name)?;
    let parent = dir
        .parent()
        .ok_or_else(|| "Directory path has no parent".to_string())?;
    let next_dir = parent.join(&next_name);

    if dir == next_dir {
        return Ok(RenamedDirectory {
            name: next_name,
            relative_path: relative_string(&root_path, &dir)?,
        });
    }

    if next_dir.exists() {
        return Err("A folder with that name already exists".into());
    }

    let old_shadow = shadow_note_path_for_directory(&dir)?;
    let old_shadow_exists = old_shadow.exists();

    if old_shadow_exists && !old_shadow.is_file() {
        return Err("Directory shadow note path is not a file".into());
    }

    let new_shadow = shadow_note_path_for_directory(&next_dir)?;
    let new_shadow_name = new_shadow
        .file_name()
        .ok_or_else(|| "Shadow note has no name".to_string())?;
    let old_shadow_name = old_shadow
        .file_name()
        .ok_or_else(|| "Shadow note has no name".to_string())?;
    let renamed_shadow_would_move = old_shadow_exists && old_shadow_name != new_shadow_name;

    if renamed_shadow_would_move && dir.join(new_shadow_name).exists() {
        return Err("A shadow note with the new folder name already exists".into());
    }

    fs::rename(&dir, &next_dir).map_err(|err| format!("Could not rename folder: {err}"))?;

    if renamed_shadow_would_move {
        let old_shadow_after_directory_rename = next_dir.join(
            old_shadow
                .file_name()
                .ok_or_else(|| "Shadow note has no name".to_string())?,
        );

        fs::rename(&old_shadow_after_directory_rename, &new_shadow)
            .map_err(|err| format!("Could not rename folder shadow note: {err}"))?;
    }

    Ok(RenamedDirectory {
        name: next_name,
        relative_path: relative_string(&root_path, &next_dir)?,
    })
}

#[tauri::command]
fn move_vault_directory(
    root: String,
    relative: String,
    destination_directory: String,
) -> Result<RenamedDirectory, String> {
    if relative.trim().is_empty() {
        return Err("Cannot move the vault root".into());
    }

    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let (_, destination_dir) = resolve_existing(&root, &destination_directory)?;

    if !destination_dir.is_dir() {
        return Err("Destination path is not a directory".into());
    }

    if destination_dir == dir || destination_dir.starts_with(&dir) {
        return Err("Cannot move a folder into itself".into());
    }

    let directory_name = dir
        .file_name()
        .ok_or_else(|| "Directory path has no name".to_string())?;
    let next_dir = destination_dir.join(directory_name);

    if dir == next_dir {
        return Ok(RenamedDirectory {
            name: directory_name.to_string_lossy().into_owned(),
            relative_path: relative_string(&root_path, &dir)?,
        });
    }

    if next_dir.exists() {
        return Err("A folder with that name already exists in the destination".into());
    }

    fs::rename(&dir, &next_dir).map_err(|err| format!("Could not move folder: {err}"))?;

    Ok(RenamedDirectory {
        name: directory_name.to_string_lossy().into_owned(),
        relative_path: relative_string(&root_path, &next_dir)?,
    })
}

#[tauri::command]
fn open_directory_shadow_file(root: String, relative: String) -> Result<OpenedFile, String> {
    let (root_path, dir) = resolve_existing(&root, &relative)?;

    if !dir.is_dir() {
        return Err("Vault path is not a directory".into());
    }

    let shadow = shadow_note_path_for_directory(&dir)?;

    // A directory can be opened as an editable note by materializing a shadow
    // markdown file inside it. Subsequent opens edit the same file.
    if !shadow.exists() {
        let dir_name = dir
            .file_name()
            .ok_or_else(|| "Directory has no name".to_string())?
            .to_string_lossy()
            .into_owned();

        fs::write(&shadow, format!("# {dir_name}\n"))
            .map_err(|err| format!("Could not create directory note: {err}"))?;
    }

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &shadow)?,
    )
}

#[tauri::command]
fn open_calendar_day_file(root: String, relative: String, _title: String) -> Result<OpenedFile, String> {
    let root_path = vault_root(&root)?;
    let relative_path = clean_relative(&relative)?;

    // Calendar creation is intentionally scoped to ROOT/Calendar so double-click
    // actions in the calendar drawer cannot create arbitrary vault files.
    if !relative_path.starts_with("Calendar") {
        return Err("Calendar day files must live under Calendar".into());
    }

    let path = root_path.join(&relative_path);

    if path.exists() && !path.is_file() {
        return Err("Calendar day path is not a file".into());
    }

    if !path.exists() {
        let parent = path
            .parent()
            .ok_or_else(|| "Calendar day path has no parent".to_string())?;
        let parent_guard = parent.parent().unwrap_or(&root_path);

        if !parent_guard.starts_with(&root_path) {
            return Err("Path escapes the vault".into());
        }

        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create calendar directory: {err}"))?;
        fs::write(&path, "")
            .map_err(|err| format!("Could not create calendar note: {err}"))?;
    }

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}

#[tauri::command]
fn list_calendar_day_files(root: String) -> Result<Vec<String>, String> {
    let root_path = vault_root(&root)?;
    let calendar_dir = root_path.join("Calendar");

    if !calendar_dir.exists() {
        return Ok(Vec::new());
    }

    if !calendar_dir.is_dir() {
        return Err("Calendar path is not a directory".into());
    }

    let mut files = fs::read_dir(&calendar_dir)
        .map_err(|err| format!("Could not list calendar directory: {err}"))?
        .map(|entry| {
            let entry = entry.map_err(|err| format!("Could not read calendar entry: {err}"))?;
            let file_type = entry
                .file_type()
                .map_err(|err| format!("Could not read calendar entry type: {err}"))?;
            let path = entry.path();

            if file_type.is_file() {
                Ok(Some(relative_string(&root_path, &path)?))
            } else {
                Ok(None)
            }
        })
        .collect::<Result<Vec<_>, String>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    files.sort();
    Ok(files)
}

#[tauri::command]
fn read_vault_settings(root: String) -> Result<VaultSettings, String> {
    let root = vault_root(&root)?;
    let path = root.join(SETTINGS_FILE_NAME);

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
fn write_vault_settings(root: String, settings: VaultSettings) -> Result<VaultSettings, String> {
    let root = vault_root(&root)?;
    let settings = clean_settings(settings)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("Could not serialize vault settings: {err}"))?;

    fs::write(root.join(SETTINGS_FILE_NAME), format!("{content}\n"))
        .map_err(|err| format!("Could not write vault settings: {err}"))?;

    Ok(settings)
}

#[tauri::command]
fn allow_vault_assets(
    app: tauri::AppHandle,
    root: String,
    asset_directory: String,
) -> Result<(), String> {
    let root = vault_root(&root)?;
    let assets = root.join(clean_settings_asset_directory(&asset_directory)?);

    // convertFileSrc only works for directories allowed in Tauri's asset scope.
    // This permission is per-vault and must be refreshed when settings change.
    app.asset_protocol_scope()
        .allow_directory(&assets, true)
        .map_err(|err| format!("Could not allow vault assets: {err}"))
}

#[cfg(target_os = "macos")]
fn apply_window_glass_effect(app: &tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    use tauri::window::{Color, Effect, EffectState, EffectsBuilder};

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available".to_string())?;

    if enabled {
        // Native material is only visible if both the window and WKWebView
        // backgrounds are transparent. The Tauri config handles creation-time
        // transparency; this runtime call updates the current WebView when the
        // user toggles the vault setting.
        window
            .set_background_color(Some(Color(0, 0, 0, 0)))
            .map_err(|err| format!("Could not make window background transparent: {err}"))?;
        window
            .set_effects(
                EffectsBuilder::new()
                    .effect(Effect::UnderWindowBackground)
                    .state(EffectState::FollowsWindowActiveState)
                    .radius(12.0)
                    .build(),
            )
            .map_err(|err| format!("Could not enable window glass effect: {err}"))?;
    } else {
        // Clearing effects entirely, or switching to the narrower Titlebar
        // material, makes macOS draw black title text on this transparent
        // window. Keep the native material that gives correct title contrast;
        // the frontend's data-window-glass flag controls whether the user sees
        // the glass styling.
        window
            .set_background_color(Some(Color(0, 0, 0, 0)))
            .map_err(|err| format!("Could not keep window background transparent: {err}"))?;
        window
            .set_effects(
                EffectsBuilder::new()
                    .effect(Effect::UnderWindowBackground)
                    .state(EffectState::FollowsWindowActiveState)
                    .radius(12.0)
                    .build(),
            )
            .map_err(|err| format!("Could not keep titlebar contrast material: {err}"))?;
    }

    Ok(enabled)
}

#[cfg(not(target_os = "macos"))]
fn apply_window_glass_effect(_app: &tauri::AppHandle, _enabled: bool) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
fn set_window_glass_effect(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    apply_window_glass_effect(&app, enabled)
}

#[tauri::command]
fn save_vault_asset(
    root: String,
    asset_directory: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<SavedAsset, String> {
    if bytes.is_empty() {
        return Err("Image file is empty".into());
    }

    if bytes.len() > MAX_ASSET_BYTES {
        return Err("Image file is larger than 50 MB".into());
    }

    let root = vault_root(&root)?;
    let assets = root.join(clean_settings_asset_directory(&asset_directory)?);
    fs::create_dir_all(&assets)
        .map_err(|err| format!("Could not create asset directory: {err}"))?;

    let file_name = sanitize_asset_file_name(&file_name);
    let path = unique_asset_path(&assets, &file_name);
    // Never overwrite a pasted/dropped asset. The frontend inserts the stored
    // filename returned here, so collision suffixes stay visible in markdown.
    fs::write(&path, bytes).map_err(|err| format!("Could not write image asset: {err}"))?;

    let stored_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| "Stored asset has no file name".to_string())?;

    Ok(SavedAsset {
        file_name: stored_name,
        relative_path: relative_string(&root, &path)?,
    })
}

#[tauri::command]
fn search_vault(
    root: String,
    query: String,
    include_content: bool,
) -> Result<Vec<SearchResult>, String> {
    let root = vault_root(&root)?;
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    if has_ripgrep() {
        // Prefer rg when available, but keep the fallback below so the app
        // remains functional on machines without command-line tooling.
        let mut results = search_filenames_with_ripgrep(&root, query)?;

        if include_content && results.len() < SEARCH_RESULT_LIMIT {
            let content_results = search_content_with_ripgrep(&root, query)?;
            for result in content_results {
                push_search_result(&mut results, result);
            }
        }

        return Ok(results);
    }

    let mut files = Vec::new();
    walk_files(&root, &root, &mut files)?;
    let mut results = filename_matches(&root, files.clone(), query)?;

    if include_content && results.len() < SEARCH_RESULT_LIMIT {
        for result in search_content_fallback(&root, query, &files)? {
            push_search_result(&mut results, result);
        }
    }

    Ok(results)
}

#[tauri::command]
async fn fetch_rich_link_metadata(url: String) -> Result<RichLinkMetadata, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "Enter a valid http or https URL".to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Rich links only support http and https URLs".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Glyphary/0.1 rich-link preview")
        .build()
        .map_err(|err| format!("Could not prepare rich link request: {err}"))?;
    let response = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|err| format!("Could not fetch rich link: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Rich link request returned {}", response.status()));
    }

    if response.content_length().unwrap_or(0) > MAX_RICH_LINK_HTML_BYTES {
        return Err("Rich link page is too large to preview".into());
    }

    let final_url = response.url().to_string();
    let html = response
        .text()
        .await
        .map_err(|err| format!("Could not read rich link page: {err}"))?;

    if html.len() as u64 > MAX_RICH_LINK_HTML_BYTES {
        return Err("Rich link page is too large to preview".into());
    }

    Ok(extract_rich_link_metadata(&final_url, &html))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            let package_info = app.package_info();
            let config = app.config();
            // macOS only renders a subset of Tauri's AboutMetadata fields. Keep
            // the cross-platform fields populated, but put the useful product
            // description in credits so the native macOS About panel is not bare.
            let about_metadata = AboutMetadata {
                name: Some("Glyphary".into()),
                version: Some(package_info.version.to_string()),
                short_version: Some(package_info.version.to_string()),
                copyright: config
                    .bundle
                    .copyright
                    .clone()
                    .or_else(|| Some("Copyright © 2026 Glyphary contributors".into())),
                authors: Some(vec!["Glyphary contributors".into()]),
                comments: Some(
                    "A local-first Markdown workspace with vaults, tabs, drawers, themes, and Tiptap editing."
                        .into(),
                ),
                website: Some("https://github.com/".into()),
                website_label: Some("Glyphary Project".into()),
                credits: Some(
                    "Glyphary\n\nA local-first Markdown workspace for vaults, rich notes, calendar pages, and themed writing.\n\nBuilt with Tauri, React, Tiptap, ProseMirror, highlight.js, and lowlight."
                        .into(),
                ),
                ..Default::default()
            };
            let open_vault = MenuItem::with_id(
                app,
                "open_vault",
                "Open Vault...",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let save = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
            let new_document =
                MenuItem::with_id(app, "new_document", "New", true, Some("CmdOrCtrl+N"))?;
            let settings =
                MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
            let appearance_auto =
                MenuItem::with_id(app, "appearance_auto", "Style: Auto", true, None::<&str>)?;
            let appearance_light =
                MenuItem::with_id(app, "appearance_light", "Style: Light", true, None::<&str>)?;
            let appearance_dark =
                MenuItem::with_id(app, "appearance_dark", "Style: Dark", true, None::<&str>)?;
            let app_menu = Submenu::with_items(
                app,
                package_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;
            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_document,
                    &open_vault,
                    &save,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            let view_menu = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &appearance_auto,
                    &appearance_light,
                    &appearance_dark,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?;
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            let help_menu = Submenu::with_items(
                app,
                "Help",
                true,
                &[&PredefinedMenuItem::bring_all_to_front(app, None)?],
            )?;

            Menu::with_items(
                app,
                &[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &window_menu,
                    &help_menu,
                ],
            )
        })
        .on_menu_event(|app, event| {
            // Menu items emit into the webview instead of duplicating app
            // behavior in Rust; React owns document state and dirty tracking.
            if event.id() == "open_vault" {
                let _ = app.emit("open-vault-requested", ());
            } else if event.id() == "save" {
                let _ = app.emit("save-requested", ());
            } else if event.id() == "new_document" {
                let _ = app.emit("new-document-requested", ());
            } else if event.id() == "settings" {
                let _ = app.emit("settings-requested", ());
            } else if event.id() == "appearance_auto" {
                let _ = app.emit("appearance-requested", "auto");
            } else if event.id() == "appearance_light" {
                let _ = app.emit("appearance-requested", "light");
            } else if event.id() == "appearance_dark" {
                let _ = app.emit("appearance-requested", "dark");
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_vault_dir,
            read_vault_file,
            write_vault_file,
            create_vault_markdown_file,
            rename_vault_file,
            move_vault_file,
            delete_vault_file,
            create_note_in_directory,
            create_directory_in_directory,
            rename_vault_directory,
            move_vault_directory,
            open_directory_shadow_file,
            open_calendar_day_file,
            list_calendar_day_files,
            read_vault_settings,
            write_vault_settings,
            allow_vault_assets,
            set_window_glass_effect,
            save_vault_asset,
            search_vault,
            fetch_rich_link_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn test_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be available")
            .as_nanos();
        let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("glyphary-vault-test-{unique}-{counter}"));
        if root.exists() {
            fs::remove_dir_all(&root).expect("stale test root should be removed");
        }
        fs::create_dir_all(&root).expect("test root should be created");
        root
    }

    #[test]
    fn lists_directories_before_files() {
        let root = test_root();
        fs::create_dir(root.join("notes")).expect("directory should be created");
        fs::write(root.join("alpha.md"), "# Alpha\n").expect("file should be created");
        fs::write(root.join(SETTINGS_FILE_NAME), "{}").expect("settings file should be created");

        let entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
            .expect("directory should list");

        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].relative_path, "notes");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].relative_path, "alpha.md");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn hides_dotfiles_unless_vault_settings_enable_them() {
        let root = test_root();
        fs::write(root.join("alpha.md"), "# Alpha\n").expect("file should be created");
        fs::write(root.join(".hidden.md"), "# Hidden\n").expect("hidden file should be created");

        let hidden_entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
            .expect("directory should list");

        assert_eq!(hidden_entries.len(), 1);
        assert_eq!(hidden_entries[0].relative_path, "alpha.md");

        write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: DEFAULT_ASSET_DIRECTORY.into(),
                frontmatter_pills: FrontmatterPillSettings::default(),
                files: FileDisplaySettings {
                    show_dotfiles: true,
                },
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: None,
            },
        )
        .expect("settings should write");

        let visible_entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
            .expect("directory should list");
        let paths = visible_entries
            .into_iter()
            .map(|entry| entry.relative_path)
            .collect::<Vec<_>>();

        assert_eq!(paths, vec![".hidden.md", "alpha.md"]);

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn reads_default_vault_settings_when_missing() {
        let root = test_root();

        let settings = read_vault_settings(root.to_string_lossy().into_owned())
            .expect("settings should default");

        assert_eq!(settings.asset_directory, DEFAULT_ASSET_DIRECTORY);
        assert!(settings.frontmatter_pills.enabled);
        assert_eq!(
            settings.frontmatter_pills.header_name,
            DEFAULT_FRONTMATTER_PILL_HEADER
        );
        assert!(!settings.files.show_dotfiles);
        assert!(settings.autosave.enabled);
        assert_eq!(settings.tidbits.path_pattern, DEFAULT_TIDBIT_PATH_PATTERN);
        assert!(!settings.editor.vim_mode);
        assert!(!settings.appearance.glass_effect);
        assert!(settings.theme.is_none());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn writes_vault_settings_file() {
        let root = test_root();

        let settings = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: "media/images".into(),
                frontmatter_pills: FrontmatterPillSettings {
                    enabled: false,
                    header_name: "topics".into(),
                },
                files: FileDisplaySettings {
                    show_dotfiles: true,
                },
                autosave: AutosaveSettings { enabled: false },
                tidbits: TidbitSettings {
                    path_pattern: "Inbox/tidbit-{{date:YYYY-MM-DD-HH-mm-ss}}.md".into(),
                },
                editor: EditorSettings { vim_mode: true },
                appearance: AppearanceSettings { glass_effect: true },
                theme: None,
            },
        )
        .expect("settings should write");

        assert_eq!(settings.asset_directory, "media/images");
        assert!(!settings.frontmatter_pills.enabled);
        assert_eq!(settings.frontmatter_pills.header_name, "topics");
        assert!(settings.files.show_dotfiles);
        assert!(!settings.autosave.enabled);
        assert_eq!(
            settings.tidbits.path_pattern,
            "Inbox/tidbit-{{date:YYYY-MM-DD-HH-mm-ss}}.md"
        );
        assert!(settings.editor.vim_mode);
        assert!(settings.appearance.glass_effect);
        assert!(
            fs::read_to_string(root.join(SETTINGS_FILE_NAME))
                .expect("settings should be readable")
                .contains("media/images")
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn rejects_invalid_vault_settings_asset_directories() {
        let root = test_root();

        let empty = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: " ".into(),
                frontmatter_pills: FrontmatterPillSettings::default(),
                files: FileDisplaySettings::default(),
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: None,
            },
        )
        .expect_err("empty asset directory should fail");
        let escaped = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: "../assets".into(),
                frontmatter_pills: FrontmatterPillSettings::default(),
                files: FileDisplaySettings::default(),
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: None,
            },
        )
        .expect_err("escaping asset directory should fail");

        assert!(empty.contains("cannot be empty"));
        assert!(escaped.contains("escapes the vault"));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn rejects_invalid_frontmatter_pill_headers() {
        let root = test_root();

        let empty = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: DEFAULT_ASSET_DIRECTORY.into(),
                frontmatter_pills: FrontmatterPillSettings {
                    enabled: true,
                    header_name: " ".into(),
                },
                files: FileDisplaySettings::default(),
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: None,
            },
        )
        .expect_err("empty pill header should fail");
        let unsafe_name = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: DEFAULT_ASSET_DIRECTORY.into(),
                frontmatter_pills: FrontmatterPillSettings {
                    enabled: true,
                    header_name: "tags: bad".into(),
                },
                files: FileDisplaySettings::default(),
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: None,
            },
        )
        .expect_err("unsafe pill header should fail");

        assert!(empty.contains("cannot be empty"));
        assert!(unsafe_name.contains("unsupported characters"));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn writes_vault_theme_tokens() {
        let root = test_root();
        let mut tokens = HashMap::new();
        tokens.insert("--glyphary-accent".into(), "#336699".into());
        tokens.insert("--glyphary-surface".into(), "  #ffffff  ".into());

        let settings = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: DEFAULT_ASSET_DIRECTORY.into(),
                frontmatter_pills: FrontmatterPillSettings::default(),
                files: FileDisplaySettings::default(),
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: Some(VaultTheme {
                    preset_id: Some("field-notes".into()),
                    tokens,
                }),
            },
        )
        .expect("settings should write");
        let saved_theme = settings
            .theme
            .expect("theme should be retained");
        let saved_tokens = saved_theme.tokens;

        assert_eq!(saved_theme.preset_id, Some("field-notes".to_string()));
        assert_eq!(saved_tokens.get("--glyphary-accent"), Some(&"#336699".to_string()));
        assert_eq!(saved_tokens.get("--glyphary-surface"), Some(&"#ffffff".to_string()));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn rejects_unsupported_vault_theme_tokens() {
        let root = test_root();
        let mut tokens = HashMap::new();
        tokens.insert("--not-a-token".into(), "#336699".into());

        let error = write_vault_settings(
            root.to_string_lossy().into_owned(),
            VaultSettings {
                asset_directory: DEFAULT_ASSET_DIRECTORY.into(),
                frontmatter_pills: FrontmatterPillSettings::default(),
                files: FileDisplaySettings::default(),
                autosave: AutosaveSettings::default(),
                tidbits: TidbitSettings::default(),
                editor: EditorSettings::default(),
                appearance: AppearanceSettings::default(),
                theme: Some(VaultTheme {
                    preset_id: None,
                    tokens,
                }),
            },
        )
        .expect_err("unsupported token should fail");

        assert!(error.contains("Unsupported theme token"));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn reads_and_writes_files_inside_vault() {
        let root = test_root();
        fs::write(root.join("note.md"), "# Old\n").expect("file should be created");

        let opened = read_vault_file(root.to_string_lossy().into_owned(), "note.md".into())
            .expect("file should be readable");
        assert_eq!(opened.content, "# Old\n");

        write_vault_file(
            root.to_string_lossy().into_owned(),
            "note.md".into(),
            "# New\n".into(),
        )
        .expect("file should be writable");

        let opened = read_vault_file(root.to_string_lossy().into_owned(), "note.md".into())
            .expect("file should be readable");
        assert_eq!(opened.content, "# New\n");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn creates_directory_shadow_file() {
        let root = test_root();
        fs::create_dir(root.join("chapter")).expect("directory should be created");

        let opened =
            open_directory_shadow_file(root.to_string_lossy().into_owned(), "chapter".into())
                .expect("shadow file should open");

        assert_eq!(opened.name, "chapter.md");
        assert_eq!(opened.relative_path, "chapter/chapter.md");
        assert_eq!(opened.content, "# chapter\n");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn creates_note_inside_directory() {
        let root = test_root();
        fs::create_dir(root.join("chapter")).expect("directory should be created");

        let opened = create_note_in_directory(
            root.to_string_lossy().into_owned(),
            "chapter".into(),
            "Scene One".into(),
        )
        .expect("note should be created");

        assert_eq!(opened.name, "Scene One.md");
        assert_eq!(opened.relative_path, "chapter/Scene One.md");
        assert!(root.join("chapter").join("Scene One.md").exists());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn creates_nested_vault_markdown_file() {
        let root = test_root();

        let opened = create_vault_markdown_file(
            root.to_string_lossy().into_owned(),
            "__transit__/Objects/tidbit-2026-06-15-09-04-07.md".into(),
        )
        .expect("tidbit should be created");

        assert_eq!(opened.name, "tidbit-2026-06-15-09-04-07.md");
        assert_eq!(
            opened.relative_path,
            "__transit__/Objects/tidbit-2026-06-15-09-04-07.md"
        );
        assert_eq!(opened.content, "");
        assert!(root
            .join("__transit__")
            .join("Objects")
            .join("tidbit-2026-06-15-09-04-07.md")
            .is_file());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn creates_folder_inside_directory() {
        let root = test_root();
        fs::create_dir(root.join("chapter")).expect("directory should be created");

        let created = create_directory_in_directory(
            root.to_string_lossy().into_owned(),
            "chapter".into(),
            "Scenes".into(),
        )
        .expect("folder should be created");

        assert_eq!(created.name, "Scenes");
        assert_eq!(created.relative_path, "chapter/Scenes");
        assert!(root.join("chapter").join("Scenes").is_dir());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn renames_directory_and_shadow_note() {
        let root = test_root();
        fs::create_dir(root.join("chapter")).expect("directory should be created");
        fs::write(root.join("chapter").join("chapter.md"), "# Shadow\n")
            .expect("shadow note should be written");

        let renamed = rename_vault_directory(
            root.to_string_lossy().into_owned(),
            "chapter".into(),
            "Book One".into(),
        )
        .expect("folder should rename");

        assert_eq!(renamed.name, "Book One");
        assert_eq!(renamed.relative_path, "Book One");
        assert!(!root.join("chapter").exists());
        assert!(root.join("Book One").is_dir());
        assert!(!root.join("Book One").join("chapter.md").exists());
        assert_eq!(
            fs::read_to_string(root.join("Book One").join("Book One.md"))
                .expect("renamed shadow note should be readable"),
            "# Shadow\n",
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn moves_vault_directory_to_existing_directory() {
        let root = test_root();
        fs::create_dir(root.join("archive")).expect("directory should be created");
        fs::create_dir(root.join("notes")).expect("directory should be created");
        fs::write(root.join("notes").join("note.md"), "# Note\n").expect("file should be created");

        let moved = move_vault_directory(
            root.to_string_lossy().into_owned(),
            "notes".into(),
            "archive".into(),
        )
        .expect("directory should move");

        assert_eq!(moved.name, "notes");
        assert_eq!(moved.relative_path, "archive/notes");
        assert!(!root.join("notes").exists());
        assert_eq!(
            fs::read_to_string(root.join("archive").join("notes").join("note.md"))
                .expect("moved child file should be readable"),
            "# Note\n",
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn refuses_to_move_vault_directory_into_itself() {
        let root = test_root();
        fs::create_dir_all(root.join("notes").join("child")).expect("directories should be created");

        let error = move_vault_directory(
            root.to_string_lossy().into_owned(),
            "notes".into(),
            "notes/child".into(),
        )
        .expect_err("directory should not move into itself");

        assert!(error.contains("itself"));
        assert!(root.join("notes").join("child").is_dir());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn opens_or_creates_calendar_day_file() {
        let root = test_root();

        let opened = open_calendar_day_file(
            root.to_string_lossy().into_owned(),
            "Calendar/Sun, Jun 14th 2026.md".into(),
            "Sun, Jun 14th 2026".into(),
        )
        .expect("calendar day should open");

        assert_eq!(opened.name, "Sun, Jun 14th 2026.md");
        assert_eq!(opened.relative_path, "Calendar/Sun, Jun 14th 2026.md");
        assert_eq!(opened.content, "");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn rejects_calendar_day_files_outside_calendar_directory() {
        let root = test_root();
        let error = open_calendar_day_file(
            root.to_string_lossy().into_owned(),
            "Notes/Sun, Jun 14th 2026.md".into(),
            "Sun, Jun 14th 2026".into(),
        )
        .expect_err("calendar path outside Calendar should fail");

        assert!(error.contains("must live under Calendar"));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn lists_calendar_day_files() {
        let root = test_root();
        fs::create_dir(root.join("Calendar")).expect("calendar directory should be created");
        fs::write(root.join("Calendar").join("Sun, Jun 14th 2026.md"), "# Day\n")
            .expect("calendar file should be created");
        fs::create_dir(root.join("Calendar").join("Archive"))
            .expect("nested directory should be created");

        let existing = list_calendar_day_files(root.to_string_lossy().into_owned())
            .expect("calendar day files should be listed");

        assert_eq!(existing, vec!["Calendar/Sun, Jun 14th 2026.md"]);

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn lists_no_calendar_day_files_when_calendar_directory_is_missing() {
        let root = test_root();

        let existing = list_calendar_day_files(root.to_string_lossy().into_owned())
            .expect("missing calendar directory should be empty");

        assert!(existing.is_empty());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn rejects_parent_path_escape() {
        let root = test_root();
        let error = list_vault_dir(root.to_string_lossy().into_owned(), "../".into())
            .expect_err("parent traversal should be rejected");

        assert!(error.contains("escapes the vault"));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn searches_vault_file_names() {
        let root = test_root();
        fs::create_dir(root.join("notes")).expect("directory should be created");
        fs::write(root.join("notes").join("Project Plan.md"), "# Plan\n")
            .expect("file should be created");
        fs::write(root.join("other.md"), "# Other\n").expect("file should be created");

        let results = search_vault(root.to_string_lossy().into_owned(), "project".into(), false)
            .expect("vault search should succeed");

        assert!(results
            .iter()
            .any(|result| result.relative_path == "notes/Project Plan.md"
                && !result.is_content_match));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn searches_vault_file_content() {
        let root = test_root();
        fs::write(root.join("alpha.md"), "# Alpha\nNeedle lives here\n")
            .expect("file should be created");
        fs::write(root.join("beta.md"), "# Beta\n").expect("file should be created");

        let results = search_vault(root.to_string_lossy().into_owned(), "needle".into(), true)
            .expect("vault search should succeed");

        assert!(results.iter().any(|result| {
            result.relative_path == "alpha.md"
                && result.is_content_match
                && result.line_number == Some(2)
                && result
                    .line_text
                    .as_deref()
                    .is_some_and(|line| line.contains("Needle"))
        }));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn extracts_rich_link_metadata_from_open_graph_tags() {
        let metadata = extract_rich_link_metadata(
            "https://example.com/articles/post",
            r#"
              <html>
                <head>
                  <meta property="og:title" content="Example &amp; Title">
                  <meta property="og:description" content="A useful summary">
                  <meta property="og:image" content="/images/card.png">
                  <meta property="og:site_name" content="Example Site">
                </head>
              </html>
            "#,
        );

        assert_eq!(metadata.url, "https://example.com/articles/post");
        assert_eq!(metadata.title, "Example & Title");
        assert_eq!(metadata.description, "A useful summary");
        assert_eq!(metadata.image, "https://example.com/images/card.png");
        assert_eq!(metadata.site_name, "Example Site");
    }

    #[test]
    fn extracts_rich_link_metadata_from_standard_html_fallbacks() {
        let metadata = extract_rich_link_metadata(
            "https://example.com/",
            r#"
              <html>
                <head>
                  <title>Fallback Title</title>
                  <meta name="description" content="Fallback description">
                </head>
              </html>
            "#,
        );

        assert_eq!(metadata.title, "Fallback Title");
        assert_eq!(metadata.description, "Fallback description");
        assert_eq!(metadata.image, "");
        assert_eq!(metadata.site_name, "");
    }

    #[test]
    fn extracts_rich_link_image_from_early_page_image_when_metadata_is_missing() {
        let metadata = extract_rich_link_metadata(
            "https://example.com/articles/post",
            r#"
              <html>
                <head><title>Fallback Image</title></head>
                <body>
                  <img src="data:image/gif;base64,abc">
                  <img src="/images/hero.jpg">
                </body>
              </html>
            "#,
        );

        assert_eq!(metadata.title, "Fallback Image");
        assert_eq!(metadata.image, "https://example.com/images/hero.jpg");
    }

    #[test]
    fn extracts_rich_link_image_from_srcset_when_src_is_missing() {
        let metadata = extract_rich_link_metadata(
            "https://example.com/articles/post",
            r#"
              <html>
                <head><title>Srcset Image</title></head>
                <body>
                  <img srcset="/small.webp 480w, /large.webp 1200w">
                </body>
              </html>
            "#,
        );

        assert_eq!(metadata.image, "https://example.com/small.webp");
    }

    #[test]
    fn keeps_metadata_image_before_page_image_fallback() {
        let metadata = extract_rich_link_metadata(
            "https://example.com/articles/post",
            r#"
              <html>
                <head>
                  <meta property="og:image" content="/images/social.jpg">
                </head>
                <body>
                  <img src="/images/hero.jpg">
                </body>
              </html>
            "#,
        );

        assert_eq!(metadata.image, "https://example.com/images/social.jpg");
    }

    #[test]
    fn saves_vault_asset_in_assets_directory() {
        let root = test_root();
        let saved = save_vault_asset(
            root.to_string_lossy().into_owned(),
            DEFAULT_ASSET_DIRECTORY.into(),
            "../My Image 20230102173741.png".into(),
            vec![1, 2, 3],
        )
        .expect("asset should save");

        assert_eq!(saved.file_name, "My Image 20230102173741.png");
        assert_eq!(saved.relative_path, "_assets_/My Image 20230102173741.png");
        assert_eq!(
            fs::read(root.join("_assets_").join(&saved.file_name)).expect("asset should be read"),
            vec![1, 2, 3]
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn saves_vault_asset_in_custom_assets_directory() {
        let root = test_root();
        let saved = save_vault_asset(
            root.to_string_lossy().into_owned(),
            "media/images".into(),
            "Pasted image 20230102173741.png".into(),
            vec![9, 8, 7],
        )
        .expect("asset should save in custom directory");

        assert_eq!(saved.relative_path, "media/images/Pasted image 20230102173741.png");
        assert_eq!(
            fs::read(root.join("media").join("images").join(saved.file_name))
                .expect("asset should be read"),
            vec![9, 8, 7]
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn saves_vault_asset_without_overwriting_existing_file() {
        let root = test_root();
        fs::create_dir(root.join("_assets_")).expect("asset directory should be created");
        fs::write(
            root.join("_assets_")
                .join("Pasted image 20230102173741.png"),
            vec![1],
        )
        .expect("existing asset should be created");

        let saved = save_vault_asset(
            root.to_string_lossy().into_owned(),
            DEFAULT_ASSET_DIRECTORY.into(),
            "Pasted image 20230102173741.png".into(),
            vec![2],
        )
        .expect("asset should save");

        assert_eq!(saved.file_name, "Pasted image 20230102173741 2.png");
        assert_eq!(
            fs::read(root.join("_assets_").join(saved.file_name)).expect("asset should be read"),
            vec![2]
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn renames_vault_file_in_same_directory() {
        let root = test_root();
        fs::create_dir(root.join("notes")).expect("directory should be created");
        fs::write(root.join("notes").join("Old.md"), "# Old\n").expect("file should be created");

        let renamed = rename_vault_file(
            root.to_string_lossy().into_owned(),
            "notes/Old.md".into(),
            "New Name".into(),
        )
        .expect("file should rename");

        assert_eq!(renamed.name, "New Name.md");
        assert_eq!(renamed.relative_path, "notes/New Name.md");
        assert!(!root.join("notes").join("Old.md").exists());
        assert_eq!(renamed.content, "# Old\n");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn refuses_vault_file_rename_collision() {
        let root = test_root();
        fs::write(root.join("Old.md"), "# Old\n").expect("file should be created");
        fs::write(root.join("Existing.md"), "# Existing\n").expect("file should be created");

        let error = rename_vault_file(
            root.to_string_lossy().into_owned(),
            "Old.md".into(),
            "Existing".into(),
        )
        .expect_err("rename should fail on collision");

        assert!(error.contains("already exists"));
        assert!(root.join("Old.md").exists());

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn moves_vault_file_to_existing_directory() {
        let root = test_root();
        fs::create_dir(root.join("archive")).expect("directory should be created");
        fs::write(root.join("note.md"), "# Note\n").expect("file should be created");

        let moved = move_vault_file(
            root.to_string_lossy().into_owned(),
            "note.md".into(),
            "archive".into(),
        )
        .expect("file should move");

        assert_eq!(moved.name, "note.md");
        assert_eq!(moved.relative_path, "archive/note.md");
        assert!(!root.join("note.md").exists());
        assert_eq!(
            fs::read_to_string(root.join("archive").join("note.md"))
                .expect("moved file should be readable"),
            "# Note\n",
        );

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn deletes_vault_file() {
        let root = test_root();
        fs::write(root.join("note.md"), "# Note\n").expect("file should be created");

        delete_vault_file(root.to_string_lossy().into_owned(), "note.md".into())
            .expect("file should delete");

        assert!(!root.join("note.md").exists());

        fs::remove_dir_all(root).expect("test root should be removed");
    }
}
