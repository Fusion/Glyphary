import { useEffect, useMemo, useRef, useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
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
  cleanVaultAssetReference,
  composeMarkdown,
  defaultDrawerOpen,
  defaultMetaDelimiter,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  displayPath,
  emptyTableMarkdown,
  escapeMarkdownImageText,
  escapeMarkdownUrl,
  fileNameForDroppedImage,
  fileNameWithoutMarkdownExtension,
  initialMarkdown,
  isMacOsPlatform,
  isSupportedImageFile,
  markdownHeadings,
  monthTitle,
  parentDirectory,
  sameCalendarDate,
  splitMetaHeader,
  tabIdForFile,
  weekdayLabels,
} from "./logic";
import type { MarkdownParts } from "./logic";
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

type ToolbarAction = {
  label: string;
  title: string;
  isActive: () => boolean;
  isEnabled?: () => boolean;
  run: () => void;
};

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

type VaultSettings = {
  assetDirectory: string;
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

type SearchResult = {
  relativePath: string;
  lineNumber?: number;
  lineText?: string;
  isContentMatch: boolean;
};

type SearchMode = "filename" | "content";
type AppearanceMode = "auto" | "light" | "dark";
type DrawerItem = "source" | "toc" | "calendar";
type VaultDrawerItem = "files" | "search";

type PersistedWorkspace = {
  vaultRoot: string;
  currentDir: string;
  activeFile: ActiveFile | null;
};

const workspaceStorageKey = "medit.workspace";
const appearanceStorageKey = "medit.appearance";

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

function tabTitle(tab: DocumentTab) {
  return tab.pageName || tab.activeFile?.name || "Untitled note";
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
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [markdownDraft, setMarkdownDraft] = useState(initialMarkdown);
  const [editorFocused, setEditorFocused] = useState(false);
  const [codeBlockActive, setCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [vaultRoot, setVaultRoot] = useState("");
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
  });
  const [settingsDraft, setSettingsDraft] = useState(defaultVaultAssetDirectory);
  const [currentDir, setCurrentDir] = useState("");
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [pageName, setPageName] = useState("Untitled note");
  const [metaHeader, setMetaHeader] = useState("");
  const [metaDelimiter, setMetaDelimiter] =
    useState<MarkdownParts["metaDelimiter"]>(defaultMetaDelimiter);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [pageNameEditing, setPageNameEditing] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceMode>(readPersistedAppearance);
  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(defaultVaultDrawerOpen);
  const [vaultDrawerItem, setVaultDrawerItem] = useState<VaultDrawerItem>("files");
  const [drawerOpen, setDrawerOpen] = useState(defaultDrawerOpen);
  const [drawerItem, setDrawerItem] = useState<DrawerItem>("source");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarNoteDateKeys, setCalendarNoteDateKeys] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const documentTabsRef = useRef<DocumentTab[]>([]);
  const activeTabIdRef = useRef("");
  const pageNameRef = useRef("Untitled note");
  const metaHeaderRef = useRef("");
  const metaDelimiterRef = useRef<MarkdownParts["metaDelimiter"]>(defaultMetaDelimiter);
  const hydratingEditor = useRef(false);
  const openVaultRef = useRef<() => void | Promise<void>>(() => undefined);
  const saveCurrentFileRef = useRef<() => void | Promise<void>>(() => undefined);
  const resetDocumentRef = useRef<() => void>(() => undefined);
  const vaultRootRef = useRef("");
  const vaultSettingsRef = useRef<VaultSettings>({
    assetDirectory: defaultVaultAssetDirectory,
  });
  const restoredWorkspace = useRef(false);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    documentTabsRef.current = documentTabs;
  }, [documentTabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

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
    document.documentElement.dataset.theme = appearance;
    document.documentElement.style.colorScheme =
      appearance === "auto" ? "light dark" : appearance;
    writePersistedAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
      }
    };
  }, []);

  function syncEditorState(nextEditor: Editor) {
    setCodeBlockActive(nextEditor.isActive("codeBlock"));
    setCodeLanguage(nextEditor.getAttributes("codeBlock").language ?? "");
  }

  function updateActiveTab(patch: Partial<DocumentTab>) {
    const tabId = activeTabIdRef.current;

    if (!tabId) {
      return;
    }

    const nextTabs = documentTabsRef.current.map((tab) =>
      tab.id === tabId ? { ...tab, ...patch } : tab,
    );

    documentTabsRef.current = nextTabs;
    setDocumentTabs(nextTabs);
  }

  function currentDocumentSnapshot(): Partial<DocumentTab> {
    return {
      activeFile: activeFileRef.current,
      pageName: pageNameRef.current,
      metaHeader: metaHeaderRef.current,
      metaDelimiter: metaDelimiterRef.current,
      markdown,
      markdownDraft,
      dirty,
    };
  }

  function snapshotActiveTab() {
    updateActiveTab(currentDocumentSnapshot());
  }

  function setActiveDocumentDirty(nextDirty: boolean) {
    setDirty(nextDirty);
    updateActiveTab({ dirty: nextDirty });
  }

  function hydrateDocumentTab(tab: DocumentTab) {
    if (!editor) {
      return;
    }

    hydratingEditor.current = true;
    activeFileRef.current = tab.activeFile;
    activeTabIdRef.current = tab.id;
    pageNameRef.current = tab.pageName;
    metaHeaderRef.current = tab.metaHeader;
    metaDelimiterRef.current = tab.metaDelimiter;
    setActiveTabId(tab.id);
    setActiveFile(tab.activeFile);
    setPageName(tab.pageName);
    setMetaHeader(tab.metaHeader);
    setMetaDelimiter(tab.metaDelimiter);
    setMarkdown(tab.markdown);
    setMarkdownDraft(tab.markdownDraft);
    setDirty(tab.dirty);
    setPageNameEditing(false);
    editor.commands.setContent(tab.markdown, { contentType: "markdown" });
    syncEditorState(editor);
    window.setTimeout(() => {
      hydratingEditor.current = false;
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

  function switchToDocumentTab(tabId: string) {
    const tab = documentTabsRef.current.find((documentTab) => documentTab.id === tabId);

    if (!tab) {
      return;
    }

    snapshotActiveTab();
    hydrateDocumentTab(tab);
    if (tab.activeFile) {
      persistWorkspace({ activeFile: tab.activeFile });
      setStatus(`Switched to ${tab.activeFile.relativePath}`);
    } else {
      persistWorkspace({ activeFile: null });
      setStatus(`Switched to ${tabTitle(tab)}`);
    }
  }

  function closeDocumentTab(tabId: string) {
    const tabs = documentTabsRef.current;
    const tab = tabs.find((documentTab) => documentTab.id === tabId);

    if (!tab) {
      return;
    }

    if (tab.dirty) {
      setStatus(`Save ${tabTitle(tab)} before closing its tab`);
      return;
    }

    if (tabs.length === 1) {
      setStatus("Keep at least one document tab open");
      return;
    }

    const closedIndex = tabs.findIndex((documentTab) => documentTab.id === tabId);
    const nextTabs = tabs.filter((documentTab) => documentTab.id !== tabId);

    documentTabsRef.current = nextTabs;
    setDocumentTabs(nextTabs);

    if (tabId !== activeTabIdRef.current) {
      setStatus(`Closed ${tabTitle(tab)}`);
      return;
    }

    const nextTab = nextTabs[Math.min(closedIndex, nextTabs.length - 1)];

    hydrateDocumentTab(nextTab);
    persistWorkspace({ activeFile: nextTab.activeFile });
    setStatus(`Closed ${tabTitle(tab)}`);
  }

  function insertVaultImage(fileName: string) {
    if (!editor) {
      return;
    }

    editor
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
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
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": "Markdown document editor",
        spellcheck: "false",
      },
      handleDrop: (_view, event) => {
        if (!queueImageImport(event.dataTransfer?.files)) {
          return false;
        }

        event.preventDefault();
        return true;
      },
      handlePaste: (_view, event) => {
        if (!queueImageImport(event.clipboardData?.files)) {
          return false;
        }

        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const nextMarkdown = editor.getMarkdown();

      setMarkdown(nextMarkdown);
      setMarkdownDraft(nextMarkdown);
      syncEditorState(editor);

      if (!hydratingEditor.current) {
        setActiveDocumentDirty(true);
        updateActiveTab({
          markdown: nextMarkdown,
          markdownDraft: nextMarkdown,
          dirty: true,
        });
        setStatus(
          activeFileRef.current
            ? `Unsaved changes in ${activeFileRef.current.name}`
            : "Unsaved changes in untitled note",
        );
      }
    },
    onSelectionUpdate: ({ editor }) => {
      syncEditorState(editor);
    },
    onFocus: ({ editor }) => {
      setEditorFocused(true);
      syncEditorState(editor);
    },
    onBlur: ({ editor }) => {
      setEditorFocused(false);
      syncEditorState(editor);
    },
  });

  useEffect(() => {
    if (editor) {
      const nextMarkdown = editor.getMarkdown();

      setMarkdown(nextMarkdown);
      setMarkdownDraft(nextMarkdown);
      syncEditorState(editor);

      if (documentTabsRef.current.length === 0) {
        const tab: DocumentTab = {
          id: `untitled:${Date.now()}`,
          activeFile: null,
          pageName: "Untitled note",
          metaHeader: "",
          metaDelimiter: defaultMetaDelimiter,
          markdown: nextMarkdown,
          markdownDraft: nextMarkdown,
          dirty: false,
        };

        activeTabIdRef.current = tab.id;
        setActiveTabId(tab.id);
        setDocumentTabs([tab]);
      }
    }
  }, [editor]);

  useEffect(() => {
    if (!editor || restoredWorkspace.current || !isTauri()) {
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

          setDocumentTabs([tab]);
          documentTabsRef.current = [tab];
          hydrateDocumentTab(tab);
          setStatus(`Restored ${file.relativePath}`);
          return;
        }

        const tab: DocumentTab = {
          id: `untitled:${Date.now()}`,
          activeFile: null,
          pageName: "Untitled note",
          metaHeader: "",
          metaDelimiter: defaultMetaDelimiter,
          markdown: initialMarkdown,
          markdownDraft: initialMarkdown,
          dirty: false,
        };

        setDocumentTabs([tab]);
        documentTabsRef.current = [tab];
        hydrateDocumentTab(tab);
        setStatus(`Restored vault ${workspace.vaultRoot}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    restoreWorkspace();
  }, [editor]);

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
  }, [editor, editorFocused, markdown]);

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

    hydratingEditor.current = clean;
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
        hydratingEditor.current = false;
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
      : { assetDirectory: defaultVaultAssetDirectory };

    vaultSettingsRef.current = settings;
    setVaultSettings(settings);
    setSettingsDraft(settings.assetDirectory);

    if (isTauri()) {
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
        },
      });

      vaultSettingsRef.current = settings;
      setVaultSettings(settings);
      setSettingsDraft(settings.assetDirectory);
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

    let file = activeFileRef.current;
    const requestedName = pageNameRef.current.trim();

    if (requestedName && requestedName !== fileNameWithoutMarkdownExtension(file.name)) {
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
      const previousTabId = activeTabIdRef.current;

      activeFileRef.current = file;
      activeTabIdRef.current = nextTabId;
      setActiveTabId(nextTabId);
      setActiveFile(file);
      setActivePageName(fileNameWithoutMarkdownExtension(file.name));
      const renamedTabs = documentTabsRef.current.map((tab) =>
        tab.id === previousTabId
          ? {
              ...tab,
              id: nextTabId,
              activeFile: file,
              pageName: fileNameWithoutMarkdownExtension(file.name),
            }
          : tab,
      );

      documentTabsRef.current = renamedTabs;
      setDocumentTabs(renamedTabs);
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
    const savedTabs = documentTabsRef.current.map((tab) =>
      tab.id === activeTabIdRef.current
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

    documentTabsRef.current = savedTabs;
    setDocumentTabs(savedTabs);
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
      const tab: DocumentTab = {
        id: `untitled:${Date.now()}`,
        activeFile: null,
        pageName: "Untitled note",
        metaHeader: "",
        metaDelimiter: defaultMetaDelimiter,
        markdown: initialMarkdown,
        markdownDraft: initialMarkdown,
        dirty: false,
      };

      setDocumentTabs([tab]);
      documentTabsRef.current = [tab];
      hydrateDocumentTab(tab);
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
    if (!isTauri()) {
      return;
    }

    const unlisteners: Array<() => void> = [];

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
      const existing = documentTabsRef.current.find(
        (tab) => tab.id === tabIdForFile(relativePath),
      );

      if (existing) {
        hydrateDocumentTab(existing);
        persistWorkspace({
          activeFile: existing.activeFile,
        });
        setStatus(`Switched to ${existing.activeFile?.relativePath ?? tabTitle(existing)}`);
        return;
      }

      const file = await invoke<OpenedFile>("read_vault_file", {
        root: vaultRoot,
        relative: relativePath,
      });
      const tab = createDocumentTabFromFile(file);

      setDocumentTabs((tabs) => [...tabs, tab]);
      documentTabsRef.current = [...documentTabsRef.current, tab];
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
    const existing = documentTabsRef.current.find(
      (tab) => tab.id === tabIdForFile(relativePath),
    );

    snapshotActiveTab();

    if (existing) {
      hydrateDocumentTab(existing);
      persistWorkspace({ activeFile: existing.activeFile });
      setStatus(`Switched to ${existing.activeFile?.relativePath ?? tabTitle(existing)}`);
      return;
    }

    try {
      const file = await invoke<OpenedFile>("open_calendar_day_file", {
        root: vaultRoot,
        relative: relativePath,
        title: calendarDayTitle(date),
      });
      const tab = createDocumentTabFromFile(file);

      setDocumentTabs((tabs) => [...tabs, tab]);
      documentTabsRef.current = [...documentTabsRef.current, tab];
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
      const existing = documentTabsRef.current.find(
        (tab) => tab.id === tabIdForFile(file.relativePath),
      );

      if (existing) {
        hydrateDocumentTab(existing);
        persistWorkspace({
          activeFile: existing.activeFile,
        });
        setStatus(`Switched to ${existing.activeFile?.relativePath ?? tabTitle(existing)}`);
        return;
      }

      const tab = createDocumentTabFromFile(file);

      setDocumentTabs((tabs) => [...tabs, tab]);
      documentTabsRef.current = [...documentTabsRef.current, tab];
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
    const tab: DocumentTab = {
      id: `untitled:${Date.now()}`,
      activeFile: null,
      pageName: "Untitled note",
      metaHeader: "",
      metaDelimiter: defaultMetaDelimiter,
      markdown: initialMarkdown,
      markdownDraft: initialMarkdown,
      dirty: false,
    };

    setDocumentTabs((tabs) => [...tabs, tab]);
    documentTabsRef.current = [...documentTabsRef.current, tab];
    hydrateDocumentTab(tab);
    persistWorkspace({ activeFile: null });
    setStatus("New unsaved document");
  }

  resetDocumentRef.current = resetDocument;

  function applyMarkdown() {
    const parts = splitMetaHeader(markdownDraft);

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
    if (!editor) {
      return;
    }

    let matchCount = 0;
    let targetPosition: number | null = null;

    editor.state.doc.descendants((node, position) => {
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
      setStatus(`Could not find heading ${entry.title}`);
      return;
    }

    editor.chain().focus().setTextSelection(targetPosition + 1).scrollIntoView().run();
    setStatus(`Jumped to ${entry.title}`);
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
            className="secondary-action"
            disabled={!activeFile || !dirty}
            type="button"
            onClick={saveCurrentFile}
          >
            Save
          </button>
          {!hideWindowDocumentActions ? (
            <button className="secondary-action" type="button" onClick={resetDocument}>
              New
            </button>
          ) : null}
          <label className="appearance-control">
            <span>Style</span>
            <select
              aria-label="App style"
              value={appearance}
              onChange={(event) => setAppearance(event.currentTarget.value as AppearanceMode)}
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>

      <section
        className={[
          "workspace with-vault",
          vaultDrawerOpen ? "vault-drawer-open" : "vault-drawer-closed",
          drawerOpen ? "drawer-open" : "drawer-closed",
        ].join(" ")}
        aria-label="Editor workspace"
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

        <div className="editor-pane">
          <div className="document-tabs" role="tablist" aria-label="Open documents">
            {documentTabs.map((tab) => (
              <div
                className={tab.id === activeTabId ? "document-tab active" : "document-tab"}
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeTabId}
                title={tab.activeFile?.relativePath ?? tabTitle(tab)}
              >
                <button
                  className="document-tab-select"
                  type="button"
                  onClick={() => switchToDocumentTab(tab.id)}
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
                    closeDocumentTab(tab.id);
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="metadata-shell" aria-label="Metadata editor">
            <div className="page-name-control">
              {pageNameEditing ? (
                <input
                  aria-label="Page name"
                  autoFocus
                  disabled={!activeFile}
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
                  disabled={!activeFile}
                  type="button"
                  title="Double-click to rename on save"
                  onDoubleClick={() => {
                    if (activeFileRef.current) {
                      setPageNameEditing(true);
                    }
                  }}
                >
                  {pageName || "Untitled note"}
                </button>
              )}
            </div>
            <div className="frontmatter-header">
              <button
                className={metadataOpen ? "metadata-toggle open" : "metadata-toggle"}
                type="button"
                aria-expanded={metadataOpen}
                aria-controls="frontmatter-editor"
                aria-label={metadataOpen ? "Hide frontmatter" : "Show frontmatter"}
                title={metadataOpen ? "Hide frontmatter" : "Show frontmatter"}
                onClick={() => setMetadataOpen((open) => !open)}
              />
              <span>Frontmatter</span>
            </div>
            {metadataOpen ? (
              <label className="metadata-control" id="frontmatter-editor">
                <textarea
                  disabled={!activeFile}
                  spellCheck="false"
                  value={metaHeader}
                  onChange={(event) => {
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

          <EditorContent className="editor-surface" editor={editor} />
        </div>

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
              <label>
                <span>Asset directory</span>
                <input
                  disabled={!vaultRoot}
                  value={settingsDraft}
                  onChange={(event) => setSettingsDraft(event.currentTarget.value)}
                  placeholder={defaultVaultAssetDirectory}
                />
              </label>
              <div className="settings-actions">
                <button
                  className="inline-action"
                  disabled={!vaultRoot || settingsDraft === vaultSettings.assetDirectory}
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
