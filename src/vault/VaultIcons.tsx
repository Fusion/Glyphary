import { isCanvasPath } from "../lib/canvas";

// Responsibilities:
// - Render vault file/folder icons shared by tree, list, and recent views.
// Contracts:
// - Canvas detection stays path-based so callers do not duplicate extension checks.

export function FolderIcon({
  className = "vault-entry-icon folder-icon",
}: {
  className?: string;
}) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32">
      <path
        className="folder-tab"
        d="M3.5 8.2c0-1.3 1-2.2 2.3-2.2h7.1c.8 0 1.5.3 2 .9l1.7 2h9.6c1.3 0 2.3 1 2.3 2.3v1.4h-25z"
      />
      <path
        className="folder-back"
        d="M2.5 10.6c0-1.4 1.1-2.5 2.5-2.5h22c1.4 0 2.5 1.1 2.5 2.5v13.1c0 1.4-1.1 2.5-2.5 2.5h-22c-1.4 0-2.5-1.1-2.5-2.5z"
      />
      <path
        className="folder-front"
        d="M3.2 13.1h25.6l-2.2 10.8c-.3 1.4-1.5 2.3-2.9 2.3h-19c-1.5 0-2.7-1.1-2.9-2.6z"
      />
      <path className="folder-shine" d="M5.1 14.3h21.8l-.4 1.6h-21.1z" />
    </svg>
  );
}

function MarkdownFileIcon() {
  return (
    <svg aria-hidden="true" className="vault-entry-icon markdown-icon" viewBox="0 0 32 32">
      <path className="document-page" d="M8.5 3.8h10.9l4.1 4.2v20.2h-15z" />
      <path className="document-fold" d="M19.2 3.9v4.4h4.2z" />
      <path className="document-line" d="M11.3 11.8h9.3" />
      <path className="document-line" d="M11.3 14.7h9.3" />
      <rect className="markdown-badge" x="9.9" y="18.3" width="12.2" height="6.1" rx="1.8" />
      <text x="16" y="22.8" textAnchor="middle">
        md
      </text>
    </svg>
  );
}

function CanvasFileIcon() {
  return (
    <svg aria-hidden="true" className="vault-entry-icon canvas-file-icon" viewBox="0 0 32 32">
      <path className="document-page" d="M8.5 3.8h10.9l4.1 4.2v20.2h-15z" />
      <path className="document-fold" d="M19.2 3.9v4.4h4.2z" />
      <circle className="canvas-node-dot primary" cx="13" cy="13" r="2.2" />
      <circle className="canvas-node-dot" cx="20.2" cy="12.2" r="2" />
      <circle className="canvas-node-dot" cx="16.8" cy="21.2" r="2.1" />
      <path className="canvas-edge-line" d="M14.8 12.6 18.3 12.3M13.9 14.7l2 4.5M19.5 14l-1.8 5.3" />
    </svg>
  );
}

export function VaultFileIcon({ relativePath }: { relativePath: string }) {
  return isCanvasPath(relativePath) ? <CanvasFileIcon /> : <MarkdownFileIcon />;
}
