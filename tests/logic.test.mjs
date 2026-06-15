import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  defaultVaultDrawerWidth,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultTidbitPathPattern,
  emptyCalloutMarkdown,
  emptyColumnsMarkdown,
  emptyTableMarkdown,
  expandDateFormat,
  expandDateTemplate,
  escapeMarkdownUrl,
  fileNameForDroppedImage,
  findTabAcrossSplitGroups,
  frontmatterListValues,
  isMacOsPlatform,
  isSupportedImageFile,
  markdownHeadings,
  maxRecentFiles,
  recentFilesWithOpenedFile,
  remainingGroupAfterSplitPaneClose,
  richLinkMarkdown,
  splitHasDirtyTabs,
  splitMetaHeader,
  tabIdForFile,
} from "../.test-dist/logic.js";

test("frontmatter is split out of the editor body and composed back without losing it", () => {
  const source = "---\ntitle: Alpha\ntags: [note]\n---\n# Body\n";
  const parts = splitMetaHeader(source);

  assert.deepEqual(parts, {
    metaHeader: "title: Alpha\ntags: [note]",
    metaDelimiter: "---",
    body: "# Body\n",
  });
  assert.equal(composeMarkdown(parts.metaHeader, parts.metaDelimiter, parts.body), source);
});

test("frontmatter supports toml delimiters and ignores unterminated headers", () => {
  assert.deepEqual(splitMetaHeader("+++\ntitle = \"Alpha\"\n+++\nBody\n"), {
    metaHeader: "title = \"Alpha\"",
    metaDelimiter: "+++",
    body: "Body\n",
  });
  assert.deepEqual(splitMetaHeader("---\ntitle: Alpha\n# Body\n"), {
    metaHeader: "",
    metaDelimiter: "---",
    body: "---\ntitle: Alpha\n# Body\n",
  });
});

test("date templates expand centrally for tidbit paths", () => {
  const date = new Date(2026, 5, 15, 9, 4, 7);

  assert.equal(expandDateFormat("YYYY-MM-DD-HH-mm-ss", date), "2026-06-15-09-04-07");
  assert.equal(expandDateFormat("YYYY-mm-DD-hh-mm-ss", date), "2026-06-15-09-04-07");
  assert.equal(
    expandDateTemplate(defaultTidbitPathPattern, date),
    "__transit__/Objects/tidbit-2026-06-15-09-04-07.md",
  );
});

test("frontmatter tags are extracted as display pills", () => {
  assert.deepEqual(
    frontmatterListValues(`title: Alpha
tags: [draft, "project x", draft]
owners:
  - Chris
  - Sam
status: active
`),
    ["draft", "project x"],
  );
  assert.deepEqual(
    frontmatterListValues(`title: Alpha
TAGS:
  - draft
  - project x
owners:
  - Chris
`),
    ["draft", "project x"],
  );
  assert.deepEqual(
    frontmatterListValues(`tags:
- databases
- devops
- networking
feature: _assets_/Pasted image 20230102173741.png
thumbnail: thumbnails/resized/2b2618e8548253e7deaf445fe995f4cc_86cf658e.webp
permalink: convoso/convoso-projects/convoso-las-vegas
`),
    ["databases", "devops", "networking"],
  );
  assert.equal(defaultFrontmatterPillHeader, "tags");
  assert.deepEqual(
    frontmatterListValues(`title: Alpha
topics: [draft, project]
tags: [ignored]
`, "topics"),
    ["draft", "project"],
  );
  assert.deepEqual(frontmatterListValues("title: Alpha\nstatus: active\n"), []);
  assert.deepEqual(frontmatterListValues("owners:\n  - Chris\n  - Sam\n"), []);
});

