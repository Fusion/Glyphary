import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { redo, undo } from "@tiptap/pm/history";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { EditorContent, useEditor } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
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
  emptyTableMarkdown,
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
  remainingGroupAfterSplitPaneClose,
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
  { label: "Table of contents", value: "toc" },
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

type ToolbarAction = {
  label: string;
  title: string;
  isActive: () => boolean;
  isEnabled?: () => boolean;
  run: () => void;
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
    meditVimMode?: { state?: { mode?: string } };
  };

  return storage.meditVimMode?.state?.mode === "normal";
}

function setVimMode(editor: Editor, mode: "insert" | "normal") {
  const storage = editor.storage as unknown as {
    meditVimMode?: { state?: { mode?: string } };
  };

  if (storage.meditVimMode?.state) {
    storage.meditVimMode.state.mode = mode;
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

function createMEditVimMode(reportStatus: (message: string) => void) {
  let pendingCommand: VimPendingCommand | null = null;
  let copyBuffer: VimCopyBuffer = { text: "", linewise: false };

  return Extension.create({
    name: "meditVimMode",

    // MEdit owns Vim handling locally instead of delegating to an external
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
          key: new PluginKey("meditVimMode"),
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

type SavedAsset = {
  fileName: string;
  relativePath: string;
};

type VaultThemeSettings = {
  tokens: Record<string, string>;
};

type FrontmatterPillSettings = {
  enabled: boolean;
  headerName: string;
};

type EditorBehaviorSettings = {
  vimMode: boolean;
};

type VaultSettings = {
  assetDirectory: string;
  frontmatterPills?: FrontmatterPillSettings | null;
  editor?: EditorBehaviorSettings | null;
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

type SearchMode = "filename" | "content";
type AppearanceMode = "auto" | "light" | "dark";
type SettingsTab = "main" | "appearance";
type DrawerItem = "source" | "toc" | "calendar";
type VaultDrawerItem = "files" | "search";
type ResizeSide = "vault" | "drawer";

type PersistedWorkspace = {
  vaultRoot: string;
  currentDir: string;
  activeFile: ActiveFile | null;
};

type ThemeTokenControl = {
  label: string;
  token: string;
};

type ThemeTokenGroup = {
  title: string;
  controls: ThemeTokenControl[];
};

const workspaceStorageKey = "medit.workspace";
const appearanceStorageKey = "medit.appearance";
const closedDrawerWidth = 48;
const workspaceResizeHandleWidth = 10;
const defaultFrontmatterPillSettings: FrontmatterPillSettings = {
  enabled: true,
  headerName: defaultFrontmatterPillHeader,
};
const defaultEditorBehaviorSettings: EditorBehaviorSettings = {
  vimMode: false,
};

// The theme builder deliberately exposes only stable MEdit variables. Vault
// settings persist these tokens directly, while CSS maps them onto Obsidian-like
// names for future theme compatibility.
const themeTokenGroups: ThemeTokenGroup[] = [
  {
    title: "Canvas",
    controls: [
      { label: "App background", token: "--medit-app-bg" },
      { label: "Surface", token: "--medit-surface" },
      { label: "Muted surface", token: "--medit-surface-muted" },
      { label: "Hover", token: "--medit-hover" },
      { label: "Selection", token: "--medit-selection" },
    ],
  },
  {
    title: "Text",
    controls: [
      { label: "Text", token: "--medit-text" },
      { label: "Soft text", token: "--medit-text-soft" },
      { label: "Editor text", token: "--medit-editor-text" },
      { label: "Heading", token: "--medit-heading" },
      { label: "Muted text", token: "--medit-muted" },
      { label: "Strong muted text", token: "--medit-muted-strong" },
      { label: "Mono text", token: "--medit-mono-text" },
    ],
  },
  {
    title: "Accent And Borders",
    controls: [
      { label: "Accent", token: "--medit-accent" },
      { label: "Accent text", token: "--medit-accent-text" },
      { label: "Focus", token: "--medit-focus" },
      { label: "Border", token: "--medit-border" },
      { label: "Soft border", token: "--medit-border-soft" },
      { label: "Strong border", token: "--medit-border-strong" },
      { label: "Table border", token: "--medit-table-border" },
    ],
  },
  {
    title: "Blocks",
    controls: [
      { label: "Code background", token: "--medit-code-bg" },
      { label: "Code text", token: "--medit-code-text" },
      { label: "Quote border", token: "--medit-quote-border" },
      { label: "Quote text", token: "--medit-quote-text" },
    ],
  },
  {
    title: "Syntax",
    controls: [
      { label: "Blue", token: "--syntax-blue" },
      { label: "Green", token: "--syntax-green" },
      { label: "Yellow", token: "--syntax-yellow" },
      { label: "Muted", token: "--syntax-muted" },
    ],
  },
];

const editableThemeTokens = new Set(
  themeTokenGroups.flatMap((group) => group.controls.map((control) => control.token)),
);

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

    // Ignore unknown CSS variables from .medit so imported or hand-edited
    // settings cannot unexpectedly restyle arbitrary parts of the app.
    if (editableThemeTokens.has(token) && cleanValue) {
      normalized[token] = cleanValue;
    }
  }

  return normalized;
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
  const [codeBlockActive, setCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [editorStateVersion, setEditorStateVersion] = useState(0);
  const [vaultRoot, setVaultRoot] = useState("");
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
    frontmatterPills: defaultFrontmatterPillSettings,
    editor: defaultEditorBehaviorSettings,
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
  const [themeDraft, setThemeDraft] = useState<Record<string, string>>({});
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("filename");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No vault open");
  const hideWindowDocumentActions = isMacOsPlatform(
    window.navigator.platform,
    window.navigator.userAgent,
  );
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFileRef = useRef<ActiveFile | null>(null);
  const editorGroupsRef = useRef<Record<EditorGroupId, EditorGroupState>>(editorGroups);
  const activeGroupIdRef = useRef<EditorGroupId>("primary");
  const workspaceRef = useRef<HTMLElement | null>(null);
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
  const vaultRootRef = useRef("");
  const vaultSettingsRef = useRef<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
    frontmatterPills: defaultFrontmatterPillSettings,
    editor: defaultEditorBehaviorSettings,
    theme: null,
  });
  // Track only properties we applied from the theme builder so switching vaults
  // or resetting a theme can remove stale inline CSS variables.
  const appliedThemeTokensRef = useRef<Set<string>>(new Set());
  const restoredWorkspace = useRef(false);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

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
    return () => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
      }
    };
  }, []);

  function syncEditorState(nextEditor: Editor) {
    if (!isEditorReady(nextEditor)) {
      return;
    }

    setCodeBlockActive(nextEditor.isActive("codeBlock"));
    setCodeLanguage(nextEditor.getAttributes("codeBlock").language ?? "");
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

  function updateThemeDraftToken(token: string, value: string) {
    setThemeDraft((tokens) => ({
      ...tokens,
      [token]: value,
    }));
  }

  function savedThemeTokens() {
    return normalizeThemeTokens(vaultSettings.theme?.tokens);
  }

  function savedFrontmatterPillSettings() {
    return normalizeFrontmatterPillSettings(vaultSettings.frontmatterPills);
  }

  function savedEditorBehaviorSettings() {
    return normalizeEditorBehaviorSettings(vaultSettings.editor);
  }

  function settingsHaveChanges() {
    return (
      settingsDraft !== vaultSettings.assetDirectory ||
      !sameFrontmatterPillSettings(frontmatterPillDraft, savedFrontmatterPillSettings()) ||
      !sameEditorBehaviorSettings(editorBehaviorDraft, savedEditorBehaviorSettings()) ||
      !sameThemeTokens(themeDraft, savedThemeTokens())
    );
  }

  function resetThemeDraft() {
    setThemeDraft({});
    setStatus("Reset theme preview");
  }

  function revertSettingsDraft() {
    setSettingsDraft(vaultSettings.assetDirectory);
    setFrontmatterPillDraft(savedFrontmatterPillSettings());
    setEditorBehaviorDraft(savedEditorBehaviorSettings());
    setThemeDraft(savedThemeTokens());
    setStatus("Reverted settings preview");
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
      persistWorkspace({ activeFile: tab.activeFile });
      setStatus(`Switched to ${tab.activeFile.relativePath}`);
    } else {
      persistWorkspace({ activeFile: null });
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
      persistWorkspace({ activeFile: promotedGroup.activeTab.activeFile });
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
    persistWorkspace({ activeFile: nextTab.activeFile });
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
        CodeBlockLowlight.configure({
          lowlight,
        }),
        TocCodeBlockRenderer,
        ...(editorBehavior.vimMode ? [createMEditVimMode(setStatus)] : []),
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
        await loadVaultSettings(workspace.vaultRoot);
        setCurrentDir(workspace.currentDir);
        setSearchQuery("");
        setSearchResults([]);
        await loadEntries(workspace.vaultRoot, workspace.currentDir);

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
        title: "Bullet list",
        isActive: () => editorFocused && editor.isActive("bulletList"),
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        label: "OL",
        title: "Ordered list",
        isActive: () => editorFocused && editor.isActive("orderedList"),
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Quote",
        title: "Blockquote",
        isActive: () => editorFocused && editor.isActive("blockquote"),
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        label: "Code",
        title: "Code block",
        isActive: () => editorFocused && editor.isActive("codeBlock"),
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        label: "Table",
        title: "Insert table",
        isActive: () => false,
        run: () => appendTable(),
      },
      {
        label: "+ Row",
        title: "Add row after",
        isActive: () => false,
        isEnabled: () => editor.can().addRowAfter(),
        run: () => editor.chain().focus().addRowAfter().run(),
      },
      {
        label: "- Row",
        title: "Delete row",
        isActive: () => false,
        isEnabled: () => editor.can().deleteRow(),
        run: () => editor.chain().focus().deleteRow().run(),
      },
      {
        label: "+ Col",
        title: "Add column after",
        isActive: () => false,
        isEnabled: () => editor.can().addColumnAfter(),
        run: () => editor.chain().focus().addColumnAfter().run(),
      },
      {
        label: "- Col",
        title: "Delete column",
        isActive: () => false,
        isEnabled: () => editor.can().deleteColumn(),
        run: () => editor.chain().focus().deleteColumn().run(),
      },
      {
        label: "Drop Table",
        title: "Delete table",
        isActive: () => false,
        isEnabled: () => editor.can().deleteTable(),
        run: () => editor.chain().focus().deleteTable().run(),
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
    if (!pageNameRef.current.trim() && activeFileRef.current) {
      setActivePageName(fileNameWithoutMarkdownExtension(activeFileRef.current.name));
    }

    setPageNameEditing(false);
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
    });
  }

  async function loadEntries(root: string, relative: string) {
    const nextEntries = await invoke<VaultEntry[]>("list_vault_dir", {
      root,
      relative,
    });

    setEntries(nextEntries);
  }

  async function loadVaultSettings(root: string) {
    const settings = isTauri()
      ? await invoke<VaultSettings>("read_vault_settings", { root })
      : {
          assetDirectory: defaultVaultAssetDirectory,
          frontmatterPills: defaultFrontmatterPillSettings,
          editor: defaultEditorBehaviorSettings,
          theme: null,
        };
    const themeTokens = normalizeThemeTokens(settings.theme?.tokens);
    const frontmatterPills = normalizeFrontmatterPillSettings(settings.frontmatterPills);
    const editorSettings = normalizeEditorBehaviorSettings(settings.editor);

    const normalizedSettings = {
      ...settings,
      frontmatterPills,
      editor: editorSettings,
    };

    vaultSettingsRef.current = normalizedSettings;
    setVaultSettings(normalizedSettings);
    setSettingsDraft(settings.assetDirectory);
    setFrontmatterPillDraft(frontmatterPills);
    setEditorBehaviorDraft(editorSettings);
    setEditorBehavior(editorSettings);
    setThemeDraft(themeTokens);

    if (isTauri()) {
      // Tauri's asset protocol is deny-by-default. Re-allow the configured
      // asset directory whenever a vault is opened or settings change.
      await invoke("allow_vault_assets", {
        root,
        assetDirectory: settings.assetDirectory,
      });
    }

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
          editor: normalizeEditorBehaviorSettings(editorBehaviorDraft),
          theme: Object.keys(normalizeThemeTokens(themeDraft)).length > 0
            ? { tokens: normalizeThemeTokens(themeDraft) }
            : null,
        },
      });
      const themeTokens = normalizeThemeTokens(settings.theme?.tokens);
      const frontmatterPills = normalizeFrontmatterPillSettings(settings.frontmatterPills);
      const editorSettings = normalizeEditorBehaviorSettings(settings.editor);
      const normalizedSettings = {
        ...settings,
        frontmatterPills,
        editor: editorSettings,
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
      setThemeDraft(themeTokens);
      await invoke("allow_vault_assets", {
        root: vaultRoot,
        assetDirectory: settings.assetDirectory,
      });
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
      persistWorkspace({ activeFile: file });
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
      await loadVaultSettings(selected);
      setCurrentDir("");
      const tab = createUntitledTab();

      replaceEditorGroupsWithPrimaryTab(tab);
      hydrateDocumentTab(tab, "primary");
      setSearchQuery("");
      setSearchResults([]);
      await loadEntries(selected, "");
      persistWorkspace({
        vaultRoot: selected,
        currentDir: "",
        activeFile: null,
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

    window.addEventListener("keydown", handleGlobalSaveShortcut);

    return () => {
      window.removeEventListener("keydown", handleGlobalSaveShortcut);
    };
  }, []);

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

    listen("settings-requested", () => {
      setSettingsOpen(true);
    })
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
        persistWorkspace({
          activeFile: existing.tab.activeFile,
        });
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
      persistWorkspace({
        activeFile: tab.activeFile,
      });
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
      persistWorkspace({ activeFile: existing.tab.activeFile });
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
      persistWorkspace({ activeFile: tab.activeFile });
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
        persistWorkspace({
          activeFile: existing.tab.activeFile,
        });
        setStatus(
          `Switched to ${existing.tab.activeFile?.relativePath ?? tabTitle(existing.tab)}`,
        );
        return;
      }

      const tab = createDocumentTabFromFile(file);

      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistWorkspace({
        activeFile: tab.activeFile,
      });
      setStatus(`Opened directory note ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
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

  function handleDirectoryClick(entry: VaultEntry) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }

    clickTimer.current = setTimeout(() => {
      enterDirectory(entry.relativePath);
    }, 180);
  }

  function handleDirectoryDoubleClick(entry: VaultEntry) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }

    openDirectoryShadow(entry.relativePath);
  }

  function resetDocument() {
    snapshotActiveTab();
    const tab = createUntitledTab();

    addTabToGroup(tab);
    hydrateDocumentTab(tab);
    persistWorkspace({ activeFile: null });
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

  function updateCodeLanguage(language: string) {
    if (!editor || !editor.isActive("codeBlock")) {
      return;
    }

    editor.chain().focus().updateAttributes("codeBlock", { language }).run();
    setCodeLanguage(language);
    setEditorFocused(true);
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
                {action.label}
              </button>
            ))}
            <label className="code-language-control">
              <span>Lang</span>
              <input
                aria-label="Code block language"
                list="code-language-options"
                disabled={!codeBlockActive}
                value={codeLanguage}
                onChange={(event) => updateCodeLanguage(event.currentTarget.value)}
                placeholder="plain"
              />
              <datalist id="code-language-options">
                {codeLanguages.map((language) => (
                  <option key={language.value || "plain"} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </datalist>
            </label>
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

  return (
    <main className="app-shell">
      <header className="titlebar">
        <div className="file-context">
          <span>{activeFile ? "Editing" : "No file open"}</span>
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
                <button type="button" onClick={() => setSettingsOpen(true)}>
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
          </div>
          {vaultDrawerOpen ? (
            <div className="vault-content">
              <div className="vault-header">
                <div>
                  <h2>{vaultDrawerItem === "files" ? "Files" : "Search"}</h2>
                  <p>{vaultDrawerItem === "files" ? vaultRoot || "No vault selected" : "Find in vault"}</p>
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
                        onClick={() => {
                          if (entry.isDir) {
                            handleDirectoryClick(entry);
                          }
                        }}
                        onDoubleClick={() => {
                          if (entry.isDir) {
                            handleDirectoryDoubleClick(entry);
                          } else {
                            openFile(entry.relativePath);
                          }
                        }}
                        type="button"
                      >
                        {entry.isDir ? (
                          <svg
                            aria-hidden="true"
                            className="vault-entry-icon folder-icon"
                            viewBox="0 0 32 32"
                          >
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
                  <div className="calendar-grid" role="grid" aria-label={monthTitle(calendarMonth)}>
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
          <div className="settings-card">
            <div className="settings-header">
              <div>
                <h2>Settings</h2>
                <span>{vaultRoot ? "Current vault" : "No vault open"}</span>
              </div>
              <button
                className="inline-action"
                type="button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
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
                        onChange={(event) =>
                          setFrontmatterPillDraft((settings) => ({
                            ...settings,
                            enabled: event.currentTarget.checked,
                          }))
                        }
                      />
                      <span>Show frontmatter pills</span>
                    </label>
                    <label>
                      <span>Pill header name</span>
                      <input
                        disabled={!vaultRoot || !frontmatterPillDraft.enabled}
                        value={frontmatterPillDraft.headerName}
                        onChange={(event) =>
                          setFrontmatterPillDraft((settings) => ({
                            ...settings,
                            headerName: event.currentTarget.value,
                          }))
                        }
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
                  </section>
                </div>
              ) : (
                <div className="settings-tab-panel" role="tabpanel" aria-label="Appearance settings">
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
                                <input
                                  aria-label={control.label}
                                  type="color"
                                  value={themeTokenValue(control.token)}
                                  onChange={(event) =>
                                    updateThemeDraftToken(control.token, event.currentTarget.value)
                                  }
                                />
                                <code>{control.token}</code>
                              </div>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                  </section>
                </div>
              )}
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
      <footer className="statusbar">{status}</footer>
    </main>
  );
}

export default App;
