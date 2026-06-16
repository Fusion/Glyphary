import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import type { Editor, JSONContent, MarkdownToken, NodeViewProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { redo, undo } from "@tiptap/pm/history";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { createLowlight } from "lowlight";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import {
  calendarDateKey,
  calendarDayRelativePath,
  calendarDayTitle,
  calendarPathDateKey,
  clampResizableDrawerWidth,
  cleanVaultAssetReference,
  composeMarkdown,
  defaultDrawerOpen,
  defaultFrontmatterPillHeader,
  defaultInspectorDrawerWidth,
  defaultMetaDelimiter,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultVaultDrawerWidth,
  displayPath,
  defaultTidbitPathPattern,
  emptyCalloutMarkdown,
  emptyCollapseMarkdown,
  emptyColumnsMarkdown,
  emptyTableMarkdown,
  expandDateTemplate,
  escapeMarkdownImageText,
  escapeMarkdownUrl,
  fileNameForDroppedImage,
  fileNameWithoutMarkdownExtension,
  findTabAcrossSplitGroups,
  frontmatterListValues,
  initialMarkdown,
  isMacOsPlatform,
  isSupportedImageFile,
  markdownHeadings,
  minEditorWorkspaceWidth,
  minResizableDrawerWidth,
  monthTitle,
  parentDirectory,
  recentFilesWithOpenedFile,
  remainingGroupAfterSplitPaneClose,
  richLinkMarkdown,
  sameCalendarDate,
  splitMetaHeader,
  splitHasDirtyTabs,
  tabIdForFile,
  weekdayLabels,
} from "./logic";
import type { MarkdownParts, SplitGroupId } from "./logic";
import type { TocEntry } from "./logic";
import "./App.css";

const codeLanguages = [
  { label: "Plain text", value: "" },
  { label: "Python", value: "python" },
  { label: "Shell", value: "sh" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "JSON", value: "json" },
  { label: "Rust", value: "rust" },
  { label: "SQL", value: "sql" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "Markdown", value: "markdown" },
];

const lowlight = createLowlight();

// Keep lowlight registration explicit so Markdown language names can be
// serialized directly from fenced code blocks and still highlight on reload.
lowlight.register("plaintext", plaintext);
lowlight.register("python", python);
lowlight.register("sh", bash);
lowlight.register("shell", bash);
lowlight.register("bash", bash);
lowlight.register("javascript", javascript);
lowlight.register("js", javascript);
lowlight.register("typescript", typescript);
lowlight.register("ts", typescript);
lowlight.register("json", json);
lowlight.register("rust", rust);
lowlight.register("rs", rust);
lowlight.register("sql", sql);
lowlight.register("html", xml);
lowlight.register("xml", xml);
lowlight.register("css", css);
lowlight.register("markdown", markdownLanguage);
lowlight.register("md", markdownLanguage);
// "toc" is a display mode layered over a normal fenced code block. Register it
// as plain text so the block remains editable and round-trips as ```toc.
lowlight.register("toc", plaintext);

function codeBlockContainsSelection(selection: Selection, position: number, nodeSize: number) {
  const contentStart = position + 1;
  const contentEnd = position + nodeSize - 1;

  return selection.from >= contentStart && selection.to <= contentEnd;
}

function codeBlockDecorationsContainLanguageControl(
  decorations: NodeViewProps["decorations"],
) {
  return decorations.some((decoration) => {
    const className = decoration.type.attrs.class;

    return (
      typeof className === "string" &&
      className.split(/\s+/).includes("code-block-language-active")
    );
  });
}

function codeBlockDecorationClassNames(decorations: NodeViewProps["decorations"]) {
  return decorations
    .map((decoration) => decoration.type.attrs.class)
    .filter((className): className is string => typeof className === "string");
}

function CodeBlockNodeView({ decorations, node, updateAttributes }: NodeViewProps) {
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const isLanguageControlActive = codeBlockDecorationsContainLanguageControl(decorations);
  const isRenderedTableOfContents = language === "toc";
  const className = [
    "code-block-node",
    isLanguageControlActive ? "active" : "",
    ...codeBlockDecorationClassNames(decorations),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <NodeViewWrapper className={className}>
      {!isRenderedTableOfContents ? (
        <label className="code-block-language-control" contentEditable={false}>
          <span>Lang</span>
          <input
            aria-label="Code block language"
            list="code-language-options"
            onChange={(event) => updateAttributes({ language: event.currentTarget.value })}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder="plain"
            spellCheck={false}
            value={language}
          />
        </label>
      ) : null}
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

// Code block language is a property of the block being edited, not global
// toolbar state. Rendering it as a node view keeps the control local to the
// current block while Markdown still round-trips through the normal fence attrs.
const CodeBlockWithLanguageControl = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    const codeBlockName = this.name;

    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("codeBlockLanguageControl"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, position) => {
              if (node.type.name !== codeBlockName) {
                return true;
              }

              if (codeBlockContainsSelection(state.selection, position, node.nodeSize)) {
                decorations.push(
                  Decoration.node(position, position + node.nodeSize, {
                    class: "code-block-language-active",
                  }),
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

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        if (!this.editor.isActive(this.name)) {
          return false;
        }

        return this.editor.commands.insertContent("    ");
      },
      "Shift-Tab": () => this.editor.isActive(this.name),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView, {
      update: ({ updateProps }) => {
        updateProps();
        return true;
      },
    });
  },
});

type WikiLinkResolution = {
  candidates: VaultIndexedFile[];
};

type WikiLinkExtensionOptions = {
  openSearch: () => void;
  resolveTarget: (target: string) => WikiLinkResolution;
};

const wikiLinkTokenPattern = /\[\[([^\]\n]+)\]\]/g;

function createWikiLinkExtension(options: WikiLinkExtensionOptions) {
  return Extension.create({
    name: "glypharyWikilinks",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("glypharyWikilinks"),
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = [];

              state.doc.descendants((node, position, parent) => {
                if (!node.isText || !node.text || parent?.type.spec.code) {
                  return true;
                }

                for (const match of node.text.matchAll(wikiLinkTokenPattern)) {
                  const target = wikiLinkTargetFromMarkup(match[1] ?? "");

                  if (!target) {
                    continue;
                  }

                  const candidates = options.resolveTarget(target).candidates;
                  const stateClass =
                    candidates.length === 0
                      ? "missing"
                      : candidates.length === 1
                        ? "resolved"
                        : "ambiguous";

                  decorations.push(
                    Decoration.inline(position + match.index, position + match.index + match[0].length, {
                      class: `wikilink wikilink-${stateClass}`,
                      "data-wikilink-target": target,
                      title:
                        candidates.length === 0
                          ? "No matching note"
                          : candidates.length === 1
                            ? candidates[0].relativePath
                            : `${candidates.length} matching notes`,
                    }),
                  );
                }

                return true;
              });

              return DecorationSet.create(state.doc, decorations);
            },
            handleTextInput: (view, from, _to, text) => {
              if (text !== "[") {
                return false;
              }

              if (view.state.doc.textBetween(Math.max(0, from - 1), from) !== "[") {
                return false;
              }

              window.setTimeout(options.openSearch, 0);
              return false;
            },
          },
        }),
      ];
    },
  });
}

type ToolbarAction = {
  label: string;
  icon?: ToolbarIconName;
  title: string;
  isActive: () => boolean;
  isEnabled?: () => boolean;
  run: () => void;
};

type ToolbarIconName =
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "code"
  | "table"
  | "columns"
  | "callout";

type CommandPaletteCommand = {
  id: string;
  title: string;
  description: string;
  run: () => void | Promise<void>;
};

type WasmPluginResponse =
  | {
      id: string;
      ok: true;
      output: string;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

function renderToolbarIcon(icon: ToolbarIconName) {
  switch (icon) {
    case "bullet-list":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="6" cy="7" r="1.2" />
          <circle cx="6" cy="12" r="1.2" />
          <circle cx="6" cy="17" r="1.2" />
          <path d="M10 7h8" />
          <path d="M10 12h8" />
          <path d="M10 17h8" />
        </svg>
      );
    case "ordered-list":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5.2 8V4.8L4.4 5.3" />
          <path d="M4.2 11.2h2.2l-2.2 2.6h2.4" />
          <path d="M4.2 16.2h2.1l-1.2 1.2c.8 0 1.4.4 1.4 1.1 0 .8-.7 1.3-1.7 1.3-.4 0-.8-.1-1.1-.2" />
          <path d="M10 6h8" />
          <path d="M10 12h8" />
          <path d="M10 18h8" />
        </svg>
      );
    case "task-list":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.2" width="3.5" height="3.5" rx="0.7" />
          <rect x="4.5" y="10.2" width="3.5" height="3.5" rx="0.7" />
          <rect x="4.5" y="15.2" width="3.5" height="3.5" rx="0.7" />
          <path d="m5.3 6.9 1 1 2-2.3" />
          <path d="M10.5 7h8" />
          <path d="M10.5 12h8" />
          <path d="M10.5 17h8" />
        </svg>
      );
    case "quote":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8.5 7.5c-1.7 1.4-2.6 3-2.6 5v3.2h4.5v-4.5H8c.1-1 .7-2 1.9-3.1z" />
          <path d="M16.4 7.5c-1.7 1.4-2.6 3-2.6 5v3.2h4.5v-4.5h-2.4c.1-1 .7-2 1.9-3.1z" />
        </svg>
      );
    case "code":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m9 8-4 4 4 4" />
          <path d="m15 8 4 4-4 4" />
          <path d="m13 6-2 12" />
        </svg>
      );
    case "table":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.5" width="15" height="13" rx="1.6" />
          <path d="M4.5 10h15" />
          <path d="M9.5 5.5v13" />
          <path d="M14.5 5.5v13" />
          <path d="M4.5 14.2h15" />
        </svg>
      );
    case "columns":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.5" width="15" height="13" rx="1.8" />
          <path d="M12 5.5v13" />
          <path d="M7.4 9h2" />
          <path d="M7.4 12h2" />
          <path d="M14.6 9h2" />
          <path d="M14.6 12h2" />
        </svg>
      );
    case "callout":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4.5" y="5.5" width="15" height="13" rx="2" />
          <path d="M8 5.5v13" />
          <path d="M11 9h5.2" />
          <path d="M11 12.4h4" />
          <path d="m8.2 18.5 2.2 2" />
        </svg>
      );
  }
}

type RichLinkMetadata = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
};

function jumpToHeadingInEditor(
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

const TocCodeBlockRenderer = Extension.create({
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

function isEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed);
}

function isVimNormalMode(editor: Editor) {
  const storage = editor.storage as unknown as {
    glypharyVimMode?: { state?: { mode?: string } };
  };

  return storage.glypharyVimMode?.state?.mode === "normal";
}

function setVimMode(editor: Editor, mode: "insert" | "normal") {
  const storage = editor.storage as unknown as {
    glypharyVimMode?: { state?: { mode?: string } };
  };

  if (storage.glypharyVimMode?.state) {
    storage.glypharyVimMode.state.mode = mode;
  }
}

type VimPendingCommand = {
  key: "c" | "d" | "g" | "y";
  expires: number;
};

type VimCopyBuffer = {
  text: string;
  linewise: boolean;
};

function createGlypharyVimMode(reportStatus: (message: string) => void) {
  let pendingCommand: VimPendingCommand | null = null;
  let copyBuffer: VimCopyBuffer = { text: "", linewise: false };

  return Extension.create({
    name: "glypharyVimMode",

    // Glyphary owns Vim handling locally instead of delegating to an external
    // keymap. That keeps multi-key commands deterministic and prevents broad
    // Normal-mode catchalls from swallowing the second key in commands like gg.
    priority: 10000,

    addStorage() {
      return {
        state: {
          mode: "insert",
        },
      };
    },

    addProseMirrorPlugins() {
      const pendingIs = (key: VimPendingCommand["key"]) => {
        if (!pendingCommand || pendingCommand.expires <= Date.now()) {
          pendingCommand = null;
          return false;
        }

        return pendingCommand.key === key;
      };

      const waitForNextKey = (key: VimPendingCommand["key"]) => {
        // Multi-key Vim commands are short-lived so an abandoned prefix like
        // `g` does not unexpectedly affect a later unrelated keypress.
        pendingCommand = { key, expires: Date.now() + 700 };
        return true;
      };

      const currentTextblockRange = () => {
        const { $head } = this.editor.state.selection;

        return {
          start: $head.start(),
          end: $head.end(),
          text: $head.parent.textContent,
          offset: $head.parentOffset,
          before: $head.before($head.depth),
          after: $head.after($head.depth),
        };
      };

      const writeCopyBuffer = (buffer: VimCopyBuffer) => {
        copyBuffer = buffer;

        // Keep a local Vim register as the source of truth. The system clipboard
        // write is best-effort because webviews may reject it outside secure or
        // explicitly permissioned clipboard contexts.
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(buffer.text).catch(() => undefined);
        }
      };

      const setSelection = (position: number) => {
        const { state, view } = this.editor;
        const nextPosition = Math.max(0, Math.min(state.doc.content.size, position));

        view.dispatch(
          state.tr
            .setSelection(TextSelection.create(state.doc, nextPosition))
            .scrollIntoView(),
        );
        return true;
      };

      const enterInsertMode = () => {
        setVimMode(this.editor, "insert");
        reportStatus("Vim insert mode");
      };

      const wordRangeAtOrAfterCursor = () => {
        const { start, text, offset } = currentTextblockRange();
        let wordStart = Math.min(offset, text.length);

        while (wordStart < text.length && /\s/.test(text[wordStart])) {
          wordStart += 1;
        }

        if (wordStart >= text.length) {
          return null;
        }

        while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
          wordStart -= 1;
        }

        let wordEnd = wordStart;

        while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
          wordEnd += 1;
        }

        return {
          from: start + wordStart,
          to: start + wordEnd,
          text: text.slice(wordStart, wordEnd),
        };
      };

      const moveBy = (delta: number) => {
        pendingCommand = null;
        return setSelection(this.editor.state.selection.from + delta);
      };

      const moveLine = (direction: -1 | 1) => {
        const { state, view } = this.editor;
        const start = view.coordsAtPos(state.selection.from);
        const lineHeight = parseInt(getComputedStyle(view.dom).lineHeight, 10) || 20;
        // ProseMirror positions are document offsets, not visual rows. Use
        // coordinate mapping for j/k so wrapped lines behave like editor lines.
        const target = view.posAtCoords({
          left: start.left,
          top: start.top + direction * lineHeight,
        });

        pendingCommand = null;

        if (!target) {
          return true;
        }

        return setSelection(target.pos);
      };

      const moveToNextWordStart = () => {
        const { start, text, offset } = currentTextblockRange();
        let nextOffset = Math.min(offset, text.length);

        while (nextOffset < text.length && !/\s/.test(text[nextOffset])) {
          nextOffset += 1;
        }

        while (nextOffset < text.length && /\s/.test(text[nextOffset])) {
          nextOffset += 1;
        }

        pendingCommand = null;
        return setSelection(start + nextOffset);
      };

      const moveToPreviousWordStart = () => {
        const { start, text, offset } = currentTextblockRange();
        let previousOffset = Math.max(0, Math.min(offset - 1, text.length - 1));

        while (previousOffset > 0 && /\s/.test(text[previousOffset])) {
          previousOffset -= 1;
        }

        while (previousOffset > 0 && !/\s/.test(text[previousOffset - 1])) {
          previousOffset -= 1;
        }

        pendingCommand = null;
        return setSelection(start + previousOffset);
      };

      const moveToFileStart = () => {
        const { state, view } = this.editor;

        pendingCommand = null;
        view.dispatch(
          state.tr
            .setSelection(Selection.atStart(state.doc))
            .scrollIntoView(),
        );
        return true;
      };

      const moveToLastTextblock = () => {
        let lastTextblockPosition = 0;

        this.editor.state.doc.descendants((node, position) => {
          if (node.isTextblock) {
            lastTextblockPosition = position + 1;
          }

          return true;
        });

        pendingCommand = null;
        return setSelection(lastTextblockPosition);
      };

      const moveToFirstNonBlank = () => {
        const { start, text } = currentTextblockRange();
        const firstNonBlank = text.search(/\S/);

        pendingCommand = null;
        return setSelection(start + (firstNonBlank === -1 ? 0 : firstNonBlank));
      };

      const moveToMatchingPair = () => {
        const { start, text, offset } = currentTextblockRange();
        const pairs: Record<string, string> = {
          "(": ")",
          "[": "]",
          "{": "}",
        };
        const reversePairs: Record<string, string> = {
          ")": "(",
          "]": "[",
          "}": "{",
        };
        const character = text[offset];

        if (pairs[character]) {
          let depth = 0;

          for (let index = offset; index < text.length; index += 1) {
            if (text[index] === character) {
              depth += 1;
            } else if (text[index] === pairs[character]) {
              depth -= 1;

              if (depth === 0) {
                pendingCommand = null;
                return setSelection(start + index);
              }
            }
          }
        }

        if (reversePairs[character]) {
          let depth = 0;

          for (let index = offset; index >= 0; index -= 1) {
            if (text[index] === character) {
              depth += 1;
            } else if (text[index] === reversePairs[character]) {
              depth -= 1;

              if (depth === 0) {
                pendingCommand = null;
                return setSelection(start + index);
              }
            }
          }
        }

        pendingCommand = null;
        return true;
      };

      const deleteCurrentLine = () => {
        const { state, view } = this.editor;
        const { start, end, text } = currentTextblockRange();
        const transaction = state.tr.delete(start, end);
        const selectionPosition = Math.min(start, transaction.doc.content.size);

        writeCopyBuffer({ text, linewise: true });
        pendingCommand = null;
        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, selectionPosition))
            .scrollIntoView(),
        );
        reportStatus("Yanked and deleted line");
        return true;
      };

      const deleteWordUnderCursor = () => {
        const { state, view } = this.editor;
        const range = wordRangeAtOrAfterCursor();

        pendingCommand = null;

        if (!range) {
          return true;
        }

        const transaction = state.tr.delete(range.from, range.to);

        writeCopyBuffer({ text: range.text, linewise: false });
        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, range.from))
            .scrollIntoView(),
        );
        reportStatus("Deleted word");
        return true;
      };

      const yankCurrentLine = () => {
        writeCopyBuffer({ text: currentTextblockRange().text, linewise: true });
        pendingCommand = null;
        reportStatus("Yanked line");
        return true;
      };

      const yankWordUnderCursor = () => {
        const range = wordRangeAtOrAfterCursor();

        pendingCommand = null;

        if (range) {
          writeCopyBuffer({ text: range.text, linewise: false });
          reportStatus("Yanked word");
        }

        return true;
      };

      const deleteCharacterUnderCursor = () => {
        const { state, view } = this.editor;
        const { end } = currentTextblockRange();
        const from = state.selection.from;
        const to = Math.min(from + 1, end);

        if (from >= to) {
          return true;
        }

        writeCopyBuffer({
          text: state.doc.textBetween(from, to, "\n", "\n"),
          linewise: false,
        });
        const transaction = state.tr.delete(from, to);

        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, from))
            .scrollIntoView(),
        );
        return true;
      };

      const deleteCharacterAndInsert = () => {
        deleteCharacterUnderCursor();
        enterInsertMode();
        return true;
      };

      const deleteLineAndInsert = () => {
        const { state, view } = this.editor;
        const { start, end, text } = currentTextblockRange();
        const transaction = state.tr.delete(start, end);
        const selectionPosition = Math.min(start, transaction.doc.content.size);

        writeCopyBuffer({ text, linewise: true });
        pendingCommand = null;
        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, selectionPosition))
            .scrollIntoView(),
        );
        enterInsertMode();
        return true;
      };

      const changeWordUnderCursor = () => {
        deleteWordUnderCursor();
        enterInsertMode();
        return true;
      };

      const pasteCopyBuffer = (beforeCursor: boolean) => {
        if (!copyBuffer.text) {
          return true;
        }

        if (copyBuffer.linewise) {
          const { state, view } = this.editor;
          const { before, after } = currentTextblockRange();
          const position = beforeCursor ? before : after;
          // The local register stores plain text; inserting it as a paragraph
          // preserves a linewise paste without importing arbitrary HTML/schema
          // content from the system clipboard.
          const paragraph = state.schema.nodes.paragraph.create(
            null,
            copyBuffer.text ? state.schema.text(copyBuffer.text) : undefined,
          );

          view.dispatch(state.tr.insert(position, paragraph).scrollIntoView());
          return true;
        }

        const { state, view } = this.editor;
        const position = beforeCursor
          ? state.selection.from
          : Math.min(state.selection.from + 1, state.doc.content.size);

        view.dispatch(state.tr.insertText(copyBuffer.text, position).scrollIntoView());
        return true;
      };

      const commandForKey = (event: KeyboardEvent) => {
        if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r") {
          return redo(this.editor.state, (transaction) => this.editor.view.dispatch(transaction));
        }

        if (event.ctrlKey || event.metaKey || event.altKey) {
          return false;
        }

        switch (event.key === " " ? "Space" : event.key) {
          case "i":
            enterInsertMode();
            return true;
          case "A":
            setSelection(currentTextblockRange().end);
            enterInsertMode();
            return true;
          case "u":
            pendingCommand = null;
            return undo(this.editor.state, (transaction) => this.editor.view.dispatch(transaction));
          case "0":
            pendingCommand = null;
            return setSelection(currentTextblockRange().start);
          case "$":
            pendingCommand = null;
            return setSelection(currentTextblockRange().end);
          case "^":
            return moveToFirstNonBlank();
          case "Space":
            pendingCommand = null;
            return setSelection(this.editor.state.selection.from + 1);
          case "%":
            return moveToMatchingPair();
          case "h":
            return moveBy(-1);
          case "l":
            return moveBy(1);
          case "j":
            return moveLine(1);
          case "k":
            return moveLine(-1);
          case "G":
            return moveToLastTextblock();
          case "g":
            if (!pendingIs("g")) {
              return waitForNextKey("g");
            }
            // `gg` is implemented explicitly here rather than through a generic
            // movement helper because earlier keymap attempts treated the
            // second `g` as a normal character or end-of-document movement.
            return moveToFileStart();
          case "d":
            if (pendingIs("d")) {
              return deleteCurrentLine();
            }
            return waitForNextKey("d");
          case "c":
            return waitForNextKey("c");
          case "w":
            if (pendingIs("c")) {
              return changeWordUnderCursor();
            }
            if (pendingIs("d")) {
              return deleteWordUnderCursor();
            }
            if (pendingIs("y")) {
              return yankWordUnderCursor();
            }
            return moveToNextWordStart();
          case "b":
            return moveToPreviousWordStart();
          case "x":
            pendingCommand = null;
            return deleteCharacterUnderCursor();
          case "s":
            pendingCommand = null;
            return deleteCharacterAndInsert();
          case "S":
            pendingCommand = null;
            return deleteLineAndInsert();
          case "p":
            pendingCommand = null;
            return pasteCopyBuffer(false);
          case "O":
            pendingCommand = null;
            return pasteCopyBuffer(true);
          case "y":
            if (pendingIs("y")) {
              return yankCurrentLine();
            }
            return waitForNextKey("y");
          default:
            if (event.key.length === 1) {
              return true;
            }
            return false;
        }
      };

      return [
        new Plugin({
          key: new PluginKey("glypharyVimMode"),
          props: {
            handleKeyDown: (_view, event) => {
              if (!isEditorReady(this.editor)) {
                return false;
              }

              if (event.key === "Escape") {
                setVimMode(this.editor, "normal");
                setSelection(this.editor.state.selection.from - 1);
                reportStatus("Vim normal mode");
                event.preventDefault();
                return true;
              }

              if (!isVimNormalMode(this.editor)) {
                return false;
              }

              const handled = commandForKey(event);

              if (!handled) {
                return false;
              }

              event.preventDefault();
              return true;
            },
            handleTextInput: () => {
              return isEditorReady(this.editor) && isVimNormalMode(this.editor);
            },
          },
        }),
      ];
    },
  });
}

type VaultEntry = {
  name: string;
  relativePath: string;
  isDir: boolean;
};

type OpenedFile = {
  name: string;
  relativePath: string;
  content: string;
};

type VaultIndexedFile = {
  name: string;
  relativePath: string;
};

type RenamedDirectory = {
  name: string;
  relativePath: string;
};

type SavedAsset = {
  fileName: string;
  relativePath: string;
};

type CssSnippetFile = {
  name: string;
  relativePath: string;
};

type CssSnippetContent = {
  name: string;
  content: string;
};

type CssSnippetSettings = {
  directory: string;
  enabled: string[];
};

type PluginSettings = {
  enabled: string[];
};

type PluginWasmCommand = {
  module: string;
  input: "selection" | "document";
  output: "replaceSelection" | "insertAtCursor" | "replaceDocument";
  timeoutMs: number;
};

type PluginCommandManifest = {
  id: string;
  title: string;
  description?: string;
  insertMarkdown?: string | null;
  template?: string | null;
  wasm?: PluginWasmCommand | null;
};

type PluginManifest = {
  id: string;
  name: string;
  runtime: "glyphary-wasm-transform@1";
  version?: string;
  description?: string;
  permissions: string[];
  commands: PluginCommandManifest[];
  styles: string[];
};

type PluginCatalog = {
  plugins: PluginManifest[];
  errors: string[];
};

type PluginStyleContent = {
  pluginId: string;
  name: string;
  content: string;
};

type VaultThemeSettings = {
  presetId?: string | null;
  callouts?: VaultThemeCalloutSettings | null;
  tokens: Record<string, string>;
  options?: VaultThemeOptions | null;
};

type CalloutKind = "note" | "info" | "tip" | "warning";
type CalloutStyle = "plain" | "striped" | "card" | "compact" | "obsidian";
type CalloutIconName = "info" | "sparkles" | "alert" | "check" | "quote" | "none";

type VaultThemeCalloutSettings = {
  style: CalloutStyle;
  icons: Record<CalloutKind, CalloutIconName>;
};

type VaultThemeOptions = {
  colorfulHeadings: boolean;
  headingUnderlines: boolean;
  headingAnchors: boolean;
  richCallouts: boolean;
};

type FrontmatterPillSettings = {
  enabled: boolean;
  headerName: string;
};

type EditorBehaviorSettings = {
  vimMode: boolean;
};

type FileDisplaySettings = {
  showDotfiles: boolean;
};

type AutosaveSettings = {
  enabled: boolean;
};

type TidbitSettings = {
  pathPattern: string;
};

type VaultAppearanceSettings = {
  glassEffect: boolean;
};

type SettingsDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type VaultSettings = {
  assetDirectory: string;
  frontmatterPills?: FrontmatterPillSettings | null;
  files?: FileDisplaySettings | null;
  autosave?: AutosaveSettings | null;
  tidbits?: TidbitSettings | null;
  editor?: EditorBehaviorSettings | null;
  appearance?: VaultAppearanceSettings | null;
  cssSnippets?: CssSnippetSettings | null;
  plugins?: PluginSettings | null;
  theme?: VaultThemeSettings | null;
};

type ActiveFile = {
  name: string;
  relativePath: string;
};

type DocumentTab = {
  id: string;
  activeFile: ActiveFile | null;
  pageName: string;
  metaHeader: string;
  metaDelimiter: MarkdownParts["metaDelimiter"];
  markdown: string;
  markdownDraft: string;
  dirty: boolean;
};

type EditorGroupId = SplitGroupId;

type EditorGroupState = {
  id: EditorGroupId;
  tabs: DocumentTab[];
  activeTabId: string;
};

type SearchResult = {
  relativePath: string;
  lineNumber?: number;
  lineText?: string;
  isContentMatch: boolean;
};

type WikiLinkPickerState = {
  target: string;
  candidates: VaultIndexedFile[];
  x: number;
  y: number;
};

type SearchMode = "filename" | "content";
type AppearanceMode = "auto" | "light" | "dark";
type SettingsTab = "main" | "plugins" | "appearance";
type DrawerItem = "source" | "toc" | "calendar";
type VaultDrawerItem = "files" | "search" | "recent";
type ResizeSide = "vault" | "drawer";

type FolderContextMenuState = {
  entry: VaultEntry;
  x: number;
  y: number;
};

type FolderActionKind =
  | "create-note"
  | "create-folder"
  | "rename"
  | "move-folder"
  | "move-file"
  | "delete-file";

type FolderActionDialogState = {
  action: FolderActionKind;
  entry: VaultEntry;
  value: string;
};

type VaultFolderTreeNodeState = {
  children: VaultEntry[];
  error: string | null;
  loaded: boolean;
  loading: boolean;
};

type VaultFolderTreeProps = {
  root: string;
  selectedPath: string;
  movingEntry?: VaultEntry | null;
  onSelect: (relativePath: string) => void;
  onStatus: (message: string) => void;
};

type PersistedWorkspace = {
  vaultRoot: string;
  currentDir: string;
  activeFile: ActiveFile | null;
  recentFiles: ActiveFile[];
};

type ThemeTokenControl = {
  label: string;
  token: string;
  kind?: "color" | "value";
  placeholder?: string;
};

type ThemeTokenGroup = {
  title: string;
  controls: ThemeTokenControl[];
};

