//! Glyphary desktop binary entry point.
//!
//! Responsibilities:
//! - Apply platform-specific binary attributes.
//! - Delegate all Tauri application construction to `tauri_app_lib::run`.
//!
//! Contracts:
//! - Keep this file thin; backend commands, menus, and state live in the
//!   library crate so tests can exercise them without launching the binary.
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_app_lib::run()
}
