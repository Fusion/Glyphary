/**
 * Fenced code-block renderers for editor-only previews.
 *
 * Responsibilities:
 * - Render ```toc and ```mermaid fences as inline widgets when their source
 *   block is not selected.
 * - Keep navigation helpers for rendered table-of-contents entries near the
 *   code that creates those entries.
 *
 * Contracts:
 * - The Markdown source remains a normal fenced code block and is never
 *   rewritten by these preview renderers.
 * - Mermaid is loaded lazily so regular editor startup does not pay for it.
 */

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { TocEntry } from "../lib/markdown";

let mermaidRenderer: Promise<typeof import("mermaid")["default"]> | null = null;

function loadMermaidRenderer() {
  mermaidRenderer ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
    });

    return mermaid;
  });

  return mermaidRenderer;
}

export function codeBlockContainsSelection(
  selection: Selection,
  position: number,
  nodeSize: number,
) {
  const contentStart = position + 1;
  const contentEnd = position + nodeSize - 1;

  return selection.from >= contentStart && selection.to <= contentEnd;
}

export function jumpToHeadingInEditor(
  targetEditor: Editor | null,
  entry: TocEntry,
  onStatus: (message: string) => void,
) {
  if (!targetEditor) {
    return;
  }

  let matchCount = 0;
  let targetPosition: number | null = null;

  targetEditor.state.doc.descendants((node, position) => {
    if (targetPosition !== null || node.type.name !== "heading") {
      return true;
    }

    if (node.attrs.level === entry.level && node.textContent.trim() === entry.title) {
      matchCount += 1;

      if (matchCount === entry.occurrence) {
        targetPosition = position;
        return false;
      }
    }

    return true;
  });

  if (targetPosition === null) {
    onStatus(`Could not find heading ${entry.title}`);
    return;
  }

  targetEditor.chain().focus().setTextSelection(targetPosition + 1).scrollIntoView().run();
  onStatus(`Jumped to ${entry.title}`);
}

function tocEntriesFromEditorDoc(doc: ProseMirrorNode): TocEntry[] {
  const headings: TocEntry[] = [];
  const occurrences = new Map<string, number>();

  doc.descendants((node) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const title = node.textContent.trim();

    if (!title) {
      return false;
    }

    const level = Number(node.attrs.level);
    const key = `${level}:${title}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;

    occurrences.set(key, occurrence);
    headings.push({
      id: `${key}:${occurrence}`,
      level,
      title,
      occurrence,
    });

    return false;
  });

  return headings;
}

function createTocCodeWidget(headings: TocEntry[], blockPosition: number) {
  const render = document.createElement("div");
  render.className = "toc-code-render toc-code-widget";
  render.contentEditable = "false";
  render.dataset.tocBlockPosition = String(blockPosition);

  const header = document.createElement("div");
  header.className = "toc-code-header";

  const title = document.createElement("strong");
  title.textContent = "Table of contents";
  header.appendChild(title);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.dataset.tocEdit = "true";
  editButton.textContent = "Edit";
  header.appendChild(editButton);
  render.appendChild(header);

  if (headings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "toc-code-empty";
    empty.textContent = "No headings in this document.";
    render.appendChild(empty);
    return render;
  }

  const list = document.createElement("div");
  list.className = "toc-code-list";
  list.setAttribute("role", "list");

  headings.forEach((entry) => {
    const button = document.createElement("button");
    const level = document.createElement("span");
    const titleElement = document.createElement("strong");

    button.type = "button";
    button.className = `toc-code-entry level-${entry.level}`;
    button.dataset.tocEntryId = entry.id;
    level.textContent = `H${entry.level}`;
    titleElement.textContent = entry.title;
    button.append(level, titleElement);
    list.appendChild(button);
  });

  render.appendChild(list);
  return render;
}

function shortHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function renderMermaidDiagram(render: HTMLElement, source: string, renderId: string) {
  render.dataset.mermaidRenderId = renderId;

  const body = render.querySelector<HTMLElement>(".mermaid-code-body");

  if (!body) {
    return;
  }

  if (!source.trim()) {
    body.textContent = "Empty Mermaid diagram.";
    return;
  }

  body.textContent = "Rendering diagram...";

  void loadMermaidRenderer()
    .then((mermaid) => mermaid.render(renderId, source))
    .then(({ svg, bindFunctions }) => {
      if (render.dataset.mermaidRenderId !== renderId) {
        return;
      }

      body.innerHTML = svg;
      bindFunctions?.(body);
    })
    .catch((error: unknown) => {
      if (render.dataset.mermaidRenderId !== renderId) {
        return;
      }

      body.textContent = error instanceof Error ? error.message : String(error);
    });
}

function createMermaidCodeWidget(source: string, blockPosition: number) {
  const render = document.createElement("div");
  const renderId = `glyphary-mermaid-${blockPosition}-${shortHash(source)}`;
  render.className = "mermaid-code-render mermaid-code-widget";
  render.contentEditable = "false";
  render.dataset.mermaidBlockPosition = String(blockPosition);

  const header = document.createElement("div");
  header.className = "mermaid-code-header";

  const title = document.createElement("strong");
  title.textContent = "Mermaid";
  header.appendChild(title);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.dataset.mermaidEdit = "true";
  editButton.textContent = "Edit";
  header.appendChild(editButton);
  render.appendChild(header);

  const body = document.createElement("div");
  body.className = "mermaid-code-body";
  render.appendChild(body);

  renderMermaidDiagram(render, source, renderId);
  return render;
}

export const TocCodeBlockRenderer = Extension.create({
  name: "tocCodeBlockRenderer",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tocCodeBlockRenderer"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            const headings = tocEntriesFromEditorDoc(state.doc);

            state.doc.descendants((node, position) => {
              if (node.type.name !== "codeBlock") {
                return true;
              }

              if (node.attrs.language !== "toc") {
                return false;
              }

              const selected =
                state.selection.from >= position &&
                state.selection.to <= position + node.nodeSize;

              decorations.push(
                Decoration.node(position, position + node.nodeSize, {
                  class: selected ? "toc-code-block editing" : "toc-code-block rendered",
                }),
              );

              if (!selected) {
                decorations.push(
                  Decoration.widget(
                    position + node.nodeSize,
                    () => createTocCodeWidget(headings, position),
                    {
                      key: `toc-code:${position}:${headings.map((entry) => entry.id).join("|")}`,
                      side: -1,
                    },
                  ),
                );
              }

              return false;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export const MermaidCodeBlockRenderer = Extension.create({
  name: "mermaidCodeBlockRenderer",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("mermaidCodeBlockRenderer"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, position) => {
              if (node.type.name !== "codeBlock") {
                return true;
              }

              if (node.attrs.language !== "mermaid") {
                return false;
              }

              const selected = codeBlockContainsSelection(
                state.selection,
                position,
                node.nodeSize,
              );
              const source = node.textContent;

              decorations.push(
                Decoration.node(position, position + node.nodeSize, {
                  class: selected ? "mermaid-code-block editing" : "mermaid-code-block rendered",
                }),
              );

              if (!selected) {
                decorations.push(
                  Decoration.widget(
                    position + node.nodeSize,
                    () => createMermaidCodeWidget(source, position),
                    {
                      key: `mermaid-code:${position}:${shortHash(source)}`,
                      side: -1,
                    },
                  ),
                );
              }

              return false;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