type ThemePreset = {
  id: string;
  name: string;
  description: string;
  tokens: Record<string, string>;
};

function FolderIcon({ className = "vault-entry-icon folder-icon" }: { className?: string }) {
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

function isMoveFolderDestinationDisabled(relativePath: string, movingEntry?: VaultEntry | null) {
  if (!movingEntry?.isDir) {
    return false;
  }

  return (
    relativePath === movingEntry.relativePath ||
    relativePath.startsWith(`${movingEntry.relativePath}/`)
  );
}

function isMoveAction(action: FolderActionKind) {
  return action === "move-file" || action === "move-folder";
}

function VaultFolderTree({
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
      const children = await invoke<VaultEntry[]>("list_vault_dir", {
        root,
        relative: relativePath,
      });

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

const workspaceStorageKey = "glyphary.workspace";
const appearanceStorageKey = "glyphary.appearance";
const closedDrawerWidth = 48;
const workspaceResizeHandleWidth = 10;
const defaultCssSnippetDirectory = "_snippets_";
const defaultFrontmatterPillSettings: FrontmatterPillSettings = {
  enabled: true,
  headerName: defaultFrontmatterPillHeader,
};
const defaultEditorBehaviorSettings: EditorBehaviorSettings = {
  vimMode: false,
};
const defaultFileDisplaySettings: FileDisplaySettings = {
  showDotfiles: false,
};
const defaultAutosaveSettings: AutosaveSettings = {
  enabled: true,
};
const defaultTidbitSettings: TidbitSettings = {
  pathPattern: defaultTidbitPathPattern,
};
const defaultVaultAppearanceSettings: VaultAppearanceSettings = {
  glassEffect: false,
};
const defaultCssSnippetSettings: CssSnippetSettings = {
  directory: defaultCssSnippetDirectory,
  enabled: [],
};
const defaultPluginSettings: PluginSettings = {
  enabled: [],
};
const defaultThemeOptions: VaultThemeOptions = {
  colorfulHeadings: false,
  headingUnderlines: false,
  headingAnchors: false,
  richCallouts: false,
};
const calloutStyleOptions: Array<{ value: CalloutStyle; label: string }> = [
  { value: "plain", label: "Plain" },
  { value: "striped", label: "Striped" },
  { value: "card", label: "Card" },
  { value: "compact", label: "Compact" },
  { value: "obsidian", label: "Obsidian" },
];
const calloutIconOptions: Array<{ value: CalloutIconName; label: string; glyph: string }> = [
  { value: "info", label: "Info", glyph: "i" },
  { value: "sparkles", label: "Sparkles", glyph: "*" },
  { value: "alert", label: "Alert", glyph: "!" },
  { value: "check", label: "Check", glyph: "+" },
  { value: "quote", label: "Quote", glyph: "\"" },
  { value: "none", label: "None", glyph: "" },
];
const calloutKinds: Array<{ value: CalloutKind; label: string }> = [
  { value: "note", label: "Note" },
  { value: "info", label: "Info" },
  { value: "tip", label: "Tip" },
  { value: "warning", label: "Warning" },
];
const defaultThemeCalloutSettings: VaultThemeCalloutSettings = {
  style: "plain",
  icons: {
    note: "info",
    info: "info",
    tip: "sparkles",
    warning: "alert",
  },
};
const defaultThemeLevelOneTokens: Record<string, string> = {
  "--glyphary-font-ui": "Inter, ui-sans-serif, system-ui, sans-serif",
  "--glyphary-font-editor": "Inter, ui-sans-serif, system-ui, sans-serif",
  "--glyphary-font-mono": "SFMono-Regular, Consolas, Liberation Mono, monospace",
  "--glyphary-editor-font-size": "1.05rem",
  "--glyphary-editor-line-height": "1.7",
  "--glyphary-editor-max-width": "none",
  "--glyphary-editor-padding-y": "38px",
  "--glyphary-editor-padding-x": "min(6vw, 72px)",
  "--glyphary-block-gap": "0.85em",
  "--glyphary-heading-h1-size": "2rem",
  "--glyphary-heading-h2-size": "1.45rem",
  "--glyphary-code-font-size": "0.92em",
  "--glyphary-code-tab-size": "4",
  "--glyphary-callout-background": "transparent",
  "--glyphary-callout-border-width": "1px",
  "--glyphary-callout-icon-size": "1.45rem",
  "--glyphary-callout-note-color": "#2f6846",
  "--glyphary-callout-info-color": "#2f6846",
  "--glyphary-callout-padding": "0.85rem 1rem",
  "--glyphary-callout-radius": "8px",
  "--glyphary-callout-title-transform": "uppercase",
  "--glyphary-callout-tip-color": "#8fd18f",
  "--glyphary-callout-warning-color": "#f5d08c",
  "--glyphary-radius-sm": "6px",
  "--glyphary-radius-md": "8px",
  "--glyphary-radius-lg": "10px",
  "--glyphary-border-width": "1px",
  "--glyphary-column-gap": "16px",
  "--syntax-red": "#ee8f8f",
  "--syntax-purple": "#c7a6ff",
  "--syntax-orange": "#e6a75e",
};

// The theme builder deliberately exposes only stable Glyphary variables. Vault
// settings persist these tokens directly, while CSS maps them onto Obsidian-like
// names for future theme compatibility.
const themeTokenGroups: ThemeTokenGroup[] = [
  {
    title: "Canvas",
    controls: [
      { label: "App background", token: "--glyphary-app-bg" },
      { label: "Surface", token: "--glyphary-surface" },
      { label: "Muted surface", token: "--glyphary-surface-muted" },
      { label: "Hover", token: "--glyphary-hover" },
      { label: "Selection", token: "--glyphary-selection" },
    ],
  },
  {
    title: "Text",
    controls: [
      { label: "Text", token: "--glyphary-text" },
      { label: "Soft text", token: "--glyphary-text-soft" },
      { label: "Editor text", token: "--glyphary-editor-text" },
      { label: "Heading", token: "--glyphary-heading" },
      { label: "Muted text", token: "--glyphary-muted" },
      { label: "Strong muted text", token: "--glyphary-muted-strong" },
      { label: "Mono text", token: "--glyphary-mono-text" },
    ],
  },
  {
    title: "Accent And Borders",
    controls: [
      { label: "Accent", token: "--glyphary-accent" },
      { label: "Accent text", token: "--glyphary-accent-text" },
      { label: "Focus", token: "--glyphary-focus" },
      { label: "Border", token: "--glyphary-border" },
      { label: "Soft border", token: "--glyphary-border-soft" },
      { label: "Strong border", token: "--glyphary-border-strong" },
      { label: "Table border", token: "--glyphary-table-border" },
    ],
  },
  {
    title: "Blocks",
    controls: [
      { label: "Code background", token: "--glyphary-code-bg" },
      { label: "Code text", token: "--glyphary-code-text" },
      { label: "Quote border", token: "--glyphary-quote-border" },
      { label: "Quote text", token: "--glyphary-quote-text" },
    ],
  },
  {
    title: "Callouts",
    controls: [
      { label: "Background", token: "--glyphary-callout-background" },
      { label: "Note color", token: "--glyphary-callout-note-color" },
      { label: "Info color", token: "--glyphary-callout-info-color" },
      { label: "Tip color", token: "--glyphary-callout-tip-color" },
      { label: "Warning color", token: "--glyphary-callout-warning-color" },
      {
        label: "Padding",
        token: "--glyphary-callout-padding",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-padding"],
      },
      {
        label: "Radius",
        token: "--glyphary-callout-radius",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-radius"],
      },
      {
        label: "Border width",
        token: "--glyphary-callout-border-width",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-border-width"],
      },
      {
        label: "Icon size",
        token: "--glyphary-callout-icon-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-icon-size"],
      },
      {
        label: "Title transform",
        token: "--glyphary-callout-title-transform",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-callout-title-transform"],
      },
    ],
  },
  {
    title: "Syntax",
    controls: [
      { label: "Blue", token: "--syntax-blue" },
      { label: "Green", token: "--syntax-green" },
      { label: "Yellow", token: "--syntax-yellow" },
      { label: "Red", token: "--syntax-red" },
      { label: "Purple", token: "--syntax-purple" },
      { label: "Orange", token: "--syntax-orange" },
      { label: "Muted", token: "--syntax-muted" },
    ],
  },
  {
    title: "Typography",
    controls: [
      {
        label: "UI font stack",
        token: "--glyphary-font-ui",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-font-ui"],
      },
      {
        label: "Editor font stack",
        token: "--glyphary-font-editor",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-font-editor"],
      },
      {
        label: "Code font stack",
        token: "--glyphary-font-mono",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-font-mono"],
      },
      {
        label: "Editor font size",
        token: "--glyphary-editor-font-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-font-size"],
      },
      {
        label: "Editor line height",
        token: "--glyphary-editor-line-height",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-line-height"],
      },
      {
        label: "H1 size",
        token: "--glyphary-heading-h1-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-heading-h1-size"],
      },
      {
        label: "H2 size",
        token: "--glyphary-heading-h2-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-heading-h2-size"],
      },
      {
        label: "Code font size",
        token: "--glyphary-code-font-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-code-font-size"],
      },
    ],
  },
  {
    title: "Spacing And Shape",
    controls: [
      {
        label: "Editor max width",
        token: "--glyphary-editor-max-width",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-max-width"],
      },
      {
        label: "Editor vertical padding",
        token: "--glyphary-editor-padding-y",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-padding-y"],
      },
      {
        label: "Editor horizontal padding",
        token: "--glyphary-editor-padding-x",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-editor-padding-x"],
      },
      {
        label: "Block gap",
        token: "--glyphary-block-gap",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-block-gap"],
      },
      {
        label: "Column gap",
        token: "--glyphary-column-gap",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-column-gap"],
      },
      {
        label: "Small radius",
        token: "--glyphary-radius-sm",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-radius-sm"],
      },
      {
        label: "Medium radius",
        token: "--glyphary-radius-md",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-radius-md"],
      },
      {
        label: "Large radius",
        token: "--glyphary-radius-lg",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-radius-lg"],
      },
      {
        label: "Border width",
        token: "--glyphary-border-width",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-border-width"],
      },
      {
        label: "Code tab size",
        token: "--glyphary-code-tab-size",
        kind: "value",
        placeholder: defaultThemeLevelOneTokens["--glyphary-code-tab-size"],
      },
    ],
  },
];

const editableThemeTokens = new Set(
  themeTokenGroups.flatMap((group) => group.controls.map((control) => control.token)),
);

// Presets are full token maps instead of partial overrides. Applying one should
// erase dependency on any previous custom theme, then the Theme Builder can
// refine individual values from that complete baseline.
const themePresets: ThemePreset[] = [
  {
    id: "field-notes",
    name: "Field Notes",
    description: "Warm paper, green accents, quiet editorial contrast.",
    tokens: {
      "--glyphary-app-bg": "#f3f1eb",
      "--glyphary-surface": "#fffdfa",
      "--glyphary-surface-muted": "#faf8f2",
      "--glyphary-hover": "#eef1ea",
      "--glyphary-selection": "rgba(47, 104, 70, 0.16)",
      "--glyphary-text": "#17201a",
      "--glyphary-text-soft": "#405044",
      "--glyphary-editor-text": "#1d271f",
      "--glyphary-heading": "#213227",
      "--glyphary-muted": "#637167",
      "--glyphary-muted-strong": "#5f6d63",
      "--glyphary-mono-text": "#273329",
      "--glyphary-accent": "#2f6846",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#7d8f7f",
      "--glyphary-border": "#ded9ce",
      "--glyphary-border-soft": "#e7e2d8",
      "--glyphary-border-strong": "#d4d0c6",
      "--glyphary-table-border": "#d8d4ca",
      "--glyphary-code-bg": "#18231c",
      "--glyphary-code-text": "#f2f7ef",
      "--glyphary-quote-border": "#77977d",
      "--glyphary-quote-text": "#435547",
      "--glyphary-shadow": "rgba(45, 38, 27, 0.08)",
      "--glyphary-shadow-strong": "rgba(45, 38, 27, 0.12)",
      "--syntax-blue": "#8fd7ff",
      "--syntax-green": "#8fd18f",
      "--syntax-yellow": "#f5d08c",
      "--syntax-muted": "#8da092",
    },
  },
  {
    id: "ink-linen",
    name: "Ink & Linen",
    description: "Clean white surfaces with crisp ink and restrained blue.",
    tokens: {
      "--glyphary-app-bg": "#f6f7f7",
      "--glyphary-surface": "#ffffff",
      "--glyphary-surface-muted": "#eef2f3",
      "--glyphary-hover": "#e8eff2",
      "--glyphary-selection": "rgba(30, 95, 132, 0.16)",
      "--glyphary-text": "#11191d",
      "--glyphary-text-soft": "#38464d",
      "--glyphary-editor-text": "#182126",
      "--glyphary-heading": "#10242d",
      "--glyphary-muted": "#64727a",
      "--glyphary-muted-strong": "#52616a",
      "--glyphary-mono-text": "#273a42",
      "--glyphary-accent": "#1e5f84",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#6da5bd",
      "--glyphary-border": "#d8e0e4",
      "--glyphary-border-soft": "#e5ebee",
      "--glyphary-border-strong": "#c5d0d6",
      "--glyphary-table-border": "#ccd7dc",
      "--glyphary-code-bg": "#142026",
      "--glyphary-code-text": "#eef7fb",
      "--glyphary-quote-border": "#7ca7b7",
      "--glyphary-quote-text": "#425d68",
      "--glyphary-shadow": "rgba(26, 38, 45, 0.08)",
      "--glyphary-shadow-strong": "rgba(26, 38, 45, 0.13)",
      "--syntax-blue": "#8ed6ff",
      "--syntax-green": "#9bdba8",
      "--syntax-yellow": "#f1d28e",
      "--syntax-muted": "#93a5ad",
    },
  },
  {
    id: "harbor",
    name: "Harbor",
    description: "Cool gray-blue workspace with a calm maritime accent.",
    tokens: {
      "--glyphary-app-bg": "#edf2f4",
      "--glyphary-surface": "#f9fbfc",
      "--glyphary-surface-muted": "#e7eef2",
      "--glyphary-hover": "#dfe9ee",
      "--glyphary-selection": "rgba(49, 111, 132, 0.18)",
      "--glyphary-text": "#142126",
      "--glyphary-text-soft": "#3e5159",
      "--glyphary-editor-text": "#1c2e35",
      "--glyphary-heading": "#16313a",
      "--glyphary-muted": "#63777f",
      "--glyphary-muted-strong": "#546a73",
      "--glyphary-mono-text": "#263d45",
      "--glyphary-accent": "#316f84",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#7fa9b7",
      "--glyphary-border": "#d0dce2",
      "--glyphary-border-soft": "#dde6ea",
      "--glyphary-border-strong": "#bdccd3",
      "--glyphary-table-border": "#c4d2d8",
      "--glyphary-code-bg": "#13242c",
      "--glyphary-code-text": "#eff8fb",
      "--glyphary-quote-border": "#6f9aac",
      "--glyphary-quote-text": "#3f606b",
      "--glyphary-shadow": "rgba(17, 40, 51, 0.09)",
      "--glyphary-shadow-strong": "rgba(17, 40, 51, 0.14)",
      "--syntax-blue": "#8fd9ff",
      "--syntax-green": "#92d7bd",
      "--syntax-yellow": "#f0cf8a",
      "--syntax-muted": "#8fa6af",
    },
  },
  {
    id: "moss-glass",
    name: "Moss Glass",
    description: "Soft green-gray surfaces with low-noise reading tones.",
    tokens: {
      "--glyphary-app-bg": "#eef2ec",
      "--glyphary-surface": "#fbfdf8",
      "--glyphary-surface-muted": "#e8eee4",
      "--glyphary-hover": "#dfe8dc",
      "--glyphary-selection": "rgba(76, 122, 84, 0.18)",
      "--glyphary-text": "#172119",
      "--glyphary-text-soft": "#415344",
      "--glyphary-editor-text": "#1d2b20",
      "--glyphary-heading": "#203625",
      "--glyphary-muted": "#627164",
      "--glyphary-muted-strong": "#55665a",
      "--glyphary-mono-text": "#28392d",
      "--glyphary-accent": "#4c7a54",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#86a888",
      "--glyphary-border": "#d4ded0",
      "--glyphary-border-soft": "#e1e8dd",
      "--glyphary-border-strong": "#c1cfbd",
      "--glyphary-table-border": "#cad7c6",
      "--glyphary-code-bg": "#142318",
      "--glyphary-code-text": "#eef8ee",
      "--glyphary-quote-border": "#85a776",
      "--glyphary-quote-text": "#4d6446",
      "--glyphary-shadow": "rgba(32, 45, 29, 0.08)",
      "--glyphary-shadow-strong": "rgba(32, 45, 29, 0.13)",
      "--syntax-blue": "#92d9f3",
      "--syntax-green": "#9bdb9d",
      "--syntax-yellow": "#e8d589",
      "--syntax-muted": "#90a393",
    },
  },
  {
    id: "nordic-dawn",
    name: "Nordic Dawn",
    description: "Pale cool canvas, muted coral accent, clear document text.",
    tokens: {
      "--glyphary-app-bg": "#f2f4f1",
      "--glyphary-surface": "#fffefd",
      "--glyphary-surface-muted": "#edf0ed",
      "--glyphary-hover": "#e6ecea",
      "--glyphary-selection": "rgba(157, 91, 82, 0.17)",
      "--glyphary-text": "#18201f",
      "--glyphary-text-soft": "#45524f",
      "--glyphary-editor-text": "#202927",
      "--glyphary-heading": "#263330",
      "--glyphary-muted": "#6b7774",
      "--glyphary-muted-strong": "#5c6966",
      "--glyphary-mono-text": "#2f3a38",
      "--glyphary-accent": "#9d5b52",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#b7928a",
      "--glyphary-border": "#d9dfdc",
      "--glyphary-border-soft": "#e6ebe8",
      "--glyphary-border-strong": "#cbd4d0",
      "--glyphary-table-border": "#d0d8d5",
      "--glyphary-code-bg": "#202928",
      "--glyphary-code-text": "#f3f8f6",
      "--glyphary-quote-border": "#a79f76",
      "--glyphary-quote-text": "#5e5b47",
      "--glyphary-shadow": "rgba(32, 39, 37, 0.08)",
      "--glyphary-shadow-strong": "rgba(32, 39, 37, 0.13)",
      "--syntax-blue": "#9dd7f5",
      "--syntax-green": "#a6d99a",
      "--syntax-yellow": "#ead38e",
      "--syntax-muted": "#95a4a1",
    },
  },
  {
    id: "sepia-study",
    name: "Sepia Study",
    description: "Library paper, subdued umber accent, comfortable long-form writing.",
    tokens: {
      "--glyphary-app-bg": "#f0ece2",
      "--glyphary-surface": "#fffaf0",
      "--glyphary-surface-muted": "#f5efe2",
      "--glyphary-hover": "#ece4d5",
      "--glyphary-selection": "rgba(129, 91, 47, 0.18)",
      "--glyphary-text": "#211a12",
      "--glyphary-text-soft": "#55483a",
      "--glyphary-editor-text": "#2b2116",
      "--glyphary-heading": "#3a2a18",
      "--glyphary-muted": "#786b5c",
      "--glyphary-muted-strong": "#6d5f4e",
      "--glyphary-mono-text": "#463827",
      "--glyphary-accent": "#815b2f",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#a88d68",
      "--glyphary-border": "#ded2bd",
      "--glyphary-border-soft": "#e9dfcc",
      "--glyphary-border-strong": "#d1c0a6",
      "--glyphary-table-border": "#d7c8b0",
      "--glyphary-code-bg": "#221a12",
      "--glyphary-code-text": "#fbf4e8",
      "--glyphary-quote-border": "#a78c5b",
      "--glyphary-quote-text": "#604c2e",
      "--glyphary-shadow": "rgba(49, 37, 21, 0.08)",
      "--glyphary-shadow-strong": "rgba(49, 37, 21, 0.13)",
      "--syntax-blue": "#9dccdd",
      "--syntax-green": "#accb8f",
      "--syntax-yellow": "#f0ce82",
      "--syntax-muted": "#a0917e",
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral dark graphite with sharp text and restrained amber.",
    tokens: {
      "--glyphary-app-bg": "#17191a",
      "--glyphary-surface": "#202324",
      "--glyphary-surface-muted": "#25292a",
      "--glyphary-hover": "#2e3435",
      "--glyphary-selection": "rgba(205, 151, 82, 0.2)",
      "--glyphary-text": "#edf0ed",
      "--glyphary-text-soft": "#c4cbc6",
      "--glyphary-editor-text": "#edf1ed",
      "--glyphary-heading": "#f5f2e9",
      "--glyphary-muted": "#9aa29d",
      "--glyphary-muted-strong": "#b0b8b3",
      "--glyphary-mono-text": "#d8ded9",
      "--glyphary-accent": "#cd9752",
      "--glyphary-accent-text": "#1a1208",
      "--glyphary-focus": "#d6b17d",
      "--glyphary-border": "#383e3f",
      "--glyphary-border-soft": "#303536",
      "--glyphary-border-strong": "#4b5253",
      "--glyphary-table-border": "#454c4d",
      "--glyphary-code-bg": "#101314",
      "--glyphary-code-text": "#f2f4ef",
      "--glyphary-quote-border": "#a88755",
      "--glyphary-quote-text": "#d0c2aa",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.32)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.42)",
      "--syntax-blue": "#8dcdf4",
      "--syntax-green": "#a7d79c",
      "--syntax-yellow": "#e8c87f",
      "--syntax-muted": "#8f9a95",
    },
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Deep teal-black writing surface with luminous syntax colors.",
    tokens: {
      "--glyphary-app-bg": "#11191a",
      "--glyphary-surface": "#172223",
      "--glyphary-surface-muted": "#1c292b",
      "--glyphary-hover": "#243436",
      "--glyphary-selection": "rgba(95, 161, 154, 0.22)",
      "--glyphary-text": "#e9f1ef",
      "--glyphary-text-soft": "#bed0cc",
      "--glyphary-editor-text": "#e7f2ef",
      "--glyphary-heading": "#f1f6f3",
      "--glyphary-muted": "#95aaa6",
      "--glyphary-muted-strong": "#abc0bc",
      "--glyphary-mono-text": "#d5e3df",
      "--glyphary-accent": "#5fa19a",
      "--glyphary-accent-text": "#071615",
      "--glyphary-focus": "#86c1b9",
      "--glyphary-border": "#2b3a3c",
      "--glyphary-border-soft": "#243234",
      "--glyphary-border-strong": "#415255",
      "--glyphary-table-border": "#394a4c",
      "--glyphary-code-bg": "#0b1213",
      "--glyphary-code-text": "#eff9f6",
      "--glyphary-quote-border": "#78aaa0",
      "--glyphary-quote-text": "#c1d7d2",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.34)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.46)",
      "--syntax-blue": "#86d5ff",
      "--syntax-green": "#9ce0b4",
      "--syntax-yellow": "#f0d783",
      "--syntax-muted": "#8fa5a2",
    },
  },
  {
    id: "alpine-dark",
    name: "Alpine Dark",
    description: "Cool dark mountain palette with green-blue emphasis.",
    tokens: {
      "--glyphary-app-bg": "#14191d",
      "--glyphary-surface": "#1b2227",
      "--glyphary-surface-muted": "#202a30",
      "--glyphary-hover": "#29363d",
      "--glyphary-selection": "rgba(113, 158, 139, 0.22)",
      "--glyphary-text": "#edf2f0",
      "--glyphary-text-soft": "#c2ceca",
      "--glyphary-editor-text": "#e7efec",
      "--glyphary-heading": "#f0f6f3",
      "--glyphary-muted": "#98a9a4",
      "--glyphary-muted-strong": "#adbbb7",
      "--glyphary-mono-text": "#d8e2df",
      "--glyphary-accent": "#719e8b",
      "--glyphary-accent-text": "#071310",
      "--glyphary-focus": "#95bba9",
      "--glyphary-border": "#313d43",
      "--glyphary-border-soft": "#2a353b",
      "--glyphary-border-strong": "#47545a",
      "--glyphary-table-border": "#3d4a50",
      "--glyphary-code-bg": "#0e1417",
      "--glyphary-code-text": "#f0f7f4",
      "--glyphary-quote-border": "#89a871",
      "--glyphary-quote-text": "#cdd8c5",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.33)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.45)",
      "--syntax-blue": "#8dcfff",
      "--syntax-green": "#a8d99e",
      "--syntax-yellow": "#ead17e",
      "--syntax-muted": "#93a4a0",
    },
  },
  {
    id: "plum-ledger",
    name: "Plum Ledger",
    description: "Charcoal base with plum accent and accountant-clean contrast.",
    tokens: {
      "--glyphary-app-bg": "#19181d",
      "--glyphary-surface": "#222128",
      "--glyphary-surface-muted": "#282631",
      "--glyphary-hover": "#332f3d",
      "--glyphary-selection": "rgba(153, 113, 142, 0.22)",
      "--glyphary-text": "#f0edf1",
      "--glyphary-text-soft": "#cec6d0",
      "--glyphary-editor-text": "#f0edf2",
      "--glyphary-heading": "#f8f1f5",
      "--glyphary-muted": "#a49aa6",
      "--glyphary-muted-strong": "#b9afbb",
      "--glyphary-mono-text": "#ded6e0",
      "--glyphary-accent": "#99718e",
      "--glyphary-accent-text": "#160d13",
      "--glyphary-focus": "#b797ad",
      "--glyphary-border": "#3b3842",
      "--glyphary-border-soft": "#332f39",
      "--glyphary-border-strong": "#514c59",
      "--glyphary-table-border": "#48434f",
      "--glyphary-code-bg": "#121116",
      "--glyphary-code-text": "#f6f1f5",
      "--glyphary-quote-border": "#9d8bba",
      "--glyphary-quote-text": "#d4c8db",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.34)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.46)",
      "--syntax-blue": "#9bcfff",
      "--syntax-green": "#a9d7a3",
      "--syntax-yellow": "#ead08a",
      "--syntax-muted": "#9f96a2",
    },
  },
  {
    id: "slate-rose",
    name: "Slate Rose",
    description: "Pale slate UI with a dried-rose accent and soft borders.",
    tokens: {
      "--glyphary-app-bg": "#f1f2f3",
      "--glyphary-surface": "#fffdfd",
      "--glyphary-surface-muted": "#ebeef0",
      "--glyphary-hover": "#e4e9eb",
      "--glyphary-selection": "rgba(154, 87, 96, 0.16)",
      "--glyphary-text": "#1d2022",
      "--glyphary-text-soft": "#4b5357",
      "--glyphary-editor-text": "#252a2d",
      "--glyphary-heading": "#2c3134",
      "--glyphary-muted": "#6c7478",
      "--glyphary-muted-strong": "#5e666b",
      "--glyphary-mono-text": "#343d41",
      "--glyphary-accent": "#9a5760",
      "--glyphary-accent-text": "#ffffff",
      "--glyphary-focus": "#b98d93",
      "--glyphary-border": "#d9dee1",
      "--glyphary-border-soft": "#e6eaec",
      "--glyphary-border-strong": "#cbd2d6",
      "--glyphary-table-border": "#d1d7da",
      "--glyphary-code-bg": "#202326",
      "--glyphary-code-text": "#f4f6f6",
      "--glyphary-quote-border": "#9b9a72",
      "--glyphary-quote-text": "#5b5b45",
      "--glyphary-shadow": "rgba(32, 38, 42, 0.08)",
      "--glyphary-shadow-strong": "rgba(32, 38, 42, 0.13)",
      "--syntax-blue": "#8ed2f4",
      "--syntax-green": "#a4d69c",
      "--syntax-yellow": "#e9d084",
      "--syntax-muted": "#96a0a4",
    },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    description: "Technical blue-gray dark mode with diagram-clean contrast.",
    tokens: {
      "--glyphary-app-bg": "#121821",
      "--glyphary-surface": "#182231",
      "--glyphary-surface-muted": "#1d2b3c",
      "--glyphary-hover": "#26384d",
      "--glyphary-selection": "rgba(86, 142, 186, 0.24)",
      "--glyphary-text": "#edf3f8",
      "--glyphary-text-soft": "#c2cfda",
      "--glyphary-editor-text": "#eaf2f8",
      "--glyphary-heading": "#f5f9fc",
      "--glyphary-muted": "#96a8b7",
      "--glyphary-muted-strong": "#adbdca",
      "--glyphary-mono-text": "#d8e4ee",
      "--glyphary-accent": "#568eba",
      "--glyphary-accent-text": "#07121a",
      "--glyphary-focus": "#83b0d1",
      "--glyphary-border": "#2d3d50",
      "--glyphary-border-soft": "#263548",
      "--glyphary-border-strong": "#43566d",
      "--glyphary-table-border": "#394d63",
      "--glyphary-code-bg": "#0c1118",
      "--glyphary-code-text": "#eff7fd",
      "--glyphary-quote-border": "#75a2c6",
      "--glyphary-quote-text": "#c8d8e4",
      "--glyphary-shadow": "rgba(0, 0, 0, 0.34)",
      "--glyphary-shadow-strong": "rgba(0, 0, 0, 0.46)",
      "--syntax-blue": "#8ed5ff",
      "--syntax-green": "#9edaa7",
      "--syntax-yellow": "#efd17e",
      "--syntax-muted": "#8ea2b1",
    },
  },
];

