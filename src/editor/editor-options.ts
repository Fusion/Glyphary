import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
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
import type { DocumentTab, EditorGroupId, EditorGroupState } from "../lib/app-types";
import { initialMarkdown } from "../lib/defaults";
import { createGlypharyVimMode } from "./vim-mode";
import { CodeBlockWithLanguageControl } from "./code-block-language";
import { createWikiLinkExtension, type WikiLinkResolution } from "./wikilinks";
import { createBlockBoundaryInsertionExtension } from "./block-boundary-insertion";
import {
  CommandPaletteSelectionRenderer,
  PageSearchRenderer,
} from "../search/page-search";
import {
  MermaidCodeBlockRenderer,
  TocCodeBlockRenderer,
} from "./code-block-renderers";
import {
  createCalloutExtension,
  createCollapseExtension,
  createColumnExtension,
  createColumnsExtension,
  createDelimitedMarkdownMarkExtension,
  createGalleryExtension,
  createHtmlBlockExtension,
  createKeyboardKeyExtension,
  createRichLinkExtension,
  findSingleTildeDelimiter,
} from "./markdown-extensions";
import { createExcalidrawEmbedExtension } from "../excalidraw/editor";
import { createVaultImageExtension } from "./vault-images";

// Responsibilities:
// - Build the Tiptap option object used by both editor groups.
// - Keep editor extensions and editor event handlers out of App.
// Contracts:
// - Custom Markdown block extensions are registered before Markdown.
// - App remains the owner of document state; this factory only calls provided callbacks.

const lowlight = createLowlight();

// Keep lowlight registration explicit so Markdown language names can be
// round-tripped through fenced code blocks and rendered with predictable aliases.
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
// Pseudo-languages used by Glyphary-rendered Markdown widgets.
lowlight.register("toc", plaintext);
lowlight.register("mermaid", plaintext);

export function createGlypharyEditorOptions({
  activateEditorGroup,
  getActiveFileName,
  getActiveGroupId,
  getEditorGroup,
  groupId,
  isHydrating,
  loadExcalidrawPreview,
  openExcalidrawDrawing,
  openWikiLinkSearch,
  queueImageImport,
  resolveVaultAssetSrc,
  resolveVaultImageSrc,
  resolveWikiLinkTarget,
  setDirty,
  setEditorFocused,
  setMarkdown,
  setMarkdownDraft,
  setStatus,
  syncEditorState,
  updateGroupTab,
  vimMode,
}: {
  activateEditorGroup: (groupId: EditorGroupId) => void;
  getActiveFileName: () => string | null;
  getActiveGroupId: () => EditorGroupId;
  getEditorGroup: () => EditorGroupState;
  groupId: EditorGroupId;
  isHydrating: () => boolean;
  loadExcalidrawPreview: (target: string) => Promise<string>;
  openExcalidrawDrawing: (target: string) => void;
  openWikiLinkSearch: () => void;
  queueImageImport: (files: FileList | File[] | null | undefined) => boolean;
  resolveVaultAssetSrc: (target: string) => string;
  resolveVaultImageSrc: (target: string) => string;
  resolveWikiLinkTarget: (target: string) => WikiLinkResolution;
  setDirty: (dirty: boolean) => void;
  setEditorFocused: (focused: boolean) => void;
  setMarkdown: (markdown: string) => void;
  setMarkdownDraft: (markdown: string) => void;
  setStatus: (message: string) => void;
  syncEditorState: (editor: Editor) => void;
  updateGroupTab: (groupId: EditorGroupId, tabId: string, patch: Partial<DocumentTab>) => void;
  vimMode: boolean;
}) {
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
      PageSearchRenderer,
      CommandPaletteSelectionRenderer,
      TocCodeBlockRenderer,
      MermaidCodeBlockRenderer,
      createWikiLinkExtension({
        openSearch: openWikiLinkSearch,
        resolveTarget: resolveWikiLinkTarget,
      }),
      ...(vimMode ? [createGlypharyVimMode(setStatus)] : []),
      createColumnExtension(),
      createColumnsExtension(),
      createGalleryExtension(),
      createCalloutExtension(),
      createCollapseExtension(),
      createHtmlBlockExtension(),
      createKeyboardKeyExtension(),
      createDelimitedMarkdownMarkExtension({
        name: "highlight",
        tag: "mark",
        delimiter: "==",
        start: "==",
        tokenPattern: /^==(?![=])([^=\n]+?)==(?!=)/,
      }),
      createDelimitedMarkdownMarkExtension({
        name: "superscript",
        tag: "sup",
        delimiter: "^",
        start: "^",
        tokenPattern: /^\^([^\^\n]+?)\^/,
      }),
      createDelimitedMarkdownMarkExtension({
        name: "subscript",
        tag: "sub",
        delimiter: "~",
        start: findSingleTildeDelimiter,
        tokenPattern: /^~(?!~)([^~\n]+?)~(?!~)/,
      }),
      createRichLinkExtension(),
      createExcalidrawEmbedExtension({
        openDrawing: openExcalidrawDrawing,
        loadPreview: loadExcalidrawPreview,
      }),
      // Vault images resolve late through callbacks because the same editor
      // instance can survive vault changes.
      createVaultImageExtension(resolveVaultImageSrc, resolveVaultAssetSrc),
      createBlockBoundaryInsertionExtension(),
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
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        if (!(event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v")) {
          return false;
        }

        if (!navigator.clipboard?.readText) {
          setStatus("Plain paste is not available in this webview");
          return true;
        }

        event.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              view.pasteText(text);
            }
          })
          .catch(() => setStatus("Could not read clipboard for plain paste"));

        return true;
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => {
      const group = getEditorGroup();
      const tabId = group.activeTabId;
      const tab = group.tabs.find((documentTab) => documentTab.id === tabId);

      if (!tab || tab.kind !== "markdown") {
        return;
      }

      const nextMarkdown = editor.getMarkdown();
      const isActiveGroup = getActiveGroupId() === groupId;
      const hydrating = isHydrating();

      updateGroupTab(groupId, tabId, {
        markdown: nextMarkdown,
        markdownDraft: nextMarkdown,
        dirty: hydrating ? tab.dirty : true,
      });

      if (isActiveGroup) {
        setMarkdown(nextMarkdown);
        setMarkdownDraft(nextMarkdown);
        syncEditorState(editor);
      }

      if (!hydrating) {
        // Programmatic hydration calls setContent too; only user edits should
        // dirty the tab and surface an unsaved-change status.
        if (isActiveGroup) {
          setDirty(true);
        }
        const activeFileName = getActiveFileName();

        setStatus(
          isActiveGroup && activeFileName
            ? `Unsaved changes in ${activeFileName}`
            : "Unsaved changes in untitled note",
        );
      }
    },
    onSelectionUpdate: ({ editor }: { editor: Editor }) => {
      if (getActiveGroupId() === groupId) {
        syncEditorState(editor);
      }
    },
    onFocus: ({ editor }: { editor: Editor }) => {
      activateEditorGroup(groupId);
      setEditorFocused(true);
      syncEditorState(editor);
    },
    onBlur: ({ editor }: { editor: Editor }) => {
      if (getActiveGroupId() === groupId) {
        setEditorFocused(false);
        syncEditorState(editor);
      }
    },
  };
}