test("local vault image references are accepted while URLs and path escapes are rejected", () => {
  assert.equal(cleanVaultAssetReference("image.png"), "image.png");
  assert.equal(cleanVaultAssetReference("folder/image.png|alias"), "folder/image.png");
  assert.equal(
    cleanVaultAssetReference("Pasted%20image%2020220413143858.png"),
    "Pasted image 20220413143858.png",
  );
  assert.equal(cleanVaultAssetReference("https://example.com/image.png"), null);
  assert.equal(cleanVaultAssetReference("https%3A%2F%2Fexample.com%2Fimage.png"), null);
  assert.equal(cleanVaultAssetReference("../image.png"), null);
  assert.equal(cleanVaultAssetReference("folder/../image.png"), null);
  assert.equal(cleanVaultAssetReference("bad%zz.png"), null);
});

test("markdown local image URLs are percent-encoded while external URLs stay intact", () => {
  assert.equal(
    escapeMarkdownUrl("Pasted image 20220413143858.png"),
    "Pasted%20image%2020220413143858.png",
  );
  assert.equal(
    escapeMarkdownUrl("folder/Pasted image 20220413143858.png"),
    "folder/Pasted%20image%2020220413143858.png",
  );
  assert.equal(escapeMarkdownUrl("https://example.com/Pasted image.png"), "https://example.com/Pasted image.png");
});

test("dropped image names follow the pasted-image timestamp convention", () => {
  const date = new Date(2023, 0, 2, 17, 37, 41);

  assert.equal(
    fileNameForDroppedImage({ name: "image.png", type: "image/png" }, date),
    "Pasted image 20230102173741.png",
  );
  assert.equal(
    fileNameForDroppedImage({ name: "Screen Shot: Draft?.jpeg", type: "image/jpeg" }, date),
    "Screen Shot- Draft 20230102173741.jpg",
  );
  assert.equal(
    fileNameForDroppedImage({ name: "diagram.webp", type: "" }, date),
    "diagram 20230102173741.webp",
  );
});

test("drag and paste image filtering accepts supported image formats", () => {
  assert.equal(isSupportedImageFile({ name: "photo.png", type: "" }), true);
  assert.equal(isSupportedImageFile({ name: "photo.dat", type: "image/webp" }), true);
  assert.equal(isSupportedImageFile({ name: "notes.txt", type: "text/plain" }), false);
});

test("macOS platform detection controls platform-specific window actions", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const capabilities = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

  assert.equal(isMacOsPlatform("MacIntel"), true);
  assert.equal(isMacOsPlatform("", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), true);
  assert.equal(isMacOsPlatform("Win32"), false);
  assert.equal(isMacOsPlatform("Linux x86_64"), false);
  assert.match(app, /getCurrentWindow\(\)\.setTheme\(resolvedAppearance\)/);
  assert.doesNotMatch(app, /mac-window-title/);
  assert.doesNotMatch(app, /app-brand/);
  assert.ok(capabilities.permissions.includes("core:window:allow-set-theme"));
  assert.equal(config.app.windows[0].theme, "Dark");
  assert.notEqual(config.app.windows[0].hiddenTitle, true);
});

test("calendar filenames match the requested note naming scheme and dot marker keys", () => {
  const day = new Date(2026, 5, 14);

  assert.equal(calendarDayTitle(day), "Sun, Jun 14th 2026");
  assert.equal(calendarDayRelativePath(day), "Calendar/Sun, Jun 14th 2026.md");
  assert.equal(calendarDateKey(day), "2026-06-14");
  assert.equal(calendarPathDateKey("Calendar/Sun, Jun 14th 2026.md"), "2026-06-14");
  assert.equal(calendarPathDateKey("Calendar/Mon, Jun 14th 2026.md"), null);
});

test("markdown headings produce a table of contents and ignore fenced code", () => {
  assert.deepEqual(
    markdownHeadings(`# Alpha

\`\`\`md
# Not a heading
\`\`\`

## Beta ##
### Beta
## Beta
# C#
`),
    [
      { id: "1:Alpha:1", level: 1, title: "Alpha", occurrence: 1 },
      { id: "2:Beta:1", level: 2, title: "Beta", occurrence: 1 },
      { id: "3:Beta:1", level: 3, title: "Beta", occurrence: 1 },
      { id: "2:Beta:2", level: 2, title: "Beta", occurrence: 2 },
      { id: "1:C#:1", level: 1, title: "C#", occurrence: 1 },
    ],
  );
});

