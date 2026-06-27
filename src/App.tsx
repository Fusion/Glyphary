import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Extension, Mark, mergeAttributes, Node } from "@tiptap/core";
import type { Editor, JSONContent, MarkdownToken, NodeViewProps } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { redo, undo } from "@tiptap/pm/history";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "tauri-plugin-macos-permissions-api";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import { GapCursor } from "@tiptap/pm/gapcursor";
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
  CanvasView,
  canvasTitle,
  isCanvasPath,
  type CanvasCommandAction,
  type CanvasCommandRequest,
} from "./CanvasView";
import {
  aiBuilderEffectiveTaskQueries,
  maxAiBuilderVaultFileChars,
  maxAiBuilderVaultFiles,
  maxAiBuilderVaultSnippetsPerFile,
  maxAiBuilderVaultTasks,
  aiBuilderPromptRequestsTaskContext,
  aiBuilderPromptRequestsVaultContext,
  aiBuilderVaultContextText,
  aiBuilderVaultQueries,
} from "./lib/ai-builder";
import {
  calendarDateKey,
  calendarDayRelativePath,
  calendarDayTitle,
  calendarPathDateKey,
  monthTitle,
  sameCalendarDate,
} from "./lib/calendar";
import {
  clampResizableDrawerWidth,
  findTabAcrossSplitGroups,
  recentFilesWithOpenedFile,
  remainingGroupAfterSplitPaneClose,
  splitHasDirtyTabs,
  tabIdForFile,
  tabsAfterClose,
} from "./lib/tabs";
import {
  cleanVaultAssetReference,
  displayPath,
  displayVaultRelativePath,
  escapeMarkdownImageText,
  escapeMarkdownUrl,
  fileNameWithoutMarkdownExtension,
  parentDirectory,
} from "./lib/paths";
import {
  defaultExcalidrawDirectory,
  defaultDrawerOpen,
  defaultFrontmatterPillHeader,
  defaultInspectorDrawerWidth,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  defaultVaultDrawerWidth,
  defaultAiBaseUrl,
  defaultTidbitGlobalShortcut,
  defaultTidbitPathPattern,
  emptyCalloutMarkdown,
  emptyCollapseMarkdown,
  emptyColumnsMarkdown,
  emptyHtmlBlockMarkdown,
  emptyTableMarkdown,
  initialMarkdown,
  minEditorWorkspaceWidth,
  minResizableDrawerWidth,
  weekdayLabels,
} from "./lib/defaults";
import {
  defaultMetaDelimiter,
  composeMarkdown,
  frontmatterScalarValue,
  frontmatterListValues,
  markdownHeadings,
  splitMetaHeader,
  type MarkdownParts,
  type TocEntry,
} from "./lib/markdown";
import {
  excalidrawFileNameForTitle,
  fileNameForDroppedImage,
  isSupportedImageFile,
} from "./lib/assets";
import { expandDateTemplate } from "./lib/dates";
import { isMacOsPlatform, isWindowsPlatform } from "./lib/platform";
import {
  defaultAutosaveSettings,
  defaultCanvasSettings,
  defaultCssSnippetDirectory,
  defaultCssSnippetSettings,
  defaultDebugSettings,
  defaultEditorBehaviorSettings,
  defaultFileDisplaySettings,
  defaultFrontmatterPillSettings,
  defaultPluginSettings,
  defaultTidbitSettings,
  defaultVaultAppearanceSettings,
  maximumGlassOpacity,
  minimumGlassOpacity,
  closedDrawerWidth,
  cssColorToHex,
  defaultAiSettings,
  defaultNewTabFile,
  isRunningOnMacOs,
  keyboardEventMatchesShortcut,
  normalizeAiSettings,
  normalizeAutosaveSettings,
  normalizeCanvasSettings,
  normalizeCssSnippetSettings,
  normalizeDebugSettings,
  normalizeEditorBehaviorSettings,
  normalizeFileDisplaySettings,
  normalizeFrontmatterPillSettings,
  normalizeNewTabFile,
  normalizePluginSettings,
  normalizeTidbitSettings,
  normalizeVaultAppearanceSettings,
  readPersistedAppearance,
  readPersistedWorkspace,
  resolveAppearance,
  sameAiSettings,
  sameAutosaveSettings,
  sameCanvasSettings,
  sameCssSnippetSettings,
  sameDebugSettings,
  sameEditorBehaviorSettings,
  sameFileDisplaySettings,
  sameFrontmatterPillSettings,
  sameNewTabFile,
  samePluginSettings,
  sameTidbitSettings,
  sameVaultAppearanceSettings,
  shortcutFromKeyboardEvent,
  workspaceResizeHandleWidth,
  writePersistedAppearance,
  writePersistedWorkspace,
} from "./lib/settings";
import { richLinkMarkdown } from "./lib/rich-links";
import { renderToolbarIcon, type ToolbarIconName } from "./toolbar-icons";
import packageJson from "../package.json";
import type {
  ActiveFile,
  AiBuilderHistoryAsset,
  AiBuilderHistoryStore,
  AiBuilderHistoryTurn,
  AiConnectionTestResponse,
  AiModelListResponse,
  AiPageBuilderAssetRequest,
  AiPageBuilderResponse,
  AiSettings,
  AiTransformResponse,
  AppearanceMode,
  AutosaveSettings,
  CalloutIconName,
  CalloutKind,
  CalloutStyle,
  CanvasSettings,
  CssSnippetContent,
  CssSnippetFile,
  CssSnippetSettings,
  DebugSettings,
  DocumentTab,
  DrawerItem,
  EditorBehaviorSettings,
  EditorGroupId,
  EditorGroupState,
  FileDisplaySettings,
  FolderActionDialogState,
  FolderActionKind,
  FolderContextMenuState,
  FrontmatterPillSettings,
  OpenedFile,
  PersistedWorkspace,
  PluginCatalog,
  PluginCommandManifest,
  PluginManifest,
  PluginSettings,
  PluginStyleContent,
  PluginWasmCommand,
  RenamedDirectory,
  ResizeSide,
  SavedAsset,
  SearchMode,
  SearchResult,
  SettingsDragState,
  SettingsTab,
  TaskFilter,
  TaskSort,
  ThemePreset,
  ThemeTokenControl,
  ThemeTokenGroup,
  TidbitSettings,
  TidbitShortcutStatus,
  VaultAppearanceSettings,
  VaultDrawerItem,
  VaultEntry,
  VaultFolderTreeNodeState,
  VaultFolderTreeProps,
  VaultIndexedFile,
  VaultSettings,
  VaultThemeCalloutSettings,
  VaultThemeOptions,
  WikiLinkPickerState,
} from "./lib/app-types";
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
const currentAppVersion = packageJson.version;
const githubReleasesApiUrl = "https://api.github.com/repos/glyphary/glyphary/releases";

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
lowlight.register("mermaid", plaintext);

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

function releaseNotificationFromGitHubRelease(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const release = value as Record<string, unknown>;
  const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
  const url = typeof release.html_url === "string" ? release.html_url : "";

  if (!tagName || !url) {
    return null;
  }

  return {
    name:
      typeof release.name === "string" && release.name.trim()
        ? release.name.trim()
        : tagName,
    notes:
      typeof release.body === "string" && release.body.trim()
        ? release.body.trim()
        : "No release notes were published for this release.",
    publishedAt: typeof release.published_at === "string" ? release.published_at : "",
    tagName,
    url,
  } satisfies ReleaseNotification;
}

function normalizedReleaseVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

const RuntimeGapCursor = GapCursor as typeof GapCursor & {
  valid: (position: ResolvedPos) => boolean;
};

function codeBlockContainsSelection(selection: Selection, position: number, nodeSize: number) {
  const contentStart = position + 1;
  const contentEnd = position + nodeSize - 1;

  return selection.from >= contentStart && selection.to <= contentEnd;
}

function ancestorDepthByName($position: ResolvedPos, nodeName: string) {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name === nodeName) {
      return depth;
    }
  }

  return null;
}

function moveGapCursorTo(view: EditorView, position: number) {
  const resolvedPosition = view.state.doc.resolve(position);

  if (!RuntimeGapCursor.valid(resolvedPosition)) {
    return false;
  }

  view.dispatch(
    view.state.tr.setSelection(new GapCursor(resolvedPosition)).scrollIntoView(),
  );

  return true;
}

function insertParagraphAtGapCursor(view: EditorView) {
  const { selection, schema } = view.state;

  if (!(selection instanceof GapCursor)) {
    return false;
  }

  const paragraph = schema.nodes.paragraph?.createAndFill();

  if (!paragraph) {
    return false;
  }

  const transaction = view.state.tr.insert(selection.from, paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc, selection.from + 1));
  view.dispatch(transaction.scrollIntoView());

  return true;
}

function insertParagraphAtPosition(view: EditorView, position: number) {
  const paragraph = view.state.schema.nodes.paragraph?.createAndFill();

  if (!paragraph) {
    return false;
  }

  const transaction = view.state.tr.insert(position, paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc, position + 1));
  view.dispatch(transaction.scrollIntoView());
  view.focus();

  return true;
}

const blockBoundaryInsertNodeNames = new Set([
  "table",
  "htmlBlock",
  "richLink",
  "excalidrawEmbed",
  "gallery",
]);

function supportsBlockBoundaryInsert(node: ProseMirrorNode) {
  // AI Builder markers are stored as hidden HTML comments so follow-up prompts
  // can replace generated regions. They are anchors, not visible widgets, so
  // they must not receive the margin + insertion controls.
  if (
    node.type.name === "htmlBlock" &&
    typeof node.attrs.rawHtml === "string" &&
    isAiBuilderMarkerComment(node.attrs.rawHtml)
  ) {
    return false;
  }

  return blockBoundaryInsertNodeNames.has(node.type.name);
}

function selectedTopLevelWidgetBlock(view: EditorView) {
  const { selection } = view.state;

  // The insertion affordance is intentionally limited to special, widget-like
  // blocks. Plain Markdown text already has natural caret positions; showing a
  // structural + there would add visual noise without solving an editing gap.
  if (selection instanceof NodeSelection && supportsBlockBoundaryInsert(selection.node)) {
    return {
      from: selection.from,
      to: selection.to,
      node: selection.node,
    };
  }

  if (selection.$from.depth === 0) {
    return null;
  }

  const node = selection.$from.node(1);

  // Table cells and custom node views can hold an inner text selection while
  // still behaving like one top-level widget for surrounding block insertion.
  // Scope controls to that containing block so only the active block gets them.
  if (!supportsBlockBoundaryInsert(node)) {
    return null;
  }

  return {
    from: selection.$from.before(1),
    to: selection.$from.after(1),
    node,
  };
}

function blockBoundaryInsertWidget(position: number, side: -1 | 1) {
  // Use a decoration instead of permanent document content. The + is a small
  // hit target for a precise boundary insertion, not a Markdown node.
  return Decoration.widget(
    position,
    (targetView, getPosition) => {
      const wrapper = document.createElement("div");
      wrapper.className = "block-boundary-insert";
      wrapper.contentEditable = "false";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "block-boundary-insert-button";
      button.setAttribute("aria-label", "Insert paragraph between blocks");
      button.title = "Insert paragraph";
      button.textContent = "+";
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentPosition = getPosition();

        if (typeof currentPosition === "number") {
          insertParagraphAtPosition(targetView, currentPosition);
        }
      });

      wrapper.append(button);

      return wrapper;
    },
    {
      key: `block-boundary-insert-${position}-${side}`,
      side,
      stopEvent: () => true,
    },
  );
}

function blockBoundaryInsertDecorations(view: EditorView) {
  const selectedBlock = selectedTopLevelWidgetBlock(view);

  if (!selectedBlock) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(view.state.doc, [
    blockBoundaryInsertWidget(selectedBlock.from, -1),
    blockBoundaryInsertWidget(selectedBlock.to, 1),
  ]);
}

function moveGapCursorAfterTableBoundary(view: EditorView) {
  const { state } = view;

  if (!state.selection.empty || !view.endOfTextblock("down")) {
    return false;
  }

  const { $head } = state.selection;
  const tableDepth = ancestorDepthByName($head, "table");
  const rowDepth = ancestorDepthByName($head, "tableRow");

  if (tableDepth === null || rowDepth === null) {
    return false;
  }

  const tableNode = $head.node(tableDepth);
  const rowIndex = $head.index(tableDepth);

  if (rowIndex !== tableNode.childCount - 1) {
    return false;
  }

  const afterTable = $head.after(tableDepth);
  const nodeAfterTable = state.doc.resolve(afterTable).nodeAfter;

  // If a normal paragraph already follows the table, native navigation has a
  // real caret destination. For adjacent block widgets, move to a gap cursor so
  // the insertion point is visible without mutating the Markdown source.
  if (!nodeAfterTable || nodeAfterTable.isTextblock) {
    return false;
  }

  return moveGapCursorTo(view, afterTable);
}

function moveGapCursorBeforeSelectedBlock(view: EditorView) {
  const { selection } = view.state;

  if (!(selection instanceof NodeSelection) || selection.node.isTextblock) {
    return false;
  }

  return moveGapCursorTo(view, selection.from);
}

function moveGapCursorAfterSelectedBlock(view: EditorView) {
  const { selection } = view.state;

  if (!(selection instanceof NodeSelection) || selection.node.isTextblock) {
    return false;
  }

  const afterSelectedBlock = selection.to;
  const nodeAfterSelectedBlock = view.state.doc.resolve(afterSelectedBlock).nodeAfter;

  if (!nodeAfterSelectedBlock || nodeAfterSelectedBlock.isTextblock) {
    return false;
  }

  return moveGapCursorTo(view, afterSelectedBlock);
}

function createBlockBoundaryInsertionExtension() {
  return Extension.create({
    name: "glypharyBlockBoundaryInsertion",
    priority: 10000,

    addKeyboardShortcuts() {
      return {
        Enter: () =>
          insertParagraphAtGapCursor(this.editor.view) ||
          moveGapCursorBeforeSelectedBlock(this.editor.view),
        ArrowDown: () =>
          moveGapCursorAfterTableBoundary(this.editor.view) ||
          moveGapCursorAfterSelectedBlock(this.editor.view),
        ArrowUp: () => moveGapCursorBeforeSelectedBlock(this.editor.view),
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("glypharyBlockBoundaryInsertAffordance"),
          props: {
            decorations: (_state) => blockBoundaryInsertDecorations(this.editor.view),
          },
        }),
      ];
    },
  });
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
                  const markup = match[1] ?? "";
                  const target = wikiLinkTargetFromMarkup(markup);

                  if (!target) {
                    continue;
                  }

                  const from = position + match.index;
                  const to = from + match[0].length;
                  const candidates = options.resolveTarget(target).candidates;
                  const stateClass =
                    candidates.length === 0
                      ? "missing"
                      : candidates.length === 1
                        ? "resolved"
                        : "ambiguous";

                  decorations.push(
                    Decoration.inline(from, to, {
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

                  if (state.selection.$from.parent !== parent) {
                    decorations.push(
                      Decoration.inline(from, from + 2, { class: "wikilink-hidden-syntax" }),
                      Decoration.inline(to - 2, to, { class: "wikilink-hidden-syntax" }),
                    );

                    const pipeIndex = markup.indexOf("|");

                    if (pipeIndex >= 0) {
                      // Obsidian-style aliases display only the alias outside
                      // the active line: [[Actual Page|Shown Text]] -> Shown Text.
                      decorations.push(
                        Decoration.inline(from + 2, from + 2 + pipeIndex + 1, {
                          class: "wikilink-hidden-syntax",
                        }),
                      );
                    }
                  }
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

type CommandPaletteCommand = {
  id: string;
  title: string;
  description: string;
  run: () => void | Promise<void>;
};

type TableContextMenuState = {
  groupId: EditorGroupId;
  x: number;
  y: number;
};

type TableColumnAlignment = "left" | "center" | "right";

type ReleaseNotification = {
  name: string;
  notes: string;
  publishedAt: string;
  tagName: string;
  url: string;
};

type PageSearchMatch = {
  from: number;
  to: number;
};

type PageSearchPluginState = {
  activeIndex: number;
  matches: PageSearchMatch[];
};

type CommandPaletteSelectionState = {
  ranges: PageSearchMatch[];
};

// The command palette is intentionally shallow at the root. Heavy command
// families live in scopes so the root stays useful for fuzzy search.
type CommandPaletteScope = "root" | "ai" | "insert" | "format" | "table";

type ExcalidrawSceneData = {
  type?: string;
  elements?: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
};

type ExcalidrawDialogState = {
  relativePath: string;
  name: string;
  initialData: ExcalidrawSceneData;
};

type ImagePreviewState = {
  src: string;
  alt: string;
};

type AiReviewState = {
  title: string;
  output: string;
  applyMode: "replace-selection" | "insert-below-selection" | "insert-at-cursor";
  aiBuilderHistoryKey?: string;
  aiBuilderTurnId?: string;
  aiBuilderReplaceTurnId?: string;
};

type AiPageBuilderAssetReviewState = {
  prompt: string;
  historyKey: string;
  replaceTurnId?: string;
  markdown: string;
  assets: AiPageBuilderAssetRequest[];
};

const aiPageBuilderMarkdownContextLimit = 12000;
const maxAiBuilderHistoryTurnsPerFile = 20;
const maxAiBuilderPromptHistoryTurns = 5;

const ExcalidrawCanvas = lazy(async () => {
  const module = await import("@excalidraw/excalidraw");

  return { default: module.Excalidraw };
});

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

const MermaidCodeBlockRenderer = Extension.create({
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

function isEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed);
}

function pageSearchMatches(targetEditor: Editor | null, query: string): PageSearchMatch[] {
  const needle = query.trim().toLowerCase();

  if (!targetEditor || !needle) {
    return [];
  }

  const chars: string[] = [];
  const positions: number[] = [];

  targetEditor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) {
      return true;
    }

    if (chars.length > 0) {
      chars.push("\n");
      positions.push(-1);
    }

    for (let index = 0; index < node.text.length; index += 1) {
      chars.push(node.text[index]);
      positions.push(position + 1 + index);
    }

    return true;
  });

  const haystack = chars.join("").toLowerCase();
  const matches: PageSearchMatch[] = [];
  let index = haystack.indexOf(needle);

  while (index >= 0) {
    const from = positions[index];
    const endPosition = positions[index + needle.length - 1];

    if (from >= 0 && endPosition >= 0) {
      matches.push({ from, to: endPosition + 1 });
    }

    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }

  return matches;
}

const pageSearchPluginKey = new PluginKey<PageSearchPluginState>("pageSearch");

