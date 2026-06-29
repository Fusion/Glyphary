import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { displayPath } from "../lib/paths";
import type { VaultEntry, VaultFolderTreeNodeState, VaultFolderTreeProps } from "../lib/app-types";
import { listVaultDir } from "./persistence";
import { FolderIcon } from "./VaultIcons";

// Responsibilities:
// - Render and lazily load the destination folder picker tree.
// Contracts:
// - Move destinations cannot be the moved folder itself or one of its children.
// - Backend load errors stay visible in the tree and are also reported upward.

function isMoveFolderDestinationDisabled(relativePath: string, movingEntry?: VaultEntry | null) {
  if (!movingEntry?.isDir) {
    return false;
  }

  return (
    relativePath === movingEntry.relativePath ||
    relativePath.startsWith(`${movingEntry.relativePath}/`)
  );
}

export function VaultFolderTree({
  root,
  selectedPath,
  movingEntry = null,
  onSelect,
  onStatus,
}: VaultFolderTreeProps) {
  const [nodes, setNodes] = useState<Record<string, VaultFolderTreeNodeState>>({});
  const [expandedPaths, setExpandedPaths] = useState<string[]>([""]);

  async function loadChildren(relativePath: string, force = false) {
    const existing = nodes[relativePath];

    if (!force && (existing?.loaded || existing?.loading)) {
      return;
    }

    setNodes((current) => ({
      ...current,
      [relativePath]: {
        children: current[relativePath]?.children ?? [],
        error: null,
        loaded: false,
        loading: true,
      },
    }));

    try {
      const children = await listVaultDir(root, relativePath);

      setNodes((current) => ({
        ...current,
        [relativePath]: {
          children: children.filter((entry) => entry.isDir),
          error: null,
          loaded: true,
          loading: false,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      setNodes((current) => ({
        ...current,
        [relativePath]: {
          children: current[relativePath]?.children ?? [],
          error: message,
          loaded: false,
          loading: false,
        },
      }));
      onStatus(message);
    }
  }

  useEffect(() => {
    setNodes({});
    setExpandedPaths([""]);
    void loadChildren("", true);
  }, [root]);

  function toggleExpanded(relativePath: string) {
    setExpandedPaths((paths) =>
      paths.includes(relativePath)
        ? paths.filter((path) => path !== relativePath)
        : [...paths, relativePath],
    );
    void loadChildren(relativePath);
  }

  function renderNode(relativePath: string, name: string, depth: number) {
    const state = nodes[relativePath];
    const isExpanded = expandedPaths.includes(relativePath);
    const isSelected = selectedPath === relativePath;
    const isDisabled = isMoveFolderDestinationDisabled(relativePath, movingEntry);
    const children = state?.children ?? [];

    return (
      <div className="vault-folder-tree-node" key={relativePath || "vault-root"} role="none">
        <div
          className="vault-folder-tree-row"
          role="treeitem"
          aria-expanded={isExpanded}
          aria-selected={isSelected}
          style={{ "--folder-tree-depth": depth } as CSSProperties}
        >
          <button
            className="folder-tree-expander"
            type="button"
            aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}
            onClick={() => toggleExpanded(relativePath)}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d={isExpanded ? "M4 6h8l-4 4z" : "M6 4l4 4-4 4z"} />
            </svg>
          </button>
          <button
            className={isSelected ? "folder-tree-select active" : "folder-tree-select"}
            disabled={isDisabled}
            type="button"
            onClick={() => onSelect(relativePath)}
          >
            <FolderIcon />
            <span>{name}</span>
          </button>
        </div>
        {state?.loading ? <p className="vault-folder-tree-note">Loading...</p> : null}
        {state?.error ? <p className="vault-folder-tree-note error">{state.error}</p> : null}
        {isExpanded && children.length > 0 ? (
          <div role="group">
            {children.map((entry) => renderNode(entry.relativePath, entry.name, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="vault-folder-tree-picker">
      <div className="folder-picker-header">
        <span>Destination folder</span>
        <strong>{displayPath(selectedPath)}</strong>
      </div>
      <div className="vault-folder-tree" role="tree" aria-label="Vault folders">
        {renderNode("", "Vault root", 0)}
      </div>
    </div>
  );
}