test("toc fenced code blocks have an inline renderer while staying markdown code blocks", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /value: "toc"/);
  assert.match(app, /lowlight\.register\("toc", plaintext\)/);
  assert.match(app, /TocCodeBlockRenderer/);
  assert.match(app, /data-toc-block-position/);
  assert.match(app, /data-toc-entry-id/);
  assert.match(css, /pre\.toc-code-block\.rendered/);
  assert.match(css, /\.toc-code-render/);
});

test("table insertion seed keeps markdown table support available", () => {
  assert.match(emptyTableMarkdown, /^\| Column 1 \| Column 2 \| Column 3 \|/);
  assert.match(emptyTableMarkdown, /\| --- \| --- \| --- \|/);
});

test("columns markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(emptyColumnsMarkdown, /^::: columns/);
  assert.match(emptyColumnsMarkdown, /::: column/);
  assert.match(app, /function createMarkdownContainerToken/);
  assert.match(app, /name: "columns"/);
  assert.match(app, /name: "column"/);
  assert.match(app, /markdownTokenName: "columns"/);
  assert.match(app, /markdownTokenName: "column"/);
  assert.match(app, /createColumnExtension\(\)/);
  assert.match(app, /createColumnsExtension\(\)/);
  assert.match(app, /appendColumns\(\)/);
  assert.match(css, /\.markdown-columns/);
  assert.match(css, /\.markdown-column/);
});

test("callout markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(emptyCalloutMarkdown, /^::: callout note "Note"/);
  assert.match(app, /function calloutContainerOpening/);
  assert.match(app, /name: "callout"/);
  assert.match(app, /markdownTokenName: "callout"/);
  assert.match(app, /data-glyphary-callout/);
  assert.match(app, /data-callout-kind/);
  assert.match(app, /escapeCalloutTitle/);
  assert.match(app, /createCalloutExtension\(\)/);
  assert.match(app, /appendCallout\(\)/);
  assert.match(css, /\.markdown-callout/);
  assert.match(css, /\.markdown-callout-warning/);
  assert.match(css, /\.markdown-callout-title/);
});

test("rich link markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.equal(
    richLinkMarkdown({
      url: "https://example.com",
      title: "Example",
      description: "Line one\nline two",
      image: "https://example.com/card.png",
      siteName: "Example Site",
    }),
    `::: rich-link
url: https://example.com
title: Example
description: Line one line two
image: https://example.com/card.png
siteName: Example Site
:::`,
  );
  assert.match(app, /name: "richLink"/);
  assert.match(app, /markdownTokenName: "rich-link"/);
  assert.match(app, /data-glyphary-rich-link/);
  assert.match(app, /fetch_rich_link_metadata/);
  assert.match(app, /id: "insert-rich-link"/);
  assert.doesNotMatch(app, /window\.prompt/);
  assert.match(app, /openRichLinkDialog/);
  assert.match(app, /insertRichLinkFromUrl/);
  assert.match(app, /richLinkDialogOpen/);
  assert.match(app, /aria-label="Insert rich link"/);
  assert.match(css, /\.rich-link-card/);
  assert.match(css, /\.rich-link-dialog-screen/);
  assert.match(css, /\.rich-link-image/);
  assert.match(css, /\.rich-link-content/);
});

test("default drawer and vault asset settings match the current product defaults", () => {
  assert.equal(defaultDrawerOpen, false);
  assert.equal(defaultVaultDrawerOpen, true);
  assert.equal(defaultVaultAssetDirectory, "_assets_");
  assert.equal(defaultVaultDrawerWidth, 320);
  assert.equal(defaultInspectorDrawerWidth, 360);
});