const PageSearchRenderer = Extension.create({
  name: "pageSearchRenderer",

  addProseMirrorPlugins() {
    return [
      new Plugin<PageSearchPluginState>({
        key: pageSearchPluginKey,
        state: {
          init: () => ({ activeIndex: -1, matches: [] }),
          apply(transaction, previous) {
            return transaction.getMeta(pageSearchPluginKey) ?? previous;
          },
        },
        props: {
          decorations(state) {
            const search = pageSearchPluginKey.getState(state);

            if (!search || search.matches.length === 0) {
              return DecorationSet.empty;
            }

            const decorations = search.matches.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class:
                  index === search.activeIndex
                    ? "page-search-match active"
                    : "page-search-match",
              }),
            );

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const commandPaletteSelectionPluginKey = new PluginKey<CommandPaletteSelectionState>(
  "commandPaletteSelection",
);

const CommandPaletteSelectionRenderer = Extension.create({
  name: "commandPaletteSelectionRenderer",

  addProseMirrorPlugins() {
    return [
      new Plugin<CommandPaletteSelectionState>({
        key: commandPaletteSelectionPluginKey,
        state: {
          init: () => ({ ranges: [] }),
          apply(transaction, previous) {
            return transaction.getMeta(commandPaletteSelectionPluginKey) ?? previous;
          },
        },
        props: {
          decorations(state) {
            const selection = commandPaletteSelectionPluginKey.getState(state);

            if (!selection || selection.ranges.length === 0) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(
              state.doc,
              selection.ranges.map((range) =>
                Decoration.inline(range.from, range.to, {
                  class: "command-palette-preserved-selection",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

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

function VaultFileIcon({ relativePath }: { relativePath: string }) {
  return isCanvasPath(relativePath) ? <CanvasFileIcon /> : <MarkdownFileIcon />;
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

function tabTitle(tab: DocumentTab) {
  return tab.pageName || tab.activeFile?.name || "Untitled note";
}

function pageNameForFileName(name: string) {
  return isCanvasPath(name) ? canvasTitle(name) : fileNameWithoutMarkdownExtension(name);
}

function createUntitledTab(markdown = initialMarkdown): DocumentTab {
  return {
    id: `untitled:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    kind: "markdown",
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

function createEmptyEditorGroups(): Record<EditorGroupId, EditorGroupState> {
  return {
    primary: {
      id: "primary",
      tabs: [],
      activeTabId: "",
    },
    secondary: {
      id: "secondary",
      tabs: [],
      activeTabId: "",
    },
  };
}

function setEditorMarkdownContent(targetEditor: Editor, markdown: string) {
  if (markdown.trim()) {
    targetEditor.commands.setContent(markdown, { contentType: "markdown" });
    return;
  }

  // Calendar notes and newly created files are allowed to be truly empty on
  // disk. Tiptap still needs a valid ProseMirror document to render and focus,
  // so empty Markdown is hydrated as one empty paragraph without changing the
  // saved Markdown value.
  targetEditor.commands.setContent({
    type: "doc",
    content: [{ type: "paragraph" }],
  });
}

function clearEditorContent(targetEditor: Editor | null) {
  if (targetEditor) {
    setEditorMarkdownContent(targetEditor, "");
  }
}

function hasNoOpenDocumentTabs(groups: Record<EditorGroupId, EditorGroupState>) {
  return groups.primary.tabs.length === 0 && groups.secondary.tabs.length === 0;
}

function joinVaultAssetPath(root: string, assetDirectory: string, reference: string) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${assetDirectory || defaultVaultAssetDirectory}/${cleanReference}`);
}

function joinVaultImagePath(root: string, reference: string) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${defaultVaultImageDirectory}/${cleanReference}`);
}

function joinVaultRelativeImagePath(root: string, reference: string) {
  const wikilinkMatch = reference.match(/^!\[\[([^\]\n]+)\]\]$/);
  const cleanReference = cleanVaultAssetReference(wikilinkMatch?.[1] ?? reference);

  if (!root || !cleanReference) {
    return "";
  }

  if (!cleanReference.includes("/")) {
    return joinVaultImagePath(root, cleanReference);
  }

  return convertFileSrc(`${root}/${cleanReference}`);
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

const htmlBlockTags = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "pre",
  "section",
  "script",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "style",
  "textarea",
  "ul",
]);
const htmlVoidBlockTags = new Set([
  "base",
  "br",
  "col",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "track",
]);
const blockedHtmlPreviewSelector = [
  "base",
  "embed",
  "iframe",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
].join(",");

// HTML blocks are preserved as raw Markdown source but previewed through a
// conservative sanitizer. This keeps notes compatible with Markdown renderers
// that allow raw HTML without letting a synced vault execute arbitrary code.
function htmlBlockStartIndex(src: string) {
  const commentIndex = src.search(/^<!--/m);
  const tagIndex = src.search(/^<\/?[A-Za-z][\w:-]*(?:\s|>|\/>)/m);
  const indexes = [commentIndex, tagIndex].filter((index) => index >= 0);

  return indexes.length ? Math.min(...indexes) : -1;
}

function lineLength(src: string) {
  const newlineIndex = src.search(/\r?\n/);

  return newlineIndex >= 0
    ? newlineIndex + (src[newlineIndex] === "\r" ? 2 : 1)
    : src.length;
}

function trailingLineEndingLength(src: string, index: number) {
  const match = src.slice(index).match(/^[ \t]*(?:\r?\n|$)/);

  return match ? match[0].length : 0;
}

function htmlBlockMarkdownToken(src: string) {
  const commentMatch = src.match(/^<!--[\s\S]*?-->/);

  if (commentMatch) {
    const raw = src.slice(
      0,
      commentMatch[0].length + trailingLineEndingLength(src, commentMatch[0].length),
    );

    return {
      type: "htmlBlock",
      raw,
      rawHtml: raw.trimEnd(),
    };
  }

  const tagMatch = src.match(/^<([A-Za-z][\w:-]*)(?:\s[^>]*)?>/);

  if (!tagMatch) {
    return undefined;
  }

  const tagName = tagMatch[1].toLowerCase();

  if (!htmlBlockTags.has(tagName)) {
    return undefined;
  }

  const isSelfClosing = /\/>\s*$/.test(tagMatch[0]) || htmlVoidBlockTags.has(tagName);
  let rawLength = lineLength(src);

  if (!isSelfClosing) {
    const closePattern = new RegExp(`</${tagName}\\s*>`, "i");
    const closeMatch = closePattern.exec(src.slice(tagMatch[0].length));

    if (closeMatch) {
      const closeEnd = tagMatch[0].length + closeMatch.index + closeMatch[0].length;
      rawLength = closeEnd + trailingLineEndingLength(src, closeEnd);
    }
  }

  const raw = src.slice(0, rawLength);

  return {
    type: "htmlBlock",
    raw,
    rawHtml: raw.trimEnd(),
  };
}

function isAiBuilderMarkerComment(rawHtml: string) {
  return /^<!--\s*glyphary-ai-builder:(?:start|end)\s+[^>]+-->$/.test(rawHtml.trim());
}

function safeHtmlAttributeValue(name: string, value: string) {
  if (/^on/i.test(name) || name.toLowerCase() === "srcdoc") {
    return false;
  }

  if (["href", "src", "xlink:href", "formaction"].includes(name.toLowerCase())) {
    return !/^\s*(?:javascript|data|vbscript):/i.test(value);
  }

  if (name.toLowerCase() === "style") {
    return !/(?:expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|data|vbscript):)/i.test(
      value,
    );
  }

  return true;
}

function sanitizeHtmlBlock(rawHtml: string) {
  if (typeof document === "undefined") {
    return "";
  }

  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  template.content.querySelectorAll(blockedHtmlPreviewSelector).forEach((element) => {
    element.remove();
  });

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];

  while (walker.nextNode()) {
    if (walker.currentNode instanceof Element) {
      elements.push(walker.currentNode);
    }
  }

  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (!safeHtmlAttributeValue(attribute.name, attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return template.innerHTML;
}

function HtmlBlockNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const rawHtml = typeof node.attrs.rawHtml === "string" ? node.attrs.rawHtml : "";

  if (isAiBuilderMarkerComment(rawHtml)) {
    // AI Builder markers are invisible replacement anchors. Keeping them in
    // the document preserves clean follow-up replacement without displaying
    // implementation comments as editable HTML widgets.
    return (
      <NodeViewWrapper
        className="markdown-html-block markdown-html-block-hidden"
        contentEditable={false}
      />
    );
  }

  return (
    <NodeViewWrapper className="markdown-html-block" contentEditable={false}>
      <div
        className="markdown-html-preview"
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlBlock(rawHtml) }}
      />
      {selected ? (
        <label className="markdown-html-source">
          <span>HTML source</span>
          <textarea
            aria-label="HTML block source"
            onChange={(event) => updateAttributes({ rawHtml: event.currentTarget.value })}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            spellCheck={false}
            value={rawHtml}
          />
        </label>
      ) : null}
    </NodeViewWrapper>
  );
}

function createHtmlBlockExtension() {
  return Node.create({
    name: "htmlBlock",
    group: "block",
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        rawHtml: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-raw-html") || element.innerHTML,
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "div[data-glyphary-html-block]" }];
    },

    renderHTML({ node }) {
      const rawHtml = typeof node.attrs.rawHtml === "string" ? node.attrs.rawHtml : "";

      return [
        "div",
        {
          "data-glyphary-html-block": "true",
          "data-raw-html": rawHtml,
          class: "markdown-html-block",
        },
        ["div", { class: "markdown-html-preview" }, sanitizeHtmlBlock(rawHtml)],
      ];
    },

    markdownTokenName: "htmlBlock",

    markdownTokenizer: {
      name: "htmlBlock",
      level: "block",
      start: htmlBlockStartIndex,
      tokenize: htmlBlockMarkdownToken,
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const rawHtml = typeof token.rawHtml === "string" ? token.rawHtml : String(token.raw ?? "");

      if (!rawHtml.trim()) {
        return [];
      }

      return helpers.createNode("htmlBlock", { rawHtml });
    },

    renderMarkdown: (node: JSONContent) => {
      const rawHtml = typeof node.attrs?.rawHtml === "string" ? node.attrs.rawHtml.trimEnd() : "";

      return rawHtml;
    },

    addNodeView() {
      return ReactNodeViewRenderer(HtmlBlockNodeView);
    },
  });
}

function createKeyboardKeyExtension() {
  return Mark.create({
    name: "keyboardKey",

    parseHTML() {
      return [{ tag: "kbd" }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["kbd", mergeAttributes(HTMLAttributes), 0];
    },

    markdownOptions: {
      htmlReopen: { open: "<kbd>", close: "</kbd>" },
    },

    renderMarkdown: (node: JSONContent, helpers) =>
      `<kbd>${helpers.renderChildren(node.content ?? [])}</kbd>`,
  });
}

function createDelimitedMarkdownMarkExtension({
  delimiter,
  name,
  start,
  tag,
  tokenPattern,
}: {
  delimiter: string;
  name: string;
  start: string | ((src: string) => number);
  tag: string;
  tokenPattern: RegExp;
}) {
  return Mark.create({
    name,

    parseHTML() {
      return [{ tag }];
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes), 0];
    },

    markdownTokenizer: {
      name,
      level: "inline",
      start,
      tokenize(src, _tokens, lexer) {
        const match = src.match(tokenPattern);

        if (!match) {
          return;
        }

        const text = match[1];

        return {
          type: name,
          raw: match[0],
          text,
          tokens: lexer.inlineTokens(text),
        };
      },
    },

    parseMarkdown: (token: MarkdownToken, helpers) =>
      helpers.applyMark(name, helpers.parseInline(token.tokens ?? [])),

    renderMarkdown: (node: JSONContent, helpers) =>
      `${delimiter}${helpers.renderChildren(node.content ?? [])}${delimiter}`,
  });
}

function findSingleTildeDelimiter(src: string) {
  for (let index = 0; index < src.length; index += 1) {
    if (src[index] === "~" && src[index - 1] !== "~" && src[index + 1] !== "~") {
      return index;
    }
  }

  return -1;
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

function createGalleryExtension() {
  return Node.create({
    name: "gallery",
    group: "block",
    // Galleries accept block content rather than image-only content because
    // Markdown image tokens can arrive wrapped in paragraphs, and this leaves
    // room for future captions without changing the persisted container syntax.
    content: "block+",
    defining: true,

    parseHTML() {
      return [{ tag: "div[data-glyphary-gallery]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-gallery": "true",
          class: "markdown-gallery",
        }),
        0,
      ];
    },

    markdownTokenName: "gallery",

    markdownTokenizer: {
      name: "gallery",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*gallery[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "gallery", namedContainerOpening(src, "gallery"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode("gallery", {}, content.length ? content : [emptyParagraphNode(helpers)]);
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: gallery\n${body}\n:::`;
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

function emptyExcalidrawScene(): ExcalidrawSceneData {
  return {
    type: "excalidraw",
    elements: [],
    appState: {},
    files: {},
  };
}

function parseExcalidrawScene(content: string): ExcalidrawSceneData {
  if (!content.trim()) {
    return emptyExcalidrawScene();
  }

  try {
    const parsed = JSON.parse(content) as ExcalidrawSceneData;

    return {
      type: parsed.type || "excalidraw",
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState:
        parsed.appState && typeof parsed.appState === "object" ? parsed.appState : {},
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch {
    return emptyExcalidrawScene();
  }
}

async function restoredExcalidrawScene(scene: ExcalidrawSceneData) {
  const { restore } = await import("@excalidraw/excalidraw");

  return restore(
    {
      elements: scene.elements ?? [],
      appState: scene.appState ?? {},
      files: scene.files ?? {},
    },
    null,
    null,
  );
}

async function excalidrawSceneToSvgMarkup(scene: ExcalidrawSceneData) {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const restored = await restoredExcalidrawScene(scene);
  const visibleElements = restored.elements.filter((element) => !element.isDeleted);

  if (visibleElements.length === 0) {
    return "";
  }

  const svg = await exportToSvg({
    elements: visibleElements,
    appState: {
      ...restored.appState,
      exportWithDarkMode: false,
    },
    files: restored.files,
    exportPadding: 18,
  });

  return new XMLSerializer().serializeToString(svg);
}

function isExcalidrawTarget(target: string) {
  return target.toLowerCase().endsWith(".excalidraw");
}

type ExcalidrawEmbedOptions = {
  openDrawing: (target: string) => void;
  loadPreview: (target: string) => Promise<string>;
};

const excalidrawPreviewRefreshEvent = "glyphary-excalidraw-preview-refresh";

function ExcalidrawEmbedView(props: NodeViewProps) {
  const target = String(props.node.attrs.target ?? "");
  const [previewSvg, setPreviewSvg] = useState("");
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const options = props.extension.options as ExcalidrawEmbedOptions;

  useEffect(() => {
    if (!isExcalidrawTarget(target)) {
      setPreviewSvg("");
      setPreviewState("error");
      return;
    }

    let cancelled = false;
    const loadPreview = () => {
      setPreviewState("loading");
      setPreviewSvg("");
      options
        .loadPreview(target)
        .then((markup) => {
          if (cancelled) {
            return;
          }

          setPreviewSvg(markup);
          setPreviewState(markup ? "ready" : "empty");
        })
        .catch(() => {
          if (!cancelled) {
            setPreviewState("error");
          }
        });
    };
    const refreshPreview = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.target !== target) {
        return;
      }

      loadPreview();
    };

    loadPreview();
    window.addEventListener(excalidrawPreviewRefreshEvent, refreshPreview);

    return () => {
      cancelled = true;
      window.removeEventListener(excalidrawPreviewRefreshEvent, refreshPreview);
    };
  }, [options, target]);

  if (!isExcalidrawTarget(target)) {
    return <NodeViewWrapper as="span" className="excalidraw-embed-invalid" />;
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="excalidraw-embed"
      data-excalidraw-target={target}
      onDoubleClick={() => options.openDrawing(target)}
    >
      <div className="excalidraw-embed-preview">
        {previewState === "ready" ? (
          <div
            className="excalidraw-embed-svg"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
        ) : (
          <div className="excalidraw-embed-empty">
            {previewState === "loading"
              ? "Loading drawing..."
              : previewState === "error"
                ? "Drawing preview unavailable"
                : "No saved drawing elements"}
          </div>
        )}
      </div>
      <figcaption>
        <span>{target.split("/").pop() ?? target}</span>
        <small>Double-click to edit</small>
      </figcaption>
    </NodeViewWrapper>
  );
}

function createExcalidrawEmbedExtension(options: ExcalidrawEmbedOptions) {
  return Node.create({
    name: "excalidrawEmbed",
    priority: 1100,
    group: "block",
    atom: true,
    draggable: true,

    addOptions() {
      return options;
    },

    addAttributes() {
      return {
        target: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-excalidraw-target") ?? "",
        },
      };
    },

    parseHTML() {
      return [{ tag: "figure[data-excalidraw-target]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "figure",
        mergeAttributes(HTMLAttributes, {
          "data-excalidraw-target": HTMLAttributes.target,
          class: "excalidraw-embed",
        }),
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(ExcalidrawEmbedView);
    },

    markdownTokenName: "excalidrawEmbed",

    markdownTokenizer: {
      name: "excalidrawEmbed",
      level: "block",
      start: (src: string) => {
        const index = src.search(/!\[\[[^\]\n]+\.excalidraw\]\]/i);

        return index >= 0 ? index : src.length;
      },
      tokenize: (src: string) => {
        const match = src.match(/^!\[\[([^\]\n]+\.excalidraw)\]\][ \t]*(?:\n|$)/i);

        if (!match) {
          return undefined;
        }

        const target = cleanVaultAssetReference(match[1]);

        if (!target || !isExcalidrawTarget(target)) {
          return undefined;
        }

        return {
          type: "excalidrawEmbed",
          raw: match[0],
          target,
        };
      },
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const target = cleanVaultAssetReference(String(token.target ?? ""));

      if (!target || !isExcalidrawTarget(target)) {
        return [];
      }

      return helpers.createNode("excalidrawEmbed", { target });
    },

    renderMarkdown: (node: JSONContent) => {
      const target =
        typeof node.attrs?.target === "string"
          ? cleanVaultAssetReference(node.attrs.target)
          : null;

      return target && isExcalidrawTarget(target) ? `![[${target}]]` : "";
    },
  });
}

function createVaultImageExtension(
  resolveVaultImageSrc: (target: string) => string,
  resolveVaultAssetSrc: (target: string) => string,
) {
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
        ? resolveVaultImageSrc(vaultTarget)
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

function imageNodeMarkdown(node: ProseMirrorNode) {
  // Gallery layout operates on selected ProseMirror image nodes. Reconstruct
  // the same markdown form that the image extension would emit so local vault
  // embeds remain ![[...]] instead of being rewritten to resolved webview URLs.
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
    newTabFile: defaultNewTabFile,
    frontmatterPills: defaultFrontmatterPillSettings,
    files: defaultFileDisplaySettings,
    autosave: defaultAutosaveSettings,
    tidbits: defaultTidbitSettings,
    editor: defaultEditorBehaviorSettings,
    appearance: defaultVaultAppearanceSettings,
    debug: defaultDebugSettings,
    cssSnippets: defaultCssSnippetSettings,
    plugins: defaultPluginSettings,
    ai: defaultAiSettings,
    canvas: defaultCanvasSettings,
    theme: null,
  });
  const [settingsDraft, setSettingsDraft] = useState(defaultVaultAssetDirectory);
  const [newTabFileDraft, setNewTabFileDraft] = useState(defaultNewTabFile);
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
  const [debugDraft, setDebugDraft] = useState<DebugSettings>(defaultDebugSettings);
  const [vaultAppearanceDraft, setVaultAppearanceDraft] =
    useState<VaultAppearanceSettings>(defaultVaultAppearanceSettings);
  const [cssSnippetDraft, setCssSnippetDraft] =
    useState<CssSnippetSettings>(defaultCssSnippetSettings);
  const [cssSnippetFiles, setCssSnippetFiles] = useState<CssSnippetFile[]>([]);
  const [cssSnippetContents, setCssSnippetContents] = useState<CssSnippetContent[]>([]);
  const [pluginDraft, setPluginDraft] = useState<PluginSettings>(defaultPluginSettings);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>({ plugins: [], errors: [] });
  const [pluginStyles, setPluginStyles] = useState<PluginStyleContent[]>([]);
  const [aiDraft, setAiDraft] = useState<AiSettings>(defaultAiSettings);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState<"success" | "error" | null>(null);
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiSubmittingTitle, setAiSubmittingTitle] = useState("");
  const [canvasDraft, setCanvasDraft] = useState<CanvasSettings>(defaultCanvasSettings);
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
  const [documentDisplayMode, setDocumentDisplayMode] = useState<"edit" | "view">("edit");
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
  const [commandPaletteScope, setCommandPaletteScope] =
    useState<CommandPaletteScope>("root");
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteSelectedIndex, setCommandPaletteSelectedIndex] = useState(0);
  const [pageSearchOpen, setPageSearchOpen] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState("");
  const [pageSearchIndex, setPageSearchIndex] = useState(0);
  const [canvasCommandRequest, setCanvasCommandRequest] =
    useState<CanvasCommandRequest | null>(null);
  const [richLinkDialogOpen, setRichLinkDialogOpen] = useState(false);
  const [richLinkUrlDraft, setRichLinkUrlDraft] = useState("");
  const [richLinkSubmitting, setRichLinkSubmitting] = useState(false);
  const [releaseNotification, setReleaseNotification] =
    useState<ReleaseNotification | null>(null);
  const [aiReview, setAiReview] = useState<AiReviewState | null>(null);
  const [aiPageBuilderOpen, setAiPageBuilderOpen] = useState(false);
  const [aiPageBuilderPrompt, setAiPageBuilderPrompt] = useState("");
  const [aiPageBuilderReplaceTurnId, setAiPageBuilderReplaceTurnId] = useState<string | null>(
    null,
  );
  const [aiPageBuilderAssetReview, setAiPageBuilderAssetReview] =
    useState<AiPageBuilderAssetReviewState | null>(null);
  const [aiPageBuilderImportingAssets, setAiPageBuilderImportingAssets] = useState(false);
  const [aiBuilderHistory, setAiBuilderHistory] = useState<AiBuilderHistoryStore>({
    entries: {},
  });
  const [excalidrawCreateDialogOpen, setExcalidrawCreateDialogOpen] = useState(false);
  const [excalidrawCreateNameDraft, setExcalidrawCreateNameDraft] = useState("Drawing");
  const [excalidrawCreateSubmitting, setExcalidrawCreateSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("filename");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("incomplete");
  const [taskResults, setTaskResults] = useState<SearchResult[]>([]);
  const [tasksSearching, setTasksSearching] = useState(false);
  const [taskListQuery, setTaskListQuery] = useState("");
  const [taskSort, setTaskSort] = useState<TaskSort>("name");
  const [recentFiles, setRecentFiles] = useState<ActiveFile[]>([]);
  const [wikiLinkIndex, setWikiLinkIndex] = useState<VaultIndexedFile[]>([]);
  const [wikiLinkIndexVersion, setWikiLinkIndexVersion] = useState(0);
  const [wikiLinkSearchOpen, setWikiLinkSearchOpen] = useState(false);
  const [wikiLinkSearchQuery, setWikiLinkSearchQuery] = useState("");
  const [wikiLinkSearchSelectedIndex, setWikiLinkSearchSelectedIndex] = useState(0);
  const [wikiLinkPicker, setWikiLinkPicker] = useState<WikiLinkPickerState | null>(null);
  const [wikiLinkPickerSelectedIndex, setWikiLinkPickerSelectedIndex] = useState(0);
  const [excalidrawDialog, setExcalidrawDialog] = useState<ExcalidrawDialogState | null>(null);
  const [excalidrawDirty, setExcalidrawDirty] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
  const [folderActionDialog, setFolderActionDialog] = useState<FolderActionDialogState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("No vault open");
  const hideDuplicateDocumentActions =
    isMacOsPlatform(window.navigator.platform, window.navigator.userAgent) ||
    isWindowsPlatform(window.navigator.platform, window.navigator.userAgent);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFileRef = useRef<ActiveFile | null>(null);
  const currentDirRef = useRef("");
  const recentFilesRef = useRef<ActiveFile[]>([]);
  const aiBuilderHistoryRef = useRef<AiBuilderHistoryStore>({ entries: {} });
  const wikiLinkIndexRef = useRef<VaultIndexedFile[]>([]);
  const suppressDirectoryClickRef = useRef(false);
  const editorGroupsRef = useRef<Record<EditorGroupId, EditorGroupState>>(editorGroups);
  const activeGroupIdRef = useRef<EditorGroupId>("primary");
  const activeEditorRef = useRef<Editor | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const commandPaletteSelectionRef = useRef<{
    editor: Editor;
    ranges: PageSearchMatch[];
    selection: unknown;
  } | null>(null);
  const pageSearchInputRef = useRef<HTMLInputElement | null>(null);
  const canvasCommandRequestIdRef = useRef(0);
  // Keyboard navigation moves a virtual selection through scrollable results;
  // this ref lets the selected option be kept visible without stealing focus.
  const commandPaletteResultsRef = useRef<HTMLDivElement | null>(null);
  const wikiLinkSearchInputRef = useRef<HTMLInputElement | null>(null);
  const richLinkInputRef = useRef<HTMLInputElement | null>(null);
  const excalidrawCreateInputRef = useRef<HTMLInputElement | null>(null);
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
  const closeActiveDocumentTabRef = useRef<() => void>(() => undefined);
  const openTidbitCaptureWindowRef = useRef<() => void | Promise<void>>(() => undefined);
  const openCapturedTidbitRef = useRef<(file: OpenedFile) => void | Promise<void>>(
    () => undefined,
  );
  const resetDocumentRef = useRef<() => void>(() => undefined);
  const openConfiguredNewTabRef = useRef<() => void>(() => undefined);
  const openPageSearchRef = useRef<() => void>(() => undefined);
  const openWikiLinkSearchRef = useRef<() => void>(() => undefined);
  const resolveWikiLinkTargetRef = useRef<(target: string) => WikiLinkResolution>(() => ({
    candidates: [],
  }));
  const openWikiLinkTargetRef = useRef<
    (target: string, event?: MouseEvent | ReactMouseEvent<HTMLElement>) => void
  >(() => undefined);
  const openExcalidrawDrawingRef = useRef<(target: string) => void>(() => undefined);
  const loadExcalidrawPreviewRef = useRef<(target: string) => Promise<string>>(async () => "");
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const excalidrawSceneRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState | Partial<AppState>;
    files: BinaryFiles;
  }>({
    elements: [],
    appState: {},
    files: {},
  });
  const vaultRootRef = useRef("");
  const vaultSettingsRef = useRef<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
    newTabFile: defaultNewTabFile,
    frontmatterPills: defaultFrontmatterPillSettings,
    files: defaultFileDisplaySettings,
    autosave: defaultAutosaveSettings,
    tidbits: defaultTidbitSettings,
    editor: defaultEditorBehaviorSettings,
    appearance: defaultVaultAppearanceSettings,
    debug: defaultDebugSettings,
    cssSnippets: defaultCssSnippetSettings,
    plugins: defaultPluginSettings,
    ai: defaultAiSettings,
    canvas: defaultCanvasSettings,
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
    currentDirRef.current = currentDir;
  }, [currentDir]);

  useEffect(() => {
    recentFilesRef.current = recentFiles;
  }, [recentFiles]);

  useEffect(() => {
    aiBuilderHistoryRef.current = aiBuilderHistory;
  }, [aiBuilderHistory]);

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

  async function requestTidbitShortcutAccessibilityPermission() {
    if (!isTauri() || !isRunningOnMacOs()) {
      return true;
    }

    try {
      if (await checkAccessibilityPermission()) {
        setStatus("macOS Accessibility permission already granted for global tidbit capture");
        return true;
      }

      await requestAccessibilityPermission();

      if (await checkAccessibilityPermission()) {
        setStatus("macOS Accessibility permission granted for global tidbit capture");
        return true;
      }

      setStatus(
        "Grant Glyphary Accessibility permission in macOS System Settings, then save settings again",
      );
      return false;
    } catch (error) {
      setStatus(
        `Could not request macOS Accessibility permission: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void listen<OpenedFile>("tidbit-capture-created", (event) => {
      void openCapturedTidbitRef.current(event.payload);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      removeListener = unlisten;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void listen<string>("tidbit-global-shortcut", (event) => {
      setStatus(
        event.payload === "test"
          ? "Received tidbit shortcut test event"
          : "Received global tidbit shortcut event",
      );
      void openTidbitCaptureWindowRef.current();
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }

      removeListener = unlisten;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    const settings = normalizeTidbitSettings(tidbitSettings);

    if (!isTauri() || !vaultRoot || !settings.globalShortcutEnabled) {
      return;
    }

    let registeredShortcut: string | null = null;
    let cancelled = false;

    async function registerTidbitShortcut() {
      const registered = await invoke<boolean>("register_tidbit_global_shortcut", {
        shortcut: settings.globalShortcut,
      });

      if (!registered) {
        setStatus(
          `Could not register tidbit shortcut ${settings.globalShortcut}. It may already be used by macOS or another app.`,
        );
        return;
      }

      if (!cancelled) {
        registeredShortcut = settings.globalShortcut;
        setStatus(`Registered global tidbit shortcut ${settings.globalShortcut}`);
      } else {
        void invoke("unregister_tidbit_global_shortcut");
      }
    }

    void registerTidbitShortcut().catch((error) => {
      setStatus(
        `Could not register tidbit shortcut ${settings.globalShortcut}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return () => {
      cancelled = true;

      if (registeredShortcut) {
        void invoke("unregister_tidbit_global_shortcut");
      }
    };
  }, [
    vaultRoot,
    tidbitSettings.pathPattern,
    tidbitSettings.globalShortcut,
    tidbitSettings.globalShortcutEnabled,
  ]);

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
    document.documentElement.style.setProperty(
      "--glyphary-glass-opacity",
      String(normalizeVaultAppearanceSettings(vaultAppearanceDraft).glassOpacity),
    );
  }, [vaultAppearanceDraft.glassEffect, vaultAppearanceDraft.glassOpacity]);

  useEffect(() => {
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

  useEffect(() => {
    if (!tableContextMenu) {
      return;
    }

    const closeMenu = () => setTableContextMenu(null);
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
  }, [tableContextMenu]);

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

  function savedDebugSettings() {
    return normalizeDebugSettings(vaultSettings.debug);
  }

  function savedCssSnippetSettings() {
    return normalizeCssSnippetSettings(vaultSettings.cssSnippets);
  }

  function savedPluginSettings() {
    return normalizePluginSettings(vaultSettings.plugins);
  }

  function savedAiSettings() {
    return normalizeAiSettings(vaultSettings.ai);
  }

  function savedCanvasSettings() {
    return normalizeCanvasSettings(vaultSettings.canvas);
  }

  function savedNewTabFile() {
    return normalizeNewTabFile(vaultSettings.newTabFile);
  }

  function vaultRelativeFileFromSelection(selected: string) {
    // The dialog returns an absolute native path; settings store portable
    // vault-relative paths so the config remains usable if the vault moves.
    const root = vaultRootRef.current
      .split(/[\\/]+/)
      .filter(Boolean)
      .join("/");
    const file = selected
      .split(/[\\/]+/)
      .filter(Boolean)
      .join("/");

    return root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : "";
  }

  async function chooseNewTabFile() {
    if (!vaultRootRef.current) {
      return;
    }

    const selected = await open({
      defaultPath: vaultRootRef.current,
      directory: false,
      multiple: false,
      title: "Choose New Tab File",
    });

    if (typeof selected !== "string") {
      return;
    }

    const relative = vaultRelativeFileFromSelection(selected);

    if (!relative) {
      setStatus("Choose a file inside the current vault");
      return;
    }

    setNewTabFileDraft(relative);
  }

  function updateAiDraft(nextSettings: AiSettings) {
    setAiTestStatus(null);
    setAiDraft(nextSettings);
  }

  function settingsHaveChanges() {
    return (
      settingsDraft !== vaultSettings.assetDirectory ||
      !sameNewTabFile(newTabFileDraft, savedNewTabFile()) ||
      !sameFrontmatterPillSettings(frontmatterPillDraft, savedFrontmatterPillSettings()) ||
      !sameEditorBehaviorSettings(editorBehaviorDraft, savedEditorBehaviorSettings()) ||
      !sameFileDisplaySettings(fileDisplayDraft, savedFileDisplaySettings()) ||
      !sameAutosaveSettings(autosaveDraft, savedAutosaveSettings()) ||
      !sameTidbitSettings(tidbitDraft, savedTidbitSettings()) ||
      !sameVaultAppearanceSettings(vaultAppearanceDraft, savedVaultAppearanceSettings()) ||
      !sameDebugSettings(debugDraft, savedDebugSettings()) ||
      !sameCssSnippetSettings(cssSnippetDraft, savedCssSnippetSettings()) ||
      !samePluginSettings(pluginDraft, savedPluginSettings()) ||
      !sameAiSettings(aiDraft, savedAiSettings()) ||
      !sameCanvasSettings(canvasDraft, savedCanvasSettings()) ||
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
    const savedAi = savedAiSettings();
    const savedCanvas = savedCanvasSettings();

    setSettingsDraft(vaultSettings.assetDirectory);
    setNewTabFileDraft(savedNewTabFile());
    setFrontmatterPillDraft(savedFrontmatterPillSettings());
    setEditorBehaviorDraft(savedEditorBehaviorSettings());
    setFileDisplayDraft(savedFileDisplaySettings());
    setAutosaveDraft(savedAutosaveSettings());
    setTidbitDraft(savedTidbitSettings());
    setVaultAppearanceDraft(savedVaultAppearanceSettings());
    setDebugDraft(savedDebugSettings());
    setCssSnippetDraft(savedCssSnippets);
    setPluginDraft(savedPlugins);
    setAiDraft(savedAi);
    setCanvasDraft(savedCanvas);
    setAiTestStatus(null);
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

  function hasActiveDocumentTab() {
    const group = editorGroupsRef.current[activeGroupIdRef.current];

    return group.tabs.some((tab) => tab.id === group.activeTabId);
  }

  function replaceEditorGroupsWithPrimaryTab(tab: DocumentTab) {
    const nextGroups = createEditorGroups(tab);

    activeGroupIdRef.current = "primary";
    setActiveGroupId("primary");
    setSplitOpen(false);
    setEditorGroupsAndRef(nextGroups);
  }

  function clearActiveDocument() {
    activeFileRef.current = null;
    pageNameRef.current = "";
    metaHeaderRef.current = "";
    metaDelimiterRef.current = defaultMetaDelimiter;
    setActiveFile(null);
    setPageName("");
    setMetaHeader("");
    setMetaDelimiter(defaultMetaDelimiter);
    setMarkdown("");
    setMarkdownDraft("");
    setDirty(false);
    setPageNameEditing(false);
    clearEditorContent(primaryEditor);
    clearEditorContent(secondaryEditor);
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
    const nextMarkdown =
      tab?.kind === "canvas"
        ? tab.markdown
        : groupEditor?.getMarkdown() ?? tab?.markdown ?? initialMarkdown;
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

    if (!groupEditor && tab.kind !== "canvas") {
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
      if (groupEditor && tab.kind !== "canvas") {
        setEditorMarkdownContent(groupEditor, tab.markdown);
      }
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
    if (groupEditor && tab.kind !== "canvas") {
      setEditorMarkdownContent(groupEditor, tab.markdown);
    }
    void revealFileInVaultDrawer(tab.activeFile);
    if (groupEditor) {
      syncEditorState(groupEditor);
    }
    window.setTimeout(() => {
      hydratingEditor.current[groupId] = false;
    }, 0);
  }

  function hydrateDocumentTabAfterCommit(tab: DocumentTab, groupId = activeGroupIdRef.current) {
    // Closing a tab removes focused DOM while Tiptap hydration mutates the
    // editor view. Defer survivor hydration until React has committed the tab
    // removal so WebKit never sees both operations in the same click turn.
    window.requestAnimationFrame(() => {
      const group = editorGroupsRef.current[groupId];
      const activeTab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);

      if (activeTab?.id === tab.id) {
        hydrateDocumentTab(activeTab, groupId);
      }
    });
  }

  function createDocumentTabFromFile(file: OpenedFile): DocumentTab {
    // Canvas tabs keep the raw JSON in the same content fields used by
    // Markdown tabs, but they bypass frontmatter parsing and Tiptap hydration.
    if (isCanvasPath(file.relativePath)) {
      return {
        id: tabIdForFile(file.relativePath),
        kind: "canvas",
        activeFile: {
          name: file.name,
          relativePath: file.relativePath,
        },
        pageName: canvasTitle(file.name),
        metaHeader: "",
        metaDelimiter: defaultMetaDelimiter,
        markdown: file.content,
        markdownDraft: file.content,
        dirty: false,
      };
    }

    const parts = splitMetaHeader(file.content);

    return {
      id: tabIdForFile(file.relativePath),
      kind: "markdown",
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
        activeGroupIdRef.current = "primary";
        setActiveGroupId("primary");
        setEditorGroupsAndRef(createEmptyEditorGroups());
        clearActiveDocument();
        persistActiveFile(null);
        setStatus(`Closed ${tabTitle(tab)}; no document open`);
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
      hydrateDocumentTabAfterCommit(promotedGroup.activeTab, "primary");
      persistActiveFile(promotedGroup.activeTab.activeFile);
      setStatus(`Closed ${tabTitle(tab)} and unsplit editor`);
      return;
    }

    const closeResult = tabsAfterClose(tabs, editorGroupsRef.current[groupId].activeTabId, tabId);

    if (!closeResult || !closeResult.nextActiveTab) {
      setStatus("Keep at least one document tab open");
      return;
    }

    setEditorGroupsAndRef({
      ...editorGroupsRef.current,
      [groupId]: {
        ...editorGroupsRef.current[groupId],
        tabs: closeResult.nextTabs,
        activeTabId: closeResult.nextActiveTabId,
      },
    });

    if (!closeResult.wasActiveTab) {
      setStatus(`Closed ${tabTitle(tab)}`);
      return;
    }

    activeGroupIdRef.current = groupId;
    setActiveGroupId(groupId);
    hydrateDocumentTabAfterCommit(closeResult.nextActiveTab, groupId);
    persistActiveFile(closeResult.nextActiveTab.activeFile);
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
          src: joinVaultImagePath(vaultRootRef.current, fileName),
          alt: fileName,
          vaultTarget: fileName,
        },
      })
      .run();
  }

  function excalidrawDrawingDirectory() {
    const assetDirectory =
      vaultSettingsRef.current.assetDirectory.trim() || defaultVaultAssetDirectory;

    if (assetDirectory === defaultVaultAssetDirectory) {
      return defaultExcalidrawDirectory;
    }

    return `${assetDirectory.replace(/\/+$/, "")}/drawings`;
  }

  async function loadExcalidrawPreview(target: string) {
    const root = vaultRootRef.current;

    if (!root || !isExcalidrawTarget(target)) {
      return "";
    }

    const file = await invoke<OpenedFile>("read_vault_file", {
      root,
      relative: target,
    });

    return excalidrawSceneToSvgMarkup(parseExcalidrawScene(file.content));
  }

  async function openExcalidrawDrawing(target: string) {
    const root = vaultRootRef.current;

    if (!root || !isExcalidrawTarget(target)) {
      setStatus("Open a vault before editing drawings");
      return;
    }

    try {
      const file = await invoke<OpenedFile>("read_vault_file", {
        root,
        relative: target,
      });
      const scene = parseExcalidrawScene(file.content);
      const restored = await restoredExcalidrawScene(scene);

      excalidrawApiRef.current = null;
      excalidrawSceneRef.current = {
        elements: restored.elements,
        appState: restored.appState,
        files: restored.files,
      };
      setExcalidrawDirty(false);
      setExcalidrawDialog({
        relativePath: file.relativePath,
        name: file.name,
        initialData: {
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
        },
      });
      setStatus(`Editing drawing ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveExcalidrawDrawing() {
    if (!vaultRootRef.current || !excalidrawDialog) {
      return;
    }

    try {
      const { serializeAsJSON } = await import("@excalidraw/excalidraw");
      const api = excalidrawApiRef.current;
      const elements = api?.getSceneElementsIncludingDeleted() ?? excalidrawSceneRef.current.elements;
      const visibleElementCount =
        api?.getSceneElements().length ?? elements.filter((element) => !element.isDeleted).length;
      const appState = api?.getAppState() ?? excalidrawSceneRef.current.appState;
      const files = api?.getFiles() ?? excalidrawSceneRef.current.files;
      const content = serializeAsJSON(elements, appState, files, "local");

      await invoke("write_vault_file", {
        root: vaultRootRef.current,
        relative: excalidrawDialog.relativePath,
        content,
      });
      window.dispatchEvent(
        new CustomEvent(excalidrawPreviewRefreshEvent, {
          detail: { target: excalidrawDialog.relativePath },
        }),
      );
      setExcalidrawDirty(false);
      setExcalidrawDialog((dialog) =>
        dialog
          ? {
              ...dialog,
              initialData: {
                elements,
                appState,
                files,
              },
            }
          : dialog,
      );
      setStatus(
        `Saved drawing ${excalidrawDialog.relativePath} (${visibleElementCount} visible element${
          visibleElementCount === 1 ? "" : "s"
        })`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function closeExcalidrawDialog() {
    if (excalidrawDirty && !window.confirm("Close drawing without saving changes?")) {
      return;
    }

    excalidrawApiRef.current = null;
    setExcalidrawDialog(null);
    setExcalidrawDirty(false);
  }

  function openExcalidrawCreateDialog() {
    if (!vaultRoot || !editor) {
      setStatus("Open a vault file before inserting a drawing");
      return;
    }

    setExcalidrawCreateNameDraft("Drawing");
    setExcalidrawCreateDialogOpen(true);
  }

  async function insertExcalidrawDrawing() {
    if (!vaultRoot || !editor || excalidrawCreateSubmitting) {
      return;
    }

    try {
      setExcalidrawCreateSubmitting(true);
      const relative = `${excalidrawDrawingDirectory()}/${excalidrawFileNameForTitle(
        excalidrawCreateNameDraft,
      )}`;
      const file = await invoke<OpenedFile>("create_excalidraw_file", {
        root: vaultRoot,
        relative,
        content: JSON.stringify(emptyExcalidrawScene(), null, 2),
      });

      insertMarkdownAtCursor(`![[${file.relativePath}]]`);
      await loadEntries(vaultRoot, currentDir);
      setExcalidrawCreateDialogOpen(false);
      await openExcalidrawDrawing(file.relativePath);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setExcalidrawCreateSubmitting(false);
    }
  }

  openExcalidrawDrawingRef.current = (target: string) => {
    void openExcalidrawDrawing(target);
  };
  loadExcalidrawPreviewRef.current = loadExcalidrawPreview;

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
          assetDirectory: defaultVaultImageDirectory,
          fileName: fileNameForDroppedImage(file),
          bytes: Array.from(new Uint8Array(buffer)),
        });

        insertVaultImage(saved.fileName);
        imported += 1;
      }

      setStatus(
        `Added ${imported} image${imported === 1 ? "" : "s"} to ${defaultVaultImageDirectory}`,
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
        PageSearchRenderer,
        CommandPaletteSelectionRenderer,
        TocCodeBlockRenderer,
        MermaidCodeBlockRenderer,
        createWikiLinkExtension({
          openSearch: () => openWikiLinkSearchRef.current(),
          resolveTarget: (target) => resolveWikiLinkTargetRef.current(target),
        }),
        ...(editorBehavior.vimMode ? [createGlypharyVimMode(setStatus)] : []),
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
          openDrawing: (target) => openExcalidrawDrawingRef.current(target),
          loadPreview: (target) => loadExcalidrawPreviewRef.current(target),
        }),
        // Vault images resolve late through refs because the same editor
        // instance can survive vault changes; bare ![[image.png]] embeds are
        // always backed by _assets_/images.
        createVaultImageExtension(
          (target) => joinVaultImagePath(vaultRootRef.current, target),
          (target) =>
            joinVaultAssetPath(
              vaultRootRef.current,
              vaultSettingsRef.current.assetDirectory,
              target,
            ),
        ),
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
        const group = editorGroupsRef.current[groupId];
        const tabId = group.activeTabId;
        const tab = group.tabs.find((documentTab) => documentTab.id === tabId);

        if (!tab || tab.kind !== "markdown") {
          return;
        }

        const nextMarkdown = editor.getMarkdown();
        const isActiveGroup = activeGroupIdRef.current === groupId;

        updateGroupTab(groupId, tabId, {
          markdown: nextMarkdown,
          markdownDraft: nextMarkdown,
          dirty: hydratingEditor.current[groupId]
            ? tab.dirty
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
  activeEditorRef.current = editor;

  function captureCommandPaletteSelection() {
    const targetEditor = activeEditorRef.current;

    if (!targetEditor) {
      commandPaletteSelectionRef.current = null;
      return;
    }

    const selection = targetEditor.state.selection;
    commandPaletteSelectionRef.current = {
      editor: targetEditor,
      ranges: selection.empty
        ? []
        : selection.ranges.map((range) => ({
            from: range.$from.pos,
            to: range.$to.pos,
          })),
      selection: selection.toJSON(),
    };
  }

  function restoreCommandPaletteSelection() {
    const saved = commandPaletteSelectionRef.current;

    if (!saved || !isEditorReady(saved.editor)) {
      return;
    }

    try {
      const selection = Selection.fromJSON(saved.editor.state.doc, saved.selection);
      saved.editor.view.dispatch(saved.editor.state.tr.setSelection(selection));
      saved.editor.view.focus();
    } catch {
      commandPaletteSelectionRef.current = null;
    }
  }

  const pageSearchResults = useMemo(
    () => pageSearchMatches(editor, pageSearchQuery),
    [editor, pageSearchQuery, markdown],
  );
  const pageSearchActiveIndex =
    pageSearchResults.length > 0 ? Math.min(pageSearchIndex, pageSearchResults.length - 1) : -1;

  function selectPageSearchMatch(index: number) {
    if (pageSearchResults.length === 0) {
      return;
    }

    const nextIndex = (index + pageSearchResults.length) % pageSearchResults.length;

    setPageSearchIndex(nextIndex);
  }

  function openPageSearch() {
    if (!editor || activeDocumentIsCanvas) {
      setStatus("Open a note before searching in page");
      return;
    }

    setPageSearchOpen(true);
    window.requestAnimationFrame(() => {
      pageSearchInputRef.current?.focus();
      pageSearchInputRef.current?.select();
    });
  }

  function closePageSearch() {
    setPageSearchOpen(false);
    setPageSearchQuery("");
    setPageSearchIndex(0);
    editor?.commands.focus();
  }

  function movePageSearch(direction: 1 | -1) {
    selectPageSearchMatch(pageSearchActiveIndex + direction);
  }

  openPageSearchRef.current = openPageSearch;

  useEffect(() => {
    if (!pageSearchOpen || !pageSearchQuery.trim()) {
      return;
    }

    if (pageSearchResults.length === 0) {
      setPageSearchIndex(0);
      return;
    }

    if (pageSearchActiveIndex < 0) {
      setPageSearchIndex(0);
    }
  }, [pageSearchOpen, pageSearchQuery, pageSearchResults.length]);

  useEffect(() => {
    [primaryEditor, secondaryEditor].forEach((targetEditor) => {
      if (!isEditorReady(targetEditor)) {
        return;
      }

      const state =
        targetEditor === editor && pageSearchOpen
          ? { activeIndex: pageSearchActiveIndex, matches: pageSearchResults }
          : { activeIndex: -1, matches: [] };

      targetEditor.view.dispatch(targetEditor.state.tr.setMeta(pageSearchPluginKey, state));
    });

    if (editor && pageSearchOpen && pageSearchResults.length > 0) {
      window.requestAnimationFrame(() => {
        editor.view.dom
          .querySelector(".page-search-match.active")
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    }
  }, [
    editor,
    pageSearchActiveIndex,
    pageSearchOpen,
    pageSearchResults,
    primaryEditor,
    secondaryEditor,
  ]);

  useEffect(() => {
    const saved = commandPaletteSelectionRef.current;

    [primaryEditor, secondaryEditor].forEach((targetEditor) => {
      if (!isEditorReady(targetEditor)) {
        return;
      }

      const state =
        commandPaletteOpen && saved?.editor === targetEditor
          ? { ranges: saved.ranges }
          : { ranges: [] };

      targetEditor.view.dispatch(
        targetEditor.state.tr.setMeta(commandPaletteSelectionPluginKey, state),
      );
    });
  }, [commandPaletteOpen, primaryEditor, secondaryEditor]);

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
          "[data-toc-entry-id], [data-toc-edit], [data-mermaid-edit]",
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

        if (button.dataset.mermaidEdit) {
          const widget = button.closest<HTMLElement>("[data-mermaid-block-position]");
          const blockPosition = Number(widget?.dataset.mermaidBlockPosition);

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
        await loadAiBuilderHistory(workspace.vaultRoot);
        setCurrentDir(workspace.currentDir);
        setSearchQuery("");
        setSearchResults([]);
        setTaskResults([]);
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
        label: "HTML",
        icon: "html",
        title: "Insert HTML block",
        isActive: () => false,
        run: () => insertHtmlBlock(),
      },
      {
        label: "Mermaid",
        icon: "code",
        title: "Insert Mermaid diagram",
        isActive: () => false,
        run: () => insertMermaidDiagram(),
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
    setEditorMarkdownContent(editor, content);
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

  function aiBuilderHistoryKeyForFile(file: ActiveFile | null) {
    return file?.relativePath ?? null;
  }

  function activeAiBuilderHistoryKey() {
    return aiBuilderHistoryKeyForFile(activeFileRef.current);
  }

  function activeAiBuilderHistoryTurns() {
    const key = activeAiBuilderHistoryKey();

    return key ? (aiBuilderHistory.entries[key] ?? []) : [];
  }

  function aiBuilderHistoryContext() {
    const turns = activeAiBuilderHistoryTurns().slice(0, maxAiBuilderPromptHistoryTurns);

    if (turns.length === 0) {
      return "(none)";
    }

    return turns
      .map((turn, index) =>
        [
          `Turn ${turns.length - index}:`,
          `User: ${turn.prompt}`,
          "Assistant markdown:",
          turn.markdown,
        ].join("\n"),
      )
      .join("\n\n");
  }

  function selectedAiBuilderReplacementTurn() {
    if (!aiPageBuilderReplaceTurnId) {
      return null;
    }

    return (
      activeAiBuilderHistoryTurns().find((turn) => turn.id === aiPageBuilderReplaceTurnId) ?? null
    );
  }

  function aiBuilderMarkedBlockPattern(turnId: string) {
    const escapedTurnId = escapeRegExp(turnId);

    return new RegExp(
      `<!--\\s*glyphary-ai-builder:start\\s+${escapedTurnId}\\s*-->[\\s\\S]*?<!--\\s*glyphary-ai-builder:end\\s+${escapedTurnId}\\s*-->`,
    );
  }

  function hasAiBuilderMarkedBlock(turnId: string) {
    return aiBuilderMarkedBlockPattern(turnId).test(markdown);
  }

  function latestReplaceableAiBuilderTurn() {
    return (
      activeAiBuilderHistoryTurns().find(
        (turn) => turn.applied && !turn.superseded && hasAiBuilderMarkedBlock(turn.id),
      ) ?? null
    );
  }

  function clearActiveAiBuilderHistory() {
    const key = activeAiBuilderHistoryKey();

    if (!key) {
      setStatus("Open a saved vault file before clearing AI Builder history");
      return;
    }

    const nextHistory = {
      entries: {
        ...aiBuilderHistoryRef.current.entries,
        [key]: [],
      },
    };

    persistAiBuilderHistory(nextHistory);
    setAiPageBuilderReplaceTurnId(null);
    setStatus("Cleared AI Builder history for this file");
  }

  async function loadAiBuilderHistory(root: string) {
    try {
      const history = await invoke<AiBuilderHistoryStore>("read_ai_builder_history", { root });
      const normalized = { entries: history.entries ?? {} };

      aiBuilderHistoryRef.current = normalized;
      setAiBuilderHistory(normalized);
    } catch (error) {
      aiBuilderHistoryRef.current = { entries: {} };
      setAiBuilderHistory({ entries: {} });
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function persistAiBuilderHistory(nextHistory: AiBuilderHistoryStore) {
    const root = vaultRootRef.current;

    if (!root) {
      return;
    }

    aiBuilderHistoryRef.current = nextHistory;
    setAiBuilderHistory(nextHistory);
    void invoke<AiBuilderHistoryStore>("write_ai_builder_history", {
      root,
      history: nextHistory,
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
  }

  function upsertAiBuilderHistoryTurn(key: string, turn: AiBuilderHistoryTurn) {
    const current = aiBuilderHistoryRef.current;
    const currentTurns = current.entries[key] ?? [];
    const nextTurns = [turn, ...currentTurns.filter((entry) => entry.id !== turn.id)].slice(
      0,
      maxAiBuilderHistoryTurnsPerFile,
    );
    const nextHistory = {
      entries: {
        ...current.entries,
        [key]: nextTurns,
      },
    };

    persistAiBuilderHistory(nextHistory);
  }

  function updateAiBuilderHistoryTurn(
    key: string,
    turnId: string,
    patch: Partial<AiBuilderHistoryTurn>,
  ) {
    const current = aiBuilderHistoryRef.current;
    const currentTurns = current.entries[key] ?? [];
    const nextTurns = currentTurns.map((turn) =>
      turn.id === turnId ? { ...turn, ...patch } : turn,
    );
    const nextHistory = {
      entries: {
        ...current.entries,
        [key]: nextTurns,
      },
    };

    persistAiBuilderHistory(nextHistory);
  }

  function moveAiBuilderHistoryKey(previousKey: string, nextKey: string) {
    if (previousKey === nextKey) {
      return;
    }

    const current = aiBuilderHistoryRef.current;
    const previousTurns = current.entries[previousKey] ?? [];

    if (previousTurns.length === 0) {
      return;
    }

    persistAiBuilderHistory({
      entries: {
        ...current.entries,
        [previousKey]: [],
        [nextKey]: previousTurns,
      },
    });
  }

  function createAiBuilderHistoryTurn(
    prompt: string,
    markdown: string,
    assets: AiBuilderHistoryAsset[] = [],
  ): AiBuilderHistoryTurn {
    const timestampMs = Date.now();

    return {
      id: `ai-builder-${timestampMs}-${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      markdown,
      assets,
      timestampMs,
      applied: false,
    };
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function aiBuilderStartMarker(turnId: string) {
    return `<!-- glyphary-ai-builder:start ${turnId} -->`;
  }

  function aiBuilderEndMarker(turnId: string) {
    return `<!-- glyphary-ai-builder:end ${turnId} -->`;
  }

  function wrapAiBuilderMarkdown(turnId: string, output: string) {
    // Plain HTML comments give us invisible anchors in rendered Markdown while
    // remaining portable source text for Obsidian-style tools and sync.
    const normalized = normalizeAiMarkdownForApply(output).trim();

    return `${aiBuilderStartMarker(turnId)}\n\n${normalized}\n\n${aiBuilderEndMarker(turnId)}`;
  }

  function replaceAiBuilderMarkedBlock(
    sourceMarkdown: string,
    replaceTurnId: string,
    nextTurnId: string,
    output: string,
  ) {
    const pattern = aiBuilderMarkedBlockPattern(replaceTurnId);

    if (!pattern.test(sourceMarkdown)) {
      return null;
    }

    return sourceMarkdown.replace(pattern, wrapAiBuilderMarkdown(nextTurnId, output));
  }

  function aiReviewOutputForInsertion(review: AiReviewState, output: string) {
    if (!review.aiBuilderTurnId) {
      return normalizeAiMarkdownForApply(output);
    }

    return wrapAiBuilderMarkdown(review.aiBuilderTurnId, output);
  }

  function markAiBuilderReviewApplied(review: AiReviewState, replaced: boolean) {
    if (!review.aiBuilderHistoryKey || !review.aiBuilderTurnId) {
      return;
    }

    updateAiBuilderHistoryTurn(review.aiBuilderHistoryKey, review.aiBuilderTurnId, {
      applied: true,
    });

    if (replaced && review.aiBuilderReplaceTurnId) {
      updateAiBuilderHistoryTurn(review.aiBuilderHistoryKey, review.aiBuilderReplaceTurnId, {
        superseded: true,
        replacedByTurnId: review.aiBuilderTurnId,
      });
    }
  }

  async function aiBuilderSearchVaultNotes(request: string) {
    if (!vaultRootRef.current || !aiBuilderPromptRequestsVaultContext(request)) {
      return [];
    }

    const queries = aiBuilderVaultQueries(request);
    const groupedResults = new Map<string, SearchResult[]>();

    // The model never receives arbitrary vault access. Glyphary first performs
    // bounded local searches, then sends only the matching snippets/excerpts.
    for (const query of queries) {
      const results = await invoke<SearchResult[]>("search_vault", {
        root: vaultRootRef.current,
        query: escapeRegExp(query),
        includeContent: true,
        markdownOnly: true,
        excludeDotPaths: true,
      });

      for (const result of results) {
        const current = groupedResults.get(result.relativePath) ?? [];

        if (current.length < maxAiBuilderVaultSnippetsPerFile) {
          current.push(result);
        }

        groupedResults.set(result.relativePath, current);
      }
    }

    const files = Array.from(groupedResults.entries()).slice(0, maxAiBuilderVaultFiles);

    return Promise.all(
      files.map(async ([relativePath, snippets]) => {
        const file = await invoke<OpenedFile>("read_vault_file", {
          root: vaultRootRef.current,
          relative: relativePath,
        });
        const parts = splitMetaHeader(file.content);

        return {
          relativePath,
          snippets,
          excerpt: parts.body.trim().slice(0, maxAiBuilderVaultFileChars),
        };
      }),
    );
  }

  async function aiBuilderSearchVaultTasks(request: string, queries: string[]) {
    if (!vaultRootRef.current || !aiBuilderPromptRequestsTaskContext(request)) {
      return [];
    }

    const results = await invoke<SearchResult[]>("search_vault", {
      root: vaultRootRef.current,
      query: taskSearchPattern("incomplete"),
      includeContent: true,
      markdownOnly: true,
      excludeDotPaths: true,
    });
    const loweredQueries = aiBuilderEffectiveTaskQueries(queries);

    return results
      .filter((result) => result.isContentMatch)
      .filter((result) => {
        if (loweredQueries.length === 0) {
          return true;
        }

        const searchable = `${result.relativePath} ${result.lineText ?? ""}`.toLowerCase();

        return loweredQueries.some((query) => searchable.includes(query));
      })
      .slice(0, maxAiBuilderVaultTasks);
  }

  async function aiBuilderVaultContext(request: string) {
    const queries = aiBuilderVaultQueries(request);
    const [notes, tasks] = await Promise.all([
      aiBuilderSearchVaultNotes(request),
      aiBuilderSearchVaultTasks(request, queries),
    ]);

    return aiBuilderVaultContextText(
      queries,
      notes,
      tasks,
      aiBuilderPromptRequestsVaultContext(request),
    );
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

  async function revealFileInVaultDrawer(file: ActiveFile | null) {
    const root = vaultRootRef.current;

    if (!root || !file) {
      return;
    }

    const fileDirectory = parentDirectory(file.relativePath);

    setVaultDrawerItem("files");
    setCurrentDir(fileDirectory);
    persistWorkspace({
      currentDir: fileDirectory,
      activeFile: file,
    });

    try {
      await loadEntries(root, fileDirectory);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
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
          newTabFile: defaultNewTabFile,
          frontmatterPills: defaultFrontmatterPillSettings,
          files: defaultFileDisplaySettings,
          autosave: defaultAutosaveSettings,
          tidbits: defaultTidbitSettings,
          editor: defaultEditorBehaviorSettings,
          appearance: defaultVaultAppearanceSettings,
          debug: defaultDebugSettings,
          cssSnippets: defaultCssSnippetSettings,
          plugins: defaultPluginSettings,
          ai: defaultAiSettings,
          canvas: defaultCanvasSettings,
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
    const debug = normalizeDebugSettings(settings.debug);
    const cssSnippets = normalizeCssSnippetSettings(settings.cssSnippets);
    const plugins = normalizePluginSettings(settings.plugins);
    const ai = normalizeAiSettings(settings.ai);
    const canvas = normalizeCanvasSettings(settings.canvas);
    const newTabFile = normalizeNewTabFile(settings.newTabFile);

    const normalizedSettings = {
      ...settings,
      newTabFile,
      frontmatterPills,
      files: fileDisplaySettings,
      autosave,
      tidbits,
      editor: editorSettings,
      appearance: vaultAppearanceSettings,
      debug,
      cssSnippets,
      plugins,
      ai,
      canvas,
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
    setNewTabFileDraft(newTabFile);
    setFrontmatterPillDraft(frontmatterPills);
    setEditorBehaviorDraft(editorSettings);
    setEditorBehavior(editorSettings);
    setFileDisplayDraft(fileDisplaySettings);
    setAutosaveDraft(autosave);
    setAutosaveSettings(autosave);
    setTidbitDraft(tidbits);
    setTidbitSettings(tidbits);
    setVaultAppearanceDraft(vaultAppearanceSettings);
    setDebugDraft(debug);
    setCssSnippetDraft(cssSnippets);
    setPluginDraft(plugins);
    setAiDraft(ai);
    setCanvasDraft(canvas);
    setAiTestStatus(null);
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
      await invoke("allow_vault_assets", {
        root,
        assetDirectory: defaultVaultImageDirectory,
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
          newTabFile: normalizeNewTabFile(newTabFileDraft),
          frontmatterPills: normalizeFrontmatterPillSettings(frontmatterPillDraft),
          files: normalizeFileDisplaySettings(fileDisplayDraft),
          autosave: normalizeAutosaveSettings(autosaveDraft),
          tidbits: normalizeTidbitSettings(tidbitDraft),
          editor: normalizeEditorBehaviorSettings(editorBehaviorDraft),
          appearance: normalizeVaultAppearanceSettings(vaultAppearanceDraft),
          debug: normalizeDebugSettings(debugDraft),
          cssSnippets: normalizeCssSnippetSettings(cssSnippetDraft),
          plugins: normalizePluginSettings(pluginDraft),
          ai: normalizeAiSettings(aiDraft),
          canvas: normalizeCanvasSettings(canvasDraft),
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
      const debug = normalizeDebugSettings(settings.debug);
      const cssSnippets = normalizeCssSnippetSettings(settings.cssSnippets);
      const plugins = normalizePluginSettings(settings.plugins);
      const ai = normalizeAiSettings(settings.ai);
      const canvas = normalizeCanvasSettings(settings.canvas);
      const newTabFile = normalizeNewTabFile(settings.newTabFile);
      const normalizedSettings = {
        ...settings,
        newTabFile,
        frontmatterPills,
        files: fileDisplaySettings,
        autosave,
        tidbits,
        editor: editorSettings,
        appearance: vaultAppearanceSettings,
        debug,
        cssSnippets,
        plugins,
        ai,
        canvas,
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
      setNewTabFileDraft(newTabFile);
      setFrontmatterPillDraft(frontmatterPills);
      setEditorBehaviorDraft(editorSettings);
      setEditorBehavior(editorSettings);
      setFileDisplayDraft(fileDisplaySettings);
      setAutosaveDraft(autosave);
      setAutosaveSettings(autosave);
      setTidbitDraft(tidbits);
      setTidbitSettings(tidbits);
      setVaultAppearanceDraft(vaultAppearanceSettings);
      setDebugDraft(debug);
      setCssSnippetDraft(cssSnippets);
      setPluginDraft(plugins);
      setAiDraft(ai);
      setCanvasDraft(canvas);
      setAiTestStatus(null);
      setSelectedThemePresetIdDraft(themePresetId);
      setThemeDraft(themeTokens);
      setThemeOptionsDraft(themeOptions);
      setThemeCalloutDraft(themeCallouts);
      await invoke("allow_vault_assets", {
        root: vaultRoot,
        assetDirectory: settings.assetDirectory,
      });
      await invoke("allow_vault_assets", {
        root: vaultRoot,
        assetDirectory: defaultVaultImageDirectory,
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
    const activeTab = editorGroupsRef.current[groupId].tabs.find(
      (tab) => tab.id === editorGroupsRef.current[groupId].activeTabId,
    );
    let file = activeFileRef.current;
    const requestedName = pageNameRef.current.trim();

    if (
      activeTab?.kind !== "canvas" &&
      requestedName &&
      requestedName !== fileNameWithoutMarkdownExtension(file.name)
    ) {
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
      moveAiBuilderHistoryKey(previousRelativePath, file.relativePath);
      await loadEntries(vaultRoot, currentDir);
    }

    const content =
      activeTab?.kind === "canvas"
        ? markdownDraft
        : composeMarkdown(
            metaHeaderRef.current,
            metaDelimiterRef.current,
            editor.getMarkdown(),
          );

    await invoke("write_vault_file", {
      root: vaultRoot,
      relative: file.relativePath,
      content,
    });
    const savedMarkdown = activeTab?.kind === "canvas" ? markdownDraft : editor.getMarkdown();
    const savedDraft = markdownDraft;
    const activeTabIdForGroup = editorGroupsRef.current[groupId].activeTabId;
    const savedTabs = editorGroupsRef.current[groupId].tabs.map((tab) =>
      tab.id === activeTabIdForGroup
        ? {
            ...tab,
            activeFile: file,
            pageName: activeTab?.kind === "canvas"
              ? canvasTitle(file.name)
              : fileNameWithoutMarkdownExtension(file.name),
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
      await loadAiBuilderHistory(selected);
      setCurrentDir("");
      const tab = createUntitledTab();

      replaceEditorGroupsWithPrimaryTab(tab);
      hydrateDocumentTab(tab, "primary");
      setSearchQuery("");
      setSearchResults([]);
      setTaskResults([]);
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
  openConfiguredNewTabRef.current = openConfiguredNewTab;
  closeActiveDocumentTabRef.current = () => {
    const groupId = activeGroupIdRef.current;
    const activeTabId = editorGroupsRef.current[groupId]?.activeTabId;

    if (activeTabId) {
      closeDocumentTab(activeTabId, groupId);
    }
  };

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
      if (!hasActiveDocumentTab()) {
        setStatus("Open or create a note before using the command palette");
        return;
      }

      setCommandPaletteScope("root");
      setCommandPaletteQuery("");
      setCommandPaletteSelectedIndex(0);
      captureCommandPaletteSelection();
      setCommandPaletteOpen(true);
    };
    const handleGlobalPageSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "f") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      openPageSearchRef.current();
    };
    const handleGlobalCloseTabShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "w") {
        return;
      }

      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      event.preventDefault();
      closeActiveDocumentTabRef.current();
    };
    const handleGlobalNewTabShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "t") {
        return;
      }

      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      event.preventDefault();
      openConfiguredNewTabRef.current();
    };

    window.addEventListener("keydown", handleGlobalSaveShortcut);
    window.addEventListener("keydown", handleGlobalCommandPaletteShortcut);
    window.addEventListener("keydown", handleGlobalPageSearchShortcut, { capture: true });
    window.addEventListener("keydown", handleGlobalNewTabShortcut, { capture: true });
    window.addEventListener("keydown", handleGlobalCloseTabShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleGlobalSaveShortcut);
      window.removeEventListener("keydown", handleGlobalCommandPaletteShortcut);
      window.removeEventListener("keydown", handleGlobalPageSearchShortcut, { capture: true });
      window.removeEventListener("keydown", handleGlobalNewTabShortcut, { capture: true });
      window.removeEventListener("keydown", handleGlobalCloseTabShortcut, { capture: true });
    };
  }, []);

  useEffect(() => {
    const settings = normalizeTidbitSettings(tidbitSettings);

    if (!settings.globalShortcutEnabled) {
      return;
    }

    const handleFocusedTidbitShortcut = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        (target instanceof Element && target.closest(".shortcut-capture-control")) ||
        !keyboardEventMatchesShortcut(event, settings.globalShortcut)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void openTidbitCaptureWindowRef.current();
    };

    window.addEventListener("keydown", handleFocusedTidbitShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleFocusedTidbitShortcut, { capture: true });
    };
  }, [tidbitSettings.globalShortcut, tidbitSettings.globalShortcutEnabled]);

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
    if (!imagePreview) {
      return;
    }

    const closeImagePreviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setImagePreview(null);
      }
    };

    window.addEventListener("keydown", closeImagePreviewOnEscape);

    return () => window.removeEventListener("keydown", closeImagePreviewOnEscape);
  }, [imagePreview]);

  useEffect(() => {
    if (!aiReview) {
      return;
    }

    const closeAiReviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAiReview(null);
      }
    };

    window.addEventListener("keydown", closeAiReviewOnEscape);

    return () => window.removeEventListener("keydown", closeAiReviewOnEscape);
  }, [aiReview]);

  useEffect(() => {
    if (!aiPageBuilderOpen) {
      return;
    }

    const closeAiPageBuilderOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAiPageBuilderOpen(false);
      }
    };

    window.addEventListener("keydown", closeAiPageBuilderOnEscape);

    return () => window.removeEventListener("keydown", closeAiPageBuilderOnEscape);
  }, [aiPageBuilderOpen]);

  useEffect(() => {
    if (!aiPageBuilderAssetReview) {
      return;
    }

    const closeAiPageBuilderAssetReviewOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAiPageBuilderAssetReview(null);
      }
    };

    window.addEventListener("keydown", closeAiPageBuilderAssetReviewOnEscape);

    return () =>
      window.removeEventListener("keydown", closeAiPageBuilderAssetReviewOnEscape);
  }, [aiPageBuilderAssetReview]);

  useEffect(() => {
    if (!releaseNotification) {
      return;
    }

    const closeReleaseNotificationOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReleaseNotification(null);
      }
    };

    window.addEventListener("keydown", closeReleaseNotificationOnEscape);

    return () =>
      window.removeEventListener("keydown", closeReleaseNotificationOnEscape);
  }, [releaseNotification]);

  useEffect(() => {
    let cancelled = false;

    async function checkForReleaseUpdate() {
      try {
        const response = await fetch(githubReleasesApiUrl, {
          headers: { Accept: "application/vnd.github+json" },
        });

        if (!response.ok) {
          return;
        }

        const releases = await response.json();

        if (!Array.isArray(releases)) {
          return;
        }

        const nextRelease = releases
          .filter((release) => {
            if (!release || typeof release !== "object") {
              return false;
            }

            const flags = release as Record<string, unknown>;

            return flags.draft !== true;
          })
          .map(releaseNotificationFromGitHubRelease)
          .find(
            (release): release is ReleaseNotification =>
              release !== null &&
              normalizedReleaseVersion(release.tagName) !==
                normalizedReleaseVersion(currentAppVersion),
          );

        if (!cancelled && nextRelease) {
          setReleaseNotification(nextRelease);
        }
      } catch {
        // Update checks should never interrupt local-first editing.
      }
    }

    void checkForReleaseUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!excalidrawCreateDialogOpen) {
      return;
    }

    excalidrawCreateInputRef.current?.focus();
    excalidrawCreateInputRef.current?.select();
  }, [excalidrawCreateDialogOpen]);

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

    listen("new-tab-requested", () => {
      openConfiguredNewTabRef.current();
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

      if (hasNoOpenDocumentTabs(editorGroupsRef.current)) {
        replaceEditorGroupsWithPrimaryTab(tab);
      } else {
        addTabToGroup(tab);
      }
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      setStatus(`Opened ${file.relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function openConfiguredNewTab() {
    if (!vaultRootRef.current) {
      setStatus("Open a vault before opening a new tab");
      return;
    }

    const relativePath = normalizeNewTabFile(vaultSettingsRef.current.newTabFile);

    if (!relativePath) {
      setStatus("Configure a new tab note in Settings");
      return;
    }

    // Cmd+T uses the saved setting, not the draft currently open in Settings.
    void openFile(relativePath);
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
      await revealFileInVaultDrawer(existing.tab.activeFile);
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
      await revealFileInVaultDrawer(tab.activeFile);
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
              pageName: pageNameForFileName(nextActiveFile.name),
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
      setPageName(pageNameForFileName(nextActiveFile.name));
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
              pageName: pageNameForFileName(movedFile.name),
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
      setPageName(pageNameForFileName(movedFile.name));
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

  function currentDirectoryEntry(): VaultEntry {
    return {
      name: currentDir ? relativePathFileName(currentDir) : "Vault root",
      relativePath: currentDir,
      isDir: true,
    };
  }

  function handleVaultListContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setFolderContextMenu({
      entry: currentDirectoryEntry(),
      x: event.clientX,
      y: event.clientY,
      createOnly: true,
    });
  }

  function openFolderActionDialog(action: FolderActionKind, entry: VaultEntry) {
    setFolderContextMenu(null);
    setFolderActionDialog({
      action,
      entry,
      value:
        action === "rename" || action === "rename-file"
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
      return isCanvasPath(folderActionDialog?.entry.relativePath ?? "")
        ? "Rename Canvas"
        : "Rename File";
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

    if (action === "create-canvas") {
      return "Canvas name";
    }

    if (action === "rename-file") {
      return isCanvasPath(folderActionDialog?.entry.relativePath ?? "")
        ? "Canvas name"
        : "File name";
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

  async function createCanvasFromFolderMenu(entry: VaultEntry, canvasName: string) {
    if (!vaultRoot) {
      return;
    }

    if (!canvasName?.trim()) {
      return;
    }

    try {
      const file = await invoke<OpenedFile>("create_canvas_in_directory", {
        root: vaultRoot,
        relative: entry.relativePath,
        canvasName,
      });
      const tab = createDocumentTabFromFile(file);

      snapshotActiveTab();
      addTabToGroup(tab);
      hydrateDocumentTab(tab);
      persistActiveFile(tab.activeFile);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Created canvas ${file.relativePath}`);
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

  async function renameFileFromContextMenu(entry: VaultEntry, nextName: string) {
    if (!vaultRoot || entry.isDir) {
      return;
    }

    if (!nextName?.trim()) {
      return;
    }

    try {
      snapshotActiveTab();
      const renamed = await invoke<OpenedFile>("rename_vault_file", {
        root: vaultRoot,
        relative: entry.relativePath,
        nextName,
      });
      const renamedFile = {
        name: renamed.name,
        relativePath: renamed.relativePath,
      };

      replaceOpenFilePath(entry.relativePath, renamedFile);
      replaceFileInWikiLinkIndex(entry.relativePath, renamedFile);
      moveAiBuilderHistoryKey(entry.relativePath, renamedFile.relativePath);
      await loadEntries(vaultRoot, currentDir);
      setStatus(`Renamed ${entry.name} to ${renamed.name}`);
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
    } else if (action === "create-canvas") {
      await createCanvasFromFolderMenu(entry, value);
    } else if (action === "create-folder") {
      await createFolderFromFolderMenu(entry, value);
    } else if (action === "move-folder") {
      await moveFolderFromContextMenu(entry, value);
    } else if (action === "rename-file") {
      await renameFileFromContextMenu(entry, value);
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

  function handleEditorContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    targetEditor: Editor | null,
    groupId: EditorGroupId,
  ) {
    const target = event.target instanceof HTMLElement ? event.target : null;

    if (!targetEditor || !target?.closest("table")) {
      return;
    }

    event.preventDefault();
    activateEditorGroup(groupId);

    const position = targetEditor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });

    if (position) {
      targetEditor.commands.setTextSelection(position.pos);
    }

    if (
      targetEditor.isActive("table") ||
      targetEditor.isActive("tableCell") ||
      targetEditor.isActive("tableHeader")
    ) {
      setTableContextMenu({ groupId, x: event.clientX, y: event.clientY });
    }
  }

  function alignCurrentTableColumn(targetEditor: Editor | null, alignment: TableColumnAlignment) {
    if (!targetEditor) {
      return;
    }

    const { state, view } = targetEditor;
    const restorePosition = state.selection.from;
    const tableDepth = ancestorDepthByName(state.selection.$from, "table");
    const cellDepth =
      ancestorDepthByName(state.selection.$from, "tableCell") ??
      ancestorDepthByName(state.selection.$from, "tableHeader");

    if (tableDepth === null || cellDepth === null) {
      return;
    }

    const table = state.selection.$from.node(tableDepth);
    const tableStart = state.selection.$from.start(tableDepth);
    const map = TableMap.get(table);
    const cellOffset = state.selection.$from.before(cellDepth) - tableStart;
    const column = map.colCount(cellOffset);
    const tr = state.tr;

    // Avoid CellSelection here: ProseMirror records it in undo history, so
    // Cmd+Z would restore a visible whole-column selection after undoing align.
    for (const cellPosition of map.cellsInRect({
      left: column,
      right: column + 1,
      top: 0,
      bottom: map.height,
    })) {
      const cell = table.nodeAt(cellPosition);

      if (cell && cell.attrs.align !== alignment) {
        tr.setNodeMarkup(tableStart + cellPosition, undefined, {
          ...cell.attrs,
          align: alignment,
        });
      }
    }

    if (tr.docChanged) {
      tr.setSelection(TextSelection.create(tr.doc, restorePosition));
      view.dispatch(tr);
      view.focus();
    }

    setTableContextMenu(null);
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
    const activeTab = editorGroupsRef.current[activeGroupIdRef.current].tabs.find(
      (tab) => tab.id === editorGroupsRef.current[activeGroupIdRef.current].activeTabId,
    );

    if (activeTab?.kind === "canvas") {
      setMarkdown(markdownDraft);
      updateActiveTab({
        markdown: markdownDraft,
        markdownDraft,
        dirty: true,
      });
      setActiveDocumentDirty(true);
      setStatus(`Unsaved changes in ${activeFileRef.current?.name ?? "canvas"}`);
      return;
    }

    const parts = splitMetaHeader(markdownDraft);

    // Source edits may include frontmatter pasted by hand. Split it back out so
    // the WYSIWYG body and metadata editor keep their separate responsibilities.
    if (parts.metaHeader) {
      setActiveMetaHeader(parts.metaHeader, parts.metaDelimiter);
    }

    setEditorBody(parts.body, false);
  }

  function updateCanvasDocument(groupId: EditorGroupId, nextContent: string) {
    const group = editorGroupsRef.current[groupId];
    const tab = group.tabs.find((documentTab) => documentTab.id === group.activeTabId);

    if (tab?.kind !== "canvas") {
      return;
    }

    updateGroupTab(groupId, tab.id, {
      markdown: nextContent,
      markdownDraft: nextContent,
      dirty: true,
    });

    if (groupId === activeGroupIdRef.current) {
      setMarkdown(nextContent);
      setMarkdownDraft(nextContent);
      setDirty(true);
    }

    setStatus(`Unsaved canvas changes in ${tab.activeFile?.name ?? "canvas"}`);
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

    editor.chain().focus().insertContent(emptyColumnsMarkdown, { contentType: "markdown" }).run();
  }

  function formatSelectionWithMark(markType: string, label: string) {
    if (!editor) {
      return;
    }

    const { doc, selection } = editor.state;

    if (selection.empty) {
      setStatus(`Select text before formatting it as ${label}`);
      return;
    }

    const selectedText = doc.textBetween(selection.from, selection.to, "\n", "\n");

    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: selectedText,
        marks: [{ type: markType }],
      })
      .run();
  }

  function formatSelectionAsKeyboardKey() {
    formatSelectionWithMark("keyboardKey", "a keyboard key");
  }

  function selectedGalleryImages(targetEditor: Editor) {
    const { doc, selection } = targetEditor.state;
    const images: string[] = [];
    let from = selection.from;
    let to = selection.to;

    // The command should behave like a layout operation over the current
    // selection. Expanding the replacement range to whole image nodes avoids
    // leaving behind atom boundaries when the user selects by drag.
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name !== "image") {
        return true;
      }

      images.push(imageNodeMarkdown(node));
      from = Math.min(from, pos);
      to = Math.max(to, pos + node.nodeSize);
      return false;
    });

    return { images, from, to };
  }

  function wrapSelectedImagesInGallery() {
    if (!editor) {
      return;
    }

    const { images, from, to } = selectedGalleryImages(editor);

    if (images.length === 0) {
      setStatus("Select one or more images before creating a gallery");
      return;
    }

    const galleryMarkdown = `::: gallery\n${images.join("\n\n")}\n:::`;

    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, galleryMarkdown, { contentType: "markdown" })
      .run();
    setStatus(`Created gallery with ${images.length} image${images.length === 1 ? "" : "s"}`);
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

  function insertHtmlBlock() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(emptyHtmlBlockMarkdown, { contentType: "markdown" })
      .run();
  }

  function insertMermaidDiagram() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent("```mermaid\nflowchart TD\n  A[Start] --> B[Done]\n```", {
        contentType: "markdown",
      })
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

  function currentCursorContext() {
    if (!editor) {
      return "";
    }

    const { doc, selection } = editor.state;
    const before = doc.textBetween(0, selection.from, "\n", "\n").trimEnd();
    const after = doc.textBetween(selection.to, doc.content.size, "\n", "\n").trimStart();

    // The backend transform only sees a string, so cursor-sensitive commands
    // receive an explicit boundary marker instead of relying on editor state.
    return [
      "Text before cursor:",
      before || "(empty)",
      "",
      "[[CURSOR]]",
      "",
      "Text after cursor:",
      after || "(empty)",
    ].join("\n");
  }

  function aiModelOptions() {
    return Array.from(
      new Set([normalizeAiSettings(aiDraft).model, ...aiModels].filter(Boolean)),
    );
  }

  async function refreshAiModels() {
    const settings = normalizeAiSettings(aiDraft);

    if (!settings.enabled) {
      setStatus("Enable AI commands before fetching models");
      return;
    }

    if (!settings.apiKey) {
      setStatus("Add an AI API key before fetching models");
      return;
    }

    try {
      setAiModelsLoading(true);
      setStatus("Fetching AI models");
      const response = await invoke<AiModelListResponse>("list_ai_models", { settings });

      setAiModels(response.models);
      if (!response.models.includes(settings.model)) {
        updateAiDraft({
          ...normalizeAiSettings(aiDraft),
          model: response.models[0] ?? settings.model,
        });
      }
      setStatus(`Fetched ${response.models.length} AI models`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiModelsLoading(false);
    }
  }

  async function testAiConnection() {
    const settings = normalizeAiSettings(aiDraft);

    if (!settings.enabled) {
      setStatus("Enable AI commands before testing the API");
      setAiTestStatus("error");
      return;
    }

    if (!settings.apiKey) {
      setStatus("Add an AI API key before testing the API");
      setAiTestStatus("error");
      return;
    }

    try {
      setAiTesting(true);
      setAiTestStatus(null);
      setStatus("Testing AI API");
      const response = await invoke<AiConnectionTestResponse>("test_ai_connection", {
        settings,
      });

      setAiTestStatus("success");
      setStatus(response.message);
    } catch (error) {
      setAiTestStatus("error");
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiTesting(false);
    }
  }

  async function runAiTextCommand(
    title: string,
    instruction: string,
    input: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    if (!editor) {
      return false;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before running AI commands");
      return false;
    }

    if (!input) {
      setStatus("Provide text before running this AI command");
      return false;
    }

    const settings = savedAiSettings();

    if (!settings.enabled) {
      setStatus("Enable AI commands in Settings before using this command");
      return false;
    }

    try {
      setAiSubmitting(true);
      setAiSubmittingTitle(title);
      setStatus(`Running ${title}`);
      const response = await invoke<AiTransformResponse>("run_ai_transform", {
        request: {
          settings,
          instruction,
          input,
        },
      });

      setAiReview({
        title,
        output: normalizeAiMarkdownForApply(response.output),
        applyMode,
      });
      setStatus(`Review ${title} result`);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setAiSubmitting(false);
      setAiSubmittingTitle("");
    }
  }

  async function runAiSelectionCommand(
    title: string,
    instruction: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    const input = currentSelectionText().trim();

    if (!input) {
      setStatus("Select text before running this AI command");
      return;
    }

    await runAiTextCommand(title, instruction, input, applyMode);
  }

  async function runAiSelectionOrDocumentCommand(
    title: string,
    instruction: string,
    applyMode: AiReviewState["applyMode"],
  ) {
    const input = (currentSelectionText().trim() || markdown.trim()).trim();

    if (!input) {
      setStatus("Write or select text before running this AI command");
      return;
    }

    await runAiTextCommand(title, instruction, input, applyMode);
  }

  async function runAiContinueWritingCommand() {
    const input = currentCursorContext();

    await runAiTextCommand(
      "AI: Continue writing",
      "Continue writing from [[CURSOR]] using the surrounding note as context. Return only the Markdown text that should be inserted at the cursor. Do not repeat existing text.",
      input,
      "insert-at-cursor",
    );
  }

  function stripJsonCodeFence(value: string) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    return fenced ? fenced[1].trim() : trimmed;
  }

  function parseAiPageBuilderResponse(output: string): AiPageBuilderResponse {
    try {
      const parsed = JSON.parse(stripJsonCodeFence(output)) as Partial<AiPageBuilderResponse>;
      const markdown = typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
      const assets = Array.isArray(parsed.assets)
        ? parsed.assets
            .map((asset, index) => ({
              id:
                typeof asset?.id === "string" && asset.id.trim()
                  ? asset.id.trim()
                  : `asset-${index + 1}`,
              label:
                typeof asset?.label === "string" && asset.label.trim()
                  ? asset.label.trim()
                  : `Asset ${index + 1}`,
              suggestedName:
                typeof asset?.suggestedName === "string" && asset.suggestedName.trim()
                  ? asset.suggestedName.trim()
                  : `AI asset ${index + 1}.png`,
              url: typeof asset?.url === "string" && asset.url.trim() ? asset.url.trim() : null,
              domain:
                typeof asset?.domain === "string" && asset.domain.trim()
                  ? asset.domain.trim()
                  : null,
            }))
            .filter((asset) => asset.id && asset.suggestedName)
        : [];

      if (markdown) {
        return { markdown, assets };
      }
    } catch {
      // Older or noncompliant providers may ignore the JSON format request.
      // Treat their response as plain Markdown so the builder still remains usable.
    }

    return {
      markdown: output.trim(),
      assets: [],
    };
  }

  function pageBuilderAssetDomain(asset: AiPageBuilderAssetRequest) {
    const value = asset.domain?.trim();

    if (!value) {
      return "";
    }

    try {
      return new URL(value.includes("://") ? value : `https://${value}`).hostname;
    } catch {
      return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    }
  }

  function pageBuilderAssetCandidateUrls(asset: AiPageBuilderAssetRequest) {
    const urls = new Set<string>();

    if (asset.url?.trim()) {
      urls.add(asset.url.trim());
    }

    const domain = pageBuilderAssetDomain(asset);

    if (domain) {
      urls.add(`https://logo.clearbit.com/${encodeURIComponent(domain)}`);
      urls.add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);
    }

    return Array.from(urls);
  }

  function replaceAiPageBuilderAssetPlaceholders(
    markdown: string,
    replacements: Map<string, SavedAsset>,
  ) {
    const replacedMarkdown = Array.from(replacements.entries()).reduce(
      (nextMarkdown, [id, saved]) => {
        const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const vaultImageMarkdown = `![[${saved.fileName}]]`;

        // Models often put asset placeholders in normal image markdown, e.g.
        // `![Logo]({{asset:logo}})`. A vault image token is already complete
        // image syntax, so replace the whole wrapper instead of creating the
        // invalid nested form `![Logo](![[logo.png]])`.
        return nextMarkdown
          .replace(
            new RegExp(
              `!\\[[^\\]\\n]*\\]\\(\\s*\\{\\{asset:${escapedId}\\}\\}\\s*\\)`,
              "g",
            ),
            vaultImageMarkdown,
          )
          .replace(new RegExp(`\\{\\{asset:${escapedId}\\}\\}`, "g"), vaultImageMarkdown);
      },
      markdown,
    );

    return normalizeAiMarkdownForApply(replacedMarkdown);
  }

  function normalizeMalformedVaultImageMarkdown(markdown: string) {
    return markdown.replace(
      /!\[[^\]\n]*\]\(\s*([^)]+?)\s*\)/g,
      (match, rawHref: string) => {
        let decodedHref = rawHref.trim();

        try {
          decodedHref = decodeURIComponent(decodedHref);
        } catch {
          return match;
        }

        const nestedVaultImage = decodedHref.match(/^!\[\[([^\]\n]+)\]\]$/);

        if (!nestedVaultImage) {
          return match;
        }

        const vaultTarget = cleanVaultAssetReference(nestedVaultImage[1]);

        return vaultTarget ? `![[${vaultTarget}]]` : match;
      },
    );
  }

  function normalizeAiMarkdownForApply(markdown: string) {
    // Keep malformed AI-generated vault image markdown out of saved notes.
    // `![Alt](![[image.png]])` may be easy for a model to produce, but the
    // portable vault-image form is the standalone Obsidian/Glyphary token.
    return normalizeMalformedVaultImageMarkdown(markdown);
  }

  function openAiPageBuilder() {
    if (!editor) {
      return;
    }

    if (!vaultRoot) {
      setStatus("Open a vault before using AI Page Builder");
      return;
    }

    if (!savedAiSettings().enabled) {
      setStatus("Enable AI commands in Settings before using AI Page Builder");
      return;
    }

    setAiPageBuilderPrompt("");
    setAiPageBuilderReplaceTurnId(latestReplaceableAiBuilderTurn()?.id ?? null);
    setAiPageBuilderOpen(true);
  }

  function aiPageBuilderContext(
    request: string,
    replacementTurn: AiBuilderHistoryTurn | null,
    vaultContext: string,
  ) {
    const selectedText = currentSelectionText().trim();
    const markdownExcerpt =
      markdown.length > aiPageBuilderMarkdownContextLimit
        ? `${markdown.slice(0, aiPageBuilderMarkdownContextLimit)}\n\n[...note truncated...]`
        : markdown;

    // The builder prompt is intentionally explicit about Glyphary's block
    // dialect. That makes generated sections usable in the editor instead of
    // generic Markdown that loses callouts, columns, galleries, or HTML blocks.
    return [
      "User request:",
      request.trim(),
      "",
      "Current note:",
      `Title: ${pageNameRef.current || "Untitled note"}`,
      `Vault-relative file: ${activeFileRef.current?.relativePath ?? "(unsaved note)"}`,
      "",
      "Frontmatter:",
      metaHeaderRef.current.trim() || "(none)",
      "",
      "Selected text:",
      selectedText || "(none)",
      "",
      "Recent AI Builder conversation for this file:",
      aiBuilderHistoryContext(),
      "",
      "Replacement target:",
      replacementTurn
        ? [
            `Turn id: ${replacementTurn.id}`,
            `Original request: ${replacementTurn.prompt}`,
            "Previously applied markdown:",
            replacementTurn.markdown,
          ].join("\n")
        : "(none)",
      "",
      "Vault retrieval context:",
      vaultContext,
      "",
      "Cursor context:",
      currentCursorContext(),
      "",
      "Current Markdown excerpt:",
      markdownExcerpt.trim() || "(empty)",
    ].join("\n");
  }

  async function runAiPageBuilder() {
    const request = aiPageBuilderPrompt.trim();

    if (!request) {
      setStatus("Describe what AI Page Builder should create");
      return;
    }

    const settings = savedAiSettings();

    if (!settings.enabled) {
      setStatus("Enable AI commands in Settings before using AI Page Builder");
      return;
    }

    try {
      const historyKey = activeAiBuilderHistoryKey();
      const replacementTurn = selectedAiBuilderReplacementTurn();
      const replaceTurnId = replacementTurn?.id ?? null;
      setAiSubmitting(true);
      setAiSubmittingTitle("AI: Page Builder");
      setStatus("Gathering vault context for AI: Page Builder");
      const vaultContext = await aiBuilderVaultContext(request);
      setStatus("Running AI: Page Builder");
      const response = await invoke<AiTransformResponse>("run_ai_transform", {
        request: {
          settings,
          instruction: [
            "Build a useful Glyphary page section from the user's request and page context.",
            "Return only valid JSON with this shape: {\"markdown\":\"...\",\"assets\":[{\"id\":\"stable-placeholder-id\",\"label\":\"Human label\",\"suggestedName\":\"file-name.png\",\"url\":\"https://... optional direct image URL\",\"domain\":\"example.com optional brand domain\"}]}",
            "In markdown, reference every generated asset with a placeholder exactly like {{asset:stable-placeholder-id}}. Glyphary will replace those placeholders after importing approved assets.",
            "Prefer Glyphary-native Markdown blocks when they fit: ::: callout, ::: columns, ::: gallery, ::: collapse, ```toc, Markdown tables, task lists, wikilinks like [[Page Name]], and vault images like ![[image.png]].",
            "Use raw HTML only when Markdown or Glyphary block syntax cannot express the requested layout.",
            "When using raw HTML, do not include scripts, iframes, event handlers, external stylesheets, data URLs, or remote executable content.",
            "If the user asks for logos or remote images, add asset entries instead of inventing local file paths. Prefer a direct image URL when known; otherwise include the brand domain.",
            "Do not wrap the JSON in a code fence.",
            "If the request is underspecified, choose a practical structure and keep the result editable.",
            "If a replacement target is provided, produce the complete replacement for that prior block, not a patch or diff.",
            "If vault retrieval context is provided, use it as source material for summaries, task tables, and cross-note answers. Cite source notes with [[Note Name]] links and do not imply a vault-wide search was exhaustive beyond the provided local results.",
          ].join("\n"),
          input: aiPageBuilderContext(request, replacementTurn, vaultContext),
        },
      });
      const builderResponse = parseAiPageBuilderResponse(response.output);
      const normalizedMarkdown = normalizeAiMarkdownForApply(builderResponse.markdown);

      if (builderResponse.assets.length > 0) {
        setAiPageBuilderAssetReview({
          ...builderResponse,
          prompt: request,
          historyKey: historyKey ?? "",
          replaceTurnId: replaceTurnId ?? undefined,
          markdown: normalizedMarkdown,
        });
        setStatus(`Review ${builderResponse.assets.length} requested asset import`);
      } else {
        const turn = historyKey
          ? createAiBuilderHistoryTurn(request, normalizedMarkdown)
          : null;

        if (historyKey && turn) {
          upsertAiBuilderHistoryTurn(historyKey, turn);
        }

        setAiReview({
          title: "AI: Page Builder",
          output: normalizedMarkdown,
          applyMode: "insert-at-cursor",
          aiBuilderHistoryKey: historyKey ?? undefined,
          aiBuilderTurnId: turn?.id,
          aiBuilderReplaceTurnId: replaceTurnId ?? undefined,
        });
        setStatus("Review AI: Page Builder result");
      }

      setAiPageBuilderOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiSubmitting(false);
      setAiSubmittingTitle("");
    }
  }

  async function importAiPageBuilderAssets() {
    if (!vaultRootRef.current || !aiPageBuilderAssetReview) {
      return;
    }

    try {
      setAiPageBuilderImportingAssets(true);
      setStatus("Importing AI Page Builder assets");
      const replacements = new Map<string, SavedAsset>();
      const importedAssets: AiBuilderHistoryAsset[] = [];

      for (const asset of aiPageBuilderAssetReview.assets) {
        const candidateUrls = pageBuilderAssetCandidateUrls(asset);
        let saved: SavedAsset | null = null;
        let lastError = "No image URL or brand domain was provided";

        // Brand logo resolution is intentionally best-effort and explicit:
        // direct URLs win, domain logo services are fallbacks, and failures keep
        // the placeholder out of the document instead of silently inserting a
        // broken local image reference.
        for (const url of candidateUrls) {
          try {
            saved = await invoke<SavedAsset>("import_remote_vault_image_asset", {
              root: vaultRootRef.current,
              assetDirectory: defaultVaultImageDirectory,
              fileName: asset.suggestedName,
              url,
            });
            break;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
        }

        if (!saved) {
          throw new Error(`Could not import ${asset.label}: ${lastError}`);
        }

        replacements.set(asset.id, saved);
        importedAssets.push({
          id: asset.id,
          label: asset.label,
          fileName: saved.fileName,
          relativePath: saved.relativePath,
        });
      }
      const output = replaceAiPageBuilderAssetPlaceholders(
        aiPageBuilderAssetReview.markdown,
        replacements,
      );
      const historyKey = aiPageBuilderAssetReview.historyKey || null;
      const turn = historyKey
        ? createAiBuilderHistoryTurn(aiPageBuilderAssetReview.prompt, output, importedAssets)
        : null;

      if (historyKey && turn) {
        upsertAiBuilderHistoryTurn(historyKey, turn);
      }

      setAiReview({
        title: "AI: Page Builder",
        output,
        applyMode: "insert-at-cursor",
        aiBuilderHistoryKey: historyKey ?? undefined,
        aiBuilderTurnId: turn?.id,
        aiBuilderReplaceTurnId: aiPageBuilderAssetReview.replaceTurnId,
      });
      setAiPageBuilderAssetReview(null);
      setStatus(
        `Imported ${replacements.size} AI Page Builder asset${
          replacements.size === 1 ? "" : "s"
        }`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAiPageBuilderImportingAssets(false);
    }
  }

  function replaceSelectionWithAiOutput(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .insertContent(content, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Applied AI result");
  }

  function insertAiOutputBelowSelection(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .setTextSelection(editor.state.selection.to)
      .insertContent(`\n\n${content}`, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Inserted AI result");
  }

  function insertAiOutputAtCursor(output: string) {
    if (!editor) {
      return;
    }

    const review = aiReview;
    const content = review
      ? aiReviewOutputForInsertion(review, output)
      : normalizeAiMarkdownForApply(output);

    editor
      .chain()
      .focus()
      .insertContent(content, { contentType: "markdown" })
      .run();
    if (review) {
      markAiBuilderReviewApplied(review, false);
    }
    setAiReview(null);
    setStatus("Inserted AI result");
  }

  function replacePreviousAiBuilderOutput(review: AiReviewState) {
    if (!editor || !review.aiBuilderReplaceTurnId || !review.aiBuilderTurnId) {
      return;
    }

    const nextMarkdown = replaceAiBuilderMarkedBlock(
      editor.getMarkdown(),
      review.aiBuilderReplaceTurnId,
      review.aiBuilderTurnId,
      review.output,
    );

    if (!nextMarkdown) {
      editor
        .chain()
        .focus()
        .insertContent(aiReviewOutputForInsertion(review, review.output), {
          contentType: "markdown",
        })
        .run();
      markAiBuilderReviewApplied(review, false);
      setAiReview(null);
      setStatus("Could not find previous AI Builder block; inserted result at cursor");
      return;
    }

    setEditorBody(nextMarkdown, false);
    markAiBuilderReviewApplied(review, true);
    setAiReview(null);
    setStatus("Replaced AI Builder result");
  }

  async function copyAiOutput(output: string) {
    await window.navigator.clipboard.writeText(output);
    setStatus("Copied AI result");
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

  async function openTidbitCaptureWindow() {
    const root = vaultRootRef.current;
    const settings = normalizeTidbitSettings(vaultSettingsRef.current.tidbits);

    if (!root) {
      setStatus("Open a vault before using global tidbit capture");
      return;
    }

    if (!settings.globalShortcutEnabled) {
      setStatus("Enable global tidbit capture in Settings before using its shortcut");
      return;
    }

    try {
      const context = {
        root,
        pathPattern: settings.pathPattern,
      };
      const captureAppearance = normalizeVaultAppearanceSettings(
        vaultSettingsRef.current.appearance,
      );
      const existing = await WebviewWindow.getByLabel("tidbit-capture");

      if (existing) {
        await existing.emit("tidbit-capture-context", context);
        await existing.show();
        await existing.setFocus();
        setStatus("Opened tidbit capture");
        return;
      }

      const params = new URLSearchParams({
        view: "tidbit-capture",
        root,
        pathPattern: settings.pathPattern,
      });
      const captureWindow = new WebviewWindow("tidbit-capture", {
        url: `index.html?${params.toString()}`,
        title: "New Tidbit",
        width: 640,
        height: 460,
        minWidth: 460,
        minHeight: 320,
        center: true,
        focus: true,
        resizable: true,
        skipTaskbar: true,
        transparent: captureAppearance.glassEffect,
      });

      captureWindow.once("tauri://created", () => {
        void captureWindow.emit("tidbit-capture-context", context);
        void captureWindow.show();
        void captureWindow.setFocus();
        setStatus("Opened tidbit capture");
      });
      captureWindow.once("tauri://error", (event) => {
        setStatus(`Could not open tidbit capture: ${String(event.payload)}`);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openCapturedTidbit(file: OpenedFile) {
    const root = vaultRootRef.current;

    if (!root) {
      return;
    }

    const tab = createDocumentTabFromFile(file);

    snapshotActiveTab();
    addTabToGroup(tab);
    hydrateDocumentTab(tab);
    persistActiveFile(tab.activeFile);
    addFileToWikiLinkIndex(file);
    await loadEntries(root, currentDirRef.current);
    setStatus(`Created tidbit ${file.relativePath}`);
  }

  openTidbitCaptureWindowRef.current = openTidbitCaptureWindow;
  openCapturedTidbitRef.current = openCapturedTidbit;

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

  const activeDocumentTab =
    editorGroups[activeGroupId]?.tabs.find(
      (tab) => tab.id === editorGroups[activeGroupId]?.activeTabId,
    ) ?? null;
  const activeDocumentIsCanvas = activeDocumentTab?.kind === "canvas";
  const cursorInsideTable =
    !activeDocumentIsCanvas &&
    !!editor &&
    (editor.isActive("table") ||
      editor.isActive("tableCell") ||
      editor.isActive("tableHeader"));
  // Table mutations are only valid while the current selection is inside a
  // table, so the entire submenu is contextual rather than always searchable.
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
  // AI commands use saved vault settings, not the unsaved settings draft. That
  // prevents palette actions from using an API key or model the user has not
  // explicitly saved for this vault.
  const aiCommandPaletteCommands: CommandPaletteCommand[] = savedAiSettings().enabled
    ? [
        {
          id: "ai-page-builder",
          title: "AI: Page Builder",
          description: "Build a note section from a prompt and current context",
          run: openAiPageBuilder,
        },
        {
          id: "ai-improve-writing-selection",
          title: "AI: Improve writing",
          description: "Clean up grammar, clarity, and flow while preserving meaning",
          run: () =>
            runAiSelectionCommand(
              "AI: Improve writing",
              "Improve the selected Markdown for grammar, clarity, and flow while preserving its meaning, tone, structure, and important details. Return only the improved Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-fix-spelling-grammar-selection",
          title: "AI: Fix spelling and grammar",
          description: "Apply a light spelling and grammar edit to the selection",
          run: () =>
            runAiSelectionCommand(
              "AI: Fix spelling and grammar",
              "Fix spelling, punctuation, and grammar in the selected Markdown. Keep wording changes minimal and preserve the original structure. Return only the corrected Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-shorten-selection",
          title: "AI: Shorten selection",
          description: "Compress the selected text without losing key points",
          run: () =>
            runAiSelectionCommand(
              "AI: Shorten selection",
              "Shorten the selected Markdown while preserving the essential meaning and important details. Return only the shortened Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-expand-selection",
          title: "AI: Expand selection",
          description: "Elaborate terse notes into fuller Markdown prose",
          run: () =>
            runAiSelectionCommand(
              "AI: Expand selection",
              "Expand the selected Markdown into clearer, fuller writing. Preserve the original meaning, avoid inventing unsupported facts, and return only the expanded Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-formal-selection",
          title: "AI: Make selection more formal",
          description: "Rewrite the selection in a more formal tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more formal",
              "Rewrite the selected Markdown in a more formal tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-casual-selection",
          title: "AI: Make selection more casual",
          description: "Rewrite the selection in a more casual tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more casual",
              "Rewrite the selected Markdown in a more casual, natural tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-direct-selection",
          title: "AI: Make selection more direct",
          description: "Rewrite the selection to be clearer and more direct",
          run: () =>
            runAiSelectionCommand(
              "AI: Make selection more direct",
              "Rewrite the selected Markdown to be more direct and concise while preserving meaning and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-tone-polished-selection",
          title: "AI: Polish selection",
          description: "Rewrite the selection with a more polished tone",
          run: () =>
            runAiSelectionCommand(
              "AI: Polish selection",
              "Rewrite the selected Markdown with a polished, professional tone while preserving meaning, structure, and important details. Return only the rewritten Markdown.",
              "replace-selection",
            ),
        },
        {
          id: "ai-summarize-selection",
          title: "AI: Summarize selection",
          description: "Create a concise Markdown summary of the selected text",
          run: () =>
            runAiSelectionCommand(
              "AI: Summarize selection",
              "Summarize the selected Markdown concisely. Use Markdown bullets if that makes the result easier to scan.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-extract-tasks-selection",
          title: "AI: Extract tasks from selection",
          description: "Turn the selected text into Markdown task items",
          run: () =>
            runAiSelectionCommand(
              "AI: Extract tasks from selection",
              "Extract concrete action items from the selected Markdown. Return only Markdown task list items using '- [ ]'.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-create-outline-selection",
          title: "AI: Create outline",
          description: "Turn the selected text into Markdown headings and bullets",
          run: () =>
            runAiSelectionCommand(
              "AI: Create outline",
              "Turn the selected Markdown into a useful outline with Markdown headings and bullets. Preserve important ideas and ordering. Return only the outline.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-generate-title",
          title: "AI: Generate title",
          description: "Suggest a concise title from the selection or current note",
          run: () =>
            runAiSelectionOrDocumentCommand(
              "AI: Generate title",
              "Suggest one concise, specific title for this note or selected Markdown. Return only the title text with no quotes, prefix, or explanation.",
              "insert-below-selection",
            ),
        },
        {
          id: "ai-continue-writing",
          title: "AI: Continue writing",
          description: "Continue from the cursor using the surrounding note as context",
          run: runAiContinueWritingCommand,
        },
        {
          id: "ai-explain-selection",
          title: "AI: Explain selection",
          description: "Explain the selected concept in simpler terms",
          run: () =>
            runAiSelectionCommand(
              "AI: Explain selection",
              "Explain the selected Markdown in simpler terms for a reader who is new to the topic. Preserve important nuance and return only Markdown.",
              "insert-below-selection",
            ),
        },
      ]
    : [];
  function requestCanvasCommand(action: CanvasCommandAction) {
    canvasCommandRequestIdRef.current += 1;
    setCanvasCommandRequest({
      id: canvasCommandRequestIdRef.current,
      action,
    });
  }

  const canvasInsertCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "canvas-add-card",
      title: "Add Card",
      description: "Insert a new editable canvas card",
      run: () => requestCanvasCommand("card"),
    },
    {
      id: "canvas-add-note-from-vault",
      title: "Add Note From Vault",
      description: "Insert a Markdown note node selected from the vault",
      run: () => requestCanvasCommand("note"),
    },
    {
      id: "canvas-add-media-from-vault",
      title: "Add Media From Vault",
      description: "Insert an image, video, or audio node selected from the vault",
      run: () => requestCanvasCommand("media"),
    },
    {
      id: "canvas-add-web-page",
      title: "Add Web Page",
      description: "Insert a web page node",
      run: () => requestCanvasCommand("web"),
    },
    {
      id: "canvas-create-group",
      title: "Create Group",
      description: "Insert a visual grouping region",
      run: () => requestCanvasCommand("group"),
    },
  ];
  // Insert commands are grouped for density, but they remain ordinary commands
  // once the user enters the submenu so fuzzy search and keyboard behavior stay
  // identical to the root palette.
  const insertCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "insert-rich-link",
      title: "Insert rich link",
      description: "Fetch a URL preview and insert a rich link card",
      run: openRichLinkDialog,
    },
    {
      id: "insert-excalidraw",
      title: "Insert Excalidraw drawing",
      description: "Create and embed an editable vault drawing",
      run: openExcalidrawCreateDialog,
    },
    {
      id: "insert-columns",
      title: "Insert columns",
      description: "Add a two-column Markdown container",
      run: appendColumns,
    },
    {
      id: "gallery-layout",
      title: "Gallery layout",
      description: "Arrange selected images into a visual gallery",
      run: wrapSelectedImagesInGallery,
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
      id: "insert-html-block",
      title: "Insert HTML block",
      description: "Add a sanitized raw HTML block",
      run: insertHtmlBlock,
    },
    {
      id: "insert-mermaid-diagram",
      title: "Insert Mermaid diagram",
      description: "Add a rendered Mermaid diagram block",
      run: insertMermaidDiagram,
    },
    {
      id: "insert-table-of-contents",
      title: "Insert table of contents",
      description: "Add a rendered table of contents block",
      run: appendTableOfContentsBlock,
    },
  ];
  const activeInsertCommandPaletteCommands = activeDocumentIsCanvas
    ? canvasInsertCommandPaletteCommands
    : insertCommandPaletteCommands;
  const openInsertCommandPalette = () => {
    setCommandPaletteScope("insert");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
  };
  const formatCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "format-strikethrough",
      title: "Strikethrough",
      description: "Wrap selected text in ~~ delimiters",
      run: () => formatSelectionWithMark("strike", "strikethrough"),
    },
    {
      id: "format-highlight",
      title: "Highlight",
      description: "Wrap selected text in == delimiters",
      run: () => formatSelectionWithMark("highlight", "a highlight"),
    },
    {
      id: "format-superscript",
      title: "Superscript",
      description: "Wrap selected text in ^ delimiters",
      run: () => formatSelectionWithMark("superscript", "superscript"),
    },
    {
      id: "format-subscript",
      title: "Subscript",
      description: "Wrap selected text in ~ delimiters",
      run: () => formatSelectionWithMark("subscript", "subscript"),
    },
    {
      id: "format-keyboard",
      title: "Keyboard",
      description: "Wrap selected text in <kbd> tags",
      run: formatSelectionAsKeyboardKey,
    },
  ];
  const openFormatCommandPalette = () => {
    setCommandPaletteScope("format");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
  };
  const canvasCommandPaletteCommands: CommandPaletteCommand[] = [
    {
      id: "insert-menu",
      title: "Insert ...",
      description: "Open canvas insert commands",
      run: openInsertCommandPalette,
    },
  ];
  const editorCommandPaletteCommands: CommandPaletteCommand[] = [
    // Table editing is contextual enough that the palette keeps it close to
    // the cursor state instead of permanently crowding the formatting toolbar.
    ...(tableCommandPaletteCommands.length > 0
      ? [
          {
            id: "table-menu",
            title: "Table ...",
            description: "Open table editing commands",
            run: () => {
              setCommandPaletteScope("table");
              setCommandPaletteQuery("");
              setCommandPaletteSelectedIndex(0);
              window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
            },
          },
        ]
      : []),
    {
      id: "create-tidbit",
      title: "Create Tidbit",
      description: "Create a fast note from the vault tidbit path pattern",
      run: createTidbit,
    },
    ...(aiCommandPaletteCommands.length > 0
      ? [
          {
            id: "ai-menu",
            title: "AI ...",
            description: "Open AI writing commands",
            run: () => {
              setCommandPaletteScope("ai");
              setCommandPaletteQuery("");
              setCommandPaletteSelectedIndex(0);
              window.setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
            },
          },
        ]
      : []),
    {
      id: "insert-menu",
      title: "Insert ...",
      description: "Open insert commands",
      run: openInsertCommandPalette,
    },
    {
      id: "format-menu",
      title: "Format ...",
      description: "Open selection formatting commands",
      run: openFormatCommandPalette,
    },
    ...pluginCommandPaletteCommands,
  ];
  const commandPaletteCommands = activeDocumentTab
    ? activeDocumentIsCanvas
      ? canvasCommandPaletteCommands
      : editorCommandPaletteCommands
    : [];
  // All scopes share the same filtering, selection, and rendering pipeline.
  // Adding a new grouped menu should usually mean adding one command list here
  // and a root "Name ..." command that switches to that scope.
  const activeCommandPaletteCommands =
    commandPaletteScope === "ai" && !activeDocumentIsCanvas
      ? aiCommandPaletteCommands
      : commandPaletteScope === "insert"
        ? activeInsertCommandPaletteCommands
        : commandPaletteScope === "format" && !activeDocumentIsCanvas
          ? formatCommandPaletteCommands
        : commandPaletteScope === "table" && !activeDocumentIsCanvas
          ? tableCommandPaletteCommands
          : commandPaletteCommands;
  const commandPaletteScopeTitle =
    commandPaletteScope === "ai"
      ? "AI commands"
    : commandPaletteScope === "insert"
        ? activeDocumentIsCanvas
          ? "Canvas insert commands"
          : "Insert commands"
        : commandPaletteScope === "format"
          ? "Format commands"
        : commandPaletteScope === "table"
          ? "Table commands"
          : "";
  const commandPalettePlaceholder =
    commandPaletteScope === "ai"
      ? "Type an AI command..."
      : commandPaletteScope === "insert"
        ? activeDocumentIsCanvas
          ? "Type a canvas insert command..."
          : "Type an insert command..."
        : commandPaletteScope === "format"
          ? "Type a format command..."
        : commandPaletteScope === "table"
          ? "Type a table command..."
          : "Type a command...";
  const normalizedCommandPaletteQuery = commandPaletteQuery.trim().toLowerCase();
  const filteredCommandPaletteCommands = normalizedCommandPaletteQuery
    ? activeCommandPaletteCommands.filter((command) =>
        `${command.title} ${command.description}`.toLowerCase().includes(
          normalizedCommandPaletteQuery,
        ),
      )
    : activeCommandPaletteCommands;
  const selectedCommandPaletteCommand =
    filteredCommandPaletteCommands[
      Math.min(commandPaletteSelectedIndex, filteredCommandPaletteCommands.length - 1)
    ] ?? null;

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    // Filtering or changing scopes can shrink the visible command list while
    // preserving the old index; clamp it before reading the active command.
    setCommandPaletteSelectedIndex((index) =>
      Math.min(index, Math.max(filteredCommandPaletteCommands.length - 1, 0)),
    );
  }, [commandPaletteOpen, filteredCommandPaletteCommands.length]);

  useEffect(() => {
    if (!commandPaletteOpen || !selectedCommandPaletteCommand) {
      return;
    }

    const results = commandPaletteResultsRef.current;
    const activeOption = document.getElementById(
      `command-palette-${selectedCommandPaletteCommand.id}`,
    );

    if (results?.contains(activeOption)) {
      activeOption?.scrollIntoView({ block: "nearest" });
    }
  }, [commandPaletteOpen, commandPaletteSelectedIndex, selectedCommandPaletteCommand]);

  function closeCommandPalette() {
    restoreCommandPaletteSelection();
    setCommandPaletteOpen(false);
    setCommandPaletteScope("root");
    setCommandPaletteQuery("");
    setCommandPaletteSelectedIndex(0);
    commandPaletteSelectionRef.current = null;
  }

  function handleCommandPaletteKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      // Escape follows the same hierarchy as Alfred-style palettes: first back
      // out of the submenu, then close the dialog from the root.
      if (commandPaletteScope !== "root") {
        setCommandPaletteScope("root");
        setCommandPaletteQuery("");
        setCommandPaletteSelectedIndex(0);
        return;
      }

      closeCommandPalette();
      return;
    }

    if (
      event.key === "Backspace" &&
      commandPaletteScope !== "root" &&
      commandPaletteQuery.length === 0
    ) {
      event.preventDefault();
      setCommandPaletteScope("root");
      setCommandPaletteSelectedIndex(0);
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
    // Submenu commands are navigational; closing here would make selecting
    // "AI ...", "Insert ...", or "Table ..." look like a no-op.
    if (
      command.id === "ai-menu" ||
      command.id === "insert-menu" ||
      command.id === "format-menu" ||
      command.id === "table-menu"
    ) {
      await command.run();
      return;
    }

    closeCommandPalette();
    await command.run();
    setEditorFocused(true);
    if (
      command.id !== "insert-rich-link" &&
      command.id !== "insert-excalidraw" &&
      command.id !== "create-tidbit" &&
      !command.id.startsWith("format-") &&
      !command.id.startsWith("ai-")
    ) {
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

    if (vaultDrawerItem === "tasks") {
      return "Tasks";
    }

    return "Search";
  }

  function vaultDrawerSubtitle() {
    if (vaultDrawerItem === "files") {
      return vaultRoot
        ? displayVaultRelativePath(activeFile?.relativePath ?? currentDir, vaultRoot)
        : "No vault selected";
    }

    if (vaultDrawerItem === "recent") {
      return vaultRoot ? "Recently opened files" : "Open a vault";
    }

    if (vaultDrawerItem === "tasks") {
      return vaultRoot ? "Markdown task list items" : "Open a vault";
    }

    return "Find in vault";
  }

  function taskSearchPattern(filter: TaskFilter) {
    if (filter === "complete") {
      return "- \\[[xX]\\]";
    }

    if (filter === "all") {
      return "- \\[( |[xX])\\]";
    }

    return "- \\[ \\]";
  }

  function taskResultPresentation(lineText: string | null | undefined) {
    const line = lineText?.trim() || "Task";
    const match = line.match(/^- \[([ xX])\]\s*(.*)$/);

    if (!match) {
      return {
        label: line,
        completed: false,
      };
    }

    return {
      label: match[2] || "Task",
      completed: match[1].toLowerCase() === "x",
    };
  }

  const visibleTaskResults = useMemo(() => {
    const query = taskListQuery.trim().toLowerCase();

    return taskResults
      .filter((result) => {
        if (!query) {
          return true;
        }

        const task = taskResultPresentation(result.lineText);
        const searchableText = `${task.label} ${result.relativePath}`.toLowerCase();

        return searchableText.includes(query);
      })
      .sort((left, right) => {
        if (taskSort === "date") {
          const byDate = (right.modifiedMs ?? 0) - (left.modifiedMs ?? 0);

          if (byDate !== 0) {
            return byDate;
          }
        }

        const leftTask = taskResultPresentation(left.lineText);
        const rightTask = taskResultPresentation(right.lineText);
        const byName = leftTask.label.localeCompare(rightTask.label, undefined, {
          sensitivity: "base",
        });

        if (byName !== 0) {
          return byName;
        }

        return `${left.relativePath}:${left.lineNumber ?? 0}`.localeCompare(
          `${right.relativePath}:${right.lineNumber ?? 0}`,
        );
      });
  }, [taskListQuery, taskResults, taskSort]);

  async function refreshTasks(filter = taskFilter) {
    if (!vaultRoot) {
      setTaskResults([]);
      return;
    }

    try {
      setTasksSearching(true);
      const results = await invoke<SearchResult[]>("search_vault", {
        root: vaultRoot,
        query: taskSearchPattern(filter),
        includeContent: true,
        markdownOnly: true,
        excludeDotPaths: true,
      });

      // Filename hits are not useful in this view; task navigation is based on
      // the exact Markdown task lines returned by content search.
      const contentResults = results.filter((result) => result.isContentMatch);
      setTaskResults(contentResults);
      setStatus(
        `Found ${contentResults.length} task${contentResults.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTasksSearching(false);
    }
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

  useEffect(() => {
    if (vaultDrawerItem !== "tasks") {
      return;
    }

    void refreshTasks(taskFilter);
  }, [vaultDrawerItem, vaultRoot, taskFilter]);

  function openImagePreviewFromEditor(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLImageElement) || (!target.currentSrc && !target.src)) {
      return;
    }

    // Use the rendered image URL as the source of truth; vault images, normal
    // markdown images, and gallery images have already been resolved by the
    // image node renderer by the time the user double-clicks.
    event.preventDefault();
    event.stopPropagation();
    setImagePreview({
      src: target.currentSrc || target.src,
      alt: target.alt || target.title || "Image preview",
    });
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
    const paneMarkdown = isActiveGroup ? markdown : groupActiveTab?.markdown ?? "";
    const paneActiveFile = isActiveGroup ? activeFile : groupActiveTab?.activeFile ?? null;
    const isCanvasTab = groupActiveTab?.kind === "canvas";
    const showEditingChrome = documentDisplayMode === "edit";
    const frontmatterPillSettings = normalizeFrontmatterPillSettings(
      vaultSettings.frontmatterPills,
    );
    const frontmatterPills = frontmatterPillSettings.enabled
      ? frontmatterListValues(paneMetaHeader, frontmatterPillSettings.headerName)
      : [];
    const bannerSrc = !isCanvasTab
      ? joinVaultRelativeImagePath(vaultRoot, frontmatterScalarValue(paneMetaHeader, "banner"))
      : "";

    // Only the active pane renders the toolbar. Toolbar actions are tied to the
    // active editor mirror; hiding inactive toolbars avoids commands landing in
    // the wrong split.
    return (
      <div
        className={isActiveGroup ? "editor-pane-shell active-group" : "editor-pane-shell"}
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
        {!groupActiveTab ? (
          <div className="editor-pane no-document-pane">
            <div className="empty-document-placeholder no-document">
              Open or create a note to start editing.
            </div>
          </div>
        ) : (
          <div className={isCanvasTab ? "editor-pane canvas-editor-pane" : "editor-pane"}>
            {bannerSrc ? (
              <figure className="document-banner">
                <img alt="" src={bannerSrc} />
              </figure>
            ) : null}
            {!isCanvasTab && showEditingChrome ? (
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
            ) : null}

            {isActiveGroup && !isCanvasTab && showEditingChrome ? (
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

            {isActiveGroup && !isCanvasTab && pageSearchOpen ? (
              <div className="page-search-bar" role="search" aria-label="Find in page">
                <input
                  ref={pageSearchInputRef}
                  aria-label="Find in page"
                  placeholder="Find in page"
                  spellCheck="false"
                  value={pageSearchQuery}
                  onChange={(event) => {
                    setPageSearchQuery(event.currentTarget.value);
                    setPageSearchIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closePageSearch();
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      movePageSearch(event.shiftKey ? -1 : 1);
                    }
                  }}
                />
                <span>
                  {pageSearchQuery.trim()
                    ? pageSearchResults.length > 0
                      ? `${pageSearchActiveIndex + 1}/${pageSearchResults.length}`
                      : "0/0"
                    : "0/0"}
                </span>
                <button
                  type="button"
                  aria-label="Previous match"
                  disabled={pageSearchResults.length === 0}
                  onClick={() => movePageSearch(-1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  aria-label="Next match"
                  disabled={pageSearchResults.length === 0}
                  onClick={() => movePageSearch(1)}
                >
                  Down
                </button>
                <button type="button" aria-label="Close find in page" onClick={closePageSearch}>
                  Close
                </button>
              </div>
            ) : null}

            {isCanvasTab ? (
              <CanvasView
                commandRequest={isActiveGroup ? canvasCommandRequest : null}
                content={paneMarkdown}
                name={panePageName}
                settings={canvasDraft}
                vaultRoot={vaultRoot}
                onChange={(nextContent) => updateCanvasDocument(groupId, nextContent)}
                onOpenFile={openFile}
              />
            ) : (
              <div className="editor-surface-frame">
                <EditorContent
                  className="editor-surface markdown-rendered markdown-preview-view"
                  editor={groupEditor}
                  onDoubleClick={openImagePreviewFromEditor}
                  onContextMenu={(event) => handleEditorContextMenu(event, groupEditor, groupId)}
                />
                {!paneMarkdown.trim() ? (
                  <div className="empty-document-placeholder" aria-hidden="true">
                    Start writing...
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const workspaceStyle = {
    "--vault-width": `${vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth}px`,
    "--drawer-width": `${drawerOpen ? inspectorDrawerWidth : closedDrawerWidth}px`,
    "--vault-resizer-width": vaultDrawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
    "--drawer-resizer-width": drawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
  } as CSSProperties;
  const normalizedVaultAppearanceDraft =
    normalizeVaultAppearanceSettings(vaultAppearanceDraft);
  const normalizedCanvasDraft = normalizeCanvasSettings(canvasDraft);

  const appShellClassName = [
    "app-shell",
    themeOptionsDraft.colorfulHeadings ? "theme-colorful-headings" : null,
    themeOptionsDraft.headingUnderlines ? "theme-heading-underlines" : null,
    themeOptionsDraft.headingAnchors ? "theme-heading-anchors" : null,
    themeOptionsDraft.richCallouts ? "theme-rich-callouts" : null,
    `callout-style-${themeCalloutDraft.style}`,
    `section-corners-${normalizedVaultAppearanceDraft.sectionCorners}`,
    `workspace-margin-${normalizedVaultAppearanceDraft.workspaceMargin}`,
    `ui-weight-${normalizedVaultAppearanceDraft.uiFontWeight}`,
  ]
    .filter(Boolean)
    .join(" ");
  const appShellStyle = {
    "--glyphary-callout-note-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.note)}"`,
    "--glyphary-callout-info-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.info)}"`,
    "--glyphary-callout-tip-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.tip)}"`,
    "--glyphary-callout-warning-icon": `"${calloutIconGlyph(themeCalloutDraft.icons.warning)}"`,
    "--vault-width": `${vaultDrawerOpen ? vaultDrawerWidth : closedDrawerWidth}px`,
    "--drawer-width": `${drawerOpen ? inspectorDrawerWidth : closedDrawerWidth}px`,
    "--vault-resizer-width": vaultDrawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
    "--drawer-resizer-width": drawerOpen ? `${workspaceResizeHandleWidth}px` : "0px",
  } as CSSProperties;
  const settingsCardStyle = {
    transform: `translate(${settingsOffset.x}px, ${settingsOffset.y}px)`,
  } as CSSProperties;
  const aiBuilderHistoryTurns = activeAiBuilderHistoryTurns();
  const tableContextEditor = tableContextMenu
    ? editorForGroup(tableContextMenu.groupId)
    : null;

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
        <div className="app-actions">
          {!hideDuplicateDocumentActions ? (
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
          {!hideDuplicateDocumentActions ? (
            <button className="secondary-action" type="button" onClick={resetDocument}>
              New
            </button>
          ) : null}
          <div className="view-mode-control" role="group" aria-label="Document display mode">
            <button
              className={documentDisplayMode === "view" ? "view-mode-button active" : "view-mode-button"}
              type="button"
              aria-label="View mode"
              aria-pressed={documentDisplayMode === "view"}
              title="View Mode"
              onClick={() => setDocumentDisplayMode("view")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            </button>
            <button
              className={documentDisplayMode === "edit" ? "view-mode-button active" : "view-mode-button"}
              type="button"
              aria-label="Edit mode"
              aria-pressed={documentDisplayMode === "edit"}
              title="Edit Mode"
              onClick={() => setDocumentDisplayMode("edit")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M5 19h4.2L18.5 9.7a2 2 0 0 0-2.8-2.8L6.4 16.2Z" />
                <path d="m14.4 8.2 1.4 1.4" />
              </svg>
            </button>
          </div>
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

      {vaultRoot ? (
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
            <button
              className={vaultDrawerItem === "tasks" && vaultDrawerOpen ? "vault-tab active" : "vault-tab"}
              type="button"
              aria-label={
                vaultDrawerOpen && vaultDrawerItem === "tasks"
                  ? "Close tasks drawer"
                  : "Open tasks drawer"
              }
              title={vaultDrawerOpen && vaultDrawerItem === "tasks" ? "Close Tasks" : "Open Tasks"}
              onClick={() => toggleVaultDrawerItem("tasks")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M9 6h11" />
                <path d="M9 12h11" />
                <path d="M9 18h11" />
                <path d="m3.7 6 1.1 1.1L7 4.8" />
                <rect x="3.3" y="10.7" width="3.4" height="3.4" rx="0.7" />
                <rect x="3.3" y="16.7" width="3.4" height="3.4" rx="0.7" />
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
                </div>
              </div>
              {vaultDrawerItem === "files" ? (
                <>
                  <div className="vault-path">
                    {displayVaultRelativePath(activeFile?.relativePath ?? currentDir, vaultRoot)}
                  </div>
                  <div
                    className="vault-list"
                    role="list"
                    onContextMenu={handleVaultListContextMenu}
                  >
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
                        {entry.isDir ? <FolderIcon /> : <VaultFileIcon relativePath={entry.relativePath} />}
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
                      <VaultFileIcon relativePath={file.relativePath} />
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
              ) : vaultDrawerItem === "tasks" ? (
                <div className="vault-tasks" role="region" aria-label="Vault tasks">
                  <div className="task-options" aria-label="Task filter">
                    <button
                      className={taskFilter === "incomplete" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setTaskFilter("incomplete")}
                    >
                      Open
                    </button>
                    <button
                      className={taskFilter === "complete" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setTaskFilter("complete")}
                    >
                      Done
                    </button>
                    <button
                      className={taskFilter === "all" ? "active" : ""}
                      disabled={!vaultRoot}
                      type="button"
                      onClick={() => setTaskFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className="task-refresh-button"
                      disabled={!vaultRoot || tasksSearching}
                      type="button"
                      title="Refresh tasks"
                      aria-label="Refresh tasks"
                      onClick={() => refreshTasks(taskFilter)}
                    >
                      {tasksSearching ? "..." : renderToolbarIcon("refresh")}
                    </button>
                  </div>
                  <div className="task-list-tools">
                    <label>
                      <span>Find</span>
                      <input
                        disabled={!vaultRoot}
                        value={taskListQuery}
                        onChange={(event) => setTaskListQuery(event.currentTarget.value)}
                        placeholder="Filter tasks"
                      />
                    </label>
                    <label>
                      <span>Sort</span>
                      <select
                        disabled={!vaultRoot}
                        value={taskSort}
                        onChange={(event) => setTaskSort(event.currentTarget.value as TaskSort)}
                      >
                        <option value="name">Name</option>
                        <option value="date">Date</option>
                      </select>
                    </label>
                  </div>
                  {visibleTaskResults.length > 0 ? (
                    <div className="task-results" role="list" aria-label="Task results">
                      {visibleTaskResults.map((result, index) => {
                        const task = taskResultPresentation(result.lineText);

                        return (
                          <button
                            key={`${result.relativePath}-${result.lineNumber ?? "task"}-${index}`}
                            type="button"
                            onClick={() => openSearchResult(result)}
                          >
                            <span
                              className={
                                task.completed
                                  ? "task-result-icon completed"
                                  : "task-result-icon"
                              }
                            >
                              {renderToolbarIcon(task.completed ? "task-done" : "task-open")}
                            </span>
                            <span className="task-result-text">
                              <strong>{task.label}</strong>
                              <span>
                                {result.relativePath}
                                {result.lineNumber ? `:${result.lineNumber}` : ""}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : vaultRoot ? (
                    <p className="empty-vault">
                      {tasksSearching
                        ? "Searching tasks..."
                        : taskResults.length > 0
                          ? "No tasks match this filter."
                          : "No matching tasks found."}
                    </p>
                  ) : (
                    <p className="empty-vault">Open a vault to list Markdown tasks.</p>
                  )}
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
                      ? activeDocumentIsCanvas
                        ? "Canvas JSON source"
                        : "Markdown source and export"
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
                      <h2>{activeDocumentIsCanvas ? "JSON Source" : "Source"}</h2>
                      <button className="inline-action" type="button" onClick={applyMarkdown}>
                        Apply
                      </button>
                    </div>
                    <textarea
                      aria-label={activeDocumentIsCanvas ? "Canvas JSON source" : "Markdown source"}
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
                      <h2>{activeDocumentIsCanvas ? "Preview Source" : "Export"}</h2>
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
      ) : (
        <section className="vault-onboarding" aria-label="Open a vault">
          <div className="vault-onboarding-card">
            <div className="vault-onboarding-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M3.5 6.5h6.2l2 2h8.8v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
                <path d="M2.5 9.5h19" />
                <path d="M8 14h8" />
              </svg>
            </div>
            <div className="vault-onboarding-copy">
              <p className="vault-onboarding-kicker">Welcome to Glyphary</p>
              <h1>Choose a vault to begin.</h1>
              <p>
                Glyphary works directly with a folder of Markdown notes. Select your Obsidian
                vault, or any folder you want to use as a vault, and the file browser, search,
                daily notes, assets, and settings will be scoped to that location.
              </p>
            </div>
            <button className="primary-action vault-onboarding-action" type="button" onClick={openVault}>
              Select Vault Folder
            </button>
          </div>
        </section>
      )}
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
                  className={settingsTab === "canvas" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "canvas"}
                  onClick={() => setSettingsTab("canvas")}
                >
                  Canvas
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
                <button
                  className={settingsTab === "ai" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "ai"}
                  onClick={() => setSettingsTab("ai")}
                >
                  AI
                </button>
                <button
                  className={settingsTab === "debug" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "debug"}
                  onClick={() => setSettingsTab("debug")}
                >
                  Debug
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
                    <label>
                      <span>New Tab</span>
                      <div className="shortcut-capture-control">
                        <input
                          disabled={!vaultRoot}
                          value={newTabFileDraft}
                          onChange={(event) => setNewTabFileDraft(event.currentTarget.value)}
                          placeholder="No file selected"
                        />
                        <button
                          type="button"
                          disabled={!vaultRoot}
                          onClick={() => void chooseNewTabFile()}
                        >
                          Choose...
                        </button>
                        <button
                          type="button"
                          disabled={!vaultRoot || !activeFile}
                          onClick={() => setNewTabFileDraft(activeFile?.relativePath ?? "")}
                        >
                          Current
                        </button>
                        <button
                          type="button"
                          disabled={!vaultRoot || !newTabFileDraft}
                          onClick={() => setNewTabFileDraft(defaultNewTabFile)}
                        >
                          Clear
                        </button>
                      </div>
                      <small>Cmd+T opens this vault file in the active pane.</small>
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
                        onChange={(event) => {
                          const pathPattern = event.currentTarget.value;

                          setTidbitDraft((settings) => ({
                            ...settings,
                            pathPattern,
                          }));
                        }}
                        placeholder={defaultTidbitPathPattern}
                      />
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={tidbitDraft.globalShortcutEnabled}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const globalShortcutEnabled = event.currentTarget.checked;

                          setTidbitDraft((settings) => ({
                            ...settings,
                            globalShortcutEnabled,
                          }));

                          if (globalShortcutEnabled) {
                            void requestTidbitShortcutAccessibilityPermission();
                            setStatus("Save Settings to activate global tidbit capture");
                          }
                        }}
                      />
                      <span>Enable global tidbit capture shortcut</span>
                    </label>
                    <label>
                      <span>Global tidbit shortcut</span>
                      <div className="shortcut-capture-control">
                        <input
                          aria-describedby="global-tidbit-shortcut-hint"
                          disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled}
                          readOnly
                          value={tidbitDraft.globalShortcut}
                          onKeyDown={(event) => {
                            const globalShortcut = shortcutFromKeyboardEvent(event);

                            event.preventDefault();
                            event.stopPropagation();

                            if (!globalShortcut) {
                              return;
                            }

                            setTidbitDraft((settings) => ({
                              ...settings,
                              globalShortcut,
                            }));
                          }}
                          placeholder={defaultTidbitGlobalShortcut}
                        />
                        <button
                          type="button"
                          disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled}
                          onClick={() =>
                            setTidbitDraft((settings) => ({
                              ...settings,
                              globalShortcut: defaultTidbitGlobalShortcut,
                            }))
                          }
                        >
                          Reset
                        </button>
                      </div>
                      <small id="global-tidbit-shortcut-hint">
                        Focus the field and press the shortcut you want to use. Save Settings to activate it.
                      </small>
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
              {settingsTab === "canvas" ? (
                <div className="settings-tab-panel" role="tabpanel" aria-label="Canvas settings">
                  <section className="settings-section" aria-label="Canvas rendering settings">
                    <div className="settings-section-header">
                      <div>
                        <h3>Canvas</h3>
                        <p>Tune JSON Canvas rendering and interaction for this vault.</p>
                      </div>
                    </div>
                    <label className="settings-range-control">
                      <span>
                        Node border thickness
                        <strong>{normalizedCanvasDraft.nodeBorderWidth.toFixed(1)}px</strong>
                      </span>
                      <input
                        aria-label="Canvas node border thickness"
                        disabled={!vaultRoot}
                        max="6"
                        min="0"
                        step="0.5"
                        type="range"
                        value={normalizedCanvasDraft.nodeBorderWidth}
                        onChange={(event) => {
                          const nodeBorderWidth = Number(event.currentTarget.value);
                          setCanvasDraft((settings) => ({
                            ...normalizeCanvasSettings(settings),
                            nodeBorderWidth,
                          }));
                        }}
                      />
                    </label>
                    <label className="settings-range-control">
                      <span>
                        Edge thickness
                        <strong>{normalizedCanvasDraft.edgeThickness.toFixed(1)}px</strong>
                      </span>
                      <input
                        aria-label="Canvas edge thickness"
                        disabled={!vaultRoot}
                        max="8"
                        min="0.5"
                        step="0.5"
                        type="range"
                        value={normalizedCanvasDraft.edgeThickness}
                        onChange={(event) => {
                          const edgeThickness = Number(event.currentTarget.value);
                          setCanvasDraft((settings) => ({
                            ...normalizeCanvasSettings(settings),
                            edgeThickness,
                          }));
                        }}
                      />
                    </label>
                    <label className="settings-field compact-field">
                      <span>Edge style</span>
                      <select
                        disabled={!vaultRoot}
                        value={normalizedCanvasDraft.edgeStyle}
                        onChange={(event) => {
                          const edgeStyle = event.currentTarget
                            .value as CanvasSettings["edgeStyle"];
                          setCanvasDraft((settings) => ({
                            ...normalizeCanvasSettings(settings),
                            edgeStyle,
                          }));
                        }}
                      >
                        <option value="curved">Curved</option>
                        <option value="straight">Straight</option>
                        <option value="stepped">Stepped</option>
                      </select>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={normalizedCanvasDraft.showGrid}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const showGrid = event.currentTarget.checked;
                          setCanvasDraft((settings) => ({
                            ...normalizeCanvasSettings(settings),
                            showGrid,
                          }));
                        }}
                      />
                      <span>Show canvas grid</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={normalizedCanvasDraft.snapToGrid}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const snapToGrid = event.currentTarget.checked;
                          setCanvasDraft((settings) => ({
                            ...normalizeCanvasSettings(settings),
                            snapToGrid,
                          }));
                        }}
                      />
                      <span>Snap moved nodes to grid</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={normalizedCanvasDraft.showNavigationPreview}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const showNavigationPreview = event.currentTarget.checked;
                          setCanvasDraft((settings) => ({
                            ...normalizeCanvasSettings(settings),
                            showNavigationPreview,
                          }));
                        }}
                      />
                      <span>Show preview/navigation box</span>
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
              {settingsTab === "ai" ? (
                <div className="settings-tab-panel" role="tabpanel" aria-label="AI settings">
                  <section className="settings-section" aria-label="AI provider settings">
                    <div className="settings-section-header">
                      <div>
                        <h3>AI</h3>
                        <p>Connect Glyphary to an OpenAI-compatible backend with your own key.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={aiDraft.enabled}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;

                          updateAiDraft({
                            ...normalizeAiSettings(aiDraft),
                            enabled,
                          });
                        }}
                      />
                      <span>Enable AI commands</span>
                    </label>
                    <label>
                      <span>Base URL</span>
                      <input
                        disabled={!vaultRoot || !aiDraft.enabled}
                        value={aiDraft.baseUrl}
                        onChange={(event) => {
                          const baseUrl = event.currentTarget.value;

                          updateAiDraft({
                            ...normalizeAiSettings(aiDraft),
                            baseUrl,
                          });
                        }}
                        placeholder={defaultAiBaseUrl}
                      />
                    </label>
                    <label>
                      <span>Model</span>
                      <select
                        disabled={!vaultRoot || !aiDraft.enabled}
                        value={aiDraft.model}
                        onChange={(event) => {
                          const model = event.currentTarget.value;

                          updateAiDraft({
                            ...normalizeAiSettings(aiDraft),
                            model,
                          });
                        }}
                      >
                        {aiModelOptions().map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>API key</span>
                      <input
                        disabled={!vaultRoot || !aiDraft.enabled}
                        type="password"
                        value={aiDraft.apiKey}
                        onChange={(event) => {
                          const apiKey = event.currentTarget.value;

                          updateAiDraft({
                            ...normalizeAiSettings(aiDraft),
                            apiKey,
                          });
                        }}
                        placeholder="sk-..."
                      />
                      <small>The key is saved in this vault's .glyphary/config.json.</small>
                    </label>
                    <div className="settings-inline-actions">
                      <button
                        className="settings-inline-action"
                        disabled={
                          !vaultRoot ||
                          !aiDraft.enabled ||
                          !normalizeAiSettings(aiDraft).apiKey ||
                          aiModelsLoading
                        }
                        type="button"
                        onClick={() => void refreshAiModels()}
                      >
                        {aiModelsLoading ? "Refreshing..." : "Refresh Models"}
                      </button>
                      <button
                        className="settings-inline-action"
                        disabled={
                          !vaultRoot ||
                          !aiDraft.enabled ||
                          !normalizeAiSettings(aiDraft).apiKey ||
                          aiTesting
                        }
                        type="button"
                        onClick={() => void testAiConnection()}
                      >
                        {aiTesting ? "Testing..." : "Test API"}
                      </button>
                      <span
                        className={`ai-test-indicator${
                          aiTestStatus ? ` ${aiTestStatus}` : ""
                        }`}
                        aria-label={
                          aiTestStatus === "success"
                            ? "AI API test passed"
                            : aiTestStatus === "error"
                              ? "AI API test failed"
                              : "AI API not tested"
                        }
                        role="status"
                        title={
                          aiTestStatus === "success"
                            ? "AI API test passed"
                            : aiTestStatus === "error"
                              ? "AI API test failed"
                              : "AI API not tested"
                        }
                      />
                    </div>
                  </section>
                </div>
              ) : null}
              {settingsTab === "debug" ? (
                <div className="settings-tab-panel" role="tabpanel" aria-label="Debug settings">
                  <section className="settings-section" aria-label="Debug mode settings">
                    <div className="settings-section-header">
                      <div>
                        <h3>Debug</h3>
                        <p>Reveal diagnostic controls that are useful while troubleshooting the app.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={debugDraft.enabled}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) =>
                          setDebugDraft({
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Enable debug mode</span>
                    </label>
                  </section>
                  {debugDraft.enabled ? (
                    <section
                      className="settings-section"
                      aria-label="Global tidbit shortcut diagnostics"
                    >
                      <div className="settings-section-header">
                        <div>
                          <h3>Global Shortcut Diagnostics</h3>
                          <p>Use these controls only when macOS shortcut capture needs inspection.</p>
                        </div>
                      </div>
                      <div className="settings-inline-actions">
                        <button
                          className="settings-inline-action"
                          type="button"
                          disabled={
                            !vaultRoot ||
                            !tidbitDraft.globalShortcutEnabled ||
                            !isRunningOnMacOs()
                          }
                          onClick={() => void requestTidbitShortcutAccessibilityPermission()}
                        >
                          Request Permission
                        </button>
                        <button
                          className="settings-inline-action"
                          type="button"
                          disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled || !isTauri()}
                          onClick={() =>
                            void invoke("test_tidbit_global_shortcut_event").catch((error) => {
                              setStatus(error instanceof Error ? error.message : String(error));
                            })
                          }
                        >
                          Test Capture Event
                        </button>
                        <button
                          className="settings-inline-action"
                          type="button"
                          disabled={!vaultRoot || !tidbitDraft.globalShortcutEnabled || !isTauri()}
                          onClick={() =>
                            void invoke<TidbitShortcutStatus>("tidbit_global_shortcut_status")
                              .then((shortcutStatus) => {
                                setStatus(
                                  shortcutStatus.shortcut
                                    ? `Tidbit shortcut ${shortcutStatus.shortcut} is ${
                                        shortcutStatus.registered ? "registered" : "not registered"
                                      }`
                                    : "No tidbit shortcut is registered",
                                );
                              })
                              .catch((error) => {
                                setStatus(error instanceof Error ? error.message : String(error));
                              })
                          }
                        >
                          Check Shortcut
                        </button>
                      </div>
                    </section>
                  ) : null}
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
                        checked={normalizedVaultAppearanceDraft.glassEffect}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const glassEffect = event.currentTarget.checked;
                          setVaultAppearanceDraft((settings) => ({
                            ...normalizeVaultAppearanceSettings(settings),
                            glassEffect,
                          }));
                        }}
                      />
                      <span>Use glass window effect</span>
                    </label>
                    <label className="settings-range-control">
                      <span>
                        Glass opacity
                        <strong>
                          {Math.round(normalizedVaultAppearanceDraft.glassOpacity * 100)}%
                        </strong>
                      </span>
                      <input
                        aria-label="Glass opacity"
                        disabled={!vaultRoot || !normalizedVaultAppearanceDraft.glassEffect}
                        max={maximumGlassOpacity}
                        min={minimumGlassOpacity}
                        step="0.01"
                        type="range"
                        value={normalizedVaultAppearanceDraft.glassOpacity}
                        onChange={(event) => {
                          const glassOpacity = Number(event.currentTarget.value);
                          setVaultAppearanceDraft((settings) => ({
                            ...normalizeVaultAppearanceSettings(settings),
                            glassOpacity,
                          }));
                        }}
                      />
                      <small>
                        Lower values reveal more of the native window material through every
                        drawer and editor layer.
                      </small>
                    </label>
                  </section>
                  <section className="settings-section" aria-label="Layout appearance">
                    <div className="settings-section-header">
                      <div>
                        <h3>Layout</h3>
                        <p>Control chrome density and the spacing around the workspace.</p>
                      </div>
                    </div>
                    <label className="settings-check-control">
                      <input
                        checked={normalizedVaultAppearanceDraft.statusBarVisible}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const statusBarVisible = event.currentTarget.checked;
                          setVaultAppearanceDraft((settings) => ({
                            ...normalizeVaultAppearanceSettings(settings),
                            statusBarVisible,
                          }));
                        }}
                      />
                      <span>Show status bar</span>
                    </label>
                    <label className="settings-check-control">
                      <input
                        checked={normalizedVaultAppearanceDraft.sectionCorners === "rounded"}
                        disabled={!vaultRoot}
                        type="checkbox"
                        onChange={(event) => {
                          const sectionCorners = event.currentTarget.checked
                            ? "rounded"
                            : "square";
                          setVaultAppearanceDraft((settings) => ({
                            ...normalizeVaultAppearanceSettings(settings),
                            sectionCorners,
                          }));
                        }}
                      />
                      <span>Use rounded section corners</span>
                    </label>
                    <label className="settings-field compact-field">
                      <span>Workspace margins</span>
                      <select
                        disabled={!vaultRoot}
                        value={normalizedVaultAppearanceDraft.workspaceMargin}
                        onChange={(event) => {
                          const workspaceMargin = event.currentTarget
                            .value as VaultAppearanceSettings["workspaceMargin"];
                          setVaultAppearanceDraft((settings) => ({
                            ...normalizeVaultAppearanceSettings(settings),
                            workspaceMargin,
                          }));
                        }}
                      >
                        <option value="compact">Flush</option>
                        <option value="comfortable">Comfortable</option>
                        <option value="spacious">Roomy</option>
                      </select>
                    </label>
                    <label className="settings-field compact-field">
                      <span>UI text weight</span>
                      <select
                        disabled={!vaultRoot}
                        value={normalizedVaultAppearanceDraft.uiFontWeight}
                        onChange={(event) => {
                          const uiFontWeight = event.currentTarget
                            .value as VaultAppearanceSettings["uiFontWeight"];
                          setVaultAppearanceDraft((settings) => ({
                            ...normalizeVaultAppearanceSettings(settings),
                            uiFontWeight,
                          }));
                        }}
                      >
                        <option value="regular">Regular</option>
                        <option value="medium">Medium</option>
                        <option value="bold">Bold</option>
                      </select>
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
      {excalidrawDialog ? (
        <div className="excalidraw-dialog-screen" role="presentation">
          <section
            className="excalidraw-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit drawing ${excalidrawDialog.name}`}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <header className="excalidraw-dialog-header">
              <div>
                <h2>{excalidrawDialog.name}</h2>
                <p>{excalidrawDialog.relativePath}</p>
              </div>
              <div className="excalidraw-dialog-actions">
                <button
                  className="inline-action"
                  type="button"
                  onClick={saveExcalidrawDrawing}
                >
                  Save Drawing
                </button>
                <button className="inline-action" type="button" onClick={closeExcalidrawDialog}>
                  Close
                </button>
              </div>
            </header>
            <div className="excalidraw-editor-shell">
              <Suspense fallback={<div className="excalidraw-loading">Loading drawing editor...</div>}>
                <ExcalidrawCanvas
                  key={excalidrawDialog.relativePath}
                  initialData={excalidrawDialog.initialData}
                  name={excalidrawDialog.name}
                  excalidrawAPI={(api) => {
                    excalidrawApiRef.current = api;
                  }}
                  onChange={(elements, appState, files) => {
                  excalidrawSceneRef.current = {
                    elements,
                    appState,
                    files,
                  };
                  setExcalidrawDirty(true);
                }}
                />
              </Suspense>
            </div>
          </section>
        </div>
      ) : null}
      {imagePreview ? (
        <div
          className="image-preview-screen"
          role="presentation"
          onMouseDown={() => setImagePreview(null)}
        >
          <figure
            className="image-preview-card"
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="image-preview-close"
              type="button"
              aria-label="Close image preview"
              onClick={() => setImagePreview(null)}
            >
              Close
            </button>
            <img src={imagePreview.src} alt={imagePreview.alt} />
            {imagePreview.alt ? <figcaption>{imagePreview.alt}</figcaption> : null}
          </figure>
        </div>
      ) : null}
      {aiPageBuilderOpen ? (
        <div
          className="ai-builder-screen"
          role="presentation"
          onMouseDown={() => setAiPageBuilderOpen(false)}
        >
          <section
            className="ai-builder-card"
            role="dialog"
            aria-modal="true"
            aria-label="AI Page Builder"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>AI Page Builder</h2>
                <span>Describe the section to generate for this note.</span>
              </div>
              <button
                className="inline-action"
                type="button"
                onClick={() => setAiPageBuilderOpen(false)}
              >
                Cancel
              </button>
            </header>
            {aiBuilderHistoryTurns.length > 0 ? (
              <section className="ai-builder-history" aria-label="AI Builder history">
                <div className="ai-builder-history-header">
                  <span>History</span>
                  <button
                    className="inline-action"
                    type="button"
                    onClick={clearActiveAiBuilderHistory}
                  >
                    Clear
                  </button>
                </div>
                <div className="ai-builder-history-list">
                  {aiBuilderHistoryTurns.map((turn) => (
                    <article
                      className={`ai-builder-history-item${
                        aiPageBuilderReplaceTurnId === turn.id ? " selected" : ""
                      }`}
                      key={turn.id}
                    >
                      <div>
                        <strong>{turn.prompt}</strong>
                        <span>
                          {turn.superseded ? "Replaced" : turn.applied ? "Inserted" : "Generated"}
                        </span>
                      </div>
                      <p>{turn.markdown}</p>
                      {turn.applied && !turn.superseded ? (
                        <button
                          className="inline-action"
                          type="button"
                          onClick={() =>
                            setAiPageBuilderReplaceTurnId(
                              aiPageBuilderReplaceTurnId === turn.id ? null : turn.id,
                            )
                          }
                        >
                          {aiPageBuilderReplaceTurnId === turn.id ? "Replacing" : "Replace"}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {selectedAiBuilderReplacementTurn() ? (
              <p className="ai-builder-replace-note">
                The next result will replace the selected AI Builder block.
              </p>
            ) : null}
            <textarea
              autoFocus
              value={aiPageBuilderPrompt}
              placeholder="Build a two-column comparison with a warning callout..."
              onChange={(event) => {
                const { value } = event.currentTarget;

                setAiPageBuilderPrompt(value);
              }}
            />
            <footer>
              <button
                className="secondary-action"
                type="button"
                onClick={() => setAiPageBuilderOpen(false)}
              >
                Cancel
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={!aiPageBuilderPrompt.trim() || aiSubmitting}
                onClick={() => void runAiPageBuilder()}
              >
                Build
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {aiPageBuilderAssetReview ? (
        <div
          className="ai-builder-asset-screen"
          role="presentation"
          onMouseDown={() => setAiPageBuilderAssetReview(null)}
        >
          <section
            className="ai-builder-asset-card"
            role="dialog"
            aria-modal="true"
            aria-label="Review AI Page Builder assets"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>Review Assets</h2>
                <span>Remote images will be saved into {defaultVaultImageDirectory}.</span>
              </div>
              <button
                className="inline-action"
                type="button"
                onClick={() => setAiPageBuilderAssetReview(null)}
              >
                Cancel
              </button>
            </header>
            <div className="ai-builder-asset-list">
              {aiPageBuilderAssetReview.assets.map((asset) => {
                const candidateUrls = pageBuilderAssetCandidateUrls(asset);

                return (
                  <article className="ai-builder-asset-item" key={asset.id}>
                    <div>
                      <strong>{asset.label}</strong>
                      <span>{asset.suggestedName}</span>
                    </div>
                    <small>
                      {candidateUrls[0] ??
                        (asset.domain ? `domain: ${asset.domain}` : "No source provided")}
                    </small>
                  </article>
                );
              })}
            </div>
            <footer>
              <button
                className="secondary-action"
                type="button"
                onClick={() => setAiPageBuilderAssetReview(null)}
              >
                Cancel
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={aiPageBuilderImportingAssets}
                onClick={() => void importAiPageBuilderAssets()}
              >
                {aiPageBuilderImportingAssets ? "Importing..." : "Import Assets"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {aiReview ? (
        <div
          className="ai-review-screen"
          role="presentation"
          onMouseDown={() => setAiReview(null)}
        >
          <section
            className="ai-review-card"
            role="dialog"
            aria-modal="true"
            aria-label="Review AI result"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>{aiReview.title}</h2>
                <span>Review before applying to the current note.</span>
              </div>
              <button
                className="inline-action"
                type="button"
                onClick={() => setAiReview(null)}
              >
                Cancel
              </button>
            </header>
            <textarea readOnly value={aiReview.output} />
            <footer>
              <button
                className="secondary-action"
                type="button"
                onClick={() => void copyAiOutput(aiReview.output)}
              >
                Copy
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() =>
                  aiReview.aiBuilderReplaceTurnId
                    ? replacePreviousAiBuilderOutput(aiReview)
                    : insertAiOutputBelowSelection(aiReview.output)
                }
              >
                {aiReview.aiBuilderReplaceTurnId ? "Replace Previous" : "Insert Below"}
              </button>
              {aiReview.applyMode === "replace-selection" ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => replaceSelectionWithAiOutput(aiReview.output)}
                >
                  Replace Selection
                </button>
              ) : null}
              {aiReview.applyMode === "insert-at-cursor" && !aiReview.aiBuilderReplaceTurnId ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => insertAiOutputAtCursor(aiReview.output)}
                >
                  Insert at Cursor
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
      {aiSubmitting ? (
        <div className="ai-progress-screen" role="presentation">
          <section
            className="ai-progress-card"
            role="status"
            aria-live="polite"
            aria-label="AI command in progress"
          >
            <span className="ai-progress-spinner" aria-hidden="true" />
            <div>
              <h2>{aiSubmittingTitle || "AI command"}</h2>
              <p>Waiting for AI response...</p>
            </div>
          </section>
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
            {commandPaletteScope !== "root" ? (
              <div className="command-palette-scopebar">
                <button
                  type="button"
                  onClick={() => {
                    setCommandPaletteScope("root");
                    setCommandPaletteQuery("");
                    setCommandPaletteSelectedIndex(0);
                    commandPaletteInputRef.current?.focus();
                  }}
                >
                  Back
                </button>
                <span>{commandPaletteScopeTitle}</span>
              </div>
            ) : null}
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
              placeholder={commandPalettePlaceholder}
              role="combobox"
              spellCheck="false"
              value={commandPaletteQuery}
              onChange={(event) => {
                setCommandPaletteQuery(event.currentTarget.value);
                setCommandPaletteSelectedIndex(0);
              }}
            />
            <div
              ref={commandPaletteResultsRef}
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
      {excalidrawCreateDialogOpen ? (
        <div
          className="excalidraw-create-dialog-screen"
          role="presentation"
          onMouseDown={() => {
            if (!excalidrawCreateSubmitting) {
              setExcalidrawCreateDialogOpen(false);
            }
          }}
        >
          <form
            className="excalidraw-create-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="Insert Excalidraw drawing"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void insertExcalidrawDrawing();
            }}
          >
            <div className="excalidraw-create-dialog-header">
              <h2>New Drawing</h2>
              <span>Name the vault drawing file to embed in this note.</span>
            </div>
            <label>
              <span>Name</span>
              <input
                ref={excalidrawCreateInputRef}
                disabled={excalidrawCreateSubmitting}
                spellCheck="false"
                value={excalidrawCreateNameDraft}
                onChange={(event) => setExcalidrawCreateNameDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !excalidrawCreateSubmitting) {
                    event.preventDefault();
                    setExcalidrawCreateDialogOpen(false);
                  }
                }}
              />
            </label>
            <div className="excalidraw-create-dialog-actions">
              <button
                className="inline-action"
                disabled={excalidrawCreateSubmitting}
                type="button"
                onClick={() => setExcalidrawCreateDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="inline-action"
                disabled={excalidrawCreateSubmitting || !excalidrawCreateNameDraft.trim()}
                type="submit"
              >
                {excalidrawCreateSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
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
      {releaseNotification ? (
        <div
          className="release-update-screen"
          role="presentation"
          onMouseDown={() => setReleaseNotification(null)}
        >
          <section
            className="release-update-card"
            role="dialog"
            aria-modal="true"
            aria-label="Glyphary update available"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="release-update-header">
              <h2>Glyphary {releaseNotification.tagName} is available</h2>
              <span>
                You are running {currentAppVersion}
                {releaseNotification.publishedAt
                  ? ` - Published ${new Date(
                      releaseNotification.publishedAt,
                    ).toLocaleDateString()}`
                  : ""}
              </span>
            </div>
            <div className="release-update-notes">
              <strong>{releaseNotification.name}</strong>
              <p>{releaseNotification.notes}</p>
            </div>
            <div className="release-update-actions">
              <button
                className="inline-action"
                type="button"
                onClick={() => setReleaseNotification(null)}
              >
                Later
              </button>
              <a
                className="inline-action"
                href={releaseNotification.url}
                rel="noreferrer"
                target="_blank"
                onClick={() => setReleaseNotification(null)}
              >
                Open Release
              </a>
            </div>
          </section>
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
      {tableContextMenu ? (
        <div
          className="table-context-menu"
          style={{ left: tableContextMenu.x, top: tableContextMenu.y }}
          role="menu"
          aria-label="Table actions"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {tableCommandPaletteCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              role="menuitem"
              onClick={() => {
                void command.run();
                setTableContextMenu(null);
              }}
            >
              {command.title}
            </button>
          ))}
          <div className="table-context-separator" role="separator" />
          <div className="table-context-submenu">
            <button type="button" role="menuitem" aria-haspopup="menu">
              Align column...
            </button>
            <div className="table-context-submenu-panel" role="menu" aria-label="Align column">
              {(["left", "center", "right"] as const).map((alignment) => (
                <button
                  key={alignment}
                  type="button"
                  role="menuitem"
                  onClick={() => alignCurrentTableColumn(tableContextEditor, alignment)}
                >
                  {alignment === "left"
                    ? "Left align"
                    : alignment === "center"
                      ? "Center align"
                      : "Right align"}
                </button>
              ))}
            </div>
          </div>
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
                  openFolderActionDialog("create-canvas", folderContextMenu.entry);
                }}
              >
                Create Canvas
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
              {!folderContextMenu.createOnly ? (
                <>
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
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openFolderActionDialog("rename-file", folderContextMenu.entry);
                }}
              >
                {isCanvasPath(folderContextMenu.entry.relativePath)
                  ? "Rename Canvas"
                  : "Rename File"}
              </button>
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
      {normalizedVaultAppearanceDraft.statusBarVisible ? (
        <footer className="statusbar" key={status}>
          {status}
        </footer>
      ) : null}
    </main>
  );
}

export default App;
