//! Calendar note commands.
//!
//! Responsibilities:
//! - Open or create daily notes under the vault's `Calendar/` directory.
//! - List existing calendar note files so the drawer can mark days with notes.
//!
//! Contracts:
//! - Calendar creation is restricted to `Calendar/`; callers cannot use this
//!   command as a generic file-create escape hatch.
//! - New day entries are intentionally empty. The frontend owns any template or
//!   insertion behavior that may be added later.
use super::*;

#[tauri::command]
pub(crate) fn open_calendar_day_file(
    root: String,
    relative: String,
    _title: String,
) -> Result<OpenedFile, String> {
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
        fs::write(&path, "").map_err(|err| format!("Could not create calendar note: {err}"))?;
    }

    read_vault_file(
        root_path.to_string_lossy().into_owned(),
        relative_string(&root_path, &path)?,
    )
}
#[tauri::command]
pub(crate) fn list_calendar_day_files(root: String) -> Result<Vec<String>, String> {
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
