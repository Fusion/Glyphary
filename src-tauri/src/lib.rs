//! Tauri backend root for Glyphary.
//!
//! Responsibilities:
//! - Wire native menus, plugins, command registration, and application startup.
//! - Import shared backend models/defaults and responsibility modules.
//!
//! Contracts:
//! - Feature implementations should live in responsibility modules, not grow
//!   this file again.
//! - Commands registered here must preserve React as the owner of document UI
//!   state; Rust emits menu/window events and performs trusted OS work.
//! - Vault-facing command inputs are untrusted until they pass through the path
//!   and settings helpers.
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

// Tauri's command macro emits helper macros beside each command. Keeping
// command-bearing modules imported with `macro_use` lets `generate_handler!`
// register those commands from this central app-wiring file.
#[macro_use]
mod assets;
mod defaults;
#[macro_use]
mod calendar;
mod models;
mod paths;
#[macro_use]
mod plugins;
#[macro_use]
mod rich_links;
#[macro_use]
mod search;
#[macro_use]
mod settings;
#[macro_use]
mod shortcuts;
#[macro_use]
mod snippets;
mod themes;
#[macro_use]
mod vault;
#[macro_use]
mod windowing;

use assets::*;
use calendar::*;
use defaults::*;
use models::*;
use paths::*;
use plugins::*;
use rich_links::*;
use search::*;
use settings::*;
use shortcuts::*;
use snippets::*;
use themes::*;
use vault::*;
use windowing::*;

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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_opener::init())
        .manage(TidbitShortcutState::default())
        .invoke_handler(tauri::generate_handler![
            list_vault_dir,
            list_vault_markdown_files,
            read_vault_file,
            write_vault_file,
            create_vault_markdown_file,
            create_excalidraw_file,
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
            register_tidbit_global_shortcut,
            unregister_tidbit_global_shortcut,
            tidbit_global_shortcut_status,
            test_tidbit_global_shortcut_event,
            list_css_snippets,
            read_css_snippets,
            list_vault_plugins,
            read_plugin_styles,
            read_plugin_template,
            read_plugin_wasm,
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
mod tests;