test("recent files are newest-first unique and capped", () => {
  const existing = Array.from({ length: maxRecentFiles }, (_, index) => ({
    name: `Note ${index}.md`,
    relativePath: `notes/note-${index}.md`,
  }));
  const reopened = {
    name: "Note 4.md",
    relativePath: "notes/note-4.md",
  };
  const withReopened = recentFilesWithOpenedFile(existing, reopened);

  assert.equal(withReopened[0].relativePath, "notes/note-4.md");
  assert.equal(
    withReopened.filter((file) => file.relativePath === "notes/note-4.md").length,
    1,
  );

  const withNewFile = recentFilesWithOpenedFile(withReopened, {
    name: "New.md",
    relativePath: "new.md",
  });

  assert.equal(withNewFile.length, maxRecentFiles);
  assert.equal(withNewFile[0].relativePath, "new.md");
  assert.equal(withNewFile.at(-1)?.relativePath, "notes/note-18.md");
});

test("vault drawer exposes files search and recent views", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /type VaultDrawerItem = "files" \| "search" \| "recent"/);
  assert.match(app, /recentFilesWithOpenedFile/);
  assert.match(app, /recentFiles: ActiveFile\[\]/);
  assert.match(app, /Recently opened files/);
  assert.match(app, /toggleVaultDrawerItem\("recent"\)/);
  assert.match(css, /\.recent-entry-text/);
  assert.match(css, /\.recent-entry em/);
});

