/**
 * React Flow node renderers for Glyphary canvas files.
 *
 * Responsibilities:
 * - Render JSON Canvas text, file, link, and group nodes as React components.
 * - Provide lightweight Markdown previews for file nodes.
 * - Keep node-specific editing behavior local to the text-card node.
 *
 * Contracts:
 * - File-node previews must stay bounded; full Markdown editors do not belong
 *   inside canvas nodes.
 * - Media previews use Tauri's asset URL path instead of adding a broader file
 *   read API.
 * - Text-card editing commits through callbacks supplied by the graph owner;
 *   this module does not serialize canvas JSON directly.
 */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { OpenedFile } from "../lib/app-types.js";
import {
  canvasColorValue,
  canvasFileKind,
  maxCanvasPreviewChars,
  maxCanvasPreviewLines,
  type CanvasFlowNodeData,
} from "../lib/canvas.js";
import { splitMetaHeader } from "../lib/markdown.js";
import { cleanVaultAssetReference } from "../lib/paths.js";

export type CanvasNodeData = CanvasFlowNodeData & {
  vaultRoot: string;
  onOpenFile: (relativePath: string) => void;
  isEditing?: boolean;
  onCancelTextEdit?: () => void;
  onCommitText?: (nodeId: string, text: string) => void;
};

type CanvasColorStyle = CSSProperties & {
  "--canvas-node-accent"?: string;
  "--canvas-node-accent-soft"?: string;
  "--canvas-node-bg"?: string;
  "--canvas-node-border"?: string;
};

function nodeColorClass(color: string | undefined) {
  return color ? ` canvas-color-${color.replace(/[^a-z0-9_-]/gi, "").toLowerCase()}` : "";
}

function canvasNodeStyle(color: string | undefined): CanvasColorStyle {
  const accent = canvasColorValue(color);

  if (!accent) {
    return {};
  }

  return {
    "--canvas-node-accent": accent,
    "--canvas-node-accent-soft": `color-mix(in srgb, ${accent} 36%, transparent)`,
    "--canvas-node-bg": `color-mix(in srgb, ${accent} 42%, var(--surface))`,
    "--canvas-node-border": `color-mix(in srgb, ${accent} 88%, var(--border))`,
  };
}

function vaultFileAssetUrl(root: string, file: string | undefined) {
  const cleanFile = file ? cleanVaultAssetReference(file) : null;

  // Media previews deliberately reuse Tauri's existing asset protocol instead
  // of introducing a broader binary read command for arbitrary vault files.
  return root && cleanFile ? convertFileSrc(`${root}/${cleanFile}`) : "";
}

function markdownPreviewBlocks(markdown: string) {
  // Canvas file nodes may point at large Markdown files. A terse preview keeps
  // a big canvas responsive while still making note nodes recognizable.
  return splitMetaHeader(markdown)
    .body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .slice(0, maxCanvasPreviewLines);
}

function CanvasHandles() {
  return (
    <>
      <Handle id="top" position={Position.Top} type="source" />
      <Handle id="right" position={Position.Right} type="source" />
      <Handle id="bottom" position={Position.Bottom} type="source" />
      <Handle id="left" position={Position.Left} type="source" />
    </>
  );
}

function CanvasMarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = markdownPreviewBlocks(markdown);

  if (blocks.length === 0) {
    return <p className="canvas-empty-preview">Empty note</p>;
  }

  return (
    <div className="canvas-markdown-preview">
      {blocks.map((line, index) => {
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        const task = line.match(/^- \[([ xX])\]\s+(.+)$/);
        const bullet = line.match(/^[-*]\s+(.+)$/);

        if (heading) {
          return (
            <strong className="canvas-preview-heading" key={`${line}-${index}`}>
              {heading[2]}
            </strong>
          );
        }

        if (task) {
          return (
            <p className="canvas-preview-task" key={`${line}-${index}`}>
              <span aria-hidden="true">{task[1].trim().toLowerCase() === "x" ? "✓" : "□"}</span>
              {task[2]}
            </p>
          );
        }

        if (bullet) {
          return (
            <p className="canvas-preview-bullet" key={`${line}-${index}`}>
              <span aria-hidden="true">•</span>
              {bullet[1]}
            </p>
          );
        }

        return <p key={`${line}-${index}`}>{line.replace(/[*_`]/g, "")}</p>;
      })}
    </div>
  );
}

function CanvasTextNode({ data, id }: NodeProps<Node<CanvasNodeData, "text">>) {
  const [draft, setDraft] = useState(data.text ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const skipNextBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraft(data.text ?? "");
  }, [data.text, data.isEditing]);

  useEffect(() => {
    if (!data.isEditing) {
      return;
    }

    const textarea = textareaRef.current;

    textarea?.focus();
    textarea?.select();
  }, [data.isEditing]);

  const commitDraft = useCallback(() => {
    data.onCommitText?.(id, draft);
  }, [data, draft, id]);

  return (
    <article
      className={`canvas-node-card canvas-text-node${nodeColorClass(data.color)}`}
      style={canvasNodeStyle(data.color)}
    >
      <CanvasHandles />
      {data.isEditing ? (
        <textarea
          ref={textareaRef}
          className="canvas-card-editor nodrag nowheel"
          value={draft}
          aria-label="Edit canvas card"
          onBlur={() => {
            if (skipNextBlurCommitRef.current) {
              skipNextBlurCommitRef.current = false;
              return;
            }

            commitDraft();
          }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              skipNextBlurCommitRef.current = true;
              data.onCancelTextEdit?.();
              return;
            }

            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              skipNextBlurCommitRef.current = true;
              commitDraft();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <CanvasMarkdownPreview markdown={data.text ?? ""} />
      )}
    </article>
  );
}

function CanvasFileNode({ data }: NodeProps<Node<CanvasNodeData, "file">>) {
  const fileKind = canvasFileKind(data.file);
  const mediaSrc = vaultFileAssetUrl(data.vaultRoot, data.file);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (fileKind !== "markdown") {
        setStatus(data.file && fileKind !== "other" && mediaSrc ? "ready" : "error");
        return;
      }

      if (!data.vaultRoot || !data.file) {
        setStatus("error");
        return;
      }

      setStatus("loading");

      try {
        // Use the normal vault read command so file-node previews respect the
        // same path constraints as opening a note from the file drawer.
        const file = await invoke<OpenedFile>("read_vault_file", {
          root: data.vaultRoot,
          relative: data.file,
        });

        if (!cancelled) {
          setPreview(file.content.slice(0, maxCanvasPreviewChars));
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setPreview("");
          setStatus("error");
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [data.file, data.vaultRoot, fileKind, mediaSrc]);

  return (
    <article
      className={`canvas-node-card canvas-file-node${nodeColorClass(data.color)}`}
      style={canvasNodeStyle(data.color)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (data.file && fileKind === "markdown") {
          data.onOpenFile(data.file);
        }
      }}
    >
      <CanvasHandles />
      <header>
        <span>File</span>
        <strong>{data.file ?? data.label}</strong>
      </header>
      {status === "ready" && fileKind === "markdown" ? (
        <CanvasMarkdownPreview markdown={preview} />
      ) : null}
      {status === "ready" && fileKind === "image" ? (
        <img className="canvas-media-preview" src={mediaSrc} alt={data.label} loading="lazy" />
      ) : null}
      {status === "ready" && fileKind === "video" ? (
        <video className="canvas-media-preview" controls src={mediaSrc} />
      ) : null}
      {status === "ready" && fileKind === "audio" ? (
        <audio className="canvas-audio-preview" controls src={mediaSrc} />
      ) : null}
      {status === "loading" ? <p className="canvas-empty-preview">Loading preview...</p> : null}
      {status === "error" ? <p className="canvas-empty-preview">No preview available.</p> : null}
    </article>
  );
}

function CanvasLinkNode({ data }: NodeProps<Node<CanvasNodeData, "link">>) {
  return (
    <article
      className={`canvas-node-card canvas-link-node${nodeColorClass(data.color)}`}
      style={canvasNodeStyle(data.color)}
    >
      <CanvasHandles />
      <header>
        <span>Web Page</span>
        <strong>{data.label || data.url}</strong>
      </header>
      {data.url ? (
        <>
          <iframe
            className="canvas-web-preview"
            loading="lazy"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            src={data.url}
            title={data.label || data.url}
          />
          <p className="canvas-web-fallback">
            Preview unavailable?{" "}
            <a href={data.url} rel="noreferrer" target="_blank">
              Open page
            </a>
          </p>
        </>
      ) : null}
    </article>
  );
}

function CanvasGroupNode({ data }: NodeProps<Node<CanvasNodeData, "group">>) {
  return (
    <section
      className={`canvas-group-node${nodeColorClass(data.color)}`}
      style={canvasNodeStyle(data.color)}
    >
      <CanvasHandles />
      {data.label ? <strong>{data.label}</strong> : null}
    </section>
  );
}

export const canvasNodeTypes = {
  text: CanvasTextNode,
  file: CanvasFileNode,
  link: CanvasLinkNode,
  group: CanvasGroupNode,
};
