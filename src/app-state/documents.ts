import type { Editor } from "@tiptap/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { canvasTitle, isCanvasPath } from "../CanvasView";
import type { DocumentTab, EditorGroupId, EditorGroupState } from "../lib/app-types";
import { defaultMetaDelimiter } from "../lib/markdown";
import {
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  initialMarkdown,
} from "../lib/defaults";
import {
  cleanVaultAssetReference,
  fileNameWithoutMarkdownExtension,
} from "../lib/paths";

// Responsibilities:
// - Own document tab/group factories and editor content hydration helpers.
// - Resolve vault-relative media references into webview-displayable asset URLs.
// Contracts:
// - Empty Markdown hydrates as a valid editor document without changing saved content.
// - Asset path helpers return an empty string for missing roots or unsafe references.

export function tabTitle(tab: DocumentTab) {
  return tab.pageName || tab.activeFile?.name || "Untitled note";
}

export function pageNameForFileName(name: string) {
  return isCanvasPath(name) ? canvasTitle(name) : fileNameWithoutMarkdownExtension(name);
}

export function createUntitledTab(markdown = initialMarkdown): DocumentTab {
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

export function createEditorGroups(
  tab = createUntitledTab(),
): Record<EditorGroupId, EditorGroupState> {
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

export function createEmptyEditorGroups(): Record<EditorGroupId, EditorGroupState> {
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

export function setEditorMarkdownContent(targetEditor: Editor, markdown: string) {
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

export function clearEditorContent(targetEditor: Editor | null) {
  if (targetEditor) {
    setEditorMarkdownContent(targetEditor, "");
  }
}

export function hasNoOpenDocumentTabs(groups: Record<EditorGroupId, EditorGroupState>) {
  return groups.primary.tabs.length === 0 && groups.secondary.tabs.length === 0;
}

export function joinVaultAssetPath(
  root: string,
  assetDirectory: string,
  reference: string,
) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${assetDirectory || defaultVaultAssetDirectory}/${cleanReference}`);
}

export function joinVaultImagePath(root: string, reference: string) {
  const cleanReference = cleanVaultAssetReference(reference);

  if (!root || !cleanReference) {
    return "";
  }

  return convertFileSrc(`${root}/${defaultVaultImageDirectory}/${cleanReference}`);
}

export function joinVaultRelativeImagePath(root: string, reference: string) {
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
