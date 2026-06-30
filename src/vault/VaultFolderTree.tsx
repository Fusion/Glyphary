import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { vaultImagePathCandidates } from "../app-state/documents";
import { splitMetaHeader } from "../lib/markdown";
import { cleanVaultAssetReference, displayPath } from "../lib/paths";
import type { VaultEntry, VaultFolderTreeNodeState } from "../lib/app-types";
import { listVaultDir, readVaultFile } from "./persistence";
import { FolderIcon, VaultFileIcon } from "./VaultIcons";

// Responsibilities:
// - Render and lazily load the destination folder picker tree.
// Contracts:
// - Move destinations cannot be the moved folder itself or one of its children.
// - Backend load errors stay visible in the tree and are also reported upward.

type VaultFolderTreeProps = {
  root: string;
  selectedPath: string;
  activeFilePath?: string | null;
  hideHeader?: boolean;
  showFilePreviews?: boolean;
  showPreviewImages?: boolean;
  showFiles?: boolean;
  movingEntry?: VaultEntry | null;
  onEntryContextMenu?: (entry: VaultEntry, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onFileOpen?: (relativePath: string) => void;
  onSelect: (relativePath: string) => void;
  onStatus: (message: string) => void;
};

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
  activeFilePath = null,
  hideHeader = false,
  showFilePreviews = true,
  showPreviewImages = true,
  showFiles = false,
  movingEntry = null,
  onEntryContextMenu,
  onFileOpen,
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
          children: showFiles ? children : children.filter((entry) => entry.isDir),
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
  }, [root, showFiles]);

  function toggleExpanded(relativePath: string) {
    setExpandedPaths((paths) =>
      paths.includes(relativePath)
        ? paths.filter((path) => path !== relativePath)
        : [...paths, relativePath],
    );
    void loadChildren(relativePath);
  }

  function renderFileNode(entry: VaultEntry, depth: number) {
    const isSelected = activeFilePath === entry.relativePath;

    return (
      <div className="vault-folder-tree-node" key={entry.relativePath} role="none">
        <div
          className="vault-folder-tree-row file"
          role="treeitem"
          aria-selected={isSelected}
          style={{ "--folder-tree-depth": depth } as CSSProperties}
        >
          <span className="folder-tree-expander-placeholder" />
          <button
            className={isSelected ? "folder-tree-file active" : "folder-tree-file"}
            type="button"
            onContextMenu={(event) => onEntryContextMenu?.(entry, event)}
            onDoubleClick={() => onFileOpen?.(entry.relativePath)}
          >
            <VaultFileIcon relativePath={entry.relativePath} />
            <span>
              <strong>{entry.name}</strong>
              {showFilePreviews ? (
                <TreeFilePreview
                  root={root}
                  relativePath={entry.relativePath}
                  showImage={showPreviewImages}
                />
              ) : null}
            </span>
          </button>
        </div>
      </div>
    );
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
          {relativePath ? (
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
          ) : (
            <span className="folder-tree-expander-placeholder" />
          )}
          <button
            className={isSelected ? "folder-tree-select active" : "folder-tree-select"}
            disabled={isDisabled}
            type="button"
            onContextMenu={(event) =>
              onEntryContextMenu?.({ name, relativePath, isDir: true }, event)
            }
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
            {children.map((entry) =>
              entry.isDir
                ? renderNode(entry.relativePath, entry.name, depth + 1)
                : renderFileNode(entry, depth + 1),
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="vault-folder-tree-picker">
      {hideHeader ? null : (
        <div className="folder-picker-header">
          <span>Destination folder</span>
          <strong>{displayPath(selectedPath)}</strong>
        </div>
      )}
      <div className="vault-folder-tree" role="tree" aria-label="Vault folders">
        {renderNode("", "Vault root", 0)}
      </div>
    </div>
  );
}

function previewText(content: string) {
  return (
    splitMetaHeader(content)
      .body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !firstImageReference(line))
      .find(Boolean)
      ?.slice(0, 90) || "Empty file"
  );
}

function firstImageReference(content: string) {
  const body = splitMetaHeader(content).body;
  const wikilinkMatch = body.match(/!\[\[([^\]\n]+)\]\]/);

  if (wikilinkMatch) {
    return cleanVaultAssetReference(wikilinkMatch[1]) ?? "";
  }

  const markdownMatch = body.match(/!\[[^\]\n]*\]\(([^)\n]+)\)/);
  const markdownTarget = markdownMatch?.[1]?.trim() ?? "";
  const closingAngle = markdownTarget.indexOf(">");
  const target = markdownTarget.startsWith("<") && closingAngle > 1
    ? markdownTarget.slice(1, closingAngle)
    : markdownTarget.replace(/\s+(['"]).*\1\s*$/, "");

  return cleanVaultAssetReference(target) ?? "";
}

export function TreeFilePreview({
  root,
  relativePath,
  showImage = true,
}: {
  root: string;
  relativePath: string;
  showImage?: boolean;
}) {
  const [preview, setPreview] = useState({
    imageIndex: 0,
    imageSources: [] as string[],
    text: "Loading preview...",
  });

  useEffect(() => {
    let cancelled = false;

    readVaultFile(root, relativePath)
      .then((file) => {
        if (!cancelled) {
          setPreview({
            imageIndex: 0,
            imageSources: showImage
              ? vaultImagePathCandidates(root, firstImageReference(file.content), {
                  relativePath,
                })
              : [],
            text: previewText(file.content),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({ imageIndex: 0, imageSources: [], text: "Preview unavailable" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [root, relativePath, showImage]);

  const imageSrc = preview.imageSources[preview.imageIndex] ?? "";

  return (
    <>
      {imageSrc ? (
        <img
          className="file-preview-thumbnail"
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            setPreview((current) => {
              const nextIndex = current.imageIndex + 1;

              if (nextIndex < current.imageSources.length) {
                return { ...current, imageIndex: nextIndex };
              }

              return { ...current, imageIndex: 0, imageSources: [] };
            });
          }}
        />
      ) : null}
      <em>{preview.text}</em>
    </>
  );
}