for (const preset of themePresets) {
  preset.tokens = {
    ...defaultThemeLevelOneTokens,
    ...preset.tokens,
  };
}

function readPersistedWorkspace() {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;

    if (typeof parsed.vaultRoot !== "string" || !parsed.vaultRoot) {
      return null;
    }

    return {
      vaultRoot: parsed.vaultRoot,
      currentDir: typeof parsed.currentDir === "string" ? parsed.currentDir : "",
      activeFile:
        parsed.activeFile &&
        typeof parsed.activeFile.name === "string" &&
        typeof parsed.activeFile.relativePath === "string"
          ? {
              name: parsed.activeFile.name,
              relativePath: parsed.activeFile.relativePath,
            }
          : null,
      recentFiles: Array.isArray(parsed.recentFiles)
        ? parsed.recentFiles
            .filter(
              (file): file is ActiveFile =>
                file &&
                typeof file.name === "string" &&
                typeof file.relativePath === "string",
            )
            .slice(0, 20)
        : [],
    };
  } catch {
    return null;
  }
}

function writePersistedWorkspace(workspace: PersistedWorkspace) {
  window.localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
}

function readPersistedAppearance(): AppearanceMode {
  const stored = window.localStorage.getItem(appearanceStorageKey);

  return stored === "light" || stored === "dark" || stored === "auto"
    ? stored
    : "auto";
}

function writePersistedAppearance(appearance: AppearanceMode) {
  window.localStorage.setItem(appearanceStorageKey, appearance);
}

function normalizeThemeTokens(tokens: Record<string, string> | undefined | null) {
  const normalized: Record<string, string> = {};

  for (const [token, value] of Object.entries(tokens ?? {})) {
    const cleanValue = value.trim();

    // Ignore unknown CSS variables from .glyphary so imported or hand-edited
    // settings cannot unexpectedly restyle arbitrary parts of the app.
    if (editableThemeTokens.has(token) && cleanValue) {
      normalized[token] = cleanValue;
    }
  }

  return normalized;
}

function normalizeThemePresetId(presetId: string | undefined | null) {
  const cleanPresetId = presetId?.trim() ?? "";

  return themePresets.some((preset) => preset.id === cleanPresetId) ? cleanPresetId : null;
}

function normalizeCalloutStyle(style: string | undefined | null): CalloutStyle {
  return calloutStyleOptions.find((option) => option.value === style)?.value ?? "plain";
}

function normalizeCalloutIcon(
  icon: string | undefined | null,
  fallback: CalloutIconName,
): CalloutIconName {
  return calloutIconOptions.find((option) => option.value === icon)?.value ?? fallback;
}

function normalizeThemeCalloutSettings(
  callouts: VaultThemeCalloutSettings | undefined | null,
) {
  return {
    style: normalizeCalloutStyle(callouts?.style),
    icons: {
      note: normalizeCalloutIcon(callouts?.icons?.note, defaultThemeCalloutSettings.icons.note),
      info: normalizeCalloutIcon(callouts?.icons?.info, defaultThemeCalloutSettings.icons.info),
      tip: normalizeCalloutIcon(callouts?.icons?.tip, defaultThemeCalloutSettings.icons.tip),
      warning: normalizeCalloutIcon(
        callouts?.icons?.warning,
        defaultThemeCalloutSettings.icons.warning,
      ),
    },
  };
}

function sameThemeCalloutSettings(
  left: VaultThemeCalloutSettings | undefined | null,
  right: VaultThemeCalloutSettings | undefined | null,
) {
  const normalizedLeft = normalizeThemeCalloutSettings(left);
  const normalizedRight = normalizeThemeCalloutSettings(right);

  return (
    normalizedLeft.style === normalizedRight.style &&
    calloutKinds.every(
      ({ value }) => normalizedLeft.icons[value] === normalizedRight.icons[value],
    )
  );
}

function calloutIconGlyph(icon: CalloutIconName) {
  return calloutIconOptions.find((option) => option.value === icon)?.glyph ?? "";
}

function normalizeThemeOptions(options: VaultThemeOptions | undefined | null) {
  return {
    colorfulHeadings: options?.colorfulHeadings ?? defaultThemeOptions.colorfulHeadings,
    headingUnderlines: options?.headingUnderlines ?? defaultThemeOptions.headingUnderlines,
    headingAnchors: options?.headingAnchors ?? defaultThemeOptions.headingAnchors,
    richCallouts: options?.richCallouts ?? defaultThemeOptions.richCallouts,
  };
}

function sameThemeOptions(
  left: VaultThemeOptions | undefined | null,
  right: VaultThemeOptions | undefined | null,
) {
  const normalizedLeft = normalizeThemeOptions(left);
  const normalizedRight = normalizeThemeOptions(right);

  return (
    normalizedLeft.colorfulHeadings === normalizedRight.colorfulHeadings &&
    normalizedLeft.headingUnderlines === normalizedRight.headingUnderlines &&
    normalizedLeft.headingAnchors === normalizedRight.headingAnchors &&
    normalizedLeft.richCallouts === normalizedRight.richCallouts
  );
}

function sameThemeTokens(
  left: Record<string, string> | undefined | null,
  right: Record<string, string> | undefined | null,
) {
  const normalizedLeft = normalizeThemeTokens(left);
  const normalizedRight = normalizeThemeTokens(right);
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && normalizedLeft[key] === normalizedRight[key])
  );
}

function normalizeFrontmatterPillSettings(
  settings: FrontmatterPillSettings | undefined | null,
) {
  return {
    enabled: settings?.enabled ?? defaultFrontmatterPillSettings.enabled,
    headerName:
      settings?.headerName?.trim() || defaultFrontmatterPillSettings.headerName,
  };
}

function sameFrontmatterPillSettings(
  left: FrontmatterPillSettings | undefined | null,
  right: FrontmatterPillSettings | undefined | null,
) {
  const normalizedLeft = normalizeFrontmatterPillSettings(left);
  const normalizedRight = normalizeFrontmatterPillSettings(right);

  return (
    normalizedLeft.enabled === normalizedRight.enabled &&
    normalizedLeft.headerName === normalizedRight.headerName
  );
}

function normalizeEditorBehaviorSettings(
  settings: EditorBehaviorSettings | undefined | null,
) {
  return {
    vimMode: settings?.vimMode ?? defaultEditorBehaviorSettings.vimMode,
  };
}

function sameEditorBehaviorSettings(
  left: EditorBehaviorSettings | undefined | null,
  right: EditorBehaviorSettings | undefined | null,
) {
  return (
    normalizeEditorBehaviorSettings(left).vimMode ===
    normalizeEditorBehaviorSettings(right).vimMode
  );
}

function normalizeFileDisplaySettings(settings: FileDisplaySettings | undefined | null) {
  return {
    showDotfiles: settings?.showDotfiles ?? defaultFileDisplaySettings.showDotfiles,
  };
}

function sameFileDisplaySettings(
  left: FileDisplaySettings | undefined | null,
  right: FileDisplaySettings | undefined | null,
) {
  return (
    normalizeFileDisplaySettings(left).showDotfiles ===
    normalizeFileDisplaySettings(right).showDotfiles
  );
}

function normalizeAutosaveSettings(settings: AutosaveSettings | undefined | null) {
  return {
    enabled: settings?.enabled ?? defaultAutosaveSettings.enabled,
  };
}

function sameAutosaveSettings(
  left: AutosaveSettings | undefined | null,
  right: AutosaveSettings | undefined | null,
) {
  return normalizeAutosaveSettings(left).enabled === normalizeAutosaveSettings(right).enabled;
}

function normalizeTidbitSettings(settings: TidbitSettings | undefined | null) {
  return {
    pathPattern: settings?.pathPattern?.trim() || defaultTidbitSettings.pathPattern,
  };
}

function sameTidbitSettings(
  left: TidbitSettings | undefined | null,
  right: TidbitSettings | undefined | null,
) {
  return normalizeTidbitSettings(left).pathPattern === normalizeTidbitSettings(right).pathPattern;
}

function normalizeVaultAppearanceSettings(
  settings: VaultAppearanceSettings | undefined | null,
) {
  return {
    glassEffect: settings?.glassEffect ?? defaultVaultAppearanceSettings.glassEffect,
  };
}

function sameVaultAppearanceSettings(
  left: VaultAppearanceSettings | undefined | null,
  right: VaultAppearanceSettings | undefined | null,
) {
  return (
    normalizeVaultAppearanceSettings(left).glassEffect ===
    normalizeVaultAppearanceSettings(right).glassEffect
  );
}

function cleanCssSnippetFileName(name: string) {
  const cleanName = name.trim();

  return /^[A-Za-z0-9_. -]+\.css$/.test(cleanName) && !cleanName.includes("..")
    ? cleanName
    : null;
}

