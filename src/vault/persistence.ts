import { invoke } from "@tauri-apps/api/core";
import type {
  OpenedFile,
  RenamedDirectory,
  SearchResult,
  VaultEntry,
  VaultIndexedFile,
  VaultSettings,
} from "../lib/app-types";

// Responsibilities:
// - Name Tauri vault commands once instead of scattering command strings in App.
// Contracts:
// - Functions are thin wrappers; App owns UI state and error handling.
// - Arguments stay vault-relative except the vault root.

export function listVaultDir(root: string, relative: string) {
  return invoke<VaultEntry[]>("list_vault_dir", { root, relative });
}

export function listVaultMarkdownFiles(root: string) {
  return invoke<VaultIndexedFile[]>("list_vault_markdown_files", { root });
}

export function readVaultSettings(root: string) {
  return invoke<VaultSettings>("read_vault_settings", { root });
}

export function writeVaultSettings(root: string, settings: VaultSettings) {
  return invoke<VaultSettings>("write_vault_settings", { root, settings });
}

export function allowVaultAssets(root: string, assetDirectory: string) {
  return invoke("allow_vault_assets", { root, assetDirectory });
}

export function openVaultFile(root: string, relative: string) {
  return invoke<OpenedFile>("open_vault_file", { root, relative });
}

export function readVaultFile(root: string, relative: string) {
  return invoke<OpenedFile>("read_vault_file", { root, relative });
}

export function writeVaultFile(root: string, relative: string, content: string) {
  return invoke("write_vault_file", { root, relative, content });
}

export function createNoteInDirectory(root: string, relative: string, noteName: string) {
  return invoke<OpenedFile>("create_note_in_directory", { root, relative, noteName });
}

export function createCanvasInDirectory(root: string, relative: string, canvasName: string) {
  return invoke<OpenedFile>("create_canvas_in_directory", { root, relative, canvasName });
}

export function createExcalidrawFile(root: string, relative: string, content: string) {
  return invoke<OpenedFile>("create_excalidraw_file", { root, relative, content });
}

export function createVaultMarkdownFile(root: string, relative: string) {
  return invoke<OpenedFile>("create_vault_markdown_file", { root, relative });
}

export function openCalendarDayFile(
  root: string,
  relative: string,
  title: string,
) {
  return invoke<OpenedFile>("open_calendar_day_file", { root, relative, title });
}

export function createDirectoryInDirectory(
  root: string,
  relative: string,
  directoryName: string,
) {
  return invoke<RenamedDirectory>("create_directory_in_directory", {
    root,
    relative,
    directoryName,
  });
}

export function renameVaultFile(root: string, relative: string, nextName: string) {
  return invoke<OpenedFile>("rename_vault_file", { root, relative, nextName });
}

export function renameVaultDirectory(root: string, relative: string, nextName: string) {
  return invoke<RenamedDirectory>("rename_vault_directory", { root, relative, nextName });
}

export function moveVaultFile(
  root: string,
  relative: string,
  destinationDirectory: string,
) {
  return invoke<OpenedFile>("move_vault_file", { root, relative, destinationDirectory });
}

export function moveVaultDirectory(
  root: string,
  relative: string,
  destinationDirectory: string,
) {
  return invoke<RenamedDirectory>("move_vault_directory", {
    root,
    relative,
    destinationDirectory,
  });
}

export function deleteVaultFile(root: string, relative: string) {
  return invoke("delete_vault_file", { root, relative });
}

export function openDirectoryShadowFile(root: string, relative: string) {
  return invoke<OpenedFile>("open_directory_shadow_file", { root, relative });
}

export function searchVaultFiles(
  root: string,
  query: string,
  options: {
    includeContent?: boolean;
    markdownOnly?: boolean;
    excludeDotPaths?: boolean;
  } = {},
) {
  return invoke<SearchResult[]>("search_vault", {
    root,
    query,
    ...options,
  });
}