test("vault rows expose context menu actions for folders and files", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

  assert.match(app, /onContextMenu=\{\(event\) => handleFolderContextMenu\(entry, event\)\}/);
  assert.match(app, /suppressDirectoryClickRef/);
  assert.match(app, /onMouseDown=\{\(event\) => handleVaultEntryMouseDown\(entry, event\)\}/);
  assert.match(app, /event\.button !== 0 \|\| suppressDirectoryClickRef\.current/);
  assert.match(app, /window\.addEventListener\("pointerdown", closeMenuOnPrimaryPointerDown\)/);
  assert.match(app, /event\.button === 0/);
  assert.match(app, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(app, /createNoteFromFolderMenu/);
  assert.match(app, /createFolderFromFolderMenu/);
  assert.match(app, /renameFolderFromFolderMenu/);
  assert.match(app, /moveFolderFromContextMenu/);
  assert.match(app, /moveFileFromContextMenu/);
  assert.match(app, /deleteFileFromContextMenu/);
  assert.match(app, /function VaultFolderTree/);
  assert.match(app, /isMoveFolderDestinationDisabled/);
  assert.match(app, /children\.filter\(\(entry\) => entry\.isDir\)/);
  assert.match(app, /folderActionDialog/);
  assert.match(app, /openFolderActionDialog\("create-folder"/);
  assert.match(app, /openFolderActionDialog\("move-folder"/);
  assert.match(app, /openFolderActionDialog\("move-file"/);
  assert.match(app, /openFolderActionDialog\("delete-file"/);
  assert.match(app, /aria-label=\{folderActionDialogTitle\(folderActionDialog\.action\)\}/);
  assert.match(app, /"create_note_in_directory"/);
  assert.match(app, /"create_directory_in_directory"/);
  assert.match(app, /"rename_vault_directory"/);
  assert.match(app, /"move_vault_directory"/);
  assert.match(app, /"move_vault_file"/);
  assert.match(app, /"delete_vault_file"/);
  assert.match(app, /Create Note/);
  assert.match(app, /Create Folder/);
  assert.match(app, /Move Folder/);
  assert.match(app, /Move File/);
  assert.match(app, /Delete File/);
  assert.match(app, /<VaultFolderTree/);
  assert.match(app, /<FolderIcon \/>/);
  assert.match(app, /Rename/);
  assert.match(css, /\.folder-context-menu/);
  assert.match(css, /\.folder-action-dialog-card/);
  assert.match(css, /\.folder-action-dialog-warning/);
  assert.match(css, /\.vault-folder-tree/);
  assert.match(css, /\.folder-tree-select/);
  assert.match(backend, /fn create_note_in_directory/);
  assert.match(backend, /fn create_directory_in_directory/);
  assert.match(backend, /fn rename_vault_directory/);
  assert.match(backend, /fn move_vault_directory/);
  assert.match(backend, /fn move_vault_file/);
  assert.match(backend, /fn delete_vault_file/);
  assert.notEqual(config.app.windows[0].hiddenTitle, true);
});

test("native webview context menu is suppressed so chrome does not show refresh", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /const suppressNativeContextMenu = \(event: MouseEvent\) => \{/);
  assert.match(app, /event\.preventDefault\(\);/);
  assert.match(app, /window\.addEventListener\("contextmenu", suppressNativeContextMenu\)/);
  assert.match(app, /window\.removeEventListener\("contextmenu", suppressNativeContextMenu\)/);
});

test("app css exposes the Obsidian theme compatibility surface", () => {
  const css = readFileSync("src/App.css", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");

  assert.match(css, /--background-primary:/);
  assert.match(css, /--interactive-accent:/);
  assert.match(css, /--text-normal:/);
  assert.match(css, /--code-background:/);
  assert.match(css, /--blockquote-border-color:/);
  assert.match(app, /theme-dark/);
  assert.match(app, /theme-light/);
  assert.match(app, /markdown-preview-view/);
  assert.match(app, /Theme Builder/);
  assert.match(app, /type ThemePreset/);
  assert.match(app, /const themePresets: ThemePreset\[\]/);
  const presetBlock = app.match(/const themePresets: ThemePreset\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.equal((presetBlock.match(/id: "[a-z-]+"/g) ?? []).length, 12);
  assert.match(app, /Theme Templates/);
  assert.match(app, /applyThemePreset/);
  assert.match(app, /presetId\?: string \| null/);
  assert.match(app, /selectedThemePresetIdDraft/);
  assert.match(app, /normalizeThemePresetId/);
  assert.match(app, /--glyphary-accent/);
  assert.match(app, /Reset Theme/);
  assert.match(app, /type VaultAppearanceSettings/);
  assert.match(app, /type FileDisplaySettings/);
  assert.match(app, /type AutosaveSettings/);
  assert.match(app, /type TidbitSettings/);
  assert.match(app, /defaultFileDisplaySettings/);
  assert.match(app, /showDotfiles: false/);
  assert.match(app, /defaultAutosaveSettings/);
  assert.match(app, /enabled: true/);
  assert.match(app, /defaultTidbitSettings/);
  assert.match(app, /Tidbit path pattern/);
  assert.match(app, /defaultTidbitPathPattern/);
  assert.match(app, /Show dotfiles and dot folders/);
  assert.match(app, /Autosave current page once per minute/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /60_000/);
  assert.match(app, /glassEffect/);
  assert.match(app, /Use glass window effect/);
  assert.match(app, /set_window_glass_effect/);
  assert.match(css, /data-window-glass="enabled"/);
  assert.match(backend, /Could not keep titlebar contrast material/);
  assert.doesNotMatch(backend, /set_effects\(None/);
  assert.match(css, /\.theme-preset-grid/);
  assert.match(css, /\.theme-preset-card/);
  assert.equal(config.app.macOSPrivateApi, true);
  assert.equal(config.app.windows[0].transparent, true);
  assert.equal(config.bundle.publisher, "Glyphary contributors");
  assert.match(config.bundle.copyright, /Glyphary contributors/);
  assert.match(cargo, /macos-private-api/);
  assert.match(backend, /name: Some\("Glyphary"\.into\(\)\)/);
  assert.match(backend, /A local-first Markdown workspace/);
  assert.match(backend, /Built with Tauri, React, Tiptap/);
  assert.match(backend, /struct AppearanceSettings/);
  assert.match(backend, /glass_effect/);
  assert.match(backend, /preset_id/);
  assert.match(backend, /Effect::UnderWindowBackground/);
  assert.match(backend, /set_background_color\(Some\(Color\(0, 0, 0, 0\)\)\)/);
});

test("vim-style editing is wired behind a settings option", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(pkg.dependencies["@prose-motions/core"], undefined);
  assert.match(app, /name: "glypharyVimMode"/);
  assert.match(app, /editorBehavior\.vimMode \? \[createGlypharyVimMode\(setStatus\)\] : \[\]/);
  assert.match(app, /Vim normal mode/);
  assert.match(app, /Vim insert mode/);
  assert.match(app, /case "u":/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "r"/);
  assert.match(app, /case "A":/);
  assert.match(app, /case "0":/);
  assert.match(app, /case "\$":/);
  assert.match(app, /case "\^":/);
  assert.match(app, /case "Space":/);
  assert.match(app, /case "%":/);
  assert.match(app, /case "G":/);
  assert.match(app, /case "g":/);
  assert.match(app, /moveToFileStart/);
  assert.match(app, /Selection\.atStart\(state\.doc\)/);
  assert.match(app, /case "c":/);
  assert.match(app, /case "d":/);
  assert.match(app, /case "w":/);
  assert.match(app, /case "b":/);
  assert.match(app, /case "x":/);
  assert.match(app, /case "s":/);
  assert.match(app, /case "S":/);
  assert.match(app, /case "p":/);
  assert.match(app, /case "O":/);
  assert.match(app, /case "y":/);
  assert.match(app, /writeCopyBuffer\(\{ text, linewise: true \}\)/);
  assert.match(app, /deleteWordUnderCursor/);
  assert.match(app, /yankWordUnderCursor/);
  assert.match(app, /handleTextInput: \(\) =>/);
  assert.match(app, /Use Vim keybindings/);
});

test("command save shortcut is wrapped in the webview", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /handleGlobalSaveShortcut/);
  assert.match(app, /handleGlobalCommandPaletteShortcut/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "s"/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "p"/);
  assert.match(app, /!event\.metaKey && !event\.ctrlKey/);
  assert.match(app, /void saveCurrentFileRef\.current\(\)/);
  assert.match(app, /setCommandPaletteOpen\(true\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalSaveShortcut\)/);
  assert.match(app, /window\.addEventListener\("keydown", handleGlobalCommandPaletteShortcut\)/);
});

test("renaming a page title immediately saves the active file", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /function finishPageNameEdit\(\)/);
  assert.match(app, /pageNameRef\.current\.trim\(\) !== fileNameWithoutMarkdownExtension\(activeFile\.name\)/);
  assert.match(app, /void saveCurrentFileRef\.current\(\)/);
});

test("quick command palette exposes initial editor commands", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(app, /type CommandPaletteCommand/);
  assert.match(app, /commandPaletteCommands/);
  assert.match(app, /id: "create-tidbit"/);
  assert.match(app, /title: "Create Tidbit"/);
  assert.match(app, /expandDateTemplate\(tidbitSettings\.pathPattern\)/);
  assert.match(app, /"create_vault_markdown_file"/);
  assert.match(app, /id: "insert-rich-link"/);
  assert.match(app, /title: "Insert rich link"/);
  assert.match(app, /id: "insert-columns"/);
  assert.match(app, /title: "Insert columns"/);
  assert.match(app, /id: "insert-callout"/);
  assert.match(app, /title: "Insert callout"/);
  assert.match(app, /role="combobox"/);
  assert.match(app, /role="listbox"/);
  assert.match(app, /runCommandPaletteCommand/);
  assert.match(css, /\.command-palette-screen/);
  assert.match(css, /\.command-palette-card/);
  assert.match(css, /\.command-palette-results/);
  assert.match(backend, /fn create_vault_markdown_file/);
  assert.match(backend, /create_vault_markdown_file,/);
});

