//! Global tidbit shortcut commands.
//!
//! Responsibilities:
//! - Register, unregister, inspect, and test the global capture shortcut.
//! - Bridge native shortcut events into frontend events that open the capture
//!   window.
//!
//! Contracts:
//! - Registration is vault/settings-gated by the frontend; this module only
//!   manages the native shortcut once requested.
//! - At most one tidbit shortcut is registered per app process.
//! - Native callback handlers must not touch editor state directly.
use super::*;

#[tauri::command]
pub(crate) fn register_tidbit_global_shortcut(
    app: AppHandle,
    shortcut_state: State<'_, TidbitShortcutState>,
    shortcut: String,
) -> Result<bool, String> {
    let shortcut = shortcut.trim().to_string();

    if shortcut.is_empty() {
        return Err("Global tidbit shortcut cannot be empty".into());
    }

    {
        let mut registered_shortcut = shortcut_state
            .registered_shortcut
            .lock()
            .map_err(|_| "Could not lock tidbit shortcut state".to_string())?;

        // The global-shortcut plugin does not replace registrations
        // atomically, so remove the old binding before attempting the new one.
        if let Some(previous_shortcut) = registered_shortcut.take() {
            if let Err(error) = app.global_shortcut().unregister(previous_shortcut.as_str()) {
                return Err(format!(
                    "Could not unregister previous tidbit shortcut {previous_shortcut}: {error}"
                ));
            }
        }
    }

    let shortcut_for_handler = shortcut.clone();
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = app.emit("tidbit-global-shortcut", &shortcut_for_handler);
            }
        })
        .map_err(|error| format!("Could not register tidbit shortcut {shortcut}: {error}"))?;

    let registered = app.global_shortcut().is_registered(shortcut.as_str());

    if registered {
        let mut registered_shortcut = shortcut_state
            .registered_shortcut
            .lock()
            .map_err(|_| "Could not lock tidbit shortcut state".to_string())?;

        registered_shortcut.replace(shortcut);
    }

    Ok(registered)
}
#[tauri::command]
pub(crate) fn unregister_tidbit_global_shortcut(
    app: AppHandle,
    shortcut_state: State<'_, TidbitShortcutState>,
) -> Result<(), String> {
    let previous_shortcut = shortcut_state
        .registered_shortcut
        .lock()
        .map_err(|_| "Could not lock tidbit shortcut state".to_string())?
        .take();

    if let Some(shortcut) = previous_shortcut {
        app.global_shortcut()
            .unregister(shortcut.as_str())
            .map_err(|error| format!("Could not unregister tidbit shortcut {shortcut}: {error}"))?;
    }

    Ok(())
}
#[tauri::command]
pub(crate) fn tidbit_global_shortcut_status(
    app: AppHandle,
    shortcut_state: State<'_, TidbitShortcutState>,
) -> Result<TidbitShortcutStatus, String> {
    let shortcut = shortcut_state
        .registered_shortcut
        .lock()
        .map_err(|_| "Could not lock tidbit shortcut state".to_string())?
        .clone();
    let registered = shortcut
        .as_deref()
        .map(|shortcut| app.global_shortcut().is_registered(shortcut))
        .unwrap_or(false);

    Ok(TidbitShortcutStatus {
        shortcut,
        registered,
    })
}
#[tauri::command]
pub(crate) fn test_tidbit_global_shortcut_event(app: AppHandle) -> Result<(), String> {
    app.emit("tidbit-global-shortcut", "test")
        .map_err(|error| format!("Could not emit tidbit shortcut test event: {error}"))
}