function normalizeCssSnippetSettings(settings: CssSnippetSettings | undefined | null) {
  const enabled = Array.from(
    new Set(
      (settings?.enabled ?? [])
        .map((name) => cleanCssSnippetFileName(name))
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort();

  return {
    directory: settings?.directory?.trim() || defaultCssSnippetSettings.directory,
    enabled,
  };
}

function sameCssSnippetSettings(
  left: CssSnippetSettings | undefined | null,
  right: CssSnippetSettings | undefined | null,
) {
  const normalizedLeft = normalizeCssSnippetSettings(left);
  const normalizedRight = normalizeCssSnippetSettings(right);

  return (
    normalizedLeft.directory === normalizedRight.directory &&
    normalizedLeft.enabled.length === normalizedRight.enabled.length &&
    normalizedLeft.enabled.every((name, index) => name === normalizedRight.enabled[index])
  );
}

function cleanPluginId(id: string) {
  const cleanId = id.trim();

  return /^[A-Za-z0-9_-]{1,80}$/.test(cleanId) ? cleanId : null;
}

function wikiLinkDisplayName(file: VaultIndexedFile) {
  return fileNameWithoutMarkdownExtension(file.name);
}

function normalizeWikiLinkText(value: string) {
  return value.trim().toLowerCase();
}

function wikiLinkTargetFromMarkup(value: string) {
  return value.split("|")[0]?.split("#")[0]?.trim() ?? "";
}

function indexedFileKey(file: VaultIndexedFile) {
  return file.relativePath;
}

function moveSelectableIndex(currentIndex: number, itemCount: number, delta: -1 | 1) {
  if (itemCount <= 0) {
    return 0;
  }

  return (currentIndex + delta + itemCount) % itemCount;
}

function addIndexedFile(files: VaultIndexedFile[], file: ActiveFile | OpenedFile) {
  if (!file.name.toLowerCase().endsWith(".md")) {
    return files;
  }

  const indexed = {
    name: file.name,
    relativePath: file.relativePath,
  };
  const withoutExisting = files.filter((candidate) => candidate.relativePath !== indexed.relativePath);

  return [...withoutExisting, indexed].sort((left, right) =>
    wikiLinkDisplayName(left)
      .toLowerCase()
      .localeCompare(wikiLinkDisplayName(right).toLowerCase()) ||
    left.relativePath.localeCompare(right.relativePath),
  );
}

function removeIndexedFile(files: VaultIndexedFile[], relativePath: string) {
  return files.filter((file) => file.relativePath !== relativePath);
}

function replaceIndexedFile(
  files: VaultIndexedFile[],
  oldRelativePath: string,
  nextFile: ActiveFile | OpenedFile,
) {
  return addIndexedFile(removeIndexedFile(files, oldRelativePath), nextFile);
}

function normalizePluginSettings(settings: PluginSettings | undefined | null) {
  const enabled = Array.from(
    new Set(
      (settings?.enabled ?? [])
        .map((id) => cleanPluginId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  ).sort();

  return { enabled };
}

function samePluginSettings(
  left: PluginSettings | undefined | null,
  right: PluginSettings | undefined | null,
) {
  const normalizedLeft = normalizePluginSettings(left);
  const normalizedRight = normalizePluginSettings(right);

  return (
    normalizedLeft.enabled.length === normalizedRight.enabled.length &&
    normalizedLeft.enabled.every((id, index) => id === normalizedRight.enabled[index])
  );
}

function resolveAppearance(appearance: AppearanceMode): Exclude<AppearanceMode, "auto"> {
  if (appearance === "light" || appearance === "dark") {
    return appearance;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function cssColorToHex(value: string, fallback = "#000000") {
  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  if (!match) {
    return fallback;
  }

  return `#${[match[1], match[2], match[3]]
    .map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function tabTitle(tab: DocumentTab) {
  return tab.pageName || tab.activeFile?.name || "Untitled note";
}

function createUntitledTab(markdown = initialMarkdown): DocumentTab {
  return {
    id: `untitled:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    activeFile: null,
    pageName: "Untitled note",
    metaHeader: "",
    metaDelimiter: defaultMetaDelimiter,
    markdown,
    markdownDraft: markdown,
    dirty: false,
  };
}

function createEditorGroups(tab = createUntitledTab()): Record<EditorGroupId, EditorGroupState> {
  return {
    primary: {
      id: "primary",
      tabs: [tab],
      activeTabId: tab.id,
    },
    secondary: {
      id: "secondary",
      tabs: [],
      activeTabId: "",
    },
  };
}

function joinVaultAssetPath(root: string, assetDirectory: string, reference: string) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${assetDirectory || defaultVaultAssetDirectory}/${cleanReference}`);
}

type ContainerMarkdownLexer = {
  blockTokens: (src: string) => MarkdownToken[];
};

type ContainerOpening = {
  length: number;
  attrs?: Record<string, unknown>;
};

function createMarkdownContainerToken(
  src: string,
  type: string,
  opening: ContainerOpening | null,
  lexer: ContainerMarkdownLexer,
) {
  if (!opening) {
    return undefined;
  }

  const openingLength = opening.length;
  const body = src.slice(openingLength);
  const markerPattern = /^:::[^\S\n]*([\w-]+)?[^\n\r]*$/gm;
  let depth = 1;
  let markerMatch: RegExpExecArray | null = null;

  while ((markerMatch = markerPattern.exec(body))) {
    const [, nestedType] = markerMatch;

    // The container syntax reuses a bare ::: closing marker for every type.
    // Track nested named openings so a child column/callout close does not
    // terminate its parent columns container.
    if (nestedType) {
      depth += 1;
    } else {
      depth -= 1;
    }

    if (depth === 0) {
      const innerMarkdown = body.slice(0, markerMatch.index);
      const closingLength = markerMatch[0].length;

      // Marked tokenizers receive the remaining source from the current
      // position. Returning only through the matching closing fence lets the
      // normal block parser continue with the markdown that follows.
      return {
        type,
        raw: src.slice(0, openingLength + markerMatch.index + closingLength),
        ...opening.attrs,
        content: innerMarkdown,
        tokens: lexer.blockTokens(innerMarkdown),
      };
    }
  }

  return undefined;
}

function namedContainerOpening(src: string, type: string) {
  const match = src.match(new RegExp(`^:::[^\\S\\n]*${type}[^\\S\\n]*\\r?\\n`));

  return match ? { length: match[0].length } : null;
}

function unescapeCalloutTitle(title: string) {
  return title.replace(/\\(["\\])/g, "$1");
}

function escapeCalloutTitle(title: string) {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function calloutContainerOpening(src: string) {
  const match = src.match(
    /^:::[^\S\n]*callout(?:[^\S\n]+(?:(\w[\w-]*)|"((?:\\.|[^"\\])*)"))?(?:[^\S\n]+"((?:\\.|[^"\\])*)")?[^\S\n]*\r?\n/,
  );

  if (!match) {
    return null;
  }

  const [, kind, titleWithoutKind, titleWithKind] = match;
  const title = titleWithKind ?? titleWithoutKind ?? "";

  // Support both `::: callout "Title"` and
  // `::: callout warning "Title"` so older notes can omit a visual kind.
  return {
    length: match[0].length,
    attrs: {
      kind: kind ?? "note",
      title: title ? unescapeCalloutTitle(title) : null,
    },
  };
}

function collapseContainerOpening(src: string) {
  const match = src.match(
    /^:::[^\S\n]*collapse(?:[^\S\n]+(?:"((?:\\.|[^"\\])*)"|([^\r\n]*?)))?(?:[^\S\n]+(open))?[^\S\n]*\r?\n/,
  );

  if (!match) {
    return null;
  }

  const [, quotedTitle, plainTitle, openFlag] = match;
  const plainParts = plainTitle?.trim().split(/\s+/).filter(Boolean) ?? [];
  const plainTitleIncludesOpenFlag =
    !quotedTitle && plainParts[plainParts.length - 1]?.toLowerCase() === "open";
  const title = quotedTitle
    ? unescapeCalloutTitle(quotedTitle)
    : plainTitleIncludesOpenFlag
      ? plainParts.slice(0, -1).join(" ")
      : plainTitle?.trim() ?? "";

  return {
    length: match[0].length,
    attrs: {
      title: title || "Details",
      defaultOpen: Boolean(openFlag) || plainTitleIncludesOpenFlag,
    },
  };
}

function CollapseNodeView({ node }: NodeViewProps) {
  const title =
    typeof node.attrs.title === "string" && node.attrs.title.trim()
      ? node.attrs.title.trim()
      : "Details";
  const [open, setOpen] = useState(Boolean(node.attrs.defaultOpen));

  return (
    <NodeViewWrapper className={`markdown-collapse ${open ? "open" : "closed"}`}>
      <button
        aria-expanded={open}
        className="markdown-collapse-summary"
        contentEditable={false}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {title}
      </button>
      <NodeViewContent
        className="markdown-collapse-body"
        style={{ display: open ? undefined : "none" }}
      />
    </NodeViewWrapper>
  );
}

function emptyParagraphNode(helpers: {
  createNode: (type: string, attrs?: Record<string, unknown>, content?: JSONContent[]) => JSONContent;
}) {
  return helpers.createNode("paragraph");
}

function createColumnExtension() {
  return Node.create({
    name: "column",
    content: "block+",
    defining: true,

    parseHTML() {
      return [{ tag: "div[data-glyphary-column]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-column": "true",
          class: "markdown-column",
        }),
        0,
      ];
    },

    markdownTokenName: "column",

    markdownTokenizer: {
      name: "column",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*column[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "column", namedContainerOpening(src, "column"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode("column", {}, content.length ? content : [emptyParagraphNode(helpers)]);
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: column\n${body}\n:::`;
    },
  });
}

function createColumnsExtension() {
  return Node.create({
    name: "columns",
    group: "block",
    content: "column+",
    defining: true,

    parseHTML() {
      return [{ tag: "div[data-glyphary-columns]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-columns": "true",
          class: "markdown-columns",
        }),
        0,
      ];
    },

    markdownTokenName: "columns",

    markdownTokenizer: {
      name: "columns",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*columns[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "columns", namedContainerOpening(src, "columns"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      // Only direct column children are preserved. Loose markdown inside a
      // columns container is ambiguous to render, so malformed input falls back
      // to a single empty column instead of silently reshaping content.
      const columns = helpers
        .parseChildren(token.tokens ?? [])
        .filter((node) => node.type === "column");

      return helpers.createNode(
        "columns",
        {},
        columns.length
          ? columns
          : [helpers.createNode("column", {}, [emptyParagraphNode(helpers)])],
      );
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: columns\n${body}\n:::`;
    },
  });
}

function createCalloutExtension() {
  return Node.create({
    name: "callout",
    group: "block",
    content: "block+",
    defining: true,

    addAttributes() {
      return {
        kind: {
          default: "note",
          parseHTML: (element) => element.getAttribute("data-callout-kind") || "note",
          renderHTML: () => ({}),
        },
        title: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-callout-title"),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "aside[data-glyphary-callout]" }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const kind = typeof node.attrs.kind === "string" ? node.attrs.kind : "note";
      const title = typeof node.attrs.title === "string" ? node.attrs.title : null;

      return [
        "aside",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-callout": "true",
          "data-callout-kind": kind,
          ...(title ? { "data-callout-title": title } : {}),
          class: `markdown-callout markdown-callout-${kind}`,
        }),
        ["div", { class: "markdown-callout-title", contenteditable: "false" }, title || kind],
        ["div", { class: "markdown-callout-body" }, 0],
      ];
    },

    markdownTokenName: "callout",

    markdownTokenizer: {
      name: "callout",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*callout(?:[^\n\r]*)?$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "callout", calloutContainerOpening(src), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const calloutToken = token as MarkdownToken & { kind?: unknown; title?: unknown };
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode(
        "callout",
        {
          kind: typeof calloutToken.kind === "string" ? calloutToken.kind : "note",
          title: typeof calloutToken.title === "string" ? calloutToken.title : null,
        },
        content.length ? content : [emptyParagraphNode(helpers)],
      );
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const attrs = node.attrs ?? {};
      const kind = typeof attrs.kind === "string" && attrs.kind ? attrs.kind : "note";
      const title = typeof attrs.title === "string" && attrs.title ? attrs.title : "";
      const titlePart = title ? ` "${escapeCalloutTitle(title)}"` : "";
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: callout ${kind}${titlePart}\n${body}\n:::`;
    },
  });
}

function createCollapseExtension() {
  return Node.create({
    name: "collapse",
    group: "block",
    content: "block+",
    defining: true,

    addAttributes() {
      return {
        title: {
          default: "Details",
          parseHTML: (element) =>
            element.getAttribute("data-collapse-title") ||
            element.querySelector("summary")?.textContent?.trim() ||
            "Details",
          renderHTML: () => ({}),
        },
        defaultOpen: {
          default: false,
          parseHTML: (element) => element.hasAttribute("open"),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [
        { tag: "details[data-glyphary-collapse]" },
        { tag: "details" },
      ];
    },

    renderHTML({ node, HTMLAttributes }) {
      const title =
        typeof node.attrs.title === "string" && node.attrs.title.trim()
          ? node.attrs.title.trim()
          : "Details";

      return [
        "details",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-collapse": "true",
          "data-collapse-title": title,
          class: "markdown-collapse",
          ...(node.attrs.defaultOpen ? { open: "true" } : {}),
        }),
        ["summary", { class: "markdown-collapse-summary", contenteditable: "false" }, title],
        ["div", { class: "markdown-collapse-body" }, 0],
      ];
    },

    markdownTokenName: "collapse",

    markdownTokenizer: {
      name: "collapse",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*collapse(?:[^\n\r]*)?$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "collapse", collapseContainerOpening(src), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const collapseToken = token as MarkdownToken & {
        title?: unknown;
        defaultOpen?: unknown;
      };
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode(
        "collapse",
        {
          title: typeof collapseToken.title === "string" ? collapseToken.title : "Details",
          defaultOpen: collapseToken.defaultOpen === true,
        },
        content.length ? content : [emptyParagraphNode(helpers)],
      );
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const attrs = node.attrs ?? {};
      const title = typeof attrs.title === "string" && attrs.title ? attrs.title : "Details";
      const openPart = attrs.defaultOpen === true ? " open" : "";
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: collapse "${escapeCalloutTitle(title)}"${openPart}\n${body}\n:::`;
    },

    addNodeView() {
      return ReactNodeViewRenderer(CollapseNodeView);
    },
  });
}

function parseRichLinkMarkdownFields(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .reduce<Record<string, string>>((fields, line) => {
      const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);

      if (!match) {
        return fields;
      }

      const [, key, value] = match;
      fields[key] = value.trim();
      return fields;
    }, {});
}

function createRichLinkExtension() {
  return Node.create({
    name: "richLink",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        url: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-url") || "",
          renderHTML: () => ({}),
        },
        title: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-title") || "",
          renderHTML: () => ({}),
        },
        description: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-description") || "",
          renderHTML: () => ({}),
        },
        image: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-image") || "",
          renderHTML: () => ({}),
        },
        siteName: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-site-name") || "",
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "div[data-glyphary-rich-link]" }];
    },

    renderHTML({ node }) {
      const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
      const title = typeof node.attrs.title === "string" ? node.attrs.title : url;
      const description =
        typeof node.attrs.description === "string" ? node.attrs.description : "";
      const image = typeof node.attrs.image === "string" ? node.attrs.image : "";
      const siteName = typeof node.attrs.siteName === "string" ? node.attrs.siteName : "";

      const content = [
          "div",
          { class: "rich-link-content" },
          siteName ? ["span", { class: "rich-link-site" }, siteName] : ["span", { class: "rich-link-site" }, "Link"],
          ["strong", {}, title || url],
          description ? ["p", {}, description] : ["p", {}, url],
          ["span", { class: "rich-link-url" }, url],
        ];

      return image
        ? [
            "div",
            {
              "data-glyphary-rich-link": "true",
              "data-rich-link-url": url,
              "data-rich-link-title": title,
              "data-rich-link-description": description,
              "data-rich-link-image": image,
              "data-rich-link-site-name": siteName,
              class: "rich-link-card",
              contenteditable: "false",
            },
            content,
            ["img", { class: "rich-link-image", src: image, alt: "" }],
          ]
        : [
            "div",
            {
              "data-glyphary-rich-link": "true",
              "data-rich-link-url": url,
              "data-rich-link-title": title,
              "data-rich-link-description": description,
              "data-rich-link-image": image,
              "data-rich-link-site-name": siteName,
              class: "rich-link-card rich-link-card-no-image",
              contenteditable: "false",
            },
            content,
          ];
    },

    markdownTokenName: "rich-link",

    markdownTokenizer: {
      name: "rich-link",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*rich-link[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "rich-link", namedContainerOpening(src, "rich-link"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const richLinkToken = token as MarkdownToken & { content?: string };
      const fields = parseRichLinkMarkdownFields(richLinkToken.content ?? "");
      const url = fields.url ?? "";

      // A rich-link container without a URL cannot be opened or refreshed, so
      // dropping it is safer than rendering a permanent inert preview card.
      if (!url) {
        return [];
      }

      return helpers.createNode("richLink", {
        url,
        title: fields.title ?? url,
        description: fields.description ?? "",
        image: fields.image ?? "",
        siteName: fields.siteName ?? "",
      });
    },

    renderMarkdown: (node: JSONContent) => {
      const attrs = node.attrs ?? {};
      const url = typeof attrs.url === "string" ? attrs.url : "";

      return richLinkMarkdown({
        url,
        title: typeof attrs.title === "string" ? attrs.title : "",
        description: typeof attrs.description === "string" ? attrs.description : "",
        image: typeof attrs.image === "string" ? attrs.image : "",
        siteName: typeof attrs.siteName === "string" ? attrs.siteName : "",
      });
    },
  });
}

function createVaultImageExtension(resolveVaultAssetSrc: (target: string) => string) {
  return Node.create({
    name: "image",
    priority: 1000,
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        src: {
          default: "",
        },
        alt: {
          default: "",
        },
        title: {
          default: null,
        },
        vaultTarget: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-vault-target"),
          renderHTML: () => ({}),
        },
        assetReference: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-asset-reference"),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "img[src]" }];
    },

    renderHTML({ HTMLAttributes }) {
      const { vaultTarget, ...renderedAttributes } = HTMLAttributes;

      // vaultTarget is an editor-only marker used to round-trip ![[asset]]
      // syntax. It must not leak into the rendered DOM; src already points to
      // the Tauri asset URL that the webview can display.
      return ["img", mergeAttributes(renderedAttributes)];
    },

    markdownTokenName: "image",

    markdownTokenizer: {
      name: "vaultImage",
      level: "inline",
      start: (src: string) => src.indexOf("![["),
      tokenize: (src: string) => {
        const match = src.match(/^!\[\[([^\]\n]+)\]\]/);

        if (!match) {
          return undefined;
        }

        const vaultTarget = cleanVaultAssetReference(match[1]);

        if (!vaultTarget) {
          return undefined;
        }

        return {
          type: "image",
          raw: match[0],
          href: resolveVaultAssetSrc(vaultTarget),
          text: vaultTarget,
          title: null,
          vaultTarget,
        };
      },
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      // Tiptap's image token also receives normal markdown images. If the href
      // is a safe local asset reference, resolve it against the vault asset
      // directory while preserving enough metadata to write markdown back.
      const vaultTarget = token.vaultTarget
        ? cleanVaultAssetReference(String(token.vaultTarget))
        : null;
      const href = String(token.href ?? token.src ?? "");
      const assetReference = !vaultTarget ? cleanVaultAssetReference(href) : null;
      const src = vaultTarget
        ? resolveVaultAssetSrc(vaultTarget)
        : assetReference
          ? resolveVaultAssetSrc(assetReference)
          : href;

      if (!src && !vaultTarget && !assetReference) {
        return [];
      }

      return helpers.createNode("image", {
        src,
        alt: String(token.text ?? token.alt ?? vaultTarget ?? ""),
        title: token.title ?? null,
        vaultTarget,
        assetReference,
      });
    },

    renderMarkdown: (node: JSONContent) => {
      const attrs = node.attrs ?? {};
      const vaultTarget =
        typeof attrs.vaultTarget === "string"
          ? cleanVaultAssetReference(attrs.vaultTarget)
          : null;

      if (vaultTarget) {
        return `![[${vaultTarget}]]`;
      }

      const alt = typeof attrs.alt === "string" ? attrs.alt : "";
      const assetReference =
        typeof attrs.assetReference === "string"
          ? cleanVaultAssetReference(attrs.assetReference)
          : null;
      const src = assetReference ?? (typeof attrs.src === "string" ? attrs.src : "");
      const title = typeof attrs.title === "string" ? attrs.title : "";
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";

      return `![${escapeMarkdownImageText(alt)}](${escapeMarkdownUrl(src)}${titlePart})`;
    },
  });
}

function App() {
  // The active editor group is mirrored into these top-level document fields
  // because drawers, toolbar state, save commands, and native menu events all
  // operate on "the current document" regardless of which split pane owns it.
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [markdownDraft, setMarkdownDraft] = useState(initialMarkdown);
  const [editorFocused, setEditorFocused] = useState(false);
  const [editorStateVersion, setEditorStateVersion] = useState(0);
  const [vaultRoot, setVaultRoot] = useState("");
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
    frontmatterPills: defaultFrontmatterPillSettings,
    files: defaultFileDisplaySettings,
    autosave: defaultAutosaveSettings,
    tidbits: defaultTidbitSettings,
    editor: defaultEditorBehaviorSettings,
    appearance: defaultVaultAppearanceSettings,
    cssSnippets: defaultCssSnippetSettings,
    plugins: defaultPluginSettings,
    theme: null,
  });
  const [settingsDraft, setSettingsDraft] = useState(defaultVaultAssetDirectory);
  const [frontmatterPillDraft, setFrontmatterPillDraft] = useState<FrontmatterPillSettings>(
    defaultFrontmatterPillSettings,
  );
  const [editorBehaviorDraft, setEditorBehaviorDraft] = useState<EditorBehaviorSettings>(
    defaultEditorBehaviorSettings,
  );
  const [editorBehavior, setEditorBehavior] = useState<EditorBehaviorSettings>(
    defaultEditorBehaviorSettings,
  );
  const [fileDisplayDraft, setFileDisplayDraft] =
    useState<FileDisplaySettings>(defaultFileDisplaySettings);
  const [autosaveDraft, setAutosaveDraft] = useState<AutosaveSettings>(defaultAutosaveSettings);
  const [autosaveSettings, setAutosaveSettings] =
    useState<AutosaveSettings>(defaultAutosaveSettings);
  const [tidbitDraft, setTidbitDraft] = useState<TidbitSettings>(defaultTidbitSettings);
  const [tidbitSettings, setTidbitSettings] = useState<TidbitSettings>(defaultTidbitSettings);
  const [vaultAppearanceDraft, setVaultAppearanceDraft] =
    useState<VaultAppearanceSettings>(defaultVaultAppearanceSettings);
  const [cssSnippetDraft, setCssSnippetDraft] =
    useState<CssSnippetSettings>(defaultCssSnippetSettings);
  const [cssSnippetFiles, setCssSnippetFiles] = useState<CssSnippetFile[]>([]);
  const [cssSnippetContents, setCssSnippetContents] = useState<CssSnippetContent[]>([]);
  const [pluginDraft, setPluginDraft] = useState<PluginSettings>(defaultPluginSettings);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>({ plugins: [], errors: [] });
  const [pluginStyles, setPluginStyles] = useState<PluginStyleContent[]>([]);
  const [selectedThemePresetIdDraft, setSelectedThemePresetIdDraft] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<Record<string, string>>({});
  const [themeOptionsDraft, setThemeOptionsDraft] =
    useState<VaultThemeOptions>(defaultThemeOptions);
  const [themeCalloutDraft, setThemeCalloutDraft] =
    useState<VaultThemeCalloutSettings>(defaultThemeCalloutSettings);
  const [currentDir, setCurrentDir] = useState("");
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [editorGroups, setEditorGroups] =
    useState<Record<EditorGroupId, EditorGroupState>>(createEditorGroups);
  const [activeGroupId, setActiveGroupId] = useState<EditorGroupId>("primary");
  const [splitOpen, setSplitOpen] = useState(false);
  const [pageName, setPageName] = useState("Untitled note");
  const [metaHeader, setMetaHeader] = useState("");
  const [metaDelimiter, setMetaDelimiter] =
    useState<MarkdownParts["metaDelimiter"]>(defaultMetaDelimiter);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [pageNameEditing, setPageNameEditing] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceMode>(readPersistedAppearance);
  const [resolvedAppearance, setResolvedAppearance] = useState(() =>
    resolveAppearance(readPersistedAppearance()),
  );
  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(defaultVaultDrawerOpen);
  const [vaultDrawerWidth, setVaultDrawerWidth] = useState(defaultVaultDrawerWidth);
  const [vaultDrawerItem, setVaultDrawerItem] = useState<VaultDrawerItem>("files");
  const [drawerOpen, setDrawerOpen] = useState(defaultDrawerOpen);
  const [inspectorDrawerWidth, setInspectorDrawerWidth] = useState(
    defaultInspectorDrawerWidth,
  );
  const [drawerItem, setDrawerItem] = useState<DrawerItem>("source");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarNoteDateKeys, setCalendarNoteDateKeys] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("main");
  const [settingsOffset, setSettingsOffset] = useState({ x: 0, y: 0 });
  const [settingsDragging, setSettingsDragging] = useState<SettingsDragState | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteSelectedIndex, setCommandPaletteSelectedIndex] = useState(0);
  const [richLinkDialogOpen, setRichLinkDialogOpen] = useState(false);
  const [richLinkUrlDraft, setRichLinkUrlDraft] = useState("");
  const [richLinkSubmitting, setRichLinkSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("filename");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentFiles, setRecentFiles] = useState<ActiveFile[]>([]);
  const [wikiLinkIndex, setWikiLinkIndex] = useState<VaultIndexedFile[]>([]);
  const [wikiLinkIndexVersion, setWikiLinkIndexVersion] = useState(0);
  const [wikiLinkSearchOpen, setWikiLinkSearchOpen] = useState(false);
  const [wikiLinkSearchQuery, setWikiLinkSearchQuery] = useState("");
  const [wikiLinkSearchSelectedIndex, setWikiLinkSearchSelectedIndex] = useState(0);
  const [wikiLinkPicker, setWikiLinkPicker] = useState<WikiLinkPickerState | null>(null);
  const [wikiLinkPickerSelectedIndex, setWikiLinkPickerSelectedIndex] = useState(0);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [folderActionDialog, setFolderActionDialog] = useState<FolderActionDialogState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No vault open");
  const hideWindowDocumentActions = isMacOsPlatform(
    window.navigator.platform,
    window.navigator.userAgent,
  );
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFileRef = useRef<ActiveFile | null>(null);
  const recentFilesRef = useRef<ActiveFile[]>([]);
  const wikiLinkIndexRef = useRef<VaultIndexedFile[]>([]);
  const suppressDirectoryClickRef = useRef(false);
  const editorGroupsRef = useRef<Record<EditorGroupId, EditorGroupState>>(editorGroups);
  const activeGroupIdRef = useRef<EditorGroupId>("primary");
  const workspaceRef = useRef<HTMLElement | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const wikiLinkSearchInputRef = useRef<HTMLInputElement | null>(null);
  const richLinkInputRef = useRef<HTMLInputElement | null>(null);
  const pageNameRef = useRef("Untitled note");
  const metaHeaderRef = useRef("");
  const metaDelimiterRef = useRef<MarkdownParts["metaDelimiter"]>(defaultMetaDelimiter);
  const hydratingEditor = useRef<Record<EditorGroupId, boolean>>({
    primary: false,
    secondary: false,
  });
  // Native menu handlers are registered once. Refs keep those listeners pointed
  // at the latest React closures without re-registering Tauri events on every
  // render.
  const openVaultRef = useRef<() => void | Promise<void>>(() => undefined);
  const saveCurrentFileRef = useRef<() => void | Promise<void>>(() => undefined);
  const resetDocumentRef = useRef<() => void>(() => undefined);
  const openWikiLinkSearchRef = useRef<() => void>(() => undefined);
  const resolveWikiLinkTargetRef = useRef<(target: string) => WikiLinkResolution>(() => ({
    candidates: [],
  }));
  const openWikiLinkTargetRef = useRef<
    (target: string, event?: MouseEvent | ReactMouseEvent<HTMLElement>) => void
  >(() => undefined);
  const vaultRootRef = useRef("");
  const vaultSettingsRef = useRef<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
    frontmatterPills: defaultFrontmatterPillSettings,
    files: defaultFileDisplaySettings,
    autosave: defaultAutosaveSettings,
    tidbits: defaultTidbitSettings,
    editor: defaultEditorBehaviorSettings,
    appearance: defaultVaultAppearanceSettings,
    cssSnippets: defaultCssSnippetSettings,
    plugins: defaultPluginSettings,
    theme: null,
  });
  // Track only properties we applied from the theme builder so switching vaults
  // or resetting a theme can remove stale inline CSS variables.
  const appliedThemeTokensRef = useRef<Set<string>>(new Set());
  const windowGlassPreviewAppliedRef = useRef(false);
  const restoredWorkspace = useRef(false);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    recentFilesRef.current = recentFiles;
  }, [recentFiles]);

  useEffect(() => {
    editorGroupsRef.current = editorGroups;
  }, [editorGroups]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    pageNameRef.current = pageName;
  }, [pageName]);

  useEffect(() => {
    metaHeaderRef.current = metaHeader;
  }, [metaHeader]);

  useEffect(() => {
    metaDelimiterRef.current = metaDelimiter;
  }, [metaDelimiter]);

  useEffect(() => {
    vaultRootRef.current = vaultRoot;
  }, [vaultRoot]);

  useEffect(() => {
    vaultSettingsRef.current = vaultSettings;
  }, [vaultSettings]);

  useEffect(() => {
    const previousTokens = appliedThemeTokensRef.current;
    const nextTokens = normalizeThemeTokens(themeDraft);

    // Apply the draft directly to :root for live preview; saving still goes
    // through the vault settings command so the preview can be reverted.
    for (const token of previousTokens) {
      if (!(token in nextTokens)) {
        document.documentElement.style.removeProperty(token);
      }
    }

    for (const [token, value] of Object.entries(nextTokens)) {
      document.documentElement.style.setProperty(token, value);
    }

    appliedThemeTokensRef.current = new Set(Object.keys(nextTokens));
  }, [themeDraft]);

  useEffect(() => {
    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncResolvedAppearance = () => {
      setResolvedAppearance(resolveAppearance(appearance));
    };

    syncResolvedAppearance();

    if (appearance !== "auto") {
      return;
    }

    colorSchemeQuery.addEventListener("change", syncResolvedAppearance);

    return () => {
      colorSchemeQuery.removeEventListener("change", syncResolvedAppearance);
    };
  }, [appearance]);

  useEffect(() => {
    const targets = [document.documentElement, document.body];

    document.documentElement.dataset.theme = appearance;
    document.documentElement.dataset.resolvedTheme = resolvedAppearance;
    document.documentElement.style.colorScheme =
      appearance === "auto" ? "light dark" : appearance;

    for (const target of targets) {
      target.classList.toggle("theme-light", resolvedAppearance === "light");
      target.classList.toggle("theme-dark", resolvedAppearance === "dark");
    }

    writePersistedAppearance(appearance);
  }, [appearance, resolvedAppearance]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void getCurrentWindow().setTheme(resolvedAppearance);
  }, [resolvedAppearance]);

  useEffect(() => {
    document.documentElement.dataset.windowGlass = vaultAppearanceDraft.glassEffect
      ? "enabled"
      : "disabled";

    const shouldReportPreview = windowGlassPreviewAppliedRef.current;
    windowGlassPreviewAppliedRef.current = true;

    if (!isTauri()) {
      if (shouldReportPreview) {
        setStatus(
          vaultAppearanceDraft.glassEffect
            ? "Previewing glass window effect"
            : "Disabled glass window effect preview",
        );
      }
      return;
    }

    void invoke<boolean>("set_window_glass_effect", {
      enabled: vaultAppearanceDraft.glassEffect,
    })
      .then((applied) => {
        if (shouldReportPreview) {
          setStatus(
            applied
              ? "Previewing glass window effect"
              : "Disabled glass window effect preview",
          );
        }
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
  }, [vaultAppearanceDraft.glassEffect]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const suppressNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", suppressNativeContextMenu);
    return () => {
      window.removeEventListener("contextmenu", suppressNativeContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!folderContextMenu) {
      return;
    }

    const closeMenu = () => setFolderContextMenu(null);
    const closeMenuOnPrimaryPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        closeMenu();
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", closeMenuOnPrimaryPointerDown);
    window.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenuOnPrimaryPointerDown);
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [folderContextMenu]);

  function syncEditorState(nextEditor: Editor) {
    if (!isEditorReady(nextEditor)) {
      return;
    }

    // Selection moves can change active marks/nodes without changing any
    // stored toolbar-specific state. This version tick forces the toolbar to
    // re-read editor.isActive(...) as the cursor moves through the document.
    setEditorStateVersion((version) => version + 1);
  }

  function themeTokenValue(token: string) {
    return cssColorToHex(
      themeDraft[token] ??
        window.getComputedStyle(document.documentElement).getPropertyValue(token),
    );
  }

  function rawThemeTokenValue(control: ThemeTokenControl) {
    return (
      themeDraft[control.token] ??
      window.getComputedStyle(document.documentElement).getPropertyValue(control.token).trim() ??
      control.placeholder ??
      ""
    );
  }

  function updateThemeDraftToken(token: string, value: string) {
    setThemeDraft((tokens) => ({
      ...tokens,
      [token]: value,
    }));
    setSelectedThemePresetIdDraft(null);
  }

  function applyThemePreset(preset: ThemePreset) {
    setSelectedThemePresetIdDraft(preset.id);
    setThemeDraft(normalizeThemeTokens(preset.tokens));
    setStatus(`Previewing theme template: ${preset.name}. Save Settings to keep it.`);
  }

  function savedThemeTokens() {
    return normalizeThemeTokens(vaultSettings.theme?.tokens);
  }

  function savedThemePresetId() {
    return normalizeThemePresetId(vaultSettings.theme?.presetId);
  }

  function savedThemeOptions() {
    return normalizeThemeOptions(vaultSettings.theme?.options);
  }

  function savedThemeCalloutSettings() {
    return normalizeThemeCalloutSettings(vaultSettings.theme?.callouts);
  }

  function savedFrontmatterPillSettings() {
    return normalizeFrontmatterPillSettings(vaultSettings.frontmatterPills);
  }

  function savedEditorBehaviorSettings() {
    return normalizeEditorBehaviorSettings(vaultSettings.editor);
  }

  function savedFileDisplaySettings() {
    return normalizeFileDisplaySettings(vaultSettings.files);
  }

  function savedAutosaveSettings() {
    return normalizeAutosaveSettings(vaultSettings.autosave);
  }

  function savedTidbitSettings() {
    return normalizeTidbitSettings(vaultSettings.tidbits);
  }

  function savedVaultAppearanceSettings() {
    return normalizeVaultAppearanceSettings(vaultSettings.appearance);
  }

  function savedCssSnippetSettings() {
    return normalizeCssSnippetSettings(vaultSettings.cssSnippets);
  }

  function savedPluginSettings() {
    return normalizePluginSettings(vaultSettings.plugins);
  }

  function settingsHaveChanges() {
    return (
      settingsDraft !== vaultSettings.assetDirectory ||
      !sameFrontmatterPillSettings(frontmatterPillDraft, savedFrontmatterPillSettings()) ||
      !sameEditorBehaviorSettings(editorBehaviorDraft, savedEditorBehaviorSettings()) ||
      !sameFileDisplaySettings(fileDisplayDraft, savedFileDisplaySettings()) ||
      !sameAutosaveSettings(autosaveDraft, savedAutosaveSettings()) ||
      !sameTidbitSettings(tidbitDraft, savedTidbitSettings()) ||
      !sameVaultAppearanceSettings(vaultAppearanceDraft, savedVaultAppearanceSettings()) ||
      !sameCssSnippetSettings(cssSnippetDraft, savedCssSnippetSettings()) ||
      !samePluginSettings(pluginDraft, savedPluginSettings()) ||
      selectedThemePresetIdDraft !== savedThemePresetId() ||
      !sameThemeTokens(themeDraft, savedThemeTokens()) ||
      !sameThemeOptions(themeOptionsDraft, savedThemeOptions()) ||
      !sameThemeCalloutSettings(themeCalloutDraft, savedThemeCalloutSettings())
    );
  }

  function resetThemeDraft() {
    setSelectedThemePresetIdDraft(null);
    setThemeDraft({});
    setThemeOptionsDraft(defaultThemeOptions);
    setThemeCalloutDraft(defaultThemeCalloutSettings);
    setStatus("Reset theme preview");
  }

  function revertSettingsDraft() {
    const savedCssSnippets = savedCssSnippetSettings();
    const savedPlugins = savedPluginSettings();

    setSettingsDraft(vaultSettings.assetDirectory);
    setFrontmatterPillDraft(savedFrontmatterPillSettings());
    setEditorBehaviorDraft(savedEditorBehaviorSettings());
    setFileDisplayDraft(savedFileDisplaySettings());
    setAutosaveDraft(savedAutosaveSettings());
    setTidbitDraft(savedTidbitSettings());
    setVaultAppearanceDraft(savedVaultAppearanceSettings());
    setCssSnippetDraft(savedCssSnippets);
    setPluginDraft(savedPlugins);
    setSelectedThemePresetIdDraft(savedThemePresetId());
    setThemeDraft(savedThemeTokens());
    setThemeOptionsDraft(savedThemeOptions());
    setThemeCalloutDraft(savedThemeCalloutSettings());
    void refreshCssSnippets(vaultRoot, savedCssSnippets).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
    void refreshPlugins(vaultRoot, savedPlugins).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
    setStatus("Reverted settings preview");
  }

  function openSettings() {
    setSettingsOffset({ x: 0, y: 0 });
    setSettingsDragging(null);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsDragging(null);
    setSettingsOpen(false);
  }

  function clampSettingsOffset(x: number, y: number) {
    const margin = 28;
    const maxX = Math.max(0, window.innerWidth / 2 - margin);
    const maxY = Math.max(0, window.innerHeight / 2 - margin);

    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  function settingsDragStartedOnControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea"));
  }

  function startSettingsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || settingsDragStartedOnControl(event.target)) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setSettingsDragging({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: settingsOffset.x,
      originY: settingsOffset.y,
    });
  }

  function moveSettingsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!settingsDragging || settingsDragging.pointerId !== event.pointerId) {
      return;
    }

    setSettingsOffset(
      clampSettingsOffset(
        settingsDragging.originX + event.clientX - settingsDragging.startX,
        settingsDragging.originY + event.clientY - settingsDragging.startY,
      ),
    );
  }

  function stopSettingsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (settingsDragging?.pointerId === event.pointerId) {
      setSettingsDragging(null);
    }
  }

  function editorForGroup(groupId: EditorGroupId) {
    const groupEditor = groupId === "primary" ? primaryEditor : secondaryEditor;

    return isEditorReady(groupEditor) ? groupEditor : null;
  }

  function setEditorGroupsAndRef(nextGroups: Record<EditorGroupId, EditorGroupState>) {
    // Tiptap callbacks can fire before React state has committed. The ref is
    // the synchronous source of truth for cross-pane tab operations.
    editorGroupsRef.current = nextGroups;
    setEditorGroups(nextGroups);
  }

  function updateGroupTab(
    groupId: EditorGroupId,
    tabId: string,
    patch: Partial<DocumentTab>,
  ) {
    if (!tabId) {
      return;
    }

    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: editorGroupsRef.current[groupId].tabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...patch } : tab,
        ),
      },
    };

    setEditorGroupsAndRef(nextGroups);
  }

  function updateActiveTab(patch: Partial<DocumentTab>) {
    const groupId = activeGroupIdRef.current;
    const tabId = editorGroupsRef.current[groupId].activeTabId;

    if (!tabId) {
      return;
    }

    updateGroupTab(groupId, tabId, patch);
  }

  function replaceEditorGroupsWithPrimaryTab(tab: DocumentTab) {
    const nextGroups = createEditorGroups(tab);

    activeGroupIdRef.current = "primary";
    setActiveGroupId("primary");
    setSplitOpen(false);
    setEditorGroupsAndRef(nextGroups);
  }

  function addTabToGroup(tab: DocumentTab, groupId = activeGroupIdRef.current) {
    const nextTabs = [...editorGroupsRef.current[groupId].tabs, tab];
    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: nextTabs,
        activeTabId: tab.id,
      },
    };

    setEditorGroupsAndRef(nextGroups);
  }

  function findOpenFileTab(relativePath: string) {
    return findTabAcrossSplitGroups(editorGroupsRef.current, tabIdForFile(relativePath));
  }

  function currentDocumentSnapshot(groupId = activeGroupIdRef.current): Partial<DocumentTab> {
    const group = editorGroupsRef.current[groupId];
    const tab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);
    const groupEditor = editorForGroup(groupId);
    const nextMarkdown = groupEditor?.getMarkdown() ?? tab?.markdown ?? initialMarkdown;
    const isActiveGroup = groupId === activeGroupIdRef.current;

    // Inactive panes do not update the top-level mirrors, so their snapshot has
    // to be read from the owning tab plus the editor instance if it exists.
    return {
      activeFile: isActiveGroup ? activeFileRef.current : tab?.activeFile ?? null,
      pageName: isActiveGroup ? pageNameRef.current : tab?.pageName ?? "Untitled note",
      metaHeader: isActiveGroup ? metaHeaderRef.current : tab?.metaHeader ?? "",
      metaDelimiter: isActiveGroup
        ? metaDelimiterRef.current
        : tab?.metaDelimiter ?? defaultMetaDelimiter,
      markdown: nextMarkdown,
      markdownDraft: isActiveGroup ? markdownDraft : tab?.markdownDraft ?? nextMarkdown,
      dirty: isActiveGroup ? dirty : tab?.dirty ?? false,
    };
  }

  function snapshotActiveTab(groupId = activeGroupIdRef.current) {
    const tabId = editorGroupsRef.current[groupId].activeTabId;
    updateGroupTab(groupId, tabId, currentDocumentSnapshot(groupId));
  }

  function setActiveDocumentDirty(nextDirty: boolean) {
    setDirty(nextDirty);
    updateActiveTab({ dirty: nextDirty });
  }

  function activateEditorGroup(groupId: EditorGroupId) {
    if (activeGroupIdRef.current === groupId) {
      return;
    }

    snapshotActiveTab();
    activeGroupIdRef.current = groupId;
    setActiveGroupId(groupId);
    const group = editorGroupsRef.current[groupId];
    const tab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);

    if (tab) {
      hydrateDocumentTab(tab, groupId);
    }
  }

  function hydrateDocumentTab(tab: DocumentTab, groupId = activeGroupIdRef.current) {
    const groupEditor = editorForGroup(groupId);

    if (!groupEditor) {
      return;
    }

    hydratingEditor.current[groupId] = true;
    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        activeTabId: tab.id,
      },
    };

    setEditorGroupsAndRef(nextGroups);

    if (groupId === activeGroupIdRef.current) {
      activeFileRef.current = tab.activeFile;
      pageNameRef.current = tab.pageName;
      metaHeaderRef.current = tab.metaHeader;
      metaDelimiterRef.current = tab.metaDelimiter;
    }

    if (groupId !== activeGroupIdRef.current) {
      // Loading an inactive split pane should update its editor content, but
      // must not move drawers, toolbar state, or persisted workspace focus.
      groupEditor.commands.setContent(tab.markdown, { contentType: "markdown" });
      window.setTimeout(() => {
        hydratingEditor.current[groupId] = false;
      }, 0);
      return;
    }

    setActiveFile(tab.activeFile);
    setPageName(tab.pageName);
    setMetaHeader(tab.metaHeader);
    setMetaDelimiter(tab.metaDelimiter);
    setMarkdown(tab.markdown);
    setMarkdownDraft(tab.markdownDraft);
    setDirty(tab.dirty);
    setPageNameEditing(false);
    groupEditor.commands.setContent(tab.markdown, { contentType: "markdown" });
    syncEditorState(groupEditor);
    window.setTimeout(() => {
      hydratingEditor.current[groupId] = false;
    }, 0);
  }

  function createDocumentTabFromFile(file: OpenedFile): DocumentTab {
    const parts = splitMetaHeader(file.content);

    return {
      id: tabIdForFile(file.relativePath),
      activeFile: {
        name: file.name,
        relativePath: file.relativePath,
      },
      pageName: fileNameWithoutMarkdownExtension(file.name),
      metaHeader: parts.metaHeader,
      metaDelimiter: parts.metaDelimiter,
      markdown: parts.body,
      markdownDraft: parts.body,
      dirty: false,
    };
  }

  function switchToDocumentTab(tabId: string, groupId = activeGroupIdRef.current) {
    const tab = editorGroupsRef.current[groupId].tabs.find(
      (documentTab) => documentTab.id === tabId,
    );

    if (!tab) {
      return;
    }

    snapshotActiveTab();
    activeGroupIdRef.current = groupId;
    setActiveGroupId(groupId);
    hydrateDocumentTab(tab, groupId);
    if (tab.activeFile) {
      persistActiveFile(tab.activeFile);
      setStatus(`Switched to ${tab.activeFile.relativePath}`);
    } else {
      persistActiveFile(null);
      setStatus(`Switched to ${tabTitle(tab)}`);
    }
  }

  function closeDocumentTab(tabId: string, groupId = activeGroupIdRef.current) {
    const tabs = editorGroupsRef.current[groupId].tabs;
    const tab = tabs.find((documentTab) => documentTab.id === tabId);

    if (!tab) {
      return;
    }

    if (tab.dirty) {
      setStatus(`Save ${tabTitle(tab)} before closing its tab`);
      return;
    }

    if (tabs.length === 1) {
      if (!splitOpen) {
        setStatus("Keep at least one document tab open");
        return;
      }

      const promotedGroup = remainingGroupAfterSplitPaneClose(editorGroupsRef.current, groupId);

      if (!promotedGroup) {
        setStatus("Keep at least one document tab open");
        return;
      }

      const nextGroups = createEditorGroups(promotedGroup.activeTab);
      nextGroups.primary = promotedGroup.primaryGroup;

      // Closing the final tab in a split pane removes the pane. If the primary
      // pane is the one being closed, the secondary group is promoted so the
      // rest of the app never has to handle a secondary-only editor layout.
      activeGroupIdRef.current = "primary";
      setActiveGroupId("primary");
      setSplitOpen(false);
      setEditorGroupsAndRef(nextGroups);
      hydrateDocumentTab(promotedGroup.activeTab, "primary");
      persistActiveFile(promotedGroup.activeTab.activeFile);
      setStatus(`Closed ${tabTitle(tab)} and unsplit editor`);
      return;
    }

    const closedIndex = tabs.findIndex((documentTab) => documentTab.id === tabId);
    const nextTabs = tabs.filter((documentTab) => documentTab.id !== tabId);
    const wasActiveTab = tabId === editorGroupsRef.current[groupId].activeTabId;
    const nextActiveTabId =
      wasActiveTab
        ? nextTabs[Math.min(closedIndex, nextTabs.length - 1)].id
        : editorGroupsRef.current[groupId].activeTabId;

    setEditorGroupsAndRef({
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      },
    });

    if (!wasActiveTab) {
      setStatus(`Closed ${tabTitle(tab)}`);
      return;
    }

    const nextTab = nextTabs[Math.min(closedIndex, nextTabs.length - 1)];

    hydrateDocumentTab(nextTab, groupId);
    persistActiveFile(nextTab.activeFile);
    setStatus(`Closed ${tabTitle(tab)}`);
  }

  function insertVaultImage(fileName: string) {
    const groupEditor = editorForGroup(activeGroupIdRef.current);

    if (!groupEditor) {
      return;
    }

    groupEditor
      .chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: {
          src: joinVaultAssetPath(
            vaultRootRef.current,
            vaultSettingsRef.current.assetDirectory,
            fileName,
          ),
          alt: fileName,
          vaultTarget: fileName,
        },
      })
      .run();
  }

  async function importImageFiles(files: File[]) {
    if (!vaultRootRef.current || !activeFileRef.current) {
      setStatus("Open a vault file before adding images");
      return;
    }

    try {
      let imported = 0;

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const saved = await invoke<SavedAsset>("save_vault_asset", {
          root: vaultRootRef.current,
          assetDirectory: vaultSettingsRef.current.assetDirectory,
          fileName: fileNameForDroppedImage(file),
          bytes: Array.from(new Uint8Array(buffer)),
        });

        insertVaultImage(saved.fileName);
        imported += 1;
      }

      setStatus(
        `Added ${imported} image${imported === 1 ? "" : "s"} to ${vaultSettingsRef.current.assetDirectory}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function queueImageImport(files: FileList | File[] | null | undefined) {
    const images = Array.from(files ?? []).filter(isSupportedImageFile);

    if (images.length === 0) {
      return false;
    }

    void importImageFiles(images);
    return true;
  }

  function createEditorOptions(groupId: EditorGroupId) {
    return {
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        // Custom block extensions must be registered before Markdown so their
        // tokenizers participate in markdown parse/serialize round-trips.
        CodeBlockWithLanguageControl.configure({
          lowlight,
        }),
        TocCodeBlockRenderer,
        createWikiLinkExtension({
          openSearch: () => openWikiLinkSearchRef.current(),
          resolveTarget: (target) => resolveWikiLinkTargetRef.current(target),
        }),
        ...(editorBehavior.vimMode ? [createGlypharyVimMode(setStatus)] : []),
        createColumnExtension(),
        createColumnsExtension(),
        createCalloutExtension(),
        createCollapseExtension(),
        createRichLinkExtension(),
        // Vault images resolve late through refs because the same editor
        // instance can survive vault setting changes such as the asset folder.
        createVaultImageExtension((target) =>
          joinVaultAssetPath(
            vaultRootRef.current,
            vaultSettingsRef.current.assetDirectory,
            target,
          ),
        ),
        TableKit.configure({
          table: {
            resizable: true,
          },
        }),
        Markdown.configure({
          markedOptions: { gfm: true },
        }),
      ],
      content: initialMarkdown,
      contentType: "markdown" as const,
      editorProps: {
        attributes: {
          "aria-label": "Markdown document editor",
          spellcheck: "false",
        },
        handleDrop: (_view: unknown, event: DragEvent) => {
          if (!queueImageImport(event.dataTransfer?.files)) {
            return false;
          }

          event.preventDefault();
          return true;
        },
        handlePaste: (_view: unknown, event: ClipboardEvent) => {
          if (!queueImageImport(event.clipboardData?.files)) {
            return false;
          }

          event.preventDefault();
          return true;
        },
      },
      onUpdate: ({ editor }: { editor: Editor }) => {
        const nextMarkdown = editor.getMarkdown();
        const isActiveGroup = activeGroupIdRef.current === groupId;

        updateGroupTab(groupId, editorGroupsRef.current[groupId].activeTabId, {
          markdown: nextMarkdown,
          markdownDraft: nextMarkdown,
          dirty: hydratingEditor.current[groupId]
            ? editorGroupsRef.current[groupId].tabs.find(
                (tab) => tab.id === editorGroupsRef.current[groupId].activeTabId,
              )?.dirty ?? false
            : true,
        });

        if (isActiveGroup) {
          setMarkdown(nextMarkdown);
          setMarkdownDraft(nextMarkdown);
          syncEditorState(editor);
        }

        if (!hydratingEditor.current[groupId]) {
          // Programmatic hydration calls setContent too; only user edits should
          // dirty the tab and surface an unsaved-change status.
          if (isActiveGroup) {
            setDirty(true);
          }
          setStatus(
            isActiveGroup && activeFileRef.current
              ? `Unsaved changes in ${activeFileRef.current.name}`
              : "Unsaved changes in untitled note",
          );
        }
      },
      onSelectionUpdate: ({ editor }: { editor: Editor }) => {
        if (activeGroupIdRef.current === groupId) {
          syncEditorState(editor);
        }
      },
      onFocus: ({ editor }: { editor: Editor }) => {
        activateEditorGroup(groupId);
        setEditorFocused(true);
        syncEditorState(editor);
      },
      onBlur: ({ editor }: { editor: Editor }) => {
        if (activeGroupIdRef.current === groupId) {
          setEditorFocused(false);
          syncEditorState(editor);
        }
      },
    };
  }

  const primaryEditor = useEditor(createEditorOptions("primary"), [editorBehavior.vimMode]);
  const secondaryEditor = useEditor(createEditorOptions("secondary"), [editorBehavior.vimMode]);
  const activeEditor = activeGroupId === "secondary" ? secondaryEditor : primaryEditor;
  const editor = isEditorReady(activeEditor) ? activeEditor : null;

  useEffect(() => {
    [primaryEditor, secondaryEditor].forEach((targetEditor) => {
      if (isEditorReady(targetEditor)) {
        targetEditor.view.dispatch(
          targetEditor.state.tr.setMeta("glypharyWikilinkIndexVersion", wikiLinkIndexVersion),
        );
      }
    });
  }, [primaryEditor, secondaryEditor, wikiLinkIndexVersion]);

  useEffect(() => {
    const editors = [primaryEditor, secondaryEditor].filter((value): value is Editor =>
      isEditorReady(value),
    );
    const cleanups = editors.map((targetEditor) => {
      const root = targetEditor.view.dom;
      const handleClick = (event: MouseEvent) => {
        const target = event.target;

        if (!(target instanceof HTMLElement)) {
          return;
        }

        const wikiLink = target.closest<HTMLElement>("[data-wikilink-target]");

        if (wikiLink && root.contains(wikiLink)) {
          event.preventDefault();
          event.stopPropagation();
          openWikiLinkTargetRef.current(wikiLink.dataset.wikilinkTarget ?? "", event);
          return;
        }

        const button = target.closest<HTMLButtonElement>(
          "[data-toc-entry-id], [data-toc-edit]",
        );

        if (!button || !root.contains(button)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (button.dataset.tocEdit) {
          const widget = button.closest<HTMLElement>("[data-toc-block-position]");
          const blockPosition = Number(widget?.dataset.tocBlockPosition);

          if (Number.isFinite(blockPosition)) {
            targetEditor.chain().focus().setTextSelection(blockPosition + 1).run();
          } else {
            targetEditor.commands.focus();
          }
          return;
        }

        const entryId = button.dataset.tocEntryId;
        const entry = markdownHeadings(targetEditor.getMarkdown()).find(
          (candidate) => candidate.id === entryId,
        );

        if (entry) {
          jumpToHeadingInEditor(targetEditor, entry, setStatus);
        }
      };

      root.addEventListener("click", handleClick);

      return () => root.removeEventListener("click", handleClick);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [primaryEditor, secondaryEditor]);

  useEffect(() => {
    if (!isEditorReady(primaryEditor)) {
      return;
    }

    const tab = editorGroupsRef.current.primary.tabs.find(
      (documentTab) => documentTab.id === editorGroupsRef.current.primary.activeTabId,
    );

    if (tab) {
      hydrateDocumentTab(tab, "primary");
    }
  }, [primaryEditor]);

  useEffect(() => {
    if (!isEditorReady(secondaryEditor) || editorGroupsRef.current.secondary.tabs.length === 0) {
      return;
    }

    const tab = editorGroupsRef.current.secondary.tabs.find(
      (documentTab) => documentTab.id === editorGroupsRef.current.secondary.activeTabId,
    );

    if (tab) {
      hydrateDocumentTab(tab, "secondary");
    }
  }, [secondaryEditor]);

  useEffect(() => {
    if (!isEditorReady(primaryEditor) || restoredWorkspace.current || !isTauri()) {
      return;
    }

    // Restore only after the primary editor exists; hydrating before Tiptap is
    // ready would update React state but leave the editor document stale.
    restoredWorkspace.current = true;
    const persisted = readPersistedWorkspace();

    if (!persisted) {
      return;
    }

    const workspace = persisted;

    async function restoreWorkspace() {
      try {
        setStatus("Restoring previous vault");
        vaultRootRef.current = workspace.vaultRoot;
        setVaultRoot(workspace.vaultRoot);
        setVaultDrawerOpen(true);
        setVaultDrawerItem("files");
        setDrawerOpen(false);
        recentFilesRef.current = workspace.recentFiles;
        setRecentFiles(workspace.recentFiles);
        await loadVaultSettings(workspace.vaultRoot);
        setCurrentDir(workspace.currentDir);
        setSearchQuery("");
        setSearchResults([]);
        await loadEntries(workspace.vaultRoot, workspace.currentDir);
        await rebuildWikiLinkIndex(workspace.vaultRoot);

        if (workspace.activeFile) {
          const file = await invoke<OpenedFile>("read_vault_file", {
            root: workspace.vaultRoot,
            relative: workspace.activeFile.relativePath,
          });
          const tab = createDocumentTabFromFile(file);

          replaceEditorGroupsWithPrimaryTab(tab);
          hydrateDocumentTab(tab, "primary");
          setStatus(`Restored ${file.relativePath}`);
          return;
        }

        const tab = createUntitledTab();

        replaceEditorGroupsWithPrimaryTab(tab);
        hydrateDocumentTab(tab, "primary");
        setStatus(`Restored vault ${workspace.vaultRoot}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    restoreWorkspace();
  }, [primaryEditor]);

  const stats = useMemo(() => {
    const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    const characters = markdown.length;

    return { words, characters };
  }, [markdown]);

  const tableOfContents = useMemo(() => markdownHeadings(markdown), [markdown]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);

      return date;
    });
  }, [calendarMonth]);

  const calendarNoteDateKeySet = useMemo(
    () => new Set(calendarNoteDateKeys),
    [calendarNoteDateKeys],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCalendarNoteDateKeys() {
      if (!vaultRoot) {
        setCalendarNoteDateKeys([]);
        return;
      }

      try {
        const files = await invoke<string[]>("list_calendar_day_files", {
          root: vaultRoot,
        });
        // The backend returns every calendar file; the UI only needs markers
        // for the currently visible month grid.
        const visibleDateKeys = new Set(calendarDays.map(calendarDateKey));
        const existing = files
          .map(calendarPathDateKey)
          .filter((dateKey): dateKey is string => !!dateKey && visibleDateKeys.has(dateKey));

        if (!cancelled) {
          setCalendarNoteDateKeys(existing);
        }
      } catch (error) {
        if (!cancelled) {
          setCalendarNoteDateKeys([]);
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadCalendarNoteDateKeys();

    return () => {
      cancelled = true;
    };
  }, [calendarDays, vaultRoot]);

  const toolbarActions: ToolbarAction[] = useMemo(() => {
    if (!editor) {
      return [];
    }

    return [
      {
        label: "B",
        title: "Bold",
        isActive: () => editorFocused && editor.isActive("bold"),
        run: () => editor.chain().focus().toggleBold().run(),
      },
      {
        label: "I",
        title: "Italic",
        isActive: () => editorFocused && editor.isActive("italic"),
        run: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        label: "H1",
        title: "Heading 1",
        isActive: () => editorFocused && editor.isActive("heading", { level: 1 }),
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        label: "H2",
        title: "Heading 2",
        isActive: () => editorFocused && editor.isActive("heading", { level: 2 }),
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "UL",
        icon: "bullet-list",
        title: "Bullet list",
        isActive: () => editorFocused && editor.isActive("bulletList"),
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        label: "OL",
        icon: "ordered-list",
        title: "Ordered list",
        isActive: () => editorFocused && editor.isActive("orderedList"),
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Tasks",
        icon: "task-list",
        title: "Task list",
        isActive: () => editorFocused && editor.isActive("taskList"),
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        label: "Quote",
        icon: "quote",
        title: "Blockquote",
        isActive: () => editorFocused && editor.isActive("blockquote"),
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        label: "Code",
        icon: "code",
        title: "Code block",
        isActive: () => editorFocused && editor.isActive("codeBlock"),
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        label: "Table",
        icon: "table",
        title: "Insert table",
        isActive: () => false,
        run: () => appendTable(),
      },
      {
        label: "Cols",
        icon: "columns",
        title: "Insert columns",
        isActive: () => false,
        run: () => appendColumns(),
      },
      {
        label: "Callout",
        icon: "callout",
        title: "Insert callout",
        isActive: () => editorFocused && editor.isActive("callout"),
        run: () => appendCallout(),
      },
    ];
  }, [editor, editorFocused, editorStateVersion, markdown]);

  function setActivePageName(nextPageName: string) {
    pageNameRef.current = nextPageName;
    setPageName(nextPageName);
    updateActiveTab({ pageName: nextPageName });
  }

  function markPageNameDirty() {
    setActiveDocumentDirty(true);
    if (activeFileRef.current) {
      setStatus(`Unsaved changes in ${activeFileRef.current.name}`);
    } else {
      setStatus("Unsaved changes in untitled note");
    }
  }

  function finishPageNameEdit() {
    const activeFile = activeFileRef.current;

    if (!pageNameRef.current.trim() && activeFileRef.current) {
      setActivePageName(fileNameWithoutMarkdownExtension(activeFileRef.current.name));
    }

    setPageNameEditing(false);

    if (
      activeFile &&
      pageNameRef.current.trim() &&
      pageNameRef.current.trim() !== fileNameWithoutMarkdownExtension(activeFile.name)
    ) {
      void saveCurrentFileRef.current();
    }
  }

  function setActiveMetaHeader(
    nextMetaHeader: string,
    nextMetaDelimiter = metaDelimiterRef.current,
  ) {
    metaHeaderRef.current = nextMetaHeader;
    metaDelimiterRef.current = nextMetaDelimiter;
    setMetaHeader(nextMetaHeader);
    setMetaDelimiter(nextMetaDelimiter);
    updateActiveTab({
      metaHeader: nextMetaHeader,
      metaDelimiter: nextMetaDelimiter,
    });
  }

  function setEditorBody(content: string, clean: boolean) {
    if (!editor) {
      return;
    }

    hydratingEditor.current[activeGroupIdRef.current] = clean;
    editor.commands.setContent(content, { contentType: "markdown" });
    setMarkdown(content);
    setMarkdownDraft(content);
    updateActiveTab({
      markdown: content,
      markdownDraft: content,
      dirty: !clean,
    });

    if (clean) {
      setActiveDocumentDirty(false);
      window.setTimeout(() => {
        hydratingEditor.current[activeGroupIdRef.current] = false;
      }, 0);
    } else {
      setActiveDocumentDirty(true);
      setStatus(
        activeFileRef.current
          ? `Unsaved changes in ${activeFileRef.current.name}`
          : "Unsaved changes in untitled note",
      );
    }
  }

  function persistWorkspace(next: Partial<PersistedWorkspace>) {
    const nextVaultRoot = next.vaultRoot ?? vaultRoot;

    if (!nextVaultRoot) {
      return;
    }

    writePersistedWorkspace({
      vaultRoot: nextVaultRoot,
      currentDir: next.currentDir ?? currentDir,
      activeFile: next.activeFile === undefined ? activeFile : next.activeFile,
      recentFiles: next.recentFiles ?? recentFilesRef.current,
    });
  }

  function recordRecentFile(file: ActiveFile) {
    const nextRecentFiles = recentFilesWithOpenedFile(recentFilesRef.current, file);

    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);
    return nextRecentFiles;
  }

  function persistActiveFile(file: ActiveFile | null) {
    persistWorkspace({
      activeFile: file,
      recentFiles: file ? recordRecentFile(file) : recentFilesRef.current,
    });
  }

  async function loadEntries(root: string, relative: string) {
    const nextEntries = await invoke<VaultEntry[]>("list_vault_dir", {
      root,
      relative,
    });

    setEntries(nextEntries);
  }

  function setWikiLinkIndexAndRef(files: VaultIndexedFile[]) {
    wikiLinkIndexRef.current = files;
    setWikiLinkIndex(files);
    setWikiLinkIndexVersion((version) => version + 1);
  }

  function addFileToWikiLinkIndex(file: ActiveFile | OpenedFile) {
    setWikiLinkIndexAndRef(addIndexedFile(wikiLinkIndexRef.current, file));
  }

  function removeFileFromWikiLinkIndex(relativePath: string) {
    setWikiLinkIndexAndRef(removeIndexedFile(wikiLinkIndexRef.current, relativePath));
  }

  function replaceFileInWikiLinkIndex(oldRelativePath: string, file: ActiveFile | OpenedFile) {
    setWikiLinkIndexAndRef(
      replaceIndexedFile(wikiLinkIndexRef.current, oldRelativePath, file),
    );
  }

  function resolveWikiLinkTarget(target: string): WikiLinkResolution {
    const cleanTarget = wikiLinkTargetFromMarkup(target);
    const normalizedTarget = normalizeWikiLinkText(cleanTarget);

    if (!normalizedTarget) {
      return { candidates: [] };
    }

    const files = wikiLinkIndexRef.current;
    const pathMatches = files.filter((file) => {
      const pathWithoutExtension = fileNameWithoutMarkdownExtension(file.relativePath);
      const normalizedPath = normalizeWikiLinkText(file.relativePath);

      return (
        normalizedPath === normalizedTarget ||
        normalizeWikiLinkText(pathWithoutExtension) === normalizedTarget
      );
    });

    if (pathMatches.length > 0) {
      return { candidates: pathMatches };
    }

    return {
      candidates: files.filter(
        (file) => normalizeWikiLinkText(wikiLinkDisplayName(file)) === normalizedTarget,
      ),
    };
  }

  async function rebuildWikiLinkIndex(root: string) {
    if (!isTauri()) {
      setWikiLinkIndexAndRef([]);
      return;
    }

    setStatus("Indexing...");
    const files = await invoke<VaultIndexedFile[]>("list_vault_markdown_files", { root });

    setWikiLinkIndexAndRef(files);
  }

  function openWikiLinkSearch() {
    if (!vaultRootRef.current) {
      return;
    }

    setWikiLinkSearchQuery("");
    setWikiLinkSearchSelectedIndex(0);
    setWikiLinkSearchOpen(true);
  }

  function closeWikiLinkSearch() {
    setWikiLinkSearchOpen(false);
    setWikiLinkSearchQuery("");
    setWikiLinkSearchSelectedIndex(0);
  }

  function handleWikiLinkSearchKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWikiLinkSearch();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setWikiLinkSearchSelectedIndex((index) =>
        moveSelectableIndex(index, filteredWikiLinkFiles.length, 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setWikiLinkSearchSelectedIndex((index) =>
        moveSelectableIndex(index, filteredWikiLinkFiles.length, -1),
      );
      return;
    }

    if (event.key === "Enter" && selectedWikiLinkFile) {
      event.preventDefault();
      insertWikiLinkSelection(selectedWikiLinkFile);
    }
  }

  function insertWikiLinkSelection(file: VaultIndexedFile) {
    if (!editor) {
      return;
    }

    const label = wikiLinkDisplayName(file);
    const { state } = editor;
    const beforeCursor = state.doc.textBetween(
      Math.max(0, state.selection.from - 2),
      state.selection.from,
    );
    const insertion = beforeCursor === "[[" ? `${label}]]` : `[[${label}]]`;

    // Completing a wikilink is plain text editing. Running the fragment through
    // Markdown insertion can split the link across paragraphs.
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        dispatch?.(tr.insertText(insertion));
        return true;
      })
      .run();
    closeWikiLinkSearch();
  }

  function openWikiLinkTarget(
    target: string,
    event?: MouseEvent | ReactMouseEvent<HTMLElement>,
  ) {
    const resolution = resolveWikiLinkTarget(target);

    if (resolution.candidates.length === 0) {
      setStatus(`No note found for [[${target}]]`);
      return;
    }

    if (resolution.candidates.length === 1) {
      void openFile(resolution.candidates[0].relativePath);
      return;
    }

    const x =
      "clientX" in (event ?? {})
        ? (event as MouseEvent | ReactMouseEvent<HTMLElement>).clientX
        : window.innerWidth / 2;
    const y =
      "clientY" in (event ?? {})
        ? (event as MouseEvent | ReactMouseEvent<HTMLElement>).clientY
        : window.innerHeight / 2;

    setWikiLinkPicker({
      target,
      candidates: resolution.candidates,
      x,
      y,
    });
    setWikiLinkPickerSelectedIndex(0);
    setStatus(`Choose one of ${resolution.candidates.length} notes for [[${target}]]`);
  }

  function openWikiLinkPickerSelection(file: VaultIndexedFile) {
    setWikiLinkPicker(null);
    setWikiLinkPickerSelectedIndex(0);
    void openFile(file.relativePath);
  }

  resolveWikiLinkTargetRef.current = resolveWikiLinkTarget;
  openWikiLinkSearchRef.current = openWikiLinkSearch;
  openWikiLinkTargetRef.current = openWikiLinkTarget;

  async function refreshCssSnippets(
    root = vaultRoot,
    settings = cssSnippetDraft,
  ) {
    if (!root || !isTauri()) {
      setCssSnippetFiles([]);
      setCssSnippetContents([]);
      return;
    }

    const normalizedSettings = normalizeCssSnippetSettings(settings);
    const [files, contents] = await Promise.all([
      invoke<CssSnippetFile[]>("list_css_snippets", {
        root,
        directory: normalizedSettings.directory,
      }),
      invoke<CssSnippetContent[]>("read_css_snippets", {
        root,
        directory: normalizedSettings.directory,
        enabled: normalizedSettings.enabled,
      }),
    ]);

    setCssSnippetFiles(files);
    setCssSnippetContents(contents);
  }

  async function refreshPlugins(root = vaultRoot, settings = pluginDraft) {
    if (!root || !isTauri()) {
      setPluginCatalog({ plugins: [], errors: [] });
      setPluginStyles([]);
      return;
    }

    const normalizedSettings = normalizePluginSettings(settings);
    // Discovery and style loading are separate backend calls by design: invalid
    // plugins remain visible as catalog errors, while only enabled plugins may
    // inject CSS into the running editor.
    const [catalog, styles] = await Promise.all([
      invoke<PluginCatalog>("list_vault_plugins", { root }),
      invoke<PluginStyleContent[]>("read_plugin_styles", {
        root,
        enabled: normalizedSettings.enabled,
      }),
    ]);

    setPluginCatalog(catalog);
    setPluginStyles(styles);
  }

  async function loadVaultSettings(root: string) {
    const settings = isTauri()
      ? await invoke<VaultSettings>("read_vault_settings", { root })
      : {
          assetDirectory: defaultVaultAssetDirectory,
          frontmatterPills: defaultFrontmatterPillSettings,
          files: defaultFileDisplaySettings,
          autosave: defaultAutosaveSettings,
          tidbits: defaultTidbitSettings,
          editor: defaultEditorBehaviorSettings,
          appearance: defaultVaultAppearanceSettings,
          cssSnippets: defaultCssSnippetSettings,
          plugins: defaultPluginSettings,
          theme: null,
    };
    const themeTokens = normalizeThemeTokens(settings.theme?.tokens);
    const themePresetId = normalizeThemePresetId(settings.theme?.presetId);
    const themeOptions = normalizeThemeOptions(settings.theme?.options);
    const themeCallouts = normalizeThemeCalloutSettings(settings.theme?.callouts);
    const frontmatterPills = normalizeFrontmatterPillSettings(settings.frontmatterPills);
    const editorSettings = normalizeEditorBehaviorSettings(settings.editor);
    const fileDisplaySettings = normalizeFileDisplaySettings(settings.files);
    const autosave = normalizeAutosaveSettings(settings.autosave);
    const tidbits = normalizeTidbitSettings(settings.tidbits);
    const vaultAppearanceSettings = normalizeVaultAppearanceSettings(settings.appearance);
    const cssSnippets = normalizeCssSnippetSettings(settings.cssSnippets);
    const plugins = normalizePluginSettings(settings.plugins);

    const normalizedSettings = {
      ...settings,
      frontmatterPills,
      files: fileDisplaySettings,
      autosave,
      tidbits,
      editor: editorSettings,
      appearance: vaultAppearanceSettings,
      cssSnippets,
      plugins,
      theme:
        Object.keys(themeTokens).length > 0 ||
        !sameThemeOptions(themeOptions, defaultThemeOptions) ||
        !sameThemeCalloutSettings(themeCallouts, defaultThemeCalloutSettings)
          ? {
              presetId: themePresetId,
              callouts: themeCallouts,
              tokens: themeTokens,
              options: themeOptions,
            }
          : null,
    };

    vaultSettingsRef.current = normalizedSettings;
    setVaultSettings(normalizedSettings);
    setSettingsDraft(settings.assetDirectory);
    setFrontmatterPillDraft(frontmatterPills);
    setEditorBehaviorDraft(editorSettings);
    setEditorBehavior(editorSettings);
    setFileDisplayDraft(fileDisplaySettings);
    setAutosaveDraft(autosave);
    setAutosaveSettings(autosave);
    setTidbitDraft(tidbits);
    setTidbitSettings(tidbits);
    setVaultAppearanceDraft(vaultAppearanceSettings);
    setCssSnippetDraft(cssSnippets);
    setPluginDraft(plugins);
    setSelectedThemePresetIdDraft(themePresetId);
    setThemeDraft(themeTokens);
    setThemeOptionsDraft(themeOptions);
    setThemeCalloutDraft(themeCallouts);

    if (isTauri()) {
      // Tauri's asset protocol is deny-by-default. Re-allow the configured
      // asset directory whenever a vault is opened or settings change.
      await invoke("allow_vault_assets", {
        root,
        assetDirectory: settings.assetDirectory,
      });
    }

    await refreshCssSnippets(root, cssSnippets);
    await refreshPlugins(root, plugins);

    return settings;
  }

  async function saveVaultSettings() {
    if (!vaultRoot) {
      return;
    }

    try {
      const settings = await invoke<VaultSettings>("write_vault_settings", {
        root: vaultRoot,
        settings: {
          assetDirectory: settingsDraft,
          frontmatterPills: normalizeFrontmatterPillSettings(frontmatterPillDraft),
          files: normalizeFileDisplaySettings(fileDisplayDraft),
          autosave: normalizeAutosaveSettings(autosaveDraft),
          tidbits: normalizeTidbitSettings(tidbitDraft),
          editor: normalizeEditorBehaviorSettings(editorBehaviorDraft),
          appearance: normalizeVaultAppearanceSettings(vaultAppearanceDraft),
          cssSnippets: normalizeCssSnippetSettings(cssSnippetDraft),
          plugins: normalizePluginSettings(pluginDraft),
          theme:
            Object.keys(normalizeThemeTokens(themeDraft)).length > 0 ||
            !sameThemeOptions(themeOptionsDraft, defaultThemeOptions) ||
            !sameThemeCalloutSettings(themeCalloutDraft, defaultThemeCalloutSettings)
            ? {
                presetId: selectedThemePresetIdDraft,
                callouts: normalizeThemeCalloutSettings(themeCalloutDraft),
                tokens: normalizeThemeTokens(themeDraft),
                options: normalizeThemeOptions(themeOptionsDraft),
              }
            : null,
        },
      });
      const themeTokens = normalizeThemeTokens(settings.theme?.tokens);
      const themePresetId = normalizeThemePresetId(settings.theme?.presetId);
      const themeOptions = normalizeThemeOptions(settings.theme?.options);
      const themeCallouts = normalizeThemeCalloutSettings(settings.theme?.callouts);
      const frontmatterPills = normalizeFrontmatterPillSettings(settings.frontmatterPills);
      const editorSettings = normalizeEditorBehaviorSettings(settings.editor);
      const fileDisplaySettings = normalizeFileDisplaySettings(settings.files);
      const autosave = normalizeAutosaveSettings(settings.autosave);
      const tidbits = normalizeTidbitSettings(settings.tidbits);
      const vaultAppearanceSettings = normalizeVaultAppearanceSettings(settings.appearance);
      const cssSnippets = normalizeCssSnippetSettings(settings.cssSnippets);
      const plugins = normalizePluginSettings(settings.plugins);
      const normalizedSettings = {
        ...settings,
        frontmatterPills,
        files: fileDisplaySettings,
        autosave,
        tidbits,
        editor: editorSettings,
        appearance: vaultAppearanceSettings,
        cssSnippets,
        plugins,
        theme:
          Object.keys(themeTokens).length > 0 ||
          !sameThemeOptions(themeOptions, defaultThemeOptions) ||
          !sameThemeCalloutSettings(themeCallouts, defaultThemeCalloutSettings)
            ? {
                presetId: themePresetId,
                callouts: themeCallouts,
                tokens: themeTokens,
                options: themeOptions,
              }
            : null,
      };

      snapshotActiveTab("primary");
      if (splitOpen) {
        snapshotActiveTab("secondary");
      }
      vaultSettingsRef.current = normalizedSettings;
      setVaultSettings(normalizedSettings);
      setSettingsDraft(settings.assetDirectory);
      setFrontmatterPillDraft(frontmatterPills);
      setEditorBehaviorDraft(editorSettings);
      setEditorBehavior(editorSettings);
      setFileDisplayDraft(fileDisplaySettings);
      setAutosaveDraft(autosave);
      setAutosaveSettings(autosave);
      setTidbitDraft(tidbits);
      setTidbitSettings(tidbits);
      setVaultAppearanceDraft(vaultAppearanceSettings);
      setCssSnippetDraft(cssSnippets);
      setPluginDraft(plugins);
      setSelectedThemePresetIdDraft(themePresetId);
      setThemeDraft(themeTokens);
      setThemeOptionsDraft(themeOptions);
      setThemeCalloutDraft(themeCallouts);
      await invoke("allow_vault_assets", {
        root: vaultRoot,
        assetDirectory: settings.assetDirectory,
      });
      await refreshCssSnippets(vaultRoot, cssSnippets);
      await refreshPlugins(vaultRoot, plugins);
      await loadEntries(vaultRoot, currentDir);
      setStatus("Saved vault settings");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveCurrentFile() {
    if (!editor || !vaultRoot || !activeFileRef.current || !dirty) {
      return;
    }

    const groupId = activeGroupIdRef.current;
    let file = activeFileRef.current;
    const requestedName = pageNameRef.current.trim();

    if (requestedName && requestedName !== fileNameWithoutMarkdownExtension(file.name)) {
      // The displayed page name is the rename source of truth. Renaming first
      // lets the subsequent write target the new path and keeps tab IDs stable
      // with the file-relative-path convention.
      const previousTabId = editorGroupsRef.current[groupId].activeTabId;
      const previousRelativePath = file.relativePath;
      const renamed = await invoke<OpenedFile>("rename_vault_file", {
        root: vaultRoot,
        relative: file.relativePath,
        nextName: requestedName,
      });

      file = {
        name: renamed.name,
        relativePath: renamed.relativePath,
      };
      const nextTabId = tabIdForFile(file.relativePath);

      activeFileRef.current = file;
      setActiveFile(file);
      setActivePageName(fileNameWithoutMarkdownExtension(file.name));
      const renamedTabs = editorGroupsRef.current[groupId].tabs.map((tab) =>
        tab.id === previousTabId
          ? {
              ...tab,
              id: nextTabId,
              activeFile: file,
              pageName: fileNameWithoutMarkdownExtension(file.name),
            }
          : tab,
      );
      const nextGroups = {
        ...editorGroupsRef.current,
        [groupId]: {
          ...editorGroupsRef.current[groupId],
          tabs: renamedTabs,
          activeTabId: nextTabId,
        },
      };

      setEditorGroupsAndRef(nextGroups);
      persistActiveFile(file);
      replaceFileInWikiLinkIndex(previousRelativePath, file);
      await loadEntries(vaultRoot, currentDir);
    }

    const content = composeMarkdown(
      metaHeaderRef.current,
      metaDelimiterRef.current,
      editor.getMarkdown(),
    );

    await invoke("write_vault_file", {
      root: vaultRoot,
      relative: file.relativePath,
      content,
    });
    const savedMarkdown = editor.getMarkdown();
    const savedDraft = markdownDraft;
    const activeTabIdForGroup = editorGroupsRef.current[groupId].activeTabId;
    const savedTabs = editorGroupsRef.current[groupId].tabs.map((tab) =>
      tab.id === activeTabIdForGroup
        ? {
            ...tab,
            activeFile: file,
            pageName: fileNameWithoutMarkdownExtension(file.name),
            metaHeader: metaHeaderRef.current,
            metaDelimiter: metaDelimiterRef.current,
            markdown: savedMarkdown,
            markdownDraft: savedDraft,
            dirty: false,
          }
        : tab,
    );
    const nextGroups = {
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: savedTabs,
      },
    };

    setEditorGroupsAndRef(nextGroups);
    setDirty(false);
    setStatus(`Saved ${file.name}`);
  }

  useEffect(() => {
    saveCurrentFileRef.current = saveCurrentFile;
  });

  useEffect(() => {
    if (!vaultRoot || !autosaveSettings.enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      void saveCurrentFileRef.current();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [vaultRoot, autosaveSettings.enabled]);

  async function openVault() {
    try {
      await saveCurrentFile();
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Vault",
      });

      if (typeof selected !== "string") {
        return;
      }

      vaultRootRef.current = selected;
      setVaultRoot(selected);
      setVaultDrawerOpen(true);
      setVaultDrawerItem("files");
      setDrawerOpen(false);
      recentFilesRef.current = [];
      setRecentFiles([]);
      await loadVaultSettings(selected);
      setCurrentDir("");
      const tab = createUntitledTab();

      replaceEditorGroupsWithPrimaryTab(tab);
      hydrateDocumentTab(tab, "primary");
      setSearchQuery("");
      setSearchResults([]);
      await loadEntries(selected, "");
      setWikiLinkIndexAndRef([]);
      await rebuildWikiLinkIndex(selected);
      persistWorkspace({
        vaultRoot: selected,
        currentDir: "",
        activeFile: null,
        recentFiles: [],
      });
      setStatus(`Opened vault ${selected}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  openVaultRef.current = openVault;
  saveCurrentFileRef.current = saveCurrentFile;

  useEffect(() => {
    const handleGlobalSaveShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "s") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      void saveCurrentFileRef.current();
    };
    const handleGlobalCommandPaletteShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "p") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      setCommandPaletteQuery("");
      setCommandPaletteSelectedIndex(0);
      setCommandPaletteOpen(true);
    };

    window.addEventListener("keydown", handleGlobalSaveShortcut);
    window.addEventListener("keydown", handleGlobalCommandPaletteShortcut);

    return () => {
      window.removeEventListener("keydown", handleGlobalSaveShortcut);
      window.removeEventListener("keydown", handleGlobalCommandPaletteShortcut);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const closeSettingsOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
      }
    };

    window.addEventListener("keydown", closeSettingsOnEscape);

    return () => window.removeEventListener("keydown", closeSettingsOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    commandPaletteInputRef.current?.focus();
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!wikiLinkSearchOpen) {
      return;
    }

    wikiLinkSearchInputRef.current?.focus();
  }, [wikiLinkSearchOpen]);

  useEffect(() => {
    if (!richLinkDialogOpen) {
      return;
    }

    richLinkInputRef.current?.focus();
  }, [richLinkDialogOpen]);

  useEffect(() => {
    if (!wikiLinkPicker) {
      return;
    }

    const closePicker = () => {
      setWikiLinkPicker(null);
      setWikiLinkPickerSelectedIndex(0);
    };
    const handlePickerKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setWikiLinkPickerSelectedIndex((index) =>
          moveSelectableIndex(index, wikiLinkPicker.candidates.length, 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setWikiLinkPickerSelectedIndex((index) =>
          moveSelectableIndex(index, wikiLinkPicker.candidates.length, -1),
        );
        return;
      }

      if (event.key === "Enter") {
        const selectedFile =
          wikiLinkPicker.candidates[
            Math.min(wikiLinkPickerSelectedIndex, wikiLinkPicker.candidates.length - 1)
          ] ?? null;

        if (!selectedFile) {
          return;
        }

        event.preventDefault();
        openWikiLinkPickerSelection(selectedFile);
      }
    };

    window.addEventListener("pointerdown", closePicker);
    window.addEventListener("keydown", handlePickerKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closePicker);
      window.removeEventListener("keydown", handlePickerKeyDown);
    };
  }, [wikiLinkPicker, wikiLinkPickerSelectedIndex]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisteners: Array<() => void> = [];

    // Native macOS menus live in Rust, but all document state lives here. The
    // bridge is event-based so menu commands and in-window buttons share the
    // same save/open/new code paths.
    listen("open-vault-requested", () => {
      void openVaultRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("save-requested", () => {
      void saveCurrentFileRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("new-document-requested", () => {
      resetDocumentRef.current();
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen<AppearanceMode>("appearance-requested", (event) => {
      if (event.payload === "auto" || event.payload === "light" || event.payload === "dark") {
        setAppearance(event.payload);
      }
    })
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    listen("settings-requested", openSettings)
      .then((nextUnlisten) => {
        unlisteners.push(nextUnlisten);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  async function openFile(relativePath: string) {
    if (!vaultRoot) {
      return;
    }

    try {
      snapshotActiveTab();
      const existing = findOpenFileTab(relativePath);

      if (existing) {
        // Avoid two editable copies of the same file. Switching to the existing
        // tab prevents divergent dirty states for one vault path.
        activeGroupIdRef.current = existing.groupId;
        setActiveGroupId(existing.groupId);
        hydrateDocumentTab(existing.tab, existing.groupId);
        persistActiveFile(existing.tab.activeFile);
        setStatus(
          `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
        );
        return;
      }

      const file = await invoke<OpenedFile>("read_vault_file", {
        root: vaultRoot,
        relative: relativePath,
      });
      const tab = createDocumentTabFromFile(file);

      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      setStatus(`Opened ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openCalendarDay(date: Date) {
    if (!vaultRoot) {
      setStatus("Open a vault before opening calendar notes");
      return;
    }

    const relativePath = calendarDayRelativePath(date);
    const existing = findOpenFileTab(relativePath);

    snapshotActiveTab();

    if (existing) {
      activeGroupIdRef.current = existing.groupId;
      setActiveGroupId(existing.groupId);
      hydrateDocumentTab(existing.tab, existing.groupId);
      persistActiveFile(existing.tab.activeFile);
      setStatus(
        `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
      );
      return;
    }

    try {
      const file = await invoke<OpenedFile>("open_calendar_day_file", {
        root: vaultRoot,
        relative: relativePath,
        title: calendarDayTitle(date),
      });
      const tab = createDocumentTabFromFile(file);

      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await loadEntries(vaultRoot, currentDir);
      setCalendarNoteDateKeys((dateKeys) =>
        dateKeys.includes(calendarDateKey(date)) ? dateKeys : [...dateKeys, calendarDateKey(date)],
      );
      setStatus(`Opened calendar note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openDirectoryShadow(relativePath: string) {
    if (!vaultRoot) {
      return;
    }

    try {
      snapshotActiveTab();
      const file = await invoke<OpenedFile>("open_directory_shadow_file", {
        root: vaultRoot,
        relative: relativePath,
      });
      const existing = findOpenFileTab(file.relativePath);

      if (existing) {
        activeGroupIdRef.current = existing.groupId;
        setActiveGroupId(existing.groupId);
        hydrateDocumentTab(existing.tab, existing.groupId);
        persistActiveFile(existing.tab.activeFile);
        setStatus(
          `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
        );
        return;
      }

      const tab = createDocumentTabFromFile(file);

      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      setStatus(`Opened directory note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function relativePathFileName(relativePath: string) {
    return relativePath.split("/").pop() || relativePath;
  }

  function rebasePathAfterDirectoryRename(
    relativePath: string,
    oldDirectory: VaultEntry,
    newDirectory: RenamedDirectory,
  ) {
    const oldDirectoryPath = oldDirectory.relativePath;
    const newDirectoryPath = newDirectory.relativePath;
    const oldShadowPath = `${oldDirectoryPath}/${oldDirectory.name}.md`;
    const newShadowPath = `${newDirectoryPath}/${newDirectory.name}.md`;

    if (relativePath === oldShadowPath) {
      return newShadowPath;
    }

    if (relativePath === oldDirectoryPath) {
      return newDirectoryPath;
    }

    if (relativePath.startsWith(`${oldDirectoryPath}/`)) {
      return `${newDirectoryPath}${relativePath.slice(oldDirectoryPath.length)}`;
    }

    return relativePath;
  }

  function activeFileWithRelativePath(relativePath: string): ActiveFile {
    return {
      name: relativePathFileName(relativePath),
      relativePath,
    };
  }

  function applyRenamedDirectoryToOpenState(
    oldDirectory: VaultEntry,
    newDirectory: RenamedDirectory,
  ) {
    const rebaseFile = (file: ActiveFile | null) => {
      if (!file) {
        return null;
      }

      const nextPath = rebasePathAfterDirectoryRename(file.relativePath, oldDirectory, newDirectory);
      return nextPath === file.relativePath ? file : activeFileWithRelativePath(nextPath);
    };
    const nextGroups = Object.fromEntries(
      (Object.entries(editorGroupsRef.current) as Array<[EditorGroupId, EditorGroupState]>).map(
        ([groupId, group]) => {
          let nextActiveTabId = group.activeTabId;
          const nextTabs = group.tabs.map((tab) => {
            const nextActiveFile = rebaseFile(tab.activeFile);

            if (!nextActiveFile || nextActiveFile === tab.activeFile) {
              return tab;
            }

            const nextId = tabIdForFile(nextActiveFile.relativePath);

            if (tab.id === group.activeTabId) {
              nextActiveTabId = nextId;
            }

            return {
              ...tab,
              id: nextId,
              activeFile: nextActiveFile,
              pageName: fileNameWithoutMarkdownExtension(nextActiveFile.name),
            };
          });

          return [
            groupId,
            {
              ...group,
              tabs: nextTabs,
              activeTabId: nextActiveTabId,
            },
          ];
        },
      ),
    ) as Record<EditorGroupId, EditorGroupState>;
    const nextActiveFile = rebaseFile(activeFileRef.current);
    const nextRecentFiles = recentFilesRef.current.map((file) => rebaseFile(file) ?? file);
    const nextCurrentDir = rebasePathAfterDirectoryRename(
      currentDir,
      oldDirectory,
      newDirectory,
    );

    setEditorGroupsAndRef(nextGroups);
    activeFileRef.current = nextActiveFile;
    setActiveFile(nextActiveFile);
    if (nextActiveFile) {
      setPageName(fileNameWithoutMarkdownExtension(nextActiveFile.name));
    }
    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);
    setCurrentDir(nextCurrentDir);
    persistWorkspace({
      currentDir: nextCurrentDir,
      activeFile: nextActiveFile,
      recentFiles: nextRecentFiles,
    });
  }

  function replaceOpenFilePath(oldRelativePath: string, movedFile: ActiveFile) {
    const nextId = tabIdForFile(movedFile.relativePath);
    let nextActiveFile = activeFileRef.current;
    const nextGroups = Object.fromEntries(
      (Object.entries(editorGroupsRef.current) as Array<[EditorGroupId, EditorGroupState]>).map(
        ([groupId, group]) => {
          let nextActiveTabId = group.activeTabId;
          const nextTabs = group.tabs.map((tab) => {
            if (tab.activeFile?.relativePath !== oldRelativePath) {
              return tab;
            }

            if (tab.id === group.activeTabId) {
              nextActiveTabId = nextId;
            }

            return {
              ...tab,
              id: nextId,
              activeFile: movedFile,
              pageName: fileNameWithoutMarkdownExtension(movedFile.name),
            };
          });

          return [
            groupId,
            {
              ...group,
              tabs: nextTabs,
              activeTabId: nextActiveTabId,
            },
          ];
        },
      ),
    ) as Record<EditorGroupId, EditorGroupState>;
    const nextRecentFiles = recentFilesRef.current.map((file) =>
      file.relativePath === oldRelativePath ? movedFile : file,
    );

    if (nextActiveFile?.relativePath === oldRelativePath) {
      nextActiveFile = movedFile;
      activeFileRef.current = movedFile;
      setActiveFile(movedFile);
      setPageName(fileNameWithoutMarkdownExtension(movedFile.name));
    }

    setEditorGroupsAndRef(nextGroups);
    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);
    persistWorkspace({
      activeFile: nextActiveFile,
      recentFiles: nextRecentFiles,
    });
  }

  function removeDeletedFileFromOpenState(relativePath: string) {
    const removeFromGroup = (group: EditorGroupState) => {
      const removedIndex = group.tabs.findIndex(
        (tab) => tab.activeFile?.relativePath === relativePath,
      );

      if (removedIndex === -1) {
        return { group, removedActive: false };
      }

      const nextTabs = group.tabs.filter((tab) => tab.activeFile?.relativePath !== relativePath);
      const removedActive = group.tabs[removedIndex].id === group.activeTabId;
      const activeTabId =
        removedActive && nextTabs.length > 0
          ? nextTabs[Math.min(removedIndex, nextTabs.length - 1)].id
          : group.activeTabId;

      return {
        group: {
          ...group,
          tabs: nextTabs,
          activeTabId,
        },
        removedActive,
      };
    };
    const primary = removeFromGroup(editorGroupsRef.current.primary);
    const secondary = removeFromGroup(editorGroupsRef.current.secondary);
    let nextGroups: Record<EditorGroupId, EditorGroupState> = {
      primary: primary.group,
      secondary: secondary.group,
    };
    let nextSplitOpen = splitOpen;
    let nextActiveGroupId = activeGroupIdRef.current;

    if (!splitOpen && nextGroups.primary.tabs.length === 0) {
      const tab = createUntitledTab();
      nextGroups = createEditorGroups(tab);
      nextActiveGroupId = "primary";
    } else if (
      splitOpen &&
      nextGroups.primary.tabs.length === 0 &&
      nextGroups.secondary.tabs.length > 0
    ) {
      const promotedPrimary: EditorGroupState = {
        ...nextGroups.secondary,
        id: "primary",
      };

      nextGroups = {
        primary: promotedPrimary,
        secondary: {
          id: "secondary",
          tabs: [],
          activeTabId: "",
        },
      };
      nextSplitOpen = false;
      nextActiveGroupId = "primary";
    } else if (splitOpen && nextGroups.secondary.tabs.length === 0) {
      nextGroups = {
        primary: nextGroups.primary,
        secondary: {
          id: "secondary",
          tabs: [],
          activeTabId: "",
        },
      };
      nextSplitOpen = false;
      nextActiveGroupId = "primary";
    }

    const activeGroup = nextGroups[nextActiveGroupId];
    const activeTab = activeGroup.tabs.find((tab) => tab.id === activeGroup.activeTabId)
      ?? activeGroup.tabs[0];
    const nextRecentFiles = recentFilesRef.current.filter(
      (file) => file.relativePath !== relativePath,
    );

    setSplitOpen(nextSplitOpen);
    activeGroupIdRef.current = nextActiveGroupId;
    setActiveGroupId(nextActiveGroupId);
    setEditorGroupsAndRef(nextGroups);
    recentFilesRef.current = nextRecentFiles;
    setRecentFiles(nextRecentFiles);

    if (activeTab) {
      hydrateDocumentTab(activeTab, nextActiveGroupId);
      persistWorkspace({
        activeFile: activeTab.activeFile,
        recentFiles: nextRecentFiles,
      });
    }
  }

  function handleFolderContextMenu(
    entry: VaultEntry,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    suppressDirectoryClickRef.current = true;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }
    setFolderContextMenu({
      entry,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function openFolderActionDialog(action: FolderActionKind, entry: VaultEntry) {
    setFolderContextMenu(null);
    setFolderActionDialog({
      action,
      entry,
      value:
        action === "rename"
          ? entry.name
          : action === "move-file" || action === "move-folder"
            ? parentDirectory(entry.relativePath)
            : "",
    });
  }

  function folderActionDialogTitle(action: FolderActionKind) {
    if (action === "create-note") {
      return "Create Note";
    }

    if (action === "create-folder") {
      return "Create Folder";
    }

    if (action === "move-file") {
      return "Move File";
    }

    if (action === "move-folder") {
      return "Move Folder";
    }

    if (action === "delete-file") {
      return "Delete File";
    }

    return "Rename Folder";
  }

  function folderActionDialogLabel(action: FolderActionKind) {
    if (action === "create-note") {
      return "Note name";
    }

    if (action === "move-file" || action === "move-folder") {
      return "Destination folder";
    }

    return "Folder name";
  }

  async function createNoteFromFolderMenu(entry: VaultEntry, noteName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!noteName?.trim()) {
      return;
    }

    try {
      const file = await invoke<OpenedFile>("create_note_in_directory", {
        root: vaultRoot,
        relative: entry.relativePath,
        noteName,
      });
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createFolderFromFolderMenu(entry: VaultEntry, directoryName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!directoryName?.trim()) {
      return;
    }

    try {
      const directory = await invoke<RenamedDirectory>("create_directory_in_directory", {
        root: vaultRoot,
        relative: entry.relativePath,
        directoryName,
      });

      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created folder ${directory.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameFolderFromFolderMenu(entry: VaultEntry, nextName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!nextName?.trim()) {
      return;
    }

    try {
      const renamed = await invoke<RenamedDirectory>("rename_vault_directory", {
        root: vaultRoot,
        relative: entry.relativePath,
        nextName,
      });

      applyRenamedDirectoryToOpenState(entry, renamed);
      await loadEntries(
        vaultRoot,
        rebasePathAfterDirectoryRename(currentDir, entry, renamed),
      );
      await rebuildWikiLinkIndex(vaultRoot);
      setStatus(`Renamed folder ${entry.name} to ${renamed.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveFolderFromContextMenu(entry: VaultEntry, destinationDirectory: string) {
    if (!vaultRoot || !entry.isDir) {
      return;
    }

    if (!destinationDirectory?.trim()) {
      return;
    }

    try {
      snapshotActiveTab();
      const moved = await invoke<RenamedDirectory>("move_vault_directory", {
        root: vaultRoot,
        relative: entry.relativePath,
        destinationDirectory,
      });
      const nextCurrentDir = rebasePathAfterDirectoryRename(currentDir, entry, moved);

      applyRenamedDirectoryToOpenState(entry, moved);
      await loadEntries(vaultRoot, nextCurrentDir);
      await rebuildWikiLinkIndex(vaultRoot);
      setStatus(`Moved folder ${entry.name} to ${moved.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveFileFromContextMenu(entry: VaultEntry, destinationDirectory: string) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    try {
      snapshotActiveTab();
      const moved = await invoke<OpenedFile>("move_vault_file", {
        root: vaultRoot,
        relative: entry.relativePath,
        destinationDirectory,
      });
      const movedFile = {
        name: moved.name,
        relativePath: moved.relativePath,
      };

      replaceOpenFilePath(entry.relativePath, movedFile);
      replaceFileInWikiLinkIndex(entry.relativePath, movedFile);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Moved ${entry.name} to ${moved.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteFileFromContextMenu(entry: VaultEntry) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    try {
      snapshotActiveTab();
      await invoke("delete_vault_file", {
        root: vaultRoot,
        relative: entry.relativePath,
      });

      removeDeletedFileFromOpenState(entry.relativePath);
      removeFileFromWikiLinkIndex(entry.relativePath);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Deleted ${entry.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitFolderActionDialog(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!folderActionDialog) {
      return;
    }

    const value = folderActionDialog.value.trim();

    if (
      folderActionDialog.action !== "delete-file" &&
      !isMoveAction(folderActionDialog.action) &&
      !value
    ) {
      return;
    }

    const { action, entry } = folderActionDialog;

    setFolderActionDialog(null);

    if (action === "create-note") {
      await createNoteFromFolderMenu(entry, value);
    } else if (action === "create-folder") {
      await createFolderFromFolderMenu(entry, value);
    } else if (action === "move-folder") {
      await moveFolderFromContextMenu(entry, value);
    } else if (action === "move-file") {
      await moveFileFromContextMenu(entry, value);
    } else if (action === "delete-file") {
      await deleteFileFromContextMenu(entry);
    } else {
      await renameFolderFromFolderMenu(entry, value);
    }
  }

  async function enterDirectory(relativePath: string) {
    if (!vaultRoot) {
      return;
    }

    try {
      snapshotActiveTab();
      setCurrentDir(relativePath);
      await loadEntries(vaultRoot, relativePath);
      persistWorkspace({ currentDir: relativePath });
      setStatus(`Browsing ${displayPath(relativePath)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function goBack() {
    if (!vaultRoot || !currentDir) {
      return;
    }

    await enterDirectory(parentDirectory(currentDir));
  }

  function cancelPendingDirectoryClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  }

  function handleVaultEntryMouseDown(entry: VaultEntry, event: ReactMouseEvent<HTMLButtonElement>) {
    if (entry.isDir && event.button !== 0) {
      suppressDirectoryClickRef.current = true;
      cancelPendingDirectoryClick();
    }
  }

  function handleDirectoryClick(entry: VaultEntry, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0 || suppressDirectoryClickRef.current) {
      suppressDirectoryClickRef.current = false;
      cancelPendingDirectoryClick();
      return;
    }

    cancelPendingDirectoryClick();
    clickTimer.current = setTimeout(() => {
      enterDirectory(entry.relativePath);
    }, 180);
  }

  function handleDirectoryDoubleClick(entry: VaultEntry) {
    cancelPendingDirectoryClick();

    openDirectoryShadow(entry.relativePath);
  }

  function resetDocument() {
    snapshotActiveTab();
    const tab = createUntitledTab();

    addTabToGroup(tab);
    hydrateDocumentTab(tab);
    persistActiveFile(null);
    setStatus("New unsaved document");
  }

  resetDocumentRef.current = resetDocument;

  function applyMarkdown() {
    const parts = splitMetaHeader(markdownDraft);

    // Source edits may include frontmatter pasted by hand. Split it back out so
    // the WYSIWYG body and metadata editor keep their separate responsibilities.
    if (parts.metaHeader) {
      setActiveMetaHeader(parts.metaHeader, parts.metaDelimiter);
    }

    setEditorBody(parts.body, false);
  }

  function appendTable() {
    if (!editor) {
      return;
    }

    setEditorBody(`${markdown.trimEnd()}\n\n${emptyTableMarkdown}`, false);
  }

  function appendColumns() {
    if (!editor) {
      return;
    }

    setEditorBody(`${markdown.trimEnd()}\n\n${emptyColumnsMarkdown}`, false);
  }

  function appendCallout() {
    if (!editor) {
      return;
    }

    setEditorBody(`${markdown.trimEnd()}\n\n${emptyCalloutMarkdown}`, false);
  }

  function insertCollapseBlock() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(emptyCollapseMarkdown, { contentType: "markdown" })
      .run();
  }

  function insertMarkdownAtCursor(content: string) {
    if (!editor || !content.trim()) {
      return;
    }

    editor.chain().focus().insertContent(content, { contentType: "markdown" }).run();
  }

  function currentSelectionText() {
    if (!editor) {
      return "";
    }

    const { state } = editor;

    return state.doc.textBetween(state.selection.from, state.selection.to, "\n", "\n");
  }

  function runWasmPluginTransform(
    pluginId: string,
    commandId: string,
    wasm: PluginWasmCommand,
    bytes: Uint8Array,
    input: string,
  ) {
    return new Promise<string>((resolve, reject) => {
      // Each command run gets a fresh worker and WASM instance. That keeps
      // plugin memory isolated and lets the timeout terminate stuck transforms.
      const worker = new Worker(new URL("./pluginWorker.ts", import.meta.url), {
        type: "module",
      });
      const requestId = `${pluginId}:${commandId}:${Date.now()}`;
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error(`Plugin ${pluginId}/${commandId} exceeded ${wasm.timeoutMs}ms`));
      }, wasm.timeoutMs);

      worker.onmessage = (event: MessageEvent<WasmPluginResponse>) => {
        if (event.data.id !== requestId) {
          return;
        }

        window.clearTimeout(timeout);
        worker.terminate();

        if (event.data.ok) {
          resolve(event.data.output);
        } else {
          reject(new Error(event.data.error));
        }
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage({
        id: requestId,
        bytes,
        input,
      });
    });
  }

  async function runPluginCommand(plugin: PluginManifest, command: PluginCommandManifest) {
    if (!editor) {
      return;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before running plugin commands");
      return;
    }

    try {
      if (command.insertMarkdown) {
        insertMarkdownAtCursor(command.insertMarkdown);
        setStatus(`Ran plugin command: ${command.title}`);
        return;
      }

      if (command.template) {
        const template = await invoke<string>("read_plugin_template", {
          root: vaultRoot,
          pluginId: plugin.id,
          template: command.template,
        });

        insertMarkdownAtCursor(template);
        setStatus(`Inserted template from ${plugin.name}`);
        return;
      }

      if (command.wasm) {
        const wasmBytes = await invoke<number[]>("read_plugin_wasm", {
          root: vaultRoot,
          pluginId: plugin.id,
          module: command.wasm.module,
        });
        const input =
          command.wasm.input === "document" ? editor.getMarkdown() : currentSelectionText();
        const output = await runWasmPluginTransform(
          plugin.id,
          command.id,
          command.wasm,
          new Uint8Array(wasmBytes),
          input,
        );

        if (command.wasm.output === "replaceDocument") {
          setEditorBody(output, false);
        } else if (command.wasm.output === "insertAtCursor") {
          // Insert-at-cursor should append after a selection rather than replace
          // it, so collapse the selection to its end before writing Markdown.
          editor.chain().focus().setTextSelection(editor.state.selection.to).run();
          insertMarkdownAtCursor(output);
        } else {
          insertMarkdownAtCursor(output);
        }

        setStatus(`Ran WASM plugin command: ${command.title}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function appendTableOfContentsBlock() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent("```toc\n```", { contentType: "markdown" })
      .run();
  }

  async function createTidbit() {
    if (!vaultRoot) {
      setStatus("Open a vault before creating a tidbit");
      return;
    }

    try {
      const relative = expandDateTemplate(tidbitSettings.pathPattern);
      const file = await invoke<OpenedFile>("create_vault_markdown_file", {
        root: vaultRoot,
        relative,
      });
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      addFileToWikiLinkIndex(file);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created tidbit ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function openRichLinkDialog() {
    if (!editor) {
      return;
    }

    setRichLinkUrlDraft("");
    setRichLinkDialogOpen(true);
  }

  async function insertRichLinkFromUrl(url: string) {
    const trimmedUrl = url.trim();

    if (!editor || !trimmedUrl) {
      return;
    }

    try {
      setRichLinkSubmitting(true);
      setStatus("Fetching rich link metadata");
      const metadata = isTauri()
        ? await invoke<RichLinkMetadata>("fetch_rich_link_metadata", { url: trimmedUrl })
        : {
            url: trimmedUrl,
            title: trimmedUrl,
            description: "",
            image: "",
            siteName: "",
          };

      setEditorBody(`${markdown.trimEnd()}\n\n${richLinkMarkdown(metadata)}`, false);
      setRichLinkDialogOpen(false);
      setRichLinkUrlDraft("");
      setStatus(`Inserted rich link ${metadata.title || metadata.url}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRichLinkSubmitting(false);
    }
  }

  const cursorInsideTable =
    !!editor &&
    (editor.isActive("table") ||
      editor.isActive("tableCell") ||
      editor.isActive("tableHeader"));
  const tableCommandPaletteCommands: CommandPaletteCommand[] = cursorInsideTable
    ? [
        {
          id: "table-add-row-after",
          title: "Add row after",
          description: "Insert a table row below the current row",
          run: () => {
            editor.chain().focus().addRowAfter().run();
          },
        },
        {
          id: "table-delete-row",
          title: "Delete row",
          description: "Remove the current table row",
          run: () => {
            editor.chain().focus().deleteRow().run();
          },
        },
        {
          id: "table-add-column-after",
          title: "Add column after",
          description: "Insert a table column to the right",
          run: () => {
            editor.chain().focus().addColumnAfter().run();
          },
        },
        {
          id: "table-delete-column",
          title: "Delete column",
          description: "Remove the current table column",
          run: () => {
            editor.chain().focus().deleteColumn().run();
          },
        },
        {
          id: "table-delete-table",
          title: "Delete table",
          description: "Remove the current table",
          run: () => {
            editor.chain().focus().deleteTable().run();
          },
        },
      ]
    : [];
  const enabledPluginIds = new Set(pluginDraft.enabled);
  // Palette entries are derived from the validated catalog but gated by the
  // unsaved draft, so enabling a plugin previews its commands before Save.
  const pluginCommandPaletteCommands: CommandPaletteCommand[] = pluginCatalog.plugins
    .filter((plugin) => enabledPluginIds.has(plugin.id))
    .flatMap((plugin) =>
      plugin.commands.map((command) => ({
        id: `plugin:${plugin.id}:${command.id}`,
        title: command.title,
        description: command.description || `${plugin.name} plugin command`,
        run: () => runPluginCommand(plugin, command),
      })),
    );
  const filteredWikiLinkFiles = wikiLinkIndex
    .filter((file) => {
      const query = wikiLinkSearchQuery.trim().toLowerCase();

      return (
        !query ||
        wikiLinkDisplayName(file).toLowerCase().includes(query) ||
        file.relativePath.toLowerCase().includes(query)
      );
    })
    .slice(0, 20);
  const selectedWikiLinkSearchIndex =
    filteredWikiLinkFiles.length > 0
      ? Math.min(wikiLinkSearchSelectedIndex, filteredWikiLinkFiles.length - 1)
      : -1;
  const selectedWikiLinkFile =
    selectedWikiLinkSearchIndex >= 0
      ? (filteredWikiLinkFiles[selectedWikiLinkSearchIndex] ?? null)
      : null;
  const commandPaletteCommands: CommandPaletteCommand[] = [
    // Table editing is contextual enough that the palette keeps it close to
    // the cursor state instead of permanently crowding the formatting toolbar.
    ...tableCommandPaletteCommands,
    {
      id: "create-tidbit",
      title: "Create Tidbit",
      description: "Create a fast note from the vault tidbit path pattern",
      run: createTidbit,
    },
    {
      id: "insert-rich-link",
      title: "Insert rich link",
      description: "Fetch a URL preview and insert a rich link card",
      run: openRichLinkDialog,
    },
    {
      id: "insert-columns",
      title: "Insert columns",
      description: "Add a two-column Markdown container",
      run: appendColumns,
    },
    {
      id: "insert-callout",
      title: "Insert callout",
      description: "Add a note callout block",
      run: appendCallout,
    },
    {
      id: "insert-collapse",
      title: "Insert collapse",
      description: "Add an expandable details block",
      run: insertCollapseBlock,
    },
    {
      id: "insert-table-of-contents",
      title: "Insert table of contents",
      description: "Add a rendered table of contents block",
      run: appendTableOfContentsBlock,
    },
    ...pluginCommandPaletteCommands,
  ];
  const normalizedCommandPaletteQuery = commandPaletteQuery.trim().toLowerCase();
  const filteredCommandPaletteCommands = normalizedCommandPaletteQuery
    ? commandPaletteCommands.filter((command) =>
        `${command.title} ${command.description}`.toLowerCase().includes(
          normalizedCommandPaletteQuery,
        ),
      )
    : commandPaletteCommands;
  const selectedCommandPaletteCommand =
    filteredCommandPaletteCommands[
      Math.min(commandPaletteSelectedIndex, filteredCommandPaletteCommands.length - 1)
    ] ?? null;

  function closeCommandPalette() {
    setCommandPaletteOpen(false);
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
  }

  function handleCommandPaletteKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandPalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandPaletteSelectedIndex((index) =>
        moveSelectableIndex(index, filteredCommandPaletteCommands.length, 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandPaletteSelectedIndex((index) =>
        moveSelectableIndex(index, filteredCommandPaletteCommands.length, -1),
      );
      return;
    }

    if (event.key === "Enter" && selectedCommandPaletteCommand) {
      event.preventDefault();
      runCommandPaletteCommand(selectedCommandPaletteCommand);
    }
  }

  async function runCommandPaletteCommand(command: CommandPaletteCommand) {
    await command.run();
    closeCommandPalette();
    setEditorFocused(true);
    if (command.id !== "insert-rich-link" && command.id !== "create-tidbit") {
      setStatus(command.title);
    }
  }

  function jumpToHeading(entry: TocEntry) {
    jumpToHeadingInEditor(editor, entry, setStatus);
  }

  function toggleDrawerItem(item: DrawerItem) {
    if (drawerItem === item) {
      setDrawerOpen((open) => !open);
      return;
    }

    setDrawerItem(item);
    setDrawerOpen(true);
  }

  function toggleVaultDrawerItem(item: VaultDrawerItem) {
    if (vaultDrawerItem === item) {
      setVaultDrawerOpen((open) => !open);
      return;
    }

    setVaultDrawerItem(item);
    setVaultDrawerOpen(true);
  }

  function vaultDrawerTitle() {
    if (vaultDrawerItem === "files") {
      return "Files";
    }

    if (vaultDrawerItem === "recent") {
      return "Recent";
    }

    return "Search";
  }

  function vaultDrawerSubtitle() {
    if (vaultDrawerItem === "files") {
      return vaultRoot || "No vault selected";
    }

    if (vaultDrawerItem === "recent") {
      return vaultRoot ? "Recently opened files" : "Open a vault";
    }

    return "Find in vault";
  }

  async function searchVault() {
    const query = searchQuery.trim();

    if (!vaultRoot || !query) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const results = await invoke<SearchResult[]>("search_vault", {
        root: vaultRoot,
        query,
        includeContent: searchMode === "content",
      });

      setSearchResults(results);
      setStatus(`Found ${results.length} result${results.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  async function openSearchResult(result: SearchResult) {
    await openFile(result.relativePath);
  }

  function workspaceWidth() {
    return workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  function totalResizeHandleWidth() {
    return (
      (vaultDrawerOpen ? workspaceResizeHandleWidth : 0) +
      (drawerOpen ? workspaceResizeHandleWidth : 0)
    );
  }

  function resizeDrawerTo(side: ResizeSide, requestedWidth: number) {
    if (side === "vault") {
      setVaultDrawerWidth(
        clampResizableDrawerWidth(
          requestedWidth,
          workspaceWidth(),
          drawerOpen ? inspectorDrawerWidth : closedDrawerWidth,
          totalResizeHandleWidth(),
        ),
      );
      return;
    }

    setInspectorDrawerWidth(
      clampResizableDrawerWidth(
        requestedWidth,
        workspaceWidth(),
        vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth,
        totalResizeHandleWidth(),
      ),
    );
  }

  function beginWorkspaceResize(side: ResizeSide, event: ReactPointerEvent<HTMLDivElement>) {
    if ((side === "vault" && !vaultDrawerOpen) || (side === "drawer" && !drawerOpen)) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startVaultWidth = vaultDrawerWidth;
    const startInspectorWidth = inspectorDrawerWidth;
    const startWorkspaceWidth = workspaceWidth();
    const startHandleWidth = totalResizeHandleWidth();
    document.body.classList.add("workspace-resizing");

    // Pointer capture on the tiny separator is brittle once the cursor leaves
    // the handle, so document-level listeners own the drag until pointerup.
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;

      if (side === "vault") {
        setVaultDrawerWidth(
          clampResizableDrawerWidth(
            startVaultWidth + delta,
            startWorkspaceWidth,
            drawerOpen ? startInspectorWidth : closedDrawerWidth,
            startHandleWidth,
          ),
        );
        return;
      }

      setInspectorDrawerWidth(
        clampResizableDrawerWidth(
          startInspectorWidth - delta,
          startWorkspaceWidth,
          vaultDrawerOpen ? startVaultWidth : closedDrawerWidth,
          startHandleWidth,
        ),
      );
    };

    const stopResize = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
      document.body.classList.remove("workspace-resizing");
      setStatus("Resized workspace drawers");
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
  }

  function handleResizeKey(side: ResizeSide, event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 24;

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    if (side === "vault") {
      resizeDrawerTo(
        "vault",
        vaultDrawerWidth + (event.key === "ArrowRight" ? step : -step),
      );
      return;
    }

    resizeDrawerTo(
      "drawer",
      inspectorDrawerWidth + (event.key === "ArrowLeft" ? step : -step),
    );
  }

  function toggleSplitEditor() {
    if (splitOpen) {
      const secondaryDirty = splitHasDirtyTabs(editorGroupsRef.current.secondary.tabs);

      if (secondaryDirty) {
        setStatus("Save secondary split tabs before closing the split");
        return;
      }

      const nextGroups = {
        ...editorGroupsRef.current,
        secondary: {
          id: "secondary" as const,
          tabs: [],
          activeTabId: "",
        },
      };

      setEditorGroupsAndRef(nextGroups);
      activeGroupIdRef.current = "primary";
      setActiveGroupId("primary");
      setSplitOpen(false);
      const primaryTab = nextGroups.primary.tabs.find(
        (tab) => tab.id === nextGroups.primary.activeTabId,
      );

      if (primaryTab) {
        hydrateDocumentTab(primaryTab, "primary");
      }
      setStatus("Closed split editor");
      return;
    }

    const secondaryTab =
      editorGroupsRef.current.secondary.tabs.find(
        (tab) => tab.id === editorGroupsRef.current.secondary.activeTabId,
      ) ?? createUntitledTab();
    const nextGroups = {
      ...editorGroupsRef.current,
      secondary: {
        id: "secondary" as const,
        tabs:
          editorGroupsRef.current.secondary.tabs.length > 0
            ? editorGroupsRef.current.secondary.tabs
            : [secondaryTab],
        activeTabId: secondaryTab.id,
      },
    };

    setEditorGroupsAndRef(nextGroups);
    setSplitOpen(true);

    if (secondaryEditor) {
      // The secondary Tiptap instance already exists even while hidden; hydrate
      // it immediately so opening the split does not show stale content.
      hydrateDocumentTab(secondaryTab, "secondary");
    }

    setStatus("Opened split editor");
  }

  function renderEditorPane(groupId: EditorGroupId, groupEditor: Editor | null) {
    const group = editorGroups[groupId];
    const groupActiveTab =
      group.tabs.find((tab) => tab.id === group.activeTabId) ?? group.tabs[0] ?? null;
    const isActiveGroup = groupId === activeGroupId;
    const panePageName = isActiveGroup ? pageName : groupActiveTab?.pageName ?? "Untitled note";
    const paneMetaHeader = isActiveGroup ? metaHeader : groupActiveTab?.metaHeader ?? "";
    const paneActiveFile = isActiveGroup ? activeFile : groupActiveTab?.activeFile ?? null;
    const frontmatterPillSettings = normalizeFrontmatterPillSettings(
      vaultSettings.frontmatterPills,
    );
    const frontmatterPills = frontmatterPillSettings.enabled
      ? frontmatterListValues(paneMetaHeader, frontmatterPillSettings.headerName)
      : [];

    // Only the active pane renders the toolbar. Toolbar actions are tied to the
    // active editor mirror; hiding inactive toolbars avoids commands landing in
    // the wrong split.
    return (
      <div
        className={isActiveGroup ? "editor-pane active-group" : "editor-pane"}
        key={groupId}
        onMouseDown={() => {
          if (!isActiveGroup) {
            activateEditorGroup(groupId);
          }
        }}
      >
        <div className="document-tabs" role="tablist" aria-label={`${groupId} open documents`}>
          {group.tabs.map((tab) => (
            <div
              className={tab.id === group.activeTabId ? "document-tab active" : "document-tab"}
              key={tab.id}
              role="tab"
              aria-selected={tab.id === group.activeTabId}
              title={tab.activeFile?.relativePath ?? tabTitle(tab)}
            >
              <button
                className="document-tab-select"
                type="button"
                onClick={() => switchToDocumentTab(tab.id, groupId)}
              >
                <span>{tabTitle(tab)}</span>
                {tab.dirty ? <em aria-label="Unsaved changes" /> : null}
              </button>
              <button
                className="document-tab-close"
                type="button"
                aria-label={`Close ${tabTitle(tab)}`}
                title={`Close ${tabTitle(tab)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeDocumentTab(tab.id, groupId);
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
        <div className="metadata-shell" aria-label="Metadata editor">
          <div className="page-name-control">
            {pageNameEditing && isActiveGroup ? (
              <input
                aria-label="Page name"
                autoFocus
                disabled={!paneActiveFile}
                value={pageName}
                onBlur={finishPageNameEdit}
                onChange={(event) => {
                  setActivePageName(event.currentTarget.value);
                  markPageNameDirty();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    if (activeFileRef.current) {
                      setActivePageName(
                        fileNameWithoutMarkdownExtension(activeFileRef.current.name),
                      );
                    }
                    setPageNameEditing(false);
                  }
                }}
              />
            ) : (
              <button
                className="page-name-display"
                disabled={!paneActiveFile}
                type="button"
                title="Double-click to rename on save"
                onDoubleClick={() => {
                  activateEditorGroup(groupId);
                  if (paneActiveFile) {
                    setPageNameEditing(true);
                  }
                }}
              >
                {panePageName || "Untitled note"}
              </button>
            )}
          </div>
          <div className="frontmatter-header">
            <button
              className={metadataOpen ? "metadata-toggle open" : "metadata-toggle"}
              type="button"
              aria-expanded={metadataOpen}
              aria-controls={`${groupId}-frontmatter-editor`}
              aria-label={metadataOpen ? "Hide frontmatter" : "Show frontmatter"}
              title={metadataOpen ? "Hide frontmatter" : "Show frontmatter"}
              onClick={() => setMetadataOpen((open) => !open)}
            />
            <span>Frontmatter</span>
            {frontmatterPills.length > 0 ? (
              <div className="frontmatter-pills" aria-label="Frontmatter list values">
                {frontmatterPills.map((value) => (
                  <span className="frontmatter-pill" key={value}>
                    {value}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {metadataOpen ? (
            <label className="metadata-control" id={`${groupId}-frontmatter-editor`}>
              <textarea
                disabled={!paneActiveFile}
                spellCheck="false"
                value={paneMetaHeader}
                onChange={(event) => {
                  activateEditorGroup(groupId);
                  setActiveMetaHeader(event.currentTarget.value);
                  if (activeFileRef.current) {
                    setActiveDocumentDirty(true);
                    setStatus(`Unsaved changes in ${activeFileRef.current.name}`);
                  }
                }}
                placeholder="title: Example&#10;tags: [note]"
              />
            </label>
          ) : null}
        </div>
        {isActiveGroup ? (
          <div className="toolbar" aria-label="Formatting toolbar">
            {toolbarActions.map((action) => (
              <button
                aria-label={action.title}
                className={action.isActive() ? "tool-button active" : "tool-button"}
                disabled={action.isEnabled ? !action.isEnabled() : false}
                key={action.title}
                onClick={() => {
                  action.run();
                  setEditorFocused(true);
                }}
                title={action.title}
                type="button"
              >
                {action.icon ? renderToolbarIcon(action.icon) : action.label}
              </button>
            ))}
          </div>
        ) : null}

        <EditorContent
          className="editor-surface markdown-rendered markdown-preview-view"
          editor={groupEditor}
        />
      </div>
    );
  }

  const workspaceStyle = {
    "--vault-width": `${vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth}px`,
    "--drawer-width": `${drawerOpen ? inspectorDrawerWidth : closedDrawerWidth}px`,
    "--vault-resizer-width": vaultDrawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
    "--drawer-resizer-width": drawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
  } as CSSProperties;

  const appShellClassName = [
    "app-shell",
    themeOptionsDraft.colorfulHeadings ? "theme-colorful-headings" : null,
    themeOptionsDraft.headingUnderlines ? "theme-heading-underlines" : null,
    themeOptionsDraft.headingAnchors ? "theme-heading-anchors" : null,
    themeOptionsDraft.richCallouts ? "theme-rich-callouts" : null,
    `callout-style-${themeCalloutDraft.style}`,
  ]
    .filter(Boolean)
    .join(" ");
  const appShellStyle = {
    "--glyphary-callout-note-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.note)}"`,
    "--glyphary-callout-info-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.info)}"`,
    "--glyphary-callout-tip-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.tip)}"`,
    "--glyphary-callout-warning-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.warning)}"`,
  } as CSSProperties;
  const settingsCardStyle = {
    transform: `translate(${settingsOffset.x}px, ${settingsOffset.y}px)`,
  } as CSSProperties;

  return (
    <main className={appShellClassName} style={appShellStyle}>
      {cssSnippetContents.map((snippet) => (
        <style data-glyphary-css-snippet={snippet.name} key={snippet.name}>
          {snippet.content}
        </style>
      ))}
      {pluginStyles.map((style) => (
        // Plugin styles are read through the backend manifest allowlist; the
        // data attributes make any injected sheet easy to identify in DevTools.
        <style
          data-glyphary-plugin={style.pluginId}
          data-glyphary-plugin-style={style.name}
          key={`${style.pluginId}:${style.name}`}
        >
          {style.content}
        </style>
      ))}
      <datalist id="code-language-options">
        {codeLanguages.map((language) => (
          <option key={language.value || "plain"} value={language.value}>
            {language.label}
          </option>
        ))}
      </datalist>
      <header className="titlebar">
        <div className="file-context">
          {!activeFile ? <span>No file open</span> : null}
          <p>{activeFile ? activeFile.relativePath : "Open a vault file to begin"}</p>
        </div>
        <div className="app-actions">
          {!hideWindowDocumentActions ? (
            <div className="file-menu">
              <button className="secondary-action" type="button">
                File
              </button>
              <div className="file-menu-popover">
                <button type="button" onClick={openVault}>
                  Open Vault...
                </button>
                <button disabled={!activeFile || !dirty} type="button" onClick={saveCurrentFile}>
                  Save
                </button>
                <button type="button" onClick={resetDocument}>
                  New
                </button>
                <button type="button" onClick={openSettings}>
                  Settings...
                </button>
              </div>
            </div>
          ) : null}
          <button
            className="secondary-action icon-action"
            disabled={!activeFile || !dirty}
            type="button"
            onClick={saveCurrentFile}
            aria-label="Save"
            title="Save"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M5 4.5h11.2L19 7.3v12.2H5z" />
              <path d="M8 4.5v5h7v-5" />
              <path d="M8 19.5v-6h8v6" />
            </svg>
          </button>
          <button
            className="secondary-action icon-action"
            type="button"
            onClick={toggleSplitEditor}
            aria-label={splitOpen ? "Unsplit editor" : "Split editor"}
            title={splitOpen ? "Unsplit Editor" : "Split Editor"}
          >
            {splitOpen ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M9 5v14" />
                <path d="m15.5 9-3 3 3 3" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M12 5v14" />
              </svg>
            )}
          </button>
          {!hideWindowDocumentActions ? (
            <button className="secondary-action" type="button" onClick={resetDocument}>
              New
            </button>
          ) : null}
          <div className="appearance-control" role="group" aria-label="App style">
            <button
              className={appearance === "auto" ? "appearance-button active" : "appearance-button"}
              type="button"
              aria-label="Auto style"
              aria-pressed={appearance === "auto"}
              title="Auto Style"
              onClick={() => setAppearance("auto")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5.5" />
                <path d="M12 6.5v11" />
                <path d="M12 3.5v1.3" />
                <path d="M12 19.2v1.3" />
                <path d="M4.8 12H3.5" />
                <path d="M20.5 12h-1.3" />
              </svg>
            </button>
            <button
              className={appearance === "light" ? "appearance-button active" : "appearance-button"}
              type="button"
              aria-label="Light style"
              aria-pressed={appearance === "light"}
              title="Light Style"
              onClick={() => setAppearance("light")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4.6" />
                <path d="M12 3v2" />
                <path d="M12 19v2" />
                <path d="M4.2 4.2 5.6 5.6" />
                <path d="m18.4 18.4 1.4 1.4" />
                <path d="M3 12h2" />
                <path d="M19 12h2" />
                <path d="m4.2 19.8 1.4-1.4" />
                <path d="m18.4 5.6 1.4-1.4" />
              </svg>
            </button>
            <button
              className={appearance === "dark" ? "appearance-button active" : "appearance-button"}
              type="button"
              aria-label="Dark style"
              aria-pressed={appearance === "dark"}
              title="Dark Style"
              onClick={() => setAppearance("dark")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M18.5 15.2A7 7 0 0 1 8.8 5.5 7.3 7.3 0 1 0 18.5 15.2Z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <section
        ref={workspaceRef}
        className={[
          "workspace with-vault",
          vaultDrawerOpen ? "vault-drawer-open" : "vault-drawer-closed",
          drawerOpen ? "drawer-open" : "drawer-closed",
        ].join(" ")}
        aria-label="Editor workspace"
        style={workspaceStyle}
      >
        <aside className="vault-pane" aria-label="Vault drawer">
          <div className="vault-rail" aria-label="Vault drawer items">
            <button
              className={vaultDrawerItem === "files" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "files"
                  ? "Close files drawer"
                  : "Open files drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "files" ? "Close Files" : "Open Files"}
              onClick={() => toggleVaultDrawerItem("files")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3.5 6.5h6.2l2 2h8.8v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
                <path d="M2.5 9.5h19" />
              </svg>
            </button>
            <button
              className={vaultDrawerItem === "search" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "search"
                  ? "Close search drawer"
                  : "Open search drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "search" ? "Close Search" : "Open Search"}
              onClick={() => toggleVaultDrawerItem("search")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="5.8" />
                <path d="m15 15 4.5 4.5" />
              </svg>
            </button>
            <button
              className={vaultDrawerItem === "recent" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "recent"
                  ? "Close recent files drawer"
                  : "Open recent files drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "recent" ? "Close Recent" : "Open Recent"}
              onClick={() => toggleVaultDrawerItem("recent")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 5.5v5h5" />
                <path d="M4.5 10.2a7.5 7.5 0 1 0 2.2-5.1" />
                <path d="M12 7.5v5l3.2 1.9" />
              </svg>
            </button>
          </div>
          {vaultDrawerOpen ? (
            <div className="vault-content">
              <div className="vault-header">
                <div>
                  <h2>{vaultDrawerTitle()}</h2>
                  <p>{vaultDrawerSubtitle()}</p>
                </div>
                <div className="vault-header-actions">
                  {vaultDrawerItem === "files" ? (
                    <button
                      className="inline-action"
                      disabled={!vaultRoot || !currentDir}
                      type="button"
                      onClick={goBack}
                    >
                      Back
                    </button>
                  ) : null}
                  <button
                    className="inline-action"
                    type="button"
                    aria-label="Close vault drawer"
                    onClick={() => setVaultDrawerOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              {vaultDrawerItem === "files" ? (
                <>
                  <div className="vault-path">{displayPath(currentDir)}</div>
                  <div className="vault-list" role="list">
                    {entries.map((entry) => (
                      <button
                        className={
                          activeFile?.relativePath === entry.relativePath
                            ? "vault-entry active"
                            : "vault-entry"
                        }
                        key={entry.relativePath}
                        onMouseDown={(event) => handleVaultEntryMouseDown(entry, event)}
                        onClick={(event) => {
                          if (entry.isDir) {
                            handleDirectoryClick(entry, event);
                          }
                        }}
                        onDoubleClick={() => {
                          if (entry.isDir) {
                            handleDirectoryDoubleClick(entry);
                          } else {
                            openFile(entry.relativePath);
                          }
                        }}
                        onContextMenu={(event) => handleFolderContextMenu(entry, event)}
                        type="button"
                      >
                        {entry.isDir ? (
                          <FolderIcon />
                        ) : (
                          <svg
                            aria-hidden="true"
                            className="vault-entry-icon markdown-icon"
                            viewBox="0 0 32 32"
                          >
                            <path
                              className="document-page"
                              d="M8.5 3.8h10.9l4.1 4.2v20.2h-15z"
                            />
                            <path className="document-fold" d="M19.2 3.9v4.4h4.2z" />
                            <path className="document-line" d="M11.3 11.8h9.3" />
                            <path className="document-line" d="M11.3 14.7h9.3" />
                            <rect className="markdown-badge" x="9.9" y="18.3" width="12.2" height="6.1" rx="1.8" />
                            <text x="16" y="22.8" textAnchor="middle">
                              md
                            </text>
                          </svg>
                        )}
                        <strong>{entry.name}</strong>
                      </button>
                    ))}
                    {vaultRoot && entries.length === 0 ? (
                      <p className="empty-vault">This directory is empty.</p>
                    ) : null}
                  </div>
                </>
              ) : vaultDrawerItem === "recent" ? (
                <div className="vault-list recent-list" role="list" aria-label="Recently opened files">
                  {recentFiles.map((file) => (
                    <button
                      className={
                        activeFile?.relativePath === file.relativePath
                          ? "vault-entry recent-entry active"
                          : "vault-entry recent-entry"
                      }
                      key={file.relativePath}
                      type="button"
                      onClick={() => openFile(file.relativePath)}
                    >
                      <svg
                        aria-hidden="true"
                        className="vault-entry-icon markdown-icon"
                        viewBox="0 0 32 32"
                      >
                        <path
                          className="document-page"
                          d="M8.5 3.8h10.9l4.1 4.2v20.2h-15z"
                        />
                        <path className="document-fold" d="M19.2 3.9v4.4h4.2z" />
                        <path className="document-line" d="M11.3 11.8h9.3" />
                        <path className="document-line" d="M11.3 14.7h9.3" />
                        <rect className="markdown-badge" x="9.9" y="18.3" width="12.2" height="6.1" rx="1.8" />
                        <text x="16" y="22.8" textAnchor="middle">
                          md
                        </text>
                      </svg>
                      <span className="recent-entry-text">
                        <strong>{file.name}</strong>
                        <em>{file.relativePath}</em>
                      </span>
                    </button>
                  ))}
                  {vaultRoot && recentFiles.length === 0 ? (
                    <p className="empty-vault">No recently opened files yet.</p>
                  ) : null}
                  {!vaultRoot ? (
                    <p className="empty-vault">Open a vault to track recent files.</p>
                  ) : null}
                </div>
              ) : (
                <div className="vault-search" role="search">
                  <label>
                    <span>Search</span>
                    <input
                      disabled={!vaultRoot}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          searchVault();
                        }
                      }}
                      placeholder="Find in vault"
                    />
                  </label>
                  <div className="search-options" aria-label="Search mode">
                    <button
                      className={searchMode === "filename" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setSearchMode("filename")}
                    >
                      Names
                    </button>
                    <button
                      className={searchMode === "content" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setSearchMode("content")}
                    >
                      Content
                    </button>
                    <button
                      disabled={!vaultRoot || !searchQuery.trim() || searching}
                      type="button"
                      onClick={searchVault}
                    >
                      {searching ? "..." : "Go"}
                    </button>
                  </div>
                  {searchResults.length > 0 ? (
                    <div className="search-results" role="list" aria-label="Search results">
                      {searchResults.map((result, index) => (
                        <button
                          key={`${result.relativePath}-${result.lineNumber ?? "name"}-${index}`}
                          type="button"
                          onClick={() => openSearchResult(result)}
                        >
                          <strong>{result.relativePath}</strong>
                          <span>
                            {result.isContentMatch && result.lineNumber
                              ? `Line ${result.lineNumber}`
                              : "Filename"}
                          </span>
                          {result.lineText ? <em>{result.lineText}</em> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <div
          className={vaultDrawerOpen ? "workspace-resizer vault-resizer" : "workspace-resizer hidden"}
          role="separator"
          aria-label="Resize vault drawer"
          aria-orientation="vertical"
          aria-valuemin={minResizableDrawerWidth}
          aria-valuemax={Math.max(
            minResizableDrawerWidth,
            workspaceWidth() -
              (drawerOpen ? inspectorDrawerWidth : closedDrawerWidth) -
              totalResizeHandleWidth() -
              minEditorWorkspaceWidth,
          )}
          aria-valuenow={vaultDrawerWidth}
          tabIndex={vaultDrawerOpen ? 0 : -1}
          onKeyDown={(event) => handleResizeKey("vault", event)}
          onPointerDown={(event) => beginWorkspaceResize("vault", event)}
        />

        <div className={splitOpen ? "editor-groups split" : "editor-groups"}>
          {renderEditorPane("primary", primaryEditor)}
          {splitOpen ? renderEditorPane("secondary", secondaryEditor) : null}
        </div>

        <div
          className={drawerOpen ? "workspace-resizer drawer-resizer" : "workspace-resizer hidden"}
          role="separator"
          aria-label="Resize inspector drawer"
          aria-orientation="vertical"
          aria-valuemin={minResizableDrawerWidth}
          aria-valuemax={Math.max(
            minResizableDrawerWidth,
            workspaceWidth() -
              (vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth) -
              totalResizeHandleWidth() -
              minEditorWorkspaceWidth,
          )}
          aria-valuenow={inspectorDrawerWidth}
          tabIndex={drawerOpen ? 0 : -1}
          onKeyDown={(event) => handleResizeKey("drawer", event)}
          onPointerDown={(event) => beginWorkspaceResize("drawer", event)}
        />

        <aside className="drawer-pane" aria-label="Inspector drawer">
          <div className="drawer-rail" aria-label="Drawer items">
            <button
              className={drawerItem === "source" && drawerOpen ? "drawer-tab active" : "drawer-tab"}
              type="button"
              aria-label={
                drawerOpen && drawerItem === "source"
                  ? "Close source drawer"
                  : "Open source drawer"
              }
              title={drawerOpen && drawerItem === "source" ? "Close Source" : "Open Source"}
              onClick={() => toggleDrawerItem("source")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m8.5 8-4 4 4 4" />
                <path d="m15.5 8 4 4-4 4" />
                <path d="m13 5.5-2 13" />
              </svg>
            </button>
            <button
              className={drawerItem === "toc" && drawerOpen ? "drawer-tab active" : "drawer-tab"}
              type="button"
              aria-label={
                drawerOpen && drawerItem === "toc"
                  ? "Close table of contents drawer"
                  : "Open table of contents drawer"
              }
              title={drawerOpen && drawerItem === "toc" ? "Close TOC" : "Open TOC"}
              onClick={() => toggleDrawerItem("toc")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 6.5h11" />
                <path d="M9 12h11" />
                <path d="M9 17.5h11" />
                <circle cx="4.5" cy="6.5" r="1.1" />
                <circle cx="4.5" cy="12" r="1.1" />
                <circle cx="4.5" cy="17.5" r="1.1" />
              </svg>
            </button>
            <button
              className={drawerItem === "calendar" && drawerOpen ? "drawer-tab active" : "drawer-tab"}
              type="button"
              aria-label={
                drawerOpen && drawerItem === "calendar"
                  ? "Close calendar drawer"
                  : "Open calendar drawer"
              }
              title={drawerOpen && drawerItem === "calendar" ? "Close Calendar" : "Open Calendar"}
              onClick={() => toggleDrawerItem("calendar")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="5.5" width="16" height="15" rx="2" />
                <path d="M8 3.5v4" />
                <path d="M16 3.5v4" />
                <path d="M4 10h16" />
                <path d="M8 14h.1" />
                <path d="M12 14h.1" />
                <path d="M16 14h.1" />
                <path d="M8 17h.1" />
                <path d="M12 17h.1" />
              </svg>
            </button>
          </div>
          {drawerOpen ? (
            <div className="drawer-content">
              <div className="drawer-header">
                <div>
                  <h2>
                    {drawerItem === "source"
                      ? "Source"
                      : drawerItem === "toc"
                        ? "Contents"
                        : "Calendar"}
                  </h2>
                  <span>
                    {drawerItem === "source"
                      ? "Markdown source and export"
                      : drawerItem === "toc"
                        ? "Current document headings"
                        : "Monthly calendar notes"}
                  </span>
                </div>
                <button
                  className="inline-action"
                  type="button"
                  aria-label="Close drawer"
                  onClick={() => setDrawerOpen(false)}
                >
                  Close
                </button>
              </div>
              {drawerItem === "source" ? (
                <div className="drawer-panel source-panel">
                  <div className="markdown-import">
                    <div className="pane-header compact">
                      <h2>Source</h2>
                      <button className="inline-action" type="button" onClick={applyMarkdown}>
                        Apply
                      </button>
                    </div>
                    <textarea
                      aria-label="Markdown source"
                      value={markdownDraft}
                      onChange={(event) => {
                        const nextDraft = event.currentTarget.value;

                        setMarkdownDraft(nextDraft);
                        updateActiveTab({
                          markdownDraft: nextDraft,
                          dirty: true,
                        });
                        setActiveDocumentDirty(true);
                        setStatus(
                          activeFileRef.current
                            ? `Unsaved changes in ${activeFileRef.current.name}`
                            : "Unsaved changes in untitled note",
                        );
                      }}
                      spellCheck="false"
                    />
                  </div>
                  <div className="markdown-export">
                    <div className="pane-header">
                      <h2>Export</h2>
                      <span>
                        {dirty ? "Unsaved / " : ""}
                        {stats.words} words / {stats.characters} chars
                      </span>
                    </div>
                    <pre>{markdown}</pre>
                  </div>
                </div>
              ) : drawerItem === "toc" ? (
                <div className="drawer-panel toc-panel">
                  {tableOfContents.length > 0 ? (
                    <div className="toc-list" role="list" aria-label="Table of contents">
                      {tableOfContents.map((entry) => (
                        <button
                          className={`toc-entry level-${entry.level}`}
                          key={entry.id}
                          type="button"
                          onClick={() => jumpToHeading(entry)}
                        >
                          <span>H{entry.level}</span>
                          <strong>{entry.title}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-toc">No headings in this document.</p>
                  )}
                </div>
              ) : (
                <div className="drawer-panel calendar-panel">
                  <div className="calendar-toolbar">
                    <button
                      className="inline-action"
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1),
                        )
                      }
                    >
                      Prev
                    </button>
                    <strong>{monthTitle(calendarMonth)}</strong>
                    <button
                      className="inline-action"
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                  <div
                    className="calendar-grid"
                    key={`${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}`}
                    role="grid"
                    aria-label={monthTitle(calendarMonth)}
                  >
                    {weekdayLabels.map((weekday) => (
                      <span className="calendar-weekday" key={weekday}>
                        {weekday}
                      </span>
                    ))}
                    {calendarDays.map((date) => {
                      const inMonth = date.getMonth() === calendarMonth.getMonth();
                      const today = sameCalendarDate(date, new Date());
                      const hasNote = calendarNoteDateKeySet.has(calendarDateKey(date));

                      return (
                        <button
                          className={[
                            "calendar-day",
                            inMonth ? "" : "outside-month",
                            today ? "today" : "",
                            hasNote ? "has-note" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={date.toISOString()}
                          type="button"
                          onDoubleClick={() => openCalendarDay(date)}
                          title={`Double-click to open ${calendarDayTitle(date)}`}
                        >
                          <span>{date.getDate()}</span>
                          {hasNote ? <i aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </section>
      {settingsOpen ? (
        <div className="settings-screen" role="dialog" aria-modal="true" aria-label="Settings">
          <div className="settings-card" style={settingsCardStyle}>
            <div
              className={settingsDragging ? "settings-header dragging" : "settings-header"}
              onPointerCancel={stopSettingsDrag}
              onPointerDown={startSettingsDrag}
              onPointerMove={moveSettingsDrag}
              onPointerUp={stopSettingsDrag}
            >
              <div>
                <h2>Settings</h2>
                <span>{vaultRoot ? "Current vault" : "No vault open"}</span>
              </div>
              <button
                className="inline-action"
                type="button"
                aria-label="Close settings"
                onClick={closeSettings}
              >
                Close
              </button>
            </div>
            <div className="settings-panel">
              <div className="settings-tabs" role="tablist" aria-label="Settings groups">
                <button
                  className={settingsTab === "main" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "main"}
                  onClick={() => setSettingsTab("main")}
                >
                  Main
                </button>
                <button
                  className={settingsTab === "appearance" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "appearance"}
                  onClick={() => setSettingsTab("appearance")}
                >
                  Appearance
                </button>
                <button
                  className={settingsTab === "plugins" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "plugins"}
                  onClick={() => setSettingsTab("plugins")}
                >
                  Plugins
                </button>
              </div>
              {settingsTab === "main" ? (
                <div className="settings-tab-panel" role="tabpanel" aria-label="Main settings">
                  <section className="settings-section" aria-label="Vault settings">
                    <h3>Vault</h3>
                    <label>
                      <span>Asset directory</span>
                      <input
                        disabled={!vaultRoot}
                        value={settingsDraft}
                        onChange={(event) => setSettingsDraft(event.currentTarget.value)}
                        placeholder={defaultVaultAssetDirectory}
                      />
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={fileDisplayDraft.showDotfiles}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) =>
                          setFileDisplayDraft({
                            showDotfiles: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Show dotfiles and dot folders</span>
                    </label>
                    <label>
                      <span>Tidbit path pattern</span>
                      <input
                        disabled={!vaultRoot}
                        value={tidbitDraft.pathPattern}
                        onChange={(event) =>
                          setTidbitDraft({
                            pathPattern: event.currentTarget.value,
                          })
                        }
                        placeholder={defaultTidbitPathPattern}
                      />
                    </label>
                  </section>
                  <section className="settings-section" aria-label="Metadata settings">
                    <div className="settings-section-header">
                      <div>
                        <h3>Metadata</h3>
                        <p>Choose whether a frontmatter list is shown as pills above the editor.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={frontmatterPillDraft.enabled}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;

                          setFrontmatterPillDraft((settings) => ({
                            ...settings,
                            enabled,
                          }));
                        }}
                      />
                      <span>Show frontmatter pills</span>
                    </label>
                    <label>
                      <span>Pill header name</span>
                      <input
                        disabled={!vaultRoot || !frontmatterPillDraft.enabled}
                        value={frontmatterPillDraft.headerName}
                        onChange={(event) => {
                          const headerName = event.currentTarget.value;

                          setFrontmatterPillDraft((settings) => ({
                            ...settings,
                            headerName,
                          }));
                        }}
                        placeholder={defaultFrontmatterPillHeader}
                      />
                    </label>
                  </section>
                  <section className="settings-section" aria-label="Editor settings">
                    <div className="settings-section-header">
                      <div>
                        <h3>Editor</h3>
                        <p>Choose editor input behavior for this vault.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={editorBehaviorDraft.vimMode}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) =>
                          setEditorBehaviorDraft({
                            vimMode: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Use Vim keybindings</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={autosaveDraft.enabled}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) =>
                          setAutosaveDraft({
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Autosave current page once per minute</span>
                    </label>
                  </section>
                </div>
              ) : null}
              {settingsTab === "plugins" ? (
                <div className="settings-tab-panel" role="tabpanel" aria-label="Plugin settings">
                  <section className="settings-section" aria-label="Plugin settings">
                    <div className="settings-section-header">
                      <div>
                        <h3>Plugins</h3>
                        <p>Enable vault plugins discovered under .glyphary/plugins.</p>
                      </div>
                      <button
                        className="inline-action"
                        disabled={!vaultRoot}
                        type="button"
                        onClick={() => {
                          void refreshPlugins(vaultRoot, pluginDraft).catch((error) => {
                            setStatus(error instanceof Error ? error.message : String(error));
                          });
                        }}
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="plugin-list">
                      {pluginCatalog.plugins.length > 0 ? (
                        pluginCatalog.plugins.map((plugin) => {
                          const checked = pluginDraft.enabled.includes(plugin.id);

                          return (
                            <label className="settings-check-control plugin-control" key={plugin.id}>
                              <input
                                checked={checked}
                                disabled={!vaultRoot}
                                type="checkbox"
                                onChange={(event) => {
                                  const enabled = event.currentTarget.checked;
                                  const nextSettings = normalizePluginSettings({
                                    enabled: enabled
                                      ? [...pluginDraft.enabled, plugin.id]
                                      : pluginDraft.enabled.filter((id) => id !== plugin.id),
                                  });

                                  setPluginDraft(nextSettings);
                                  void refreshPlugins(vaultRoot, nextSettings).catch((error) => {
                                    setStatus(error instanceof Error ? error.message : String(error));
                                  });
                                }}
                              />
                              <span>
                                <strong>{plugin.name}</strong>
                                <small>
                                  {plugin.commands.length} command
                                  {plugin.commands.length === 1 ? "" : "s"}
                                  {plugin.styles.length > 0
                                    ? ` / ${plugin.styles.length} stylesheet${
                                        plugin.styles.length === 1 ? "" : "s"
                                      }`
                                    : ""}
                                </small>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="settings-note">No plugins found.</p>
                      )}
                    </div>
                    {pluginCatalog.errors.length > 0 ? (
                      <div className="plugin-errors">
                        {pluginCatalog.errors.map((error) => (
                          <p key={error}>{error}</p>
                        ))}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
              {settingsTab === "appearance" ? (
                <div className="settings-tab-panel" role="tabpanel" aria-label="Appearance settings">
                  <section className="settings-section" aria-label="Window appearance">
                    <div className="settings-section-header">
                      <div>
                        <h3>Window</h3>
                        <p>Choose whether the app window uses a translucent native material.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={vaultAppearanceDraft.glassEffect}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) =>
                          setVaultAppearanceDraft({
                            glassEffect: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Use glass window effect</span>
                    </label>
                  </section>
                  <section className="settings-section" aria-label="Theme templates">
                    <div className="settings-section-header">
                      <div>
                        <h3>Theme Templates</h3>
                        <p>Apply a complete color system, then refine individual tokens below.</p>
                      </div>
                    </div>
                    <div className="theme-preset-grid">
                      {themePresets.map((preset) => (
                        <button
                          className={
                            selectedThemePresetIdDraft === preset.id ||
                            sameThemeTokens(themeDraft, preset.tokens)
                              ? "theme-preset-card active"
                              : "theme-preset-card"
                          }
                          disabled={!vaultRoot}
                          key={preset.id}
                          type="button"
                          onClick={() => applyThemePreset(preset)}
                        >
                          <span className="theme-preset-swatches" aria-hidden="true">
                            <i style={{ background: preset.tokens["--glyphary-app-bg"] }} />
                            <i style={{ background: preset.tokens["--glyphary-surface"] }} />
                            <i style={{ background: preset.tokens["--glyphary-accent"] }} />
                            <i style={{ background: preset.tokens["--glyphary-code-bg"] }} />
                          </span>
                          <strong>{preset.name}</strong>
                          <small>{preset.description}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="settings-section" aria-label="CSS snippets">
                    <div className="settings-section-header">
                      <div>
                        <h3>CSS Snippets</h3>
                        <p>Load only approved .css files from a vault-relative directory.</p>
                      </div>
                      <button
                        className="inline-action"
                        disabled={!vaultRoot}
                        type="button"
                        onClick={() => {
                          void refreshCssSnippets(vaultRoot, cssSnippetDraft).catch((error) => {
                            setStatus(error instanceof Error ? error.message : String(error));
                          });
                        }}
                      >
                        Refresh
                      </button>
                    </div>
                    <label>
                      <span>Snippets directory</span>
                      <input
                        disabled={!vaultRoot}
                        value={cssSnippetDraft.directory}
                        onBlur={() => {
                          void refreshCssSnippets(vaultRoot, cssSnippetDraft).catch((error) => {
                            setStatus(error instanceof Error ? error.message : String(error));
                          });
                        }}
                        onChange={(event) => {
                          const directory = event.currentTarget.value;

                          setCssSnippetDraft((settings) => ({
                            ...settings,
                            directory,
                          }));
                        }}
                        placeholder={defaultCssSnippetDirectory}
                      />
                    </label>
                    <div className="css-snippet-list">
                      {cssSnippetFiles.length > 0 ? (
                        cssSnippetFiles.map((snippet) => {
                          const checked = cssSnippetDraft.enabled.includes(snippet.name);

                          return (
                            <label className="settings-check-control" key={snippet.name}>
                              <input
                                checked={checked}
                                disabled={!vaultRoot}
                                type="checkbox"
                                onChange={(event) => {
                                  const enabled = event.currentTarget.checked;
                                  const nextSettings = normalizeCssSnippetSettings({
                                    ...cssSnippetDraft,
                                    enabled: enabled
                                      ? [...cssSnippetDraft.enabled, snippet.name]
                                      : cssSnippetDraft.enabled.filter((name) => name !== snippet.name),
                                  });

                                  setCssSnippetDraft(nextSettings);
                                  void refreshCssSnippets(vaultRoot, nextSettings).catch((error) => {
                                    setStatus(error instanceof Error ? error.message : String(error));
                                  });
                                }}
                              />
                              <span>{snippet.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="settings-note">No CSS snippets found.</p>
                      )}
                    </div>
                  </section>
                  <section className="settings-section" aria-label="Theme options">
                    <div className="settings-section-header">
                      <div>
                        <h3>Theme Options</h3>
                        <p>Apply optional editor treatments on top of the selected theme.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={themeOptionsDraft.colorfulHeadings}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const colorfulHeadings = event.currentTarget.checked;

                          setThemeOptionsDraft((options) => ({
                            ...options,
                            colorfulHeadings,
                          }));
                        }}
                      />
                      <span>Use colorful heading levels</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={themeOptionsDraft.headingUnderlines}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const headingUnderlines = event.currentTarget.checked;

                          setThemeOptionsDraft((options) => ({
                            ...options,
                            headingUnderlines,
                          }));
                        }}
                      />
                      <span>Add heading underlines</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={themeOptionsDraft.headingAnchors}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const headingAnchors = event.currentTarget.checked;

                          setThemeOptionsDraft((options) => ({
                            ...options,
                            headingAnchors,
                          }));
                        }}
                      />
                      <span>Show heading anchor markers</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={themeOptionsDraft.richCallouts}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const richCallouts = event.currentTarget.checked;

                          setThemeOptionsDraft((options) => ({
                            ...options,
                            richCallouts,
                          }));
                        }}
                      />
                      <span>Use rich callout styling and icons</span>
                    </label>
                  </section>
                  <section className="settings-section" aria-label="Callout rendering">
                    <div className="settings-section-header">
                      <div>
                        <h3>Callout Rendering</h3>
                        <p>Choose a structured callout layout and icons for this vault theme.</p>
                      </div>
                    </div>
                    <label>
                      <span>Callout layout</span>
                      <select
                        disabled={!vaultRoot}
                        value={themeCalloutDraft.style}
                        onChange={(event) => {
                          const style = normalizeCalloutStyle(event.currentTarget.value);

                          setThemeCalloutDraft((settings) => ({
                            ...settings,
                            style,
                          }));
                        }}
                      >
                        {calloutStyleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="callout-icon-grid">
                      {calloutKinds.map((kind) => (
                        <label key={kind.value}>
                          <span>{kind.label} icon</span>
                          <select
                            disabled={!vaultRoot}
                            value={themeCalloutDraft.icons[kind.value]}
                            onChange={(event) => {
                              const icon = normalizeCalloutIcon(
                                event.currentTarget.value,
                                defaultThemeCalloutSettings.icons[kind.value],
                              );

                              setThemeCalloutDraft((settings) => ({
                                ...settings,
                                icons: {
                                  ...settings.icons,
                                  [kind.value]: icon,
                                },
                              }));
                            }}
                          >
                            {calloutIconOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </section>
                  <section className="settings-section" aria-label="Theme builder">
                    <div className="settings-section-header">
                      <div>
                        <h3>Theme Builder</h3>
                        <p>Changes preview immediately and are saved to this vault.</p>
                      </div>
                      <button
                        className="inline-action"
                        disabled={!vaultRoot || Object.keys(themeDraft).length === 0}
                        type="button"
                        onClick={resetThemeDraft}
                      >
                        Reset Theme
                      </button>
                    </div>
                    <div className="theme-builder">
                      {themeTokenGroups.map((group) => (
                        <fieldset className="theme-token-group" disabled={!vaultRoot} key={group.title}>
                          <legend>{group.title}</legend>
                          {group.controls.map((control) => (
                            <label className="theme-token-control" key={control.token}>
                              <span>{control.label}</span>
                              <div>
                                {control.kind === "value" ? (
                                  <input
                                    aria-label={control.label}
                                    type="text"
                                    value={rawThemeTokenValue(control)}
                                    placeholder={control.placeholder}
                                    onChange={(event) =>
                                      updateThemeDraftToken(control.token, event.currentTarget.value)
                                    }
                                  />
                                ) : (
                                  <input
                                    aria-label={control.label}
                                    type="color"
                                    value={themeTokenValue(control.token)}
                                    onChange={(event) =>
                                      updateThemeDraftToken(control.token, event.currentTarget.value)
                                    }
                                  />
                                )}
                                <code>{control.token}</code>
                              </div>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}
              <div className="settings-actions">
                <button
                  className="inline-action"
                  disabled={!vaultRoot || !settingsHaveChanges()}
                  type="button"
                  onClick={revertSettingsDraft}
                >
                  Revert
                </button>
                <button
                  className="inline-action"
                  disabled={!vaultRoot || !settingsHaveChanges()}
                  type="button"
                  onClick={saveVaultSettings}
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {commandPaletteOpen ? (
        <div
          className="command-palette-screen"
          role="presentation"
          onMouseDown={closeCommandPalette}
        >
          <div
            className="command-palette-card"
            role="dialog"
            aria-modal="true"
            aria-label="Quick command"
            onKeyDown={handleCommandPaletteKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              ref={commandPaletteInputRef}
              aria-activedescendant={
                selectedCommandPaletteCommand
                  ? `command-palette-${selectedCommandPaletteCommand.id}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls="command-palette-results"
              aria-label="Quick command"
              autoComplete="off"
              placeholder="Type a command..."
              role="combobox"
              spellCheck="false"
              value={commandPaletteQuery}
              onChange={(event) => {
                setCommandPaletteQuery(event.currentTarget.value);
                setCommandPaletteSelectedIndex(0);
              }}
            />
            <div
              className="command-palette-results"
              id="command-palette-results"
              role="listbox"
              aria-label="Matching commands"
            >
              {filteredCommandPaletteCommands.length > 0 ? (
                filteredCommandPaletteCommands.map((command, index) => (
                  <button
                    className={index === commandPaletteSelectedIndex ? "active" : ""}
                    id={`command-palette-${command.id}`}
                    key={command.id}
                    role="option"
                    aria-selected={index === commandPaletteSelectedIndex}
                    type="button"
                    onClick={() => runCommandPaletteCommand(command)}
                    onMouseEnter={() => setCommandPaletteSelectedIndex(index)}
                  >
                    <span>{command.title}</span>
                    <small>{command.description}</small>
                  </button>
                ))
              ) : (
                <p>No commands found</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {wikiLinkSearchOpen ? (
        <div
          className="wikilink-search-screen"
          role="presentation"
          onMouseDown={closeWikiLinkSearch}
        >
          <div
            className="wikilink-search-card"
            role="dialog"
            aria-modal="true"
            aria-label="Find page"
            onKeyDown={handleWikiLinkSearchKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              ref={wikiLinkSearchInputRef}
              aria-activedescendant={
                selectedWikiLinkFile
                  ? `wikilink-search-${selectedWikiLinkSearchIndex}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls="wikilink-search-results"
              aria-label="Find page"
              autoComplete="off"
              placeholder="Find page..."
              role="combobox"
              spellCheck="false"
              value={wikiLinkSearchQuery}
              onChange={(event) => {
                setWikiLinkSearchQuery(event.currentTarget.value);
                setWikiLinkSearchSelectedIndex(0);
              }}
            />
            <div
              className="wikilink-search-results"
              id="wikilink-search-results"
              role="listbox"
              aria-label="Matching pages"
            >
              {filteredWikiLinkFiles.length > 0 ? (
                filteredWikiLinkFiles.map((file, index) => (
                  <button
                    className={index === selectedWikiLinkSearchIndex ? "active" : ""}
                    id={`wikilink-search-${index}`}
                    key={indexedFileKey(file)}
                    type="button"
                    role="option"
                    aria-selected={index === selectedWikiLinkSearchIndex}
                    onClick={() => insertWikiLinkSelection(file)}
                    onMouseEnter={() => setWikiLinkSearchSelectedIndex(index)}
                  >
                    <span>{wikiLinkDisplayName(file)}</span>
                    <small>{file.relativePath}</small>
                  </button>
                ))
              ) : (
                <p>No matching pages</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {richLinkDialogOpen ? (
        <div
          className="rich-link-dialog-screen"
          role="presentation"
          onMouseDown={() => {
            if (!richLinkSubmitting) {
              setRichLinkDialogOpen(false);
            }
          }}
        >
          <form
            className="rich-link-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="Insert rich link"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void insertRichLinkFromUrl(richLinkUrlDraft);
            }}
          >
            <div className="rich-link-dialog-header">
              <h2>Insert Rich Link</h2>
              <span>Paste a URL to fetch a preview card.</span>
            </div>
            <label>
              <span>URL</span>
              <input
                ref={richLinkInputRef}
                disabled={richLinkSubmitting}
                inputMode="url"
                placeholder="https://example.com/article"
                spellCheck="false"
                type="url"
                value={richLinkUrlDraft}
                onChange={(event) => setRichLinkUrlDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !richLinkSubmitting) {
                    event.preventDefault();
                    setRichLinkDialogOpen(false);
                  }
                }}
              />
            </label>
            <div className="rich-link-dialog-actions">
              <button
                className="inline-action"
                disabled={richLinkSubmitting}
                type="button"
                onClick={() => setRichLinkDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="inline-action"
                disabled={richLinkSubmitting || !richLinkUrlDraft.trim()}
                type="submit"
              >
                {richLinkSubmitting ? "Fetching..." : "Insert"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {wikiLinkPicker ? (
        <div
          className="wikilink-picker"
          style={{ left: wikiLinkPicker.x, top: wikiLinkPicker.y }}
          role="menu"
          aria-label={`Choose target for ${wikiLinkPicker.target}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {wikiLinkPicker.candidates.map((file, index) => (
            <button
              className={index === wikiLinkPickerSelectedIndex ? "active" : ""}
              key={indexedFileKey(file)}
              type="button"
              role="menuitem"
              onClick={() => openWikiLinkPickerSelection(file)}
              onMouseEnter={() => setWikiLinkPickerSelectedIndex(index)}
            >
              <span>{wikiLinkDisplayName(file)}</span>
              <small>{file.relativePath}</small>
            </button>
          ))}
        </div>
      ) : null}
      {folderContextMenu ? (
        <div
          className="folder-context-menu"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
          role="menu"
          aria-label={`${folderContextMenu.entry.isDir ? "Folder" : "File"} actions for ${
            folderContextMenu.entry.name
          }`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {folderContextMenu.entry.isDir ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("create-note", folderContextMenu.entry);
                }}
              >
                Create Note
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("create-folder", folderContextMenu.entry);
                }}
              >
                Create Folder
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("rename", folderContextMenu.entry);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("move-folder", folderContextMenu.entry);
                }}
              >
                Move
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("move-file", folderContextMenu.entry);
                }}
              >
                Move
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("delete-file", folderContextMenu.entry);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      ) : null}
      {folderActionDialog ? (
        <div
          className="folder-action-dialog-screen"
          role="presentation"
          onMouseDown={() => setFolderActionDialog(null)}
        >
          <form
            className="folder-action-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label={folderActionDialogTitle(folderActionDialog.action)}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => void submitFolderActionDialog(event)}
          >
            <div className="folder-action-dialog-header">
              <h2>{folderActionDialogTitle(folderActionDialog.action)}</h2>
              <span>{folderActionDialog.entry.relativePath}</span>
            </div>
            {folderActionDialog.action === "delete-file" ? (
              <p className="folder-action-dialog-warning">
                Delete this file from the vault? This cannot be undone.
              </p>
            ) : isMoveAction(folderActionDialog.action) && vaultRoot ? (
              <VaultFolderTree
                key={`${folderActionDialog.action}:${folderActionDialog.entry.relativePath}`}
                root={vaultRoot}
                selectedPath={folderActionDialog.value}
                movingEntry={
                  folderActionDialog.action === "move-folder" ? folderActionDialog.entry : null
                }
                onStatus={setStatus}
                onSelect={(relativePath) =>
                  setFolderActionDialog((dialog) =>
                    dialog ? { ...dialog, value: relativePath } : dialog,
                  )
                }
              />
            ) : (
              <label>
                <span>{folderActionDialogLabel(folderActionDialog.action)}</span>
                <input
                  autoFocus
                  spellCheck="false"
                  value={folderActionDialog.value}
                  onChange={(event) => {
                    const value = event.currentTarget.value;

                    setFolderActionDialog((dialog) =>
                      dialog ? { ...dialog, value } : dialog,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setFolderActionDialog(null);
                    }
                  }}
                />
              </label>
            )}
            <div className="folder-action-dialog-actions">
              <button
                className="inline-action"
                type="button"
                onClick={() => setFolderActionDialog(null)}
              >
                Cancel
              </button>
              <button
                className="inline-action"
                disabled={
                  folderActionDialog.action !== "delete-file" &&
                  !isMoveAction(folderActionDialog.action) &&
                  !folderActionDialog.value.trim()
                }
                type="submit"
              >
                {folderActionDialogTitle(folderActionDialog.action)}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <footer className="statusbar" key={status}>
        {status}
      </footer>
    </main>
  );
}

export default App;
