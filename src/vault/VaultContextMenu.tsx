import type { ReactNode } from "react";
import type {
  FolderActionKind,
  FolderContextMenuState,
  VaultEntry,
} from "../lib/app-types";

// Responsibilities:
// - Render the Files drawer right-click menu for one file or folder.
// Contracts:
// - This component owns no file mutations; callers perform actions through callbacks.
// - Empty-area folder menus are create-only but still reveal the current folder.

type VaultContextMenuProps = {
  menu: FolderContextMenuState;
  isCanvasFile: (relativePath: string) => boolean;
  onAction: (action: FolderActionKind, entry: VaultEntry) => void;
  onReveal: (entry: VaultEntry) => void;
};

export function VaultContextMenu({
  menu,
  isCanvasFile,
  onAction,
  onReveal,
}: VaultContextMenuProps) {
  return (
    <div
      className="folder-context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label={`${menu.entry.isDir ? "Folder" : "File"} actions for ${menu.entry.name}`}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.entry.isDir ? (
        <>
          <MenuButton onClick={() => onAction("create-note", menu.entry)}>Create Note</MenuButton>
          <MenuButton onClick={() => onAction("create-canvas", menu.entry)}>Create Canvas</MenuButton>
          <MenuButton onClick={() => onAction("create-folder", menu.entry)}>Create Folder</MenuButton>
          <MenuButton onClick={() => onReveal(menu.entry)}>Reveal in Finder</MenuButton>
          {!menu.createOnly ? (
            <>
              <MenuButton onClick={() => onAction("rename", menu.entry)}>Rename</MenuButton>
              <MenuButton onClick={() => onAction("move-folder", menu.entry)}>Move</MenuButton>
            </>
          ) : null}
        </>
      ) : (
        <>
          <MenuButton onClick={() => onAction("rename-file", menu.entry)}>
            {isCanvasFile(menu.entry.relativePath) ? "Rename Canvas" : "Rename File"}
          </MenuButton>
          <MenuButton onClick={() => onAction("move-file", menu.entry)}>Move</MenuButton>
          <MenuButton onClick={() => onReveal(menu.entry)}>Reveal in Finder</MenuButton>
          <MenuButton onClick={() => onAction("delete-file", menu.entry)}>Delete</MenuButton>
        </>
      )}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  );
}
