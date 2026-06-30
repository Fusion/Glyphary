import type { FolderActionKind, VaultEntry } from "../lib/app-types";
import { parentDirectory } from "../lib/paths";

// Responsibilities:
// - Keep vault file action labels and path helpers out of App.
// Contracts:
// - Dialog text depends only on the action and whether the target is a canvas.
// - Revealed paths are host paths built from a vault root plus a vault-relative path.

export function isMoveAction(action: FolderActionKind) {
  return action === "move-file" || action === "move-folder";
}

export function vaultEntryPath(root: string, relativePath: string) {
  const cleanRoot = root.replace(/[\\/]+$/, "");
  return relativePath ? `${cleanRoot}/${relativePath}` : cleanRoot;
}

export function folderActionInitialValue(action: FolderActionKind, entry: VaultEntry) {
  if (action === "rename" || action === "rename-file") {
    return entry.name;
  }

  if (isMoveAction(action)) {
    return parentDirectory(entry.relativePath);
  }

  return "";
}

export function folderActionDialogTitle(action: FolderActionKind, isCanvasFile = false) {
  if (action === "create-note") {
    return "Create Note";
  }

  if (action === "create-canvas") {
    return "Create Canvas";
  }

  if (action === "create-folder") {
    return "Create Folder";
  }

  if (action === "move-file") {
    return "Move File";
  }

  if (action === "rename-file") {
    return isCanvasFile ? "Rename Canvas" : "Rename File";
  }

  if (action === "move-folder") {
    return "Move Folder";
  }

  if (action === "delete-file") {
    return "Delete File";
  }

  return "Rename Folder";
}

export function folderActionDialogLabel(action: FolderActionKind, isCanvasFile = false) {
  if (action === "create-note") {
    return "Note name";
  }

  if (action === "create-canvas") {
    return "Canvas name";
  }

  if (action === "rename-file") {
    return isCanvasFile ? "Canvas name" : "File name";
  }

  if (isMoveAction(action)) {
    return "Destination folder";
  }

  return "Folder name";
}
