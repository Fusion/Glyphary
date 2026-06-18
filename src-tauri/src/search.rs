//! Vault search commands.
//!
//! Responsibilities:
//! - Search vault filenames and optionally file contents.
//! - Use the same `grep` matcher/searcher crates that power ripgrep, but keep
//!   execution in-process so Glyphary has no external `rg` binary dependency.
//! - Return compact, capped results suitable for drawer navigation.
//!
//! Contracts:
//! - Search never mutates the vault.
//! - Results are vault-relative and bounded to avoid large IPC payloads.
//! - Content search treats the query as a regular expression, matching the old
//!   `rg` behavior instead of silently changing search semantics.
use super::*;
use grep::{
    regex::RegexMatcherBuilder,
    searcher::{BinaryDetection, Searcher, SearcherBuilder, Sink, SinkMatch},
};
use std::io;
use std::time::UNIX_EPOCH;

#[derive(Clone, Copy, Default)]
pub(crate) struct SearchFileFilter {
    pub(crate) markdown_only: bool,
    pub(crate) exclude_dot_paths: bool,
}

pub(crate) fn normalize_preview(line: &str) -> String {
    line.trim().chars().take(220).collect()
}
pub(crate) fn file_modified_ms(file: &Path) -> Option<u64> {
    let modified = fs::metadata(file).ok()?.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;

    u64::try_from(duration.as_millis()).ok()
}
pub(crate) fn push_search_result(results: &mut Vec<SearchResult>, result: SearchResult) {
    // Search is intended for navigation, not exhaustive indexing. A hard cap
    // keeps IPC payloads and drawer rendering predictable in large vaults.
    if results.len() < SEARCH_RESULT_LIMIT {
        results.push(result);
    }
}
pub(crate) fn is_dot_path_component(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}
pub(crate) fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}
pub(crate) fn walk_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<PathBuf>,
    filter: SearchFileFilter,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|err| format!("Could not list directory: {err}"))? {
        let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Could not read file type: {err}"))?;
        let path = entry.path();

        // Task search is intentionally limited to visible Markdown notes. Keeping
        // this filter in the shared walker lets future drawer views opt into the
        // same vault-local constraints without duplicating traversal rules.
        if filter.exclude_dot_paths && is_dot_path_component(&path) {
            continue;
        }

        if file_type.is_dir() {
            walk_files(root, &path, files, filter)?;
        } else if file_type.is_file()
            && path.starts_with(root)
            && (!filter.markdown_only || is_markdown_file(&path))
        {
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
                    modified_ms: file_modified_ms(&file),
                },
            );
        }
    }

    Ok(results)
}

struct ContentSearchSink<'a> {
    root: &'a Path,
    file: &'a Path,
    results: &'a mut Vec<SearchResult>,
}
impl Sink for ContentSearchSink<'_> {
    type Error = io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        let relative_path = relative_string(self.root, self.file).map_err(io::Error::other)?;
        let line_text = String::from_utf8_lossy(mat.bytes());
        let line_number = mat
            .line_number()
            .and_then(|line_number| usize::try_from(line_number).ok());

        push_search_result(
            self.results,
            SearchResult {
                relative_path,
                line_number,
                line_text: Some(normalize_preview(&line_text)),
                is_content_match: true,
                modified_ms: file_modified_ms(self.file),
            },
        );

        Ok(self.results.len() < SEARCH_RESULT_LIMIT)
    }
}
pub(crate) fn search_content_internal(
    root: &Path,
    query: &str,
    files: &[PathBuf],
) -> Result<Vec<SearchResult>, String> {
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(true)
        .line_terminator(Some(b'\n'))
        .build(query)
        .map_err(|err| format!("Invalid search pattern: {err}"))?;
    let mut searcher = SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .line_number(true)
        .build();
    let mut results = Vec::new();

    for file in files {
        if results.len() >= SEARCH_RESULT_LIMIT {
            break;
        }

        let sink = ContentSearchSink {
            root,
            file,
            results: &mut results,
        };
        searcher
            .search_path(&matcher, file, sink)
            .map_err(|err| format!("Could not search file {}: {err}", file.display()))?;
    }

    Ok(results)
}
#[tauri::command]
pub(crate) fn search_vault(
    root: String,
    query: String,
    include_content: bool,
    markdown_only: Option<bool>,
    exclude_dot_paths: Option<bool>,
) -> Result<Vec<SearchResult>, String> {
    let root = vault_root(&root)?;
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let filter = SearchFileFilter {
        markdown_only: markdown_only.unwrap_or(false),
        exclude_dot_paths: exclude_dot_paths.unwrap_or(false),
    };
    let mut files = Vec::new();
    walk_files(&root, &root, &mut files, filter)?;
    let mut results = filename_matches(&root, files.clone(), query)?;

    if include_content && results.len() < SEARCH_RESULT_LIMIT {
        for result in search_content_internal(&root, query, &files)? {
            push_search_result(&mut results, result);
        }
    }

    Ok(results)
}
