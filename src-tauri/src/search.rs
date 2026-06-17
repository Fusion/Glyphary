//! Vault search commands.
//!
//! Responsibilities:
//! - Search vault filenames and optionally file contents.
//! - Use ripgrep when available, with a filesystem fallback for portability.
//! - Return compact, capped results suitable for drawer navigation.
//!
//! Contracts:
//! - Search never mutates the vault.
//! - Results are vault-relative and bounded to avoid large IPC payloads.
//! - `rg --json` is parsed structurally; terminal-formatted output is not a
//!   stable interface.
use super::*;

pub(crate) fn has_ripgrep() -> bool {
    Command::new("rg").arg("--version").output().is_ok()
}
pub(crate) fn normalize_preview(line: &str) -> String {
    line.trim().chars().take(220).collect()
}
pub(crate) fn push_search_result(results: &mut Vec<SearchResult>, result: SearchResult) {
    // Search is intended for navigation, not exhaustive indexing. A hard cap
    // keeps IPC payloads and drawer rendering predictable in large vaults.
    if results.len() < SEARCH_RESULT_LIMIT {
        results.push(result);
    }
}
pub(crate) fn walk_files(root: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
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
pub(crate) fn filename_matches(
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
pub(crate) fn search_filenames_with_ripgrep(
    root: &Path,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
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
pub(crate) fn search_content_with_ripgrep(
    root: &Path,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
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
pub(crate) fn search_content_fallback(
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
#[tauri::command]
pub(crate) fn search_vault(
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
