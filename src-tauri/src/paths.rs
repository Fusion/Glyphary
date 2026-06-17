//! Vault path and filename helpers.
//!
//! Responsibilities:
//! - Canonicalize vault roots and resolve vault-relative paths safely.
//! - Sanitize user-provided file, folder, and asset names.
//! - Centralize shadow-note and collision-resistant asset path rules.
//!
//! Contracts:
//! - All vault command paths must pass through this module before filesystem
//!   access.
//! - Returned relative paths use forward slashes so settings and markdown stay
//!   portable across platforms.
//! - Helpers may create parent directories only when their name explicitly
//!   describes write/create behavior.
use super::*;

pub(crate) fn vault_root(root: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|err| format!("Could not read vault root: {err}"))?;

    if !root.is_dir() {
        return Err("Vault root must be a directory".into());
    }

    Ok(root)
}
pub(crate) fn vault_settings_path(root: &Path) -> PathBuf {
    root.join(SETTINGS_DIRECTORY_NAME)
        .join(SETTINGS_CONFIG_FILE_NAME)
}
pub(crate) fn clean_relative(relative: &str) -> Result<PathBuf, String> {
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
pub(crate) fn clean_settings_asset_directory(asset_directory: &str) -> Result<PathBuf, String> {
    let asset_directory = asset_directory.trim();

    if asset_directory.is_empty() {
        return Err("Asset directory cannot be empty".into());
    }

    clean_relative(asset_directory)
}
pub(crate) fn resolve_existing(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = vault_root(root)?;
    let relative = clean_relative(relative)?;
    let target = fs::canonicalize(root.join(relative))
        .map_err(|err| format!("Could not resolve vault path: {err}"))?;

    if !target.starts_with(&root) {
        return Err("Path escapes the vault".into());
    }

    Ok((root, target))
}
pub(crate) fn resolve_for_write(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
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
pub(crate) fn ensure_vault_parent_dirs(
    root: &Path,
    relative_parent: &Path,
) -> Result<PathBuf, String> {
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
pub(crate) fn relative_string(root: &Path, target: &Path) -> Result<String, String> {
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
pub(crate) fn sanitize_asset_file_name(file_name: &str) -> String {
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
pub(crate) fn sanitize_markdown_file_name(file_name: &str) -> Result<String, String> {
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
pub(crate) fn sanitize_directory_name(directory_name: &str) -> Result<String, String> {
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
pub(crate) fn shadow_note_path_for_directory(dir: &Path) -> Result<PathBuf, String> {
    let dir_name = dir
        .file_name()
        .ok_or_else(|| "Directory has no name".to_string())?
        .to_string_lossy()
        .into_owned();

    Ok(dir.join(format!("{dir_name}.md")))
}
pub(crate) fn unique_asset_path(asset_dir: &Path, file_name: &str) -> PathBuf {
    let candidate = asset_dir.join(file_name);

    if !candidate.exists() {
        return candidate;
    }

    let path = Path::new(file_name);
    // Match the user-facing pasted-image convention by adding a plain numeric
    // suffix before the extension instead of changing the original stem.
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
