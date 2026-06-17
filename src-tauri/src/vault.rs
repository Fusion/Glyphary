//! Vault file and folder commands.
//!
//! Responsibilities:
//! - List, read, write, create, rename, move, and delete vault files/folders.
//! - Maintain special vault behaviors such as directory shadow notes,
//!   Excalidraw files, and the markdown filename index for wikilinks.
//!
//! Contracts:
//! - Every filesystem operation must go through `paths` helpers before touching
//!   the OS.
//! - Commands return vault-relative paths so the frontend never needs absolute
//!   paths for editor state.
//! - Folder operations must preserve user notes and reject root/self moves.
//! - This module stores raw markdown/text files only; WYSIWYG transformations
//!   remain frontend/editor responsibilities.
use super::*;

pub(crate) fn walk_note_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|err| format!("Could not list directory: {err}"))? {
        let entry = entry.map_err(|err| format!("Could not read directory entry: {err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Could not read file type: {err}"))?;
        let path = entry.path();

        // The vault index is for user notes. Application state under
        // `.glyphary/` should never appear in wikilink suggestions.
        if path.file_name().and_then(|name| name.to_str()) == Some(SETTINGS_DIRECTORY_NAME) {
            continue;
        }

        if file_type.is_dir() {
            walk_note_files(root, &path, files)?;
        } else if file_type.is_file()
            && path.starts_with(root)
            && path
                .extension()
                .map(|extension| extension.to_string_lossy().eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        {
            files.push(path);
        }
    }

    Ok(())
}
#[tauri::command]
pub(crate) fn list_vault_dir(root: String, relative: String) -> Result<Vec<VaultEntry>, String> {
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
                if name == SETTINGS_DIRECTORY_NAME || (!show_dotfiles && name.starts_with('.')) {
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
pub(crate) fn list_vault_markdown_files(root: String) -> Result<Vec<VaultIndexedFile>, String> {
    let root = vault_root(&root)?;
    let mut files = Vec::new();

    walk_note_files(&root, &root, &mut files)?;

    let mut indexed = files
        .into_iter()
        .map(|path| {
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string_lossy().into_owned());

            Ok(VaultIndexedFile {
                name,
                relative_path: relative_string(&root, &path)?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    indexed.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });

    Ok(indexed)
}
#[tauri::command]
pub(crate) fn read_vault_file(root: String, relative: String) -> Result<OpenedFile, String> {
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
pub(crate) fn write_vault_file(
    root: String,
    relative: String,
    content: String,
) -> Result<(), String> {
    let (_, path) = resolve_for_write(&root, &relative)?;

    if path.exists() && !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    fs::write(path, content).map_err(|err| format!("Could not write file: {err}"))
}
#[tauri::command]
pub(crate) fn create_vault_markdown_file(
    root: String,
    relative: String,
) -> Result<OpenedFile, String> {
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
pub(crate) fn create_excalidraw_file(
    root: String,
    relative: String,
    content: String,
) -> Result<OpenedFile, String> {
    let root_path = vault_root(&root)?;
    let clean_relative = clean_relative(&relative)?;

    if clean_relative.as_os_str().is_empty() {
        return Err("Drawing path cannot be empty".into());
    }

    let file_name = clean_relative
        .file_name()
        .ok_or_else(|| "Drawing path must include a file name".to_string())?
        .to_string_lossy()
        .into_owned();

    if !file_name.to_lowercase().ends_with(".excalidraw") {
        return Err("Drawing path must end with .excalidraw".into());
    }

    let parent = clean_relative
        .parent()
        .ok_or_else(|| "Drawing path has no parent".to_string())?;
    let parent = ensure_vault_parent_dirs(&root_path, parent)?;
    let path = parent.join(&file_name);

    if path.exists() {
        return Err("A drawing already exists at that path".into());
    }

    fs::write(&path, content).map_err(|err| format!("Could not create drawing: {err}"))?;

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
#[tauri::command]
pub(crate) fn rename_vault_file(
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
pub(crate) fn move_vault_file(
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
pub(crate) fn delete_vault_file(root: String, relative: String) -> Result<(), String> {
    let (_, path) = resolve_existing(&root, &relative)?;

    if !path.is_file() {
        return Err("Vault path is not a file".into());
    }

    fs::remove_file(path).map_err(|err| format!("Could not delete file: {err}"))
}
#[tauri::command]
pub(crate) fn create_note_in_directory(
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
pub(crate) fn create_directory_in_directory(
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
pub(crate) fn rename_vault_directory(
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

    // A folder rename may also rename its companion `<folder>.md` shadow note.
    // Check for collisions before moving the directory so the operation stays
    // all-or-nothing from the user's point of view.
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
pub(crate) fn move_vault_directory(
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
pub(crate) fn open_directory_shadow_file(
    root: String,
    relative: String,
) -> Result<OpenedFile, String> {
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