test("table row and column actions are contextual command palette entries", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /const cursorInsideTable/);
  assert.match(app, /editor\.isActive\("table"\)/);
  assert.match(app, /editor\.isActive\("tableCell"\)/);
  assert.match(app, /editor\.isActive\("tableHeader"\)/);
  assert.match(app, /id: "table-add-row-after"/);
  assert.match(app, /title: "Add row after"/);
  assert.match(app, /id: "table-delete-row"/);
  assert.match(app, /title: "Delete row"/);
  assert.match(app, /id: "table-add-column-after"/);
  assert.match(app, /title: "Add column after"/);
  assert.match(app, /id: "table-delete-column"/);
  assert.match(app, /title: "Delete column"/);
  assert.match(app, /id: "table-delete-table"/);
  assert.match(app, /title: "Delete table"/);
  assert.match(app, /\.\.\.tableCommandPaletteCommands/);
  assert.doesNotMatch(app, /label: "\+ Row"/);
  assert.doesNotMatch(app, /label: "- Row"/);
  assert.doesNotMatch(app, /label: "\+ Col"/);
  assert.doesNotMatch(app, /label: "- Col"/);
  assert.doesNotMatch(app, /label: "Drop Table"/);
});

test("list task quote code table columns and callout toolbar actions render as icons", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(app, /import \{ TaskItem \} from "@tiptap\/extension-task-item"/);
  assert.match(app, /import \{ TaskList \} from "@tiptap\/extension-task-list"/);
  assert.match(app, /TaskItem\.configure\(\{\s*nested: true,/);
  assert.match(app, /TaskList/);
  assert.match(app, /toggleTaskList\(\)/);
  assert.match(app, /type ToolbarIconName/);
  assert.match(app, /function renderToolbarIcon/);
  assert.match(app, /icon: "bullet-list"/);
  assert.match(app, /icon: "ordered-list"/);
  assert.match(app, /icon: "task-list"/);
  assert.match(app, /icon: "quote"/);
  assert.match(app, /icon: "code"/);
  assert.match(app, /icon: "table"/);
  assert.match(app, /icon: "columns"/);
  assert.match(app, /icon: "callout"/);
  assert.match(app, /aria-label=\{action\.title\}/);
  assert.match(app, /action\.icon \? renderToolbarIcon\(action\.icon\) : action\.label/);
  assert.match(css, /\.tool-button svg/);
  assert.match(css, /ul\[data-type="taskList"\]/);
  assert.match(css, /li\[data-type="taskItem"\]/);
  assert.match(css, /li\[data-checked\]/);
  assert.match(css, /display: flex;/);
  assert.match(css, /flex: 0 0 1\.15rem;/);
  assert.match(css, /li\[data-type="taskItem"\] > div > p/);
  assert.equal(packageJson.dependencies["@tiptap/extension-task-item"], "^3.26.1");
  assert.equal(packageJson.dependencies["@tiptap/extension-task-list"], "^3.26.1");
});

test("toolbar state refreshes when editor selection changes", () => {
  const app = readFileSync("src/App.tsx", "utf8");

  assert.match(app, /editorStateVersion/);
  assert.match(app, /setEditorStateVersion\(\(version\) => version \+ 1\)/);
  assert.match(app, /onSelectionUpdate: \(\{ editor \}: \{ editor: Editor \}\) => \{/);
  assert.match(app, /\[editor, editorFocused, editorStateVersion, markdown\]/);
});

test("code block language picker renders inside the active code block", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /function codeBlockContainsSelection\(selection: Selection, position: number, nodeSize: number\)/);
  assert.match(app, /const contentStart = position \+ 1;/);
  assert.match(app, /const contentEnd = position \+ nodeSize - 1;/);
  assert.match(app, /selection\.from >= contentStart && selection\.to <= contentEnd/);
  assert.match(app, /function codeBlockDecorationsContainLanguageControl/);
  assert.match(app, /includes\("code-block-language-active"\)/);
  assert.match(app, /function CodeBlockNodeView/);
  assert.match(app, /new PluginKey\("codeBlockLanguageControl"\)/);
  assert.match(app, /codeBlockContainsSelection\(state\.selection, position, node\.nodeSize\)/);
  assert.match(app, /addKeyboardShortcuts\(\) \{/);
  assert.match(app, /Tab: \(\) => \{/);
  assert.match(app, /return this\.editor\.commands\.insertContent\("    "\);/);
  assert.match(app, /"Shift-Tab": \(\) => this\.editor\.isActive\(this\.name\),/);
  assert.match(app, /ReactNodeViewRenderer\(CodeBlockNodeView, \{\s*update: \(\{ updateProps \}\) => \{/);
  assert.match(app, /updateProps\(\);/);
  assert.match(app, /CodeBlockWithLanguageControl\.configure\(\{\s*lowlight,/);
  assert.match(app, /class: "code-block-language-active"/);
  assert.match(app, /className="code-block-language-control"/);
  assert.match(app, /<NodeViewContent<"code"> as="code" \/>/);
  assert.match(app, /<datalist id="code-language-options">/);
  assert.doesNotMatch(app, /disabled=\{!codeBlockActive\}/);
  assert.doesNotMatch(app, /function updateCodeLanguage/);
  assert.doesNotMatch(app, /className="code-language-control"/);
  assert.match(css, /\.editor-surface \.code-block-node/);
  assert.match(css, /display: none;/);
  assert.match(css, /\.editor-surface \.code-block-node\.active \.code-block-language-control/);
  assert.match(css, /tab-size: 4;/);
  assert.match(css, /\.code-block-language-control/);
  assert.doesNotMatch(css, /\.code-language-control/);
});

test("tauri starts with the requested default window size", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const [windowConfig] = config.app.windows;

  assert.equal(windowConfig.width, 1470);
  assert.equal(windowConfig.height, 956);
});

test("split editor groups find an already open file across both panes", () => {
  const groups = {
    primary: {
      id: "primary",
      activeTabId: tabIdForFile("Notes/A.md"),
      tabs: [{ id: tabIdForFile("Notes/A.md"), dirty: false }],
    },
    secondary: {
      id: "secondary",
      activeTabId: tabIdForFile("Notes/B.md"),
      tabs: [{ id: tabIdForFile("Notes/B.md"), dirty: false }],
    },
  };

  assert.deepEqual(findTabAcrossSplitGroups(groups, tabIdForFile("Notes/B.md")), {
    groupId: "secondary",
    tab: { id: tabIdForFile("Notes/B.md"), dirty: false },
  });
  assert.equal(findTabAcrossSplitGroups(groups, tabIdForFile("Notes/C.md")), null);
});

test("split editor refuses to close a secondary group with dirty tabs", () => {
  assert.equal(splitHasDirtyTabs([{ dirty: false }, { dirty: false }]), false);
  assert.equal(splitHasDirtyTabs([{ dirty: false }, { dirty: true }]), true);
});

test("closing the final tab in a split pane leaves the other pane as primary", () => {
  const groups = {
    primary: {
      id: "primary",
      activeTabId: "a",
      tabs: [{ id: "a", title: "Alpha" }],
    },
    secondary: {
      id: "secondary",
      activeTabId: "b",
      tabs: [
        { id: "b", title: "Beta" },
        { id: "c", title: "Gamma" },
      ],
    },
  };

  assert.deepEqual(remainingGroupAfterSplitPaneClose(groups, "secondary"), {
    remainingGroupId: "primary",
    activeTab: { id: "a", title: "Alpha" },
    primaryGroup: {
      id: "primary",
      activeTabId: "a",
      tabs: [{ id: "a", title: "Alpha" }],
    },
  });
  assert.deepEqual(remainingGroupAfterSplitPaneClose(groups, "primary"), {
    remainingGroupId: "secondary",
    activeTab: { id: "b", title: "Beta" },
    primaryGroup: {
      id: "primary",
      activeTabId: "b",
      tabs: [
        { id: "b", title: "Beta" },
        { id: "c", title: "Gamma" },
      ],
    },
  });
});

test("resizable drawer widths are clamped to preserve editor workspace", () => {
  assert.equal(clampResizableDrawerWidth(140, 1200, 360, 20), 220);
  assert.equal(clampResizableDrawerWidth(420, 1200, 360, 20), 420);
  assert.equal(clampResizableDrawerWidth(900, 1200, 360, 20), 460);
});
