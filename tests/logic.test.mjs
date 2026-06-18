import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
  defaultExcalidrawDirectory,
  defaultFrontmatterPillHeader,
  defaultInspectorDrawerWidth,
  defaultVaultDrawerWidth,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  defaultVaultImageDirectory,
  defaultTidbitGlobalShortcut,
  defaultTidbitPathPattern,
  displayVaultRelativePath,
  emptyCalloutMarkdown,
  emptyCollapseMarkdown,
  emptyColumnsMarkdown,
  emptyTableMarkdown,
  excalidrawFileNameForTitle,
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
  tabsAfterClose,
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
  assert.equal(defaultTidbitGlobalShortcut, "CommandOrControl+Shift+Space");
});

test("vault paths display relative to the vault root without markdown extensions", () => {
  assert.equal(displayVaultRelativePath(""), "/");
  assert.equal(displayVaultRelativePath("folder1/hello.md"), "folder1/hello");
  assert.equal(displayVaultRelativePath("/folder1/hello.markdown"), "folder1/hello");
  assert.equal(
    displayVaultRelativePath(
      "/Users/Chris/Documents/Obsidian/CFR/folder1/hello.md",
      "/Users/Chris/Documents/Obsidian/CFR",
    ),
    "folder1/hello",
  );
  assert.equal(
    displayVaultRelativePath(
      "/Users/Chris/Documents/Obsidian/CFR",
      "/Users/Chris/Documents/Obsidian/CFR",
    ),
    "/",
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

  assert.doesNotMatch(app, /\{ label: "Table of contents", value: "toc" \}/);
  assert.match(app, /const isRenderedTableOfContents = language === "toc"/);
  assert.match(app, /!isRenderedTableOfContents \? \(/);
  assert.match(app, /function codeBlockDecorationClassNames/);
  assert.match(app, /\.\.\.codeBlockDecorationClassNames\(decorations\)/);
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

test("gallery markdown containers are wired into the editor", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const readme = readFileSync("README.md", "utf8");

  assert.match(app, /function createGalleryExtension\(\)/);
  assert.match(app, /name: "gallery"/);
  assert.match(app, /markdownTokenName: "gallery"/);
  assert.match(app, /data-glyphary-gallery/);
  assert.match(app, /namedContainerOpening\(src, "gallery"\)/);
  assert.match(app, /createGalleryExtension\(\)/);
  assert.match(app, /function imageNodeMarkdown/);
  assert.match(app, /function selectedGalleryImages/);
  assert.match(app, /function wrapSelectedImagesInGallery\(\)/);
  assert.match(app, /id: "gallery-layout"/);
  assert.match(app, /title: "Gallery layout"/);
  assert.match(css, /\.markdown-gallery/);
  assert.match(readme, /::: gallery/);
});

test("editor images can be opened in a full-size preview", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(app, /type ImagePreviewState/);
  assert.match(app, /imagePreview, setImagePreview/);
  assert.match(app, /function openImagePreviewFromEditor/);
  assert.match(app, /target instanceof HTMLImageElement/);
  assert.match(app, /onDoubleClick=\{openImagePreviewFromEditor\}/);
  assert.match(app, /closeImagePreviewOnEscape/);
  assert.match(app, /className="image-preview-screen"/);
  assert.match(app, /aria-label="Image preview"/);
  assert.match(css, /\.image-preview-screen/);
  assert.match(css, /\.image-preview-card img/);
  assert.match(css, /max-height: calc\(100vh - 128px\)/);
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

test("collapse markdown containers render as expandable details blocks", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(emptyCollapseMarkdown, /^::: collapse More details/);
  assert.match(app, /function collapseContainerOpening/);
  assert.match(app, /function CollapseNodeView/);
  assert.match(app, /const \[open, setOpen\] = useState\(Boolean\(node\.attrs\.defaultOpen\)\)/);
  assert.match(app, /name: "collapse"/);
  assert.match(app, /markdownTokenName: "collapse"/);
  assert.match(app, /defaultOpen/);
  assert.match(app, /plainTitleIncludesOpenFlag/);
  assert.match(app, /data-glyphary-collapse/);
  assert.match(app, /markdown-collapse-summary/);
  assert.match(app, /ReactNodeViewRenderer\(CollapseNodeView\)/);
  assert.match(app, /setOpen\(\(value\) => !value\)/);
  assert.match(app, /createCollapseExtension\(\)/);
  assert.match(app, /insertCollapseBlock\(\)/);
  assert.match(app, /id: "insert-collapse"/);
  assert.match(app, /title: "Insert collapse"/);
  assert.match(app, /insertContent\(emptyCollapseMarkdown, \{ contentType: "markdown" \}\)/);
  assert.match(app, /const openPart = attrs\.defaultOpen === true \? " open" : ""/);
  assert.match(css, /\.markdown-collapse/);
  assert.match(css, /\.markdown-collapse\.open/);
  assert.match(css, /\.markdown-collapse-summary/);
  assert.match(css, /\.markdown-collapse-body/);
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
  assert.match(app, /openRichLinkDialog/);
  assert.match(app, /insertRichLinkFromUrl/);
  assert.match(app, /richLinkDialogOpen/);
  assert.match(app, /aria-label="Insert rich link"/);
  assert.match(css, /\.rich-link-card/);
  assert.match(css, /\.rich-link-dialog-screen/);
  assert.match(css, /\.rich-link-image/);
  assert.match(css, /\.rich-link-content/);
});

test("excalidraw drawings are embedded as vault files", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");
  const date = new Date("2023-01-02T17:37:41");

  assert.equal(defaultExcalidrawDirectory, "_assets_/drawings");
  assert.equal(
    excalidrawFileNameForTitle("System sketch?.excalidraw", date),
    "System sketch 20230102173741.excalidraw",
  );
  assert.match(app, /const ExcalidrawCanvas = lazy/);
  assert.match(app, /function createExcalidrawEmbedExtension/);
  assert.match(app, /markdownTokenName: "excalidrawEmbed"/);
  assert.match(app, /src\.search\(/);
  assert.match(app, /return index >= 0 \? index : src\.length/);
  assert.match(app, /excalidraw-embed-invalid/);
  const excalidrawViewStart = app.indexOf("function ExcalidrawEmbedView");
  const invalidEmbedReturn = app.indexOf("excalidraw-embed-invalid", excalidrawViewStart);
  const previewEffectHook = app.indexOf("useEffect(() => {", excalidrawViewStart);
  assert.ok(excalidrawViewStart >= 0);
  assert.ok(previewEffectHook > excalidrawViewStart);
  assert.ok(previewEffectHook < invalidEmbedReturn);
  assert.match(app, /excalidrawPreviewRefreshEvent/);
  assert.match(app, /window\.dispatchEvent\(\s*new CustomEvent\(excalidrawPreviewRefreshEvent/);
  assert.doesNotMatch(app, /excalidrawIgnoreNextChangeRef/);
  assert.match(app, /ExcalidrawImperativeAPI/);
  assert.match(app, /excalidrawApiRef/);
  assert.match(app, /api\?\.getSceneElementsIncludingDeleted\(\)/);
  assert.match(app, /visibleElementCount/);
  assert.match(app, /visible element/);
  assert.match(app, /api\?\.getAppState\(\)/);
  assert.match(app, /api\?\.getFiles\(\)/);
  assert.match(app, /excalidrawAPI=\{\(api\) =>/);
  assert.match(app, /createExcalidrawEmbedExtension\(\{/);
  assert.match(app, /id: "insert-excalidraw"/);
  assert.match(app, /title: "Insert Excalidraw drawing"/);
  assert.match(app, /openExcalidrawCreateDialog/);
  assert.match(app, /excalidrawCreateDialogOpen/);
  assert.match(app, /aria-label="Insert Excalidraw drawing"/);
  assert.match(app, /create_excalidraw_file/);
  assert.match(app, /serializeAsJSON\(elements, appState, files, "local"\)/);
  assert.match(app, /excalidrawSceneToSvgMarkup/);
  assert.match(css, /\.editor-surface \.excalidraw-embed/);
  assert.match(css, /\.excalidraw-create-dialog-screen/);
  assert.match(css, /\.excalidraw-dialog-screen/);
  assert.match(css, /\.excalidraw-editor-shell/);
  assert.match(vaultBackend, /pub\(crate\) fn create_excalidraw_file/);
  assert.match(vaultBackend, /Drawing path must end with \.excalidraw/);
  assert.match(backend, /create_excalidraw_file,/);
});

test("default drawer and vault asset settings match the current product defaults", () => {
  assert.equal(defaultDrawerOpen, false);
  assert.equal(defaultVaultDrawerOpen, true);
  assert.equal(defaultVaultAssetDirectory, "_assets_");
  assert.equal(defaultVaultImageDirectory, "_assets_/images");
  assert.equal(defaultVaultDrawerWidth, 320);
  assert.equal(defaultInspectorDrawerWidth, 360);
});

test("tauri backend modules document their responsibilities and contracts", () => {
  function rustFilesUnder(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;

      if (entry.isDirectory()) {
        return rustFilesUnder(path);
      }

      return entry.name.endsWith(".rs") ? [path] : [];
    });
  }

  const rustFiles = rustFilesUnder("src-tauri/src");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");

  for (const file of rustFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /^\/\/! /, `${file} should start with module docs`);
    assert.match(source, /\/\/! Responsibilities:/, `${file} should document responsibilities`);
    assert.match(source, /\/\/! Contracts:/, `${file} should document contracts`);
  }

  assert.match(backend, /mod defaults;/);
  assert.match(backend, /mod models;/);
  assert.match(backend, /#\[cfg\(test\)\]\nmod tests;/);
  assert.doesNotMatch(backend, /mod tests \{/);
  assert.doesNotMatch(rustFiles.join("\n"), /src-tauri\/src\/tests\.rs/);
  assert.ok(rustFiles.includes("src-tauri/src/tests/mod.rs"));
});

test("frontend pure logic is split into documented helper modules", () => {
  const helperFiles = readdirSync("src/lib")
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `src/lib/${file}`);
  const barrel = readFileSync("src/logic.ts", "utf8");

  assert.ok(helperFiles.length >= 8);

  for (const file of helperFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /^\/\*\*/, `${file} should start with a module header`);
    assert.match(source, /Responsibilities:/, `${file} should document responsibilities`);
    assert.match(source, /Contracts:/, `${file} should document contracts`);
  }

  assert.match(barrel, /Compatibility barrel for pure frontend logic/);
  assert.match(barrel, /export \* from "\.\/lib\/markdown\.js"/);
  assert.match(barrel, /export \* from "\.\/lib\/tabs\.js"/);
  assert.doesNotMatch(barrel, /function splitMetaHeader/);
});

test("documentation website introduces core Glyphary workflows", () => {
  const html = readFileSync("docs-site/glyphary.html", "utf8");
  const redirect = readFileSync("docs-site/index.html", "utf8");
  const manualHtml = readFileSync("docs-manual/index.html", "utf8");
  const manualTheming = readFileSync("docs-manual/theming.html", "utf8");
  const manualPlugins = readFileSync("docs-manual/plugins.html", "utf8");
  const manualCss = readFileSync("docs-manual/styles.css", "utf8");
  const manualScript = readFileSync("docs-manual/script.js", "utf8");
  const css = readFileSync("docs-site/styles.css", "utf8");
  const script = readFileSync("docs-site/script.js", "utf8");
  const screenshots = readFileSync("docs-site/screenshots.md", "utf8");
  const makefile = readFileSync("Makefile", "utf8");

  assert.match(html, /Glyphary \| VoilaWeb/);
  assert.match(html, /Your vault, made visible/);
  assert.match(html, /VoilaWeb/);
  assert.match(html, /Three steps from folder to workspace/);
  assert.match(html, /Rich editing without giving up Markdown/);
  assert.match(html, /⌘P/);
  assert.match(html, /assets\/screenshots\/main-workspace\.png/);
  assert.match(html, /assets\/screenshots\/split-editing\.png/);
  assert.match(css, /\.navbar/);
  assert.match(css, /\.glass-card/);
  assert.match(css, /\.masonry/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(script, /screenshotImages/);
  assert.match(redirect, /url=\.\/glyphary\.html/);
  assert.match(manualHtml, /Glyphary User Manual/);
  assert.match(manualHtml, /href="https:\/\/github\.com\/glyphary\/glyphary"/);
  assert.match(manualHtml, /href="\.\/theming\.html"/);
  assert.match(manualHtml, /href="\.\/plugins\.html"/);
  assert.doesNotMatch(manualHtml, /href="\.\.\/docs-site\/glyphary\.html"/);
  assert.doesNotMatch(manualHtml, /href="\.\.\/docs\/theming\.md"/);
  assert.doesNotMatch(manualHtml, /href="\.\.\/docs\/plugins\.md"/);
  assert.match(manualHtml, /Open A Vault/);
  assert.match(manualHtml, /File And Folder Actions/);
  assert.match(manualHtml, /Command Palette/);
  assert.match(manualHtml, /Metadata And Frontmatter/);
  assert.match(manualHtml, /Markdown Features/);
  assert.match(manualHtml, /Excalidraw drawings/);
  assert.match(manualHtml, /Tidbits/);
  assert.match(manualHtml, /Global tidbit capture/);
  assert.match(manualHtml, /Theme Builder groups/);
  assert.match(manualHtml, /CSS snippets/);
  assert.match(manualHtml, /Minimal manifest/);
  assert.match(manualHtml, /glyphary-wasm-transform@1/);
  assert.match(manualHtml, /About And Debug/);
  assert.match(manualHtml, /Vim Mode/);
  assert.match(manualHtml, /Troubleshooting/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/main-workspace\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/columns\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/callouts\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/collapse\.png/);
  assert.match(manualHtml, /\.\/assets\/screenshots\/rich-links\.png/);
  assert.match(manualHtml, /Plain text, Python, Shell, JavaScript, TypeScript/);
  assert.match(manualHtml, /Insert table of contents/);
  assert.match(manualHtml, /_assets_\/drawings/);
  assert.match(manualHtml, /_assets_\/images/);
  assert.match(manualHtml, /_snippets_/);
  assert.match(manualHtml, /not for rendering live embedded HTML inside the note/);
  assert.doesNotMatch(manualHtml, /\.\.\/docs-site\/assets/);
  assert.match(manualTheming, /Glyphary Theming Reference/);
  assert.match(manualTheming, /Loading Snippets/);
  assert.match(manualTheming, /Stable Glyphary Variables/);
  assert.match(manualTheming, /Obsidian Compatibility Variables/);
  assert.match(manualTheming, /Supported Editor Selectors/);
  assert.match(manualTheming, /--glyphary-editor-max-width/);
  assert.match(manualTheming, /href="https:\/\/github\.com\/glyphary\/glyphary"/);
  assert.match(manualTheming, /href="\.\/plugins\.html"/);
  assert.match(manualTheming, /href="\.\/index\.html"/);
  assert.match(manualPlugins, /Glyphary Plugin Authoring/);
  assert.match(manualPlugins, /Plugin Location/);
  assert.match(manualPlugins, /Manifest/);
  assert.match(manualPlugins, /WASM Transform ABI/);
  assert.match(manualPlugins, /glyphary-wasm-transform@1/);
  assert.match(manualPlugins, /examples\/plugins\/uppercase_selection_rust/);
  assert.match(manualPlugins, /href="https:\/\/github\.com\/glyphary\/glyphary"/);
  assert.match(manualPlugins, /href="\.\/theming\.html"/);
  assert.match(manualPlugins, /href="\.\/index\.html"/);
  assert.match(manualCss, /\.manual-sidebar/);
  assert.match(manualCss, /\.feature-table/);
  assert.match(manualCss, /\.manual-toplinks a\.current/);
  assert.match(manualScript, /filterManualSections/);
  assert.match(screenshots, /Main workspace/);
  assert.match(screenshots, /docs-site\/assets\/screenshots\/main-workspace\.png/);
  assert.match(makefile, /^docs:/m);
  assert.match(makefile, /^docs-open:/m);
  assert.match(makefile, /^manual:/m);
  assert.match(makefile, /^manual-open:/m);
});

test("motion layer keeps interface animations short and reduced-motion aware", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(css, /--glyphary-motion-duration-fast: 120ms/);
  assert.match(css, /--glyphary-motion-duration-base: 160ms/);
  assert.match(css, /--glyphary-motion-duration-slow: 180ms/);
  assert.match(css, /transition: grid-template-columns var\(--motion-duration-slow\) var\(--motion-ease\)/);
  assert.match(css, /animation: glyphary-pop-in var\(--motion-duration-base\) var\(--motion-ease\)/);
  assert.match(css, /@keyframes glyphary-status-update/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /key=\{`\$\{calendarMonth\.getFullYear\(\)\}-\$\{calendarMonth\.getMonth\(\)\}`\}/);
  assert.match(app, /normalizedVaultAppearanceDraft\.statusBarVisible \? \(/);
  assert.match(app, /<footer className="statusbar" key=\{status\}>/);
  assert.match(css, /min-height: 14px/);
  assert.match(css, /--glyphary-shell-gap: 4px/);
  assert.doesNotMatch(css, /--glyphary-shell-gap: 20px/);
});

test("vault plugins are settings-gated and run commands through safe host paths", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const defaultsBackend = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const pathsBackend = readFileSync("src-tauri/src/paths.rs", "utf8");
  const pluginsBackend = readFileSync("src-tauri/src/plugins.rs", "utf8");
  const pluginTestsBackend = readFileSync("src-tauri/src/tests/plugins.rs", "utf8");
  const worker = readFileSync("src/pluginWorker.ts", "utf8");

  assert.match(appTypes, /export type PluginManifest/);
  assert.match(appTypes, /runtime: "glyphary-wasm-transform@1"/);
  assert.match(appTypes, /export type PluginWasmCommand/);
  assert.match(appTypes, /export type SettingsTab = "main" \| "appearance" \| "plugins" \| "debug"/);
  assert.match(appTypes, /export type DebugSettings/);
  assert.match(appTypes, /debug\?: DebugSettings \| null/);
  assert.match(settings, /defaultDebugSettings: DebugSettings = \{\s*enabled: false,/);
  assert.match(settings, /function normalizeDebugSettings/);
  assert.match(settings, /function sameDebugSettings/);
  assert.match(app, /defaultPluginSettings/);
  assert.match(appTypes, /plugins\?: PluginSettings \| null/);
  assert.match(settings, /normalizePluginSettings/);
  assert.match(app, /refreshPlugins/);
  assert.match(app, /list_vault_plugins/);
  assert.match(app, /read_plugin_styles/);
  assert.match(app, /read_plugin_template/);
  assert.match(app, /read_plugin_wasm/);
  assert.match(app, /new Worker\(new URL\("\.\/pluginWorker\.ts", import\.meta\.url\)/);
  assert.match(app, /setTimeout\(\(\) => \{/);
  assert.match(app, /runWasmPluginTransform/);
  assert.match(app, /pluginCommandPaletteCommands/);
  assert.match(app, /id: `plugin:\$\{plugin\.id\}:\$\{command\.id\}`/);
  assert.match(app, /Open a vault before running plugin commands/);
  assert.match(app, /settingsTab === "plugins"/);
  assert.match(app, /settingsTab === "debug"/);
  assert.match(app, /Enable debug mode/);
  assert.match(app, /Global Shortcut Diagnostics/);
  assert.match(app, /aria-label="Plugin settings"/);
  assert.match(app, /Enable vault plugins discovered under \.glyphary\/plugins/);
  assert.match(app, /data-glyphary-plugin-style/);
  assert.match(css, /\.plugin-list/);
  assert.match(css, /\.plugin-errors/);
  assert.match(modelsBackend, /pub\(crate\) struct PluginManifest/);
  assert.match(defaultsBackend, /PLUGIN_RUNTIME_WASM_TRANSFORM_V1: &str = "glyphary-wasm-transform@1"/);
  assert.match(pluginsBackend, /Unsupported plugin runtime/);
  assert.match(modelsBackend, /pub\(crate\) struct PluginWasmCommand/);
  assert.match(pluginsBackend, /pub\(crate\) fn list_vault_plugins/);
  assert.match(pluginsBackend, /pub\(crate\) fn read_plugin_styles/);
  assert.match(pluginsBackend, /pub\(crate\) fn read_plugin_template/);
  assert.match(pluginsBackend, /pub\(crate\) fn read_plugin_wasm/);
  assert.match(defaultsBackend, /PLUGIN_DIRECTORY: &str = "\.glyphary\/plugins"/);
  assert.match(defaultsBackend, /SETTINGS_DIRECTORY_NAME: &str = "\.glyphary"/);
  assert.match(defaultsBackend, /SETTINGS_CONFIG_FILE_NAME: &str = "config\.json"/);
  assert.match(pathsBackend, /pub\(crate\) fn vault_settings_path/);
  assert.match(pluginsBackend, /Unsupported plugin permission/);
  assert.match(pluginTestsBackend, /lists_plugins_and_reads_only_declared_plugin_assets/);
  assert.match(worker, /WASM plugin must export memory/);
  assert.match(worker, /WASM plugin must export alloc\(length\)/);
  assert.match(worker, /WASM plugin must export transform\(pointer, length\)/);
});

test("wikilinks use the vault filename index for navigation and insertion", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const vaultTestsBackend = readFileSync("src-tauri/src/tests/vault.rs", "utf8");
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");

  assert.match(modelsBackend, /pub\(crate\) struct VaultIndexedFile/);
  assert.match(vaultBackend, /pub\(crate\) fn list_vault_markdown_files/);
  assert.match(vaultBackend, /pub\(crate\) fn walk_note_files/);
  assert.match(backend, /list_vault_markdown_files,/);
  assert.match(vaultTestsBackend, /lists_vault_markdown_files_for_wikilink_index/);
  assert.match(appTypes, /export type VaultIndexedFile/);
  assert.match(appTypes, /export type WikiLinkPickerState/);
  assert.match(app, /createWikiLinkExtension/);
  assert.match(app, /wikiLinkTokenPattern/);
  assert.match(app, /data-wikilink-target/);
  assert.match(app, /resolveWikiLinkTarget/);
  assert.match(app, /rebuildWikiLinkIndex/);
  assert.match(app, /setStatus\("Indexing\.\.\."\)/);
  assert.match(app, /invoke<VaultIndexedFile\[]>\("list_vault_markdown_files"/);
  assert.match(app, /openWikiLinkSearchRef/);
  assert.match(app, /wikiLinkSearchOpen/);
  assert.match(app, /wikiLinkSearchSelectedIndex/);
  assert.match(app, /handleWikiLinkSearchKeyDown/);
  assert.match(app, /moveSelectableIndex\(index, filteredWikiLinkFiles\.length, 1\)/);
  assert.match(app, /moveSelectableIndex\(index, filteredWikiLinkFiles\.length, -1\)/);
  assert.match(app, /insertWikiLinkSelection/);
  assert.match(app, /tr\.insertText\(insertion\)/);
  assert.match(app, /setWikiLinkPicker/);
  assert.match(app, /wikiLinkPickerSelectedIndex/);
  assert.match(app, /openWikiLinkPickerSelection/);
  assert.match(app, /addFileToWikiLinkIndex/);
  assert.match(app, /replaceFileInWikiLinkIndex/);
  assert.match(app, /removeFileFromWikiLinkIndex/);
  assert.match(css, /\.editor-surface \.wikilink/);
  assert.match(css, /\.wikilink-search-screen/);
  assert.match(css, /\.wikilink-picker/);
});

test("sample uppercase WASM plugin follows the transform ABI", async () => {
  const manifest = JSON.parse(
    readFileSync("examples/plugins/uppercase_selection/plugin.json", "utf8"),
  );
  const wasm = readFileSync("examples/plugins/uppercase_selection/plugin.wasm");
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const exports = instance.exports;
  const input = new TextEncoder().encode("Hello, Glyphary plugin!");
  const inputPointer = exports.alloc(input.length);

  new Uint8Array(exports.memory.buffer, inputPointer, input.length).set(input);

  const outputPointer = exports.transform(inputPointer, input.length);
  const outputLength = new DataView(exports.memory.buffer).getUint32(outputPointer, true);
  const outputBytes = new Uint8Array(exports.memory.buffer, outputPointer + 4, outputLength);
  const output = new TextDecoder().decode(outputBytes);

  assert.equal(manifest.id, "uppercase_selection");
  assert.equal(manifest.runtime, "glyphary-wasm-transform@1");
  assert.equal(manifest.commands[0].wasm.module, "plugin.wasm");
  assert.equal(manifest.commands[0].wasm.input, "selection");
  assert.equal(manifest.commands[0].wasm.output, "replaceSelection");
  assert.equal(output, "HELLO, GLYPHARY PLUGIN!");
});

test("sample Rust WASM plugin follows the transform ABI", async () => {
  const manifest = JSON.parse(
    readFileSync("examples/plugins/uppercase_selection_rust/plugin.json", "utf8"),
  );
  const wasm = readFileSync("examples/plugins/uppercase_selection_rust/plugin.wasm");
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const exports = instance.exports;
  const input = new TextEncoder().encode("Hello, Rust plugin!");
  const inputPointer = exports.alloc(input.length);

  new Uint8Array(exports.memory.buffer, inputPointer, input.length).set(input);

  const outputPointer = exports.transform(inputPointer, input.length);
  const outputLength = new DataView(exports.memory.buffer).getUint32(outputPointer, true);
  const outputBytes = new Uint8Array(exports.memory.buffer, outputPointer + 4, outputLength);
  const output = new TextDecoder().decode(outputBytes);

  assert.equal(manifest.id, "uppercase_selection_rust");
  assert.equal(manifest.runtime, "glyphary-wasm-transform@1");
  assert.equal(manifest.commands[0].wasm.module, "plugin.wasm");
  assert.equal(manifest.commands[0].wasm.input, "selection");
  assert.equal(manifest.commands[0].wasm.output, "replaceSelection");
  assert.equal(output, "HELLO, RUST PLUGIN!");
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

test("global tidbit capture is vault-gated and opens a lightweight editor window", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const capture = readFileSync("src/TidbitCapture.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const defaultsBackend = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const shortcutsBackend = readFileSync("src-tauri/src/shortcuts.rs", "utf8");
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
  const capabilities = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(packageJson.dependencies["@tauri-apps/plugin-global-shortcut"], "^2.3.2");
  assert.equal(packageJson.dependencies["tauri-plugin-macos-permissions-api"], "^2.3.0");
  assert.match(cargo, /tauri-plugin-global-shortcut = "2"/);
  assert.match(cargo, /tauri-plugin-macos-permissions = "2\.3\.0"/);
  assert.ok(capabilities.windows.includes("tidbit-capture"));
  assert.ok(capabilities.permissions.includes("global-shortcut:default"));
  assert.ok(capabilities.permissions.includes("macos-permissions:default"));
  assert.ok(capabilities.permissions.includes("core:window:allow-close"));
  assert.ok(capabilities.permissions.includes("core:webview:allow-create-webview-window"));
  assert.match(defaultsBackend, /global_shortcut_enabled: false/);
  assert.match(defaultsBackend, /default_tidbit_global_shortcut/);
  assert.match(backend, /tauri_plugin_global_shortcut::Builder::new\(\)\.build\(\)/);
  assert.match(backend, /tauri_plugin_macos_permissions::init\(\)/);
  assert.match(modelsBackend, /pub\(crate\) struct TidbitShortcutState/);
  assert.match(shortcutsBackend, /pub\(crate\) fn register_tidbit_global_shortcut/);
  assert.match(shortcutsBackend, /pub\(crate\) fn unregister_tidbit_global_shortcut/);
  assert.match(shortcutsBackend, /pub\(crate\) fn tidbit_global_shortcut_status/);
  assert.match(shortcutsBackend, /pub\(crate\) fn test_tidbit_global_shortcut_event/);
  assert.match(shortcutsBackend, /app\.global_shortcut\(\)\s*\.on_shortcut/);
  assert.match(shortcutsBackend, /app\.emit\("tidbit-global-shortcut"/);
  assert.match(backend, /register_tidbit_global_shortcut,/);
  assert.match(backend, /unregister_tidbit_global_shortcut,/);
  assert.match(backend, /tidbit_global_shortcut_status,/);
  assert.match(backend, /test_tidbit_global_shortcut_event,/);
  assert.match(settings, /globalShortcutEnabled: false/);
  assert.match(settings, /globalShortcut: defaultTidbitGlobalShortcut/);
  assert.match(app, /checkAccessibilityPermission/);
  assert.match(app, /requestAccessibilityPermission/);
  assert.match(app, /function requestTidbitShortcutAccessibilityPermission/);
  assert.match(settings, /function keyboardEventMatchesShortcut/);
  assert.match(app, /void requestTidbitShortcutAccessibilityPermission\(\);/);
  assert.match(app, /if \(!isTauri\(\) \|\| !vaultRoot \|\| !settings\.globalShortcutEnabled\)/);
  assert.match(app, /if \(!isTauri\(\) \|\| !isRunningOnMacOs\(\)\)/);
  assert.match(app, /Grant Glyphary Accessibility permission in macOS System Settings/);
  assert.match(app, /listen<string>\("tidbit-global-shortcut"/);
  assert.match(app, /Received global tidbit shortcut event/);
  assert.match(app, /Received tidbit shortcut test event/);
  assert.match(app, /invoke<boolean>\("register_tidbit_global_shortcut"/);
  assert.match(app, /invoke\("unregister_tidbit_global_shortcut"\)/);
  assert.match(app, /invoke<TidbitShortcutStatus>\("tidbit_global_shortcut_status"\)/);
  assert.match(app, /invoke\("test_tidbit_global_shortcut_event"\)/);
  assert.match(app, /It may already be used by macOS or another app/);
  assert.match(app, /WebviewWindow\.getByLabel\("tidbit-capture"\)/);
  assert.match(app, /url: `index\.html\?\$\{params\.toString\(\)\}`/);
  assert.match(app, /view: "tidbit-capture"/);
  assert.match(app, /tidbit-capture-created/);
  assert.match(app, /Enable global tidbit capture shortcut/);
  assert.match(app, /Global tidbit shortcut/);
  assert.match(app, /settingsTab === "debug"/);
  assert.match(app, /debugDraft\.enabled \? \(/);
  assert.match(app, /Enable debug mode/);
  assert.match(app, /Global Shortcut Diagnostics/);
  assert.match(app, /Request Permission/);
  assert.match(app, /Test Capture Event/);
  assert.match(app, /Check Shortcut/);
  assert.match(app, /No tidbit shortcut is registered/);
  assert.match(app, /onClick=\{\(\) => void requestTidbitShortcutAccessibilityPermission\(\)\}/);
  assert.match(app, /Save Settings to activate global tidbit capture/);
  assert.match(app, /Save Settings to activate it/);
  assert.match(app, /const pathPattern = event\.currentTarget\.value;/);
  assert.match(app, /const globalShortcutEnabled = event\.currentTarget\.checked;/);
  assert.match(settings, /function shortcutFromKeyboardEvent/);
  assert.match(settings, /function shortcutKeyFromEvent/);
  assert.match(settings, /event\.metaKey \? "Command" : ""/);
  assert.match(settings, /event\.ctrlKey \? "Control" : ""/);
  assert.match(settings, /if \(!event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(app, /readOnly/);
  assert.match(app, /onKeyDown=\{\(event\) => \{/);
  assert.match(app, /const globalShortcut = shortcutFromKeyboardEvent\(event\);/);
  assert.match(app, /event\.preventDefault\(\);/);
  assert.match(app, /globalShortcut: defaultTidbitGlobalShortcut/);
  assert.match(app, /handleFocusedTidbitShortcut/);
  assert.match(app, /keyboardEventMatchesShortcut\(event, settings\.globalShortcut\)/);
  assert.match(app, /addEventListener\("keydown", handleFocusedTidbitShortcut, \{ capture: true \}\)/);
  assert.match(app, /target\.closest\("\.shortcut-capture-control"\)/);
  assert.doesNotMatch(app, /setTidbitDraft\(\(settings\) => \(\{[\s\S]{0,220}event\.currentTarget/);
  const mainSettingsStart = app.indexOf('{settingsTab === "main" ? (');
  const mainSettingsEnd = app.indexOf('{settingsTab === "plugins" ? (', mainSettingsStart);
  const mainSettingsPanel = app.slice(mainSettingsStart, mainSettingsEnd);
  const debugSettingsStart = app.indexOf('{settingsTab === "debug" ? (');
  const debugSettingsEnd = app.indexOf('{settingsTab === "appearance" ? (', debugSettingsStart);
  const debugSettingsPanel = app.slice(debugSettingsStart, debugSettingsEnd);

  assert.ok(mainSettingsStart > -1);
  assert.ok(mainSettingsEnd > mainSettingsStart);
  assert.ok(debugSettingsStart > -1);
  assert.ok(debugSettingsEnd > debugSettingsStart);
  assert.doesNotMatch(mainSettingsPanel, /Request Permission|Test Capture Event|Check Shortcut/);
  assert.match(debugSettingsPanel, /Request Permission/);
  assert.match(debugSettingsPanel, /Test Capture Event/);
  assert.match(debugSettingsPanel, /Check Shortcut/);
  const registrationStart = app.indexOf("async function registerTidbitShortcut()");
  const registrationEnd = app.indexOf("void registerTidbitShortcut().catch", registrationStart);
  const registrationEffect = app.slice(registrationStart, registrationEnd);

  assert.ok(registrationStart > -1);
  assert.ok(registrationEnd > registrationStart);
  assert.doesNotMatch(registrationEffect, /requestTidbitShortcutAccessibilityPermission/);
  assert.doesNotMatch(registrationEffect, /checkAccessibilityPermission/);
  assert.match(css, /\.shortcut-capture-control/);
  assert.match(css, /\.settings-inline-actions/);
  assert.match(css, /\.settings-inline-action/);
  assert.match(capture, /function contextFromUrl/);
  assert.match(capture, /readPersistedAppearance/);
  assert.match(capture, /resolveAppearance/);
  assert.match(capture, /read_vault_settings/);
  assert.match(capture, /normalizeCaptureThemeTokens/);
  assert.match(capture, /function tidbitDirectory/);
  assert.match(capture, /function tidbitDisplayName/);
  assert.match(capture, /function normalizeTidbitNameDraft/);
  assert.match(capture, /function tidbitRelativePathFromName/);
  assert.match(capture, /const \[nameEditing, setNameEditing\]/);
  assert.match(capture, /const \[nameDraft, setNameDraft\]/);
  assert.match(capture, /const saveRelativePath = tidbitRelativePathFromName\(relativePath, nameDraft\)/);
  assert.match(capture, /document\.documentElement\.style\.setProperty\(token, value\)/);
  assert.match(capture, /getCurrentWindow\(\)\.setTheme\(resolvedAppearance\)/);
  assert.match(capture, /useEditor\(\{/);
  assert.match(capture, /Markdown\.configure/);
  assert.match(capture, /create_vault_markdown_file/);
  assert.match(capture, /relative: saveRelativePath/);
  assert.match(capture, /write_vault_file/);
  assert.match(capture, /emitTo\("main", "tidbit-capture-created"/);
  assert.match(capture, /event\.key === "Enter" && \(event\.metaKey \|\| event\.ctrlKey\)/);
  assert.match(capture, /event\.key === "Escape"/);
  assert.match(capture, /getCurrentWindow\(\)\.close\(\)/);
  assert.match(capture, /onKeyDownCapture=\{handleKeyDown\}/);
  assert.match(capture, /aria-label="Tidbit name"/);
  assert.match(capture, /onDoubleClick=\{\(\) => setNameEditing\(true\)\}/);
  assert.match(capture, /Double-click to rename before saving/);
  assert.match(capture, /tidbitDisplayName\(saveRelativePath\)/);
  assert.match(capture, /setStatus\(error instanceof Error \? error\.message : String\(error\)\)/);
  assert.match(main, /view"\) === "tidbit-capture"/);
  assert.match(main, /<TidbitCapture \/>/);
  assert.match(css, /\.tidbit-capture/);
  assert.match(css, /\.tidbit-capture-path/);
  assert.match(css, /\.tidbit-capture-header input/);
  assert.match(css, /\.tidbit-capture-editor \.tiptap/);
  assert.match(css, /\.tidbit-capture-editor \.tiptap \{[\s\S]*max-width: var\(--glyphary-editor-max-width\)/);
});

test("vault drawer exposes files search and recent views", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const css = readFileSync("src/App.css", "utf8");

  assert.match(appTypes, /export type VaultDrawerItem = "files" \| "search" \| "recent"/);
  assert.match(app, /recentFilesWithOpenedFile/);
  assert.match(appTypes, /recentFiles: ActiveFile\[\]/);
  assert.match(app, /Recently opened files/);
  assert.match(app, /toggleVaultDrawerItem\("recent"\)/);
  assert.doesNotMatch(app, /className="file-context"/);
  assert.match(app, /displayVaultRelativePath\(activeFile\?\.relativePath \?\? currentDir, vaultRoot\)/);
  assert.doesNotMatch(app, /vaultDrawerItem === "files"[\s\S]*?return vaultRoot \|\| "No vault selected"/);
  assert.doesNotMatch(app, /aria-label="Close vault drawer"/);
  assert.match(app, /className=\{isActiveGroup \? "editor-pane-shell active-group" : "editor-pane-shell"\}/);
  assert.match(css, /\.editor-pane-shell/);
  assert.match(css, /\.editor-pane-shell\.active-group \.editor-pane/);
  assert.match(css, /\.editor-groups \{[\s\S]*grid-auto-rows: minmax\(0, 1fr\)/);
  assert.match(css, /\.editor-pane-shell \{[\s\S]*height: 100%/);
  assert.match(css, /\.editor-pane \{[\s\S]*flex: 1/);
  assert.doesNotMatch(css, /\.editor-groups\s*\{[^}]*padding-top:\s*50px/s);
  assert.match(css, /\.recent-entry-text/);
  assert.match(css, /\.recent-entry em/);
});

test("vault rows expose context menu actions for folders and files", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");
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
  assert.match(vaultBackend, /pub\(crate\) fn create_note_in_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn create_directory_in_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn rename_vault_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn move_vault_directory/);
  assert.match(vaultBackend, /pub\(crate\) fn move_vault_file/);
  assert.match(vaultBackend, /pub\(crate\) fn delete_vault_file/);
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
  const appTypes = readFileSync("src/lib/app-types.ts", "utf8");
  const settings = readFileSync("src/lib/settings.ts", "utf8");
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
  const defaultsBackend = readFileSync("src-tauri/src/defaults.rs", "utf8");
  const modelsBackend = readFileSync("src-tauri/src/models.rs", "utf8");
  const snippetsBackend = readFileSync("src-tauri/src/snippets.rs", "utf8");
  const settingsTestsBackend = readFileSync("src-tauri/src/tests/settings.rs", "utf8");
  const themesBackend = readFileSync("src-tauri/src/themes.rs", "utf8");
  const windowingBackend = readFileSync("src-tauri/src/windowing.rs", "utf8");
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");

  assert.match(css, /--background-primary:/);
  assert.match(css, /--font-editor: var\(--glyphary-font-editor\)/);
  assert.match(css, /max-width: var\(--glyphary-editor-max-width\)/);
  assert.match(css, /font-size: var\(--glyphary-editor-font-size\)/);
  assert.match(css, /line-height: var\(--glyphary-editor-line-height\)/);
  assert.match(css, /margin-top: var\(--glyphary-block-gap\)/);
  assert.match(css, /border-radius: var\(--radius-md\)/);
  assert.match(css, /tab-size: var\(--glyphary-code-tab-size\)/);
  assert.match(css, /--interactive-accent:/);
  assert.match(css, /--text-normal:/);
  assert.match(css, /--code-background:/);
  assert.match(css, /--blockquote-border-color:/);
  assert.match(app, /theme-dark/);
  assert.match(app, /theme-light/);
  assert.match(app, /markdown-preview-view/);
  assert.match(app, /Theme Builder/);
  assert.match(appTypes, /kind\?: "color" \| "value"/);
  assert.match(app, /defaultThemeLevelOneTokens/);
  assert.match(appTypes, /export type ThemePreset/);
  assert.match(app, /const themePresets: ThemePreset\[\]/);
  const presetBlock = app.match(/const themePresets: ThemePreset\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.equal((presetBlock.match(/id: "[a-z-]+"/g) ?? []).length, 12);
  assert.match(app, /for \(const preset of themePresets\)/);
  assert.match(app, /Theme Templates/);
  assert.match(app, /Theme Options/);
  assert.match(appTypes, /export type VaultThemeOptions/);
  assert.match(appTypes, /export type VaultThemeCalloutSettings/);
  assert.match(appTypes, /export type CssSnippetSettings/);
  assert.match(appTypes, /export type CalloutStyle = "plain" \| "striped" \| "card" \| "compact" \| "obsidian"/);
  assert.match(app, /defaultThemeOptions/);
  assert.match(app, /defaultThemeCalloutSettings/);
  assert.match(app, /normalizeThemeCalloutSettings/);
  assert.match(app, /sameThemeCalloutSettings/);
  assert.match(app, /normalizeThemeOptions/);
  assert.match(app, /sameThemeOptions/);
  assert.match(app, /themeOptionsDraft/);
  assert.match(app, /themeCalloutDraft/);
  assert.match(app, /cssSnippetDraft/);
  assert.match(app, /CSS Snippets/);
  assert.match(app, /Load only approved \.css files from a vault-relative directory/);
  assert.match(app, /data-glyphary-css-snippet/);
  assert.match(app, /list_css_snippets/);
  assert.match(app, /read_css_snippets/);
  assert.match(settings, /normalizeCssSnippetSettings/);
  assert.match(app, /Apply optional editor treatments on top of the selected theme/);
  assert.match(app, /Callout Rendering/);
  assert.match(app, /Choose a structured callout layout and icons for this vault theme/);
  assert.match(app, /callout-style-/);
  assert.match(app, /--glyphary-callout-note-icon/);
  assert.match(app, /const appShellClassName = \[/);
  assert.match(app, /theme-colorful-headings/);
  assert.match(app, /theme-heading-underlines/);
  assert.match(app, /theme-heading-anchors/);
  assert.match(app, /theme-rich-callouts/);
  assert.doesNotMatch(app, /dataset\.glypharyColorfulHeadings/);
  assert.doesNotMatch(app, /dataset\.glypharyHeadingUnderlines/);
  assert.doesNotMatch(app, /dataset\.glypharyHeadingAnchors/);
  assert.doesNotMatch(app, /dataset\.glypharyRichCallouts/);
  assert.match(app, /const colorfulHeadings = event\.currentTarget\.checked/);
  assert.match(app, /const headingUnderlines = event\.currentTarget\.checked/);
  assert.match(app, /const headingAnchors = event\.currentTarget\.checked/);
  assert.match(app, /const richCallouts = event\.currentTarget\.checked/);
  assert.match(app, /Use colorful heading levels/);
  assert.match(app, /Add heading underlines/);
  assert.match(app, /Show heading anchor markers/);
  assert.match(app, /Use rich callout styling and icons/);
  assert.match(app, /Callout layout/);
  assert.match(app, /const calloutKinds/);
  assert.match(app, /\{kind\.label\} icon/);
  assert.match(app, /applyThemePreset/);
  assert.match(appTypes, /presetId\?: string \| null/);
  assert.match(app, /selectedThemePresetIdDraft/);
  assert.match(app, /normalizeThemePresetId/);
  assert.match(app, /--glyphary-accent/);
  assert.match(app, /--glyphary-font-editor/);
  assert.match(app, /--glyphary-editor-max-width/);
  assert.match(app, /--glyphary-radius-md/);
  assert.match(app, /--glyphary-callout-padding/);
  assert.match(app, /--glyphary-callout-warning-color/);
  assert.match(app, /--glyphary-code-tab-size/);
  assert.match(app, /--syntax-purple/);
  assert.match(app, /rawThemeTokenValue/);
  assert.match(app, /type="text"/);
  assert.match(app, /Reset Theme/);
  assert.match(appTypes, /export type VaultAppearanceSettings/);
  assert.match(appTypes, /export type FileDisplaySettings/);
  assert.match(appTypes, /export type AutosaveSettings/);
  assert.match(appTypes, /export type TidbitSettings/);
  assert.doesNotMatch(app, /attachmentDirectory: string/);
  assert.doesNotMatch(app, /defaultVaultAttachmentDirectory/);
  assert.match(app, /function joinVaultImagePath/);
  assert.match(app, /defaultVaultImageDirectory/);
  assert.match(app, /convertFileSrc\(`\$\{root\}\/\$\{defaultVaultImageDirectory\}\/\$\{cleanReference\}`\)/);
  assert.match(app, /createVaultImageExtension\(\s*\(target\) => joinVaultImagePath/);
  assert.match(app, /assetDirectory: defaultVaultImageDirectory/);
  assert.match(settings, /defaultFileDisplaySettings/);
  assert.match(settings, /showDotfiles: false/);
  assert.match(settings, /defaultAutosaveSettings/);
  assert.match(settings, /enabled: true/);
  assert.match(settings, /defaultTidbitSettings/);
  assert.match(app, /Tidbit path pattern/);
  assert.doesNotMatch(app, /Attachment directory/);
  assert.match(app, /defaultTidbitPathPattern/);
  assert.match(app, /Show dotfiles and dot folders/);
  assert.match(app, /Autosave current page once per minute/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /60_000/);
  assert.match(app, /glassEffect/);
  assert.match(settings, /statusBarVisible: true/);
  assert.match(settings, /sectionCorners: "rounded"/);
  assert.match(settings, /workspaceMargin: "comfortable"/);
  assert.match(app, /Use glass window effect/);
  assert.match(app, /Show status bar/);
  assert.match(app, /Use rounded section corners/);
  assert.match(app, /Workspace margins/);
  assert.match(app, /<option value="compact">Flush<\/option>/);
  assert.match(app, /<option value="spacious">Roomy<\/option>/);
  assert.match(app, /normalizedVaultAppearanceDraft/);
  assert.match(app, /section-corners-\$\{normalizedVaultAppearanceDraft\.sectionCorners\}/);
  assert.match(app, /workspace-margin-\$\{normalizedVaultAppearanceDraft\.workspaceMargin\}/);
  assert.doesNotMatch(
    app,
    /setVaultAppearanceDraft\(\(settings\) => \(\{(?:(?!\}\)\);)[\s\S])*event\.currentTarget/,
  );
  assert.match(css, /\.section-corners-square \.editor-pane/);
  assert.match(css, /\.workspace-margin-compact/);
  assert.match(css, /\.workspace-margin-spacious/);
  assert.match(css, /--glyphary-shell-padding-top: 8px/);
  assert.match(css, /--glyphary-shell-padding-inline: 8px/);
  assert.match(css, /\.workspace-margin-compact \{[\s\S]*--glyphary-shell-padding-top: 0px/);
  assert.match(css, /\.workspace-margin-compact \{[\s\S]*--glyphary-shell-padding-inline: 0px/);
  assert.match(css, /\.workspace-margin-spacious \{[\s\S]*--glyphary-shell-padding-top: 14px/);
  assert.match(app, /set_window_glass_effect/);
  assert.match(appTypes, /export type SettingsDragState/);
  assert.match(app, /function openSettings/);
  assert.match(app, /setSettingsOffset\(\{ x: 0, y: 0 \}\)/);
  assert.match(app, /function closeSettings/);
  assert.match(app, /function clampSettingsOffset/);
  assert.match(app, /function settingsDragStartedOnControl/);
  assert.match(app, /target\.closest\("button, input, select, textarea"\)/);
  assert.match(app, /settingsDragStartedOnControl\(event\.target\)/);
  assert.match(app, /onPointerDown=\{startSettingsDrag\}/);
  assert.match(app, /onPointerMove=\{moveSettingsDrag\}/);
  assert.match(app, /closeSettingsOnEscape/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(css, /data-window-glass="enabled"/);
  assert.match(css, /\.settings-header\.dragging/);
  assert.match(css, /cursor: grab/);
  assert.match(windowingBackend, /Could not keep titlebar contrast material/);
  assert.doesNotMatch(windowingBackend, /set_effects\(None/);
  assert.match(css, /\.theme-preset-grid/);
  assert.match(css, /\.theme-preset-card/);
  assert.match(css, /\.app-shell\.theme-colorful-headings/);
  assert.match(css, /\.app-shell\.theme-heading-underlines/);
  assert.match(css, /\.app-shell\.theme-heading-anchors/);
  assert.match(css, /\.app-shell\.theme-rich-callouts/);
  assert.match(css, /\.app-shell\.callout-style-striped/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /\.app-shell\.callout-style-card/);
  assert.match(css, /\.app-shell\.callout-style-compact/);
  assert.match(css, /\.app-shell\.callout-style-obsidian/);
  assert.match(css, /content: var\(--callout-icon\)/);
  assert.doesNotMatch(css, /data-glyphary-colorful-headings="enabled"/);
  assert.doesNotMatch(css, /data-glyphary-heading-underlines="enabled"/);
  assert.doesNotMatch(css, /data-glyphary-heading-anchors="enabled"/);
  assert.doesNotMatch(css, /data-glyphary-rich-callouts="enabled"/);
  assert.match(defaultsBackend, /"--glyphary-font-editor"/);
  assert.match(defaultsBackend, /"--glyphary-callout-padding"/);
  assert.match(defaultsBackend, /"--glyphary-callout-warning-color"/);
  assert.match(defaultsBackend, /"--glyphary-editor-max-width"/);
  assert.match(defaultsBackend, /"--glyphary-radius-md"/);
  assert.match(defaultsBackend, /"--syntax-purple"/);
  assert.match(modelsBackend, /pub\(crate\) struct VaultThemeOptions/);
  assert.match(modelsBackend, /pub\(crate\) struct VaultThemeCallouts/);
  assert.match(modelsBackend, /pub\(crate\) struct CssSnippetSettings/);
  assert.match(snippetsBackend, /pub\(crate\) fn list_css_snippets/);
  assert.match(snippetsBackend, /pub\(crate\) fn read_css_snippets/);
  assert.match(snippetsBackend, /pub\(crate\) fn clean_css_snippet_name/);
  assert.match(defaultsBackend, /THEME_CALLOUT_STYLE_ALLOWLIST/);
  assert.match(defaultsBackend, /THEME_CALLOUT_ICON_ALLOWLIST/);
  assert.match(themesBackend, /clean_theme_callouts/);
  assert.match(settingsTestsBackend, /writes_vault_theme_options_without_tokens/);
  assert.equal(config.app.macOSPrivateApi, true);
  assert.equal(config.app.windows[0].transparent, true);
  assert.equal(config.bundle.publisher, "Glyphary contributors");
  assert.match(config.bundle.copyright, /Glyphary contributors/);
  assert.match(cargo, /macos-private-api/);
  assert.match(backend, /name: Some\("Glyphary"\.into\(\)\)/);
  assert.match(backend, /A local-first Markdown workspace/);
  assert.match(backend, /Built with Tauri, React, Tiptap/);
  assert.match(modelsBackend, /pub\(crate\) struct AppearanceSettings/);
  assert.match(modelsBackend, /glass_effect/);
  assert.match(modelsBackend, /preset_id/);
  assert.match(windowingBackend, /Effect::UnderWindowBackground/);
  assert.match(windowingBackend, /set_background_color\(Some\(Color\(0, 0, 0, 0\)\)\)/);
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
  const vaultBackend = readFileSync("src-tauri/src/vault.rs", "utf8");

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
  assert.match(app, /id: "gallery-layout"/);
  assert.match(app, /title: "Gallery layout"/);
  assert.match(app, /id: "insert-callout"/);
  assert.match(app, /title: "Insert callout"/);
  assert.match(app, /id: "insert-collapse"/);
  assert.match(app, /title: "Insert collapse"/);
  assert.match(app, /id: "insert-table-of-contents"/);
  assert.match(app, /title: "Insert table of contents"/);
  assert.match(app, /function appendTableOfContentsBlock\(\)/);
  assert.match(app, /insertContent\("```toc\\n```", \{ contentType: "markdown" \}\)/);
  assert.match(app, /role="combobox"/);
  assert.match(app, /role="listbox"/);
  assert.match(app, /runCommandPaletteCommand/);
  assert.match(app, /handleCommandPaletteKeyDown/);
  assert.match(app, /moveSelectableIndex\(index, filteredCommandPaletteCommands\.length, 1\)/);
  assert.match(app, /moveSelectableIndex\(index, filteredCommandPaletteCommands\.length, -1\)/);
  assert.match(css, /\.command-palette-screen/);
  assert.match(css, /\.command-palette-card/);
  assert.match(css, /\.command-palette-results/);
  assert.match(vaultBackend, /pub\(crate\) fn create_vault_markdown_file/);
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
  const app = readFileSync("src/App.tsx", "utf8");
  const css = readFileSync("src/App.css", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
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
  assert.match(app, /function revealFileInVaultDrawer\(file: ActiveFile \| null\)/);
  assert.match(app, /setVaultDrawerItem\("files"\)/);
  assert.match(app, /const fileDirectory = parentDirectory\(file\.relativePath\)/);
  assert.match(app, /void revealFileInVaultDrawer\(tab\.activeFile\)/);
  assert.match(app, /function setEditorMarkdownContent\(targetEditor: Editor, markdown: string\)/);
  assert.match(app, /targetEditor\.commands\.setContent\(\{\s*type: "doc"/);
  assert.match(app, /function hydrateDocumentTabAfterCommit\(tab: DocumentTab/);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(app, /hydrateDocumentTabAfterCommit\(closeResult\.nextActiveTab, groupId\)/);
  assert.match(app, /className="editor-surface-frame"/);
  assert.match(app, /className="empty-document-placeholder"/);
  assert.doesNotMatch(app, /commands\.setContent\(tab\.markdown, \{ contentType: "markdown" \}\)/);
  assert.match(css, /\.editor-surface-frame/);
  assert.match(css, /\.empty-document-placeholder/);
  assert.match(css, /isolation: isolate/);
  assert.match(css, /caret-color: var\(--editor-text\)/);
  assert.match(css, /z-index: 0/);
  assert.match(css, /--glyphary-editor-effective-padding-x: max\(18px, var\(--glyphary-editor-padding-x\)\)/);
  assert.match(css, /left: var\(--glyphary-editor-effective-padding-x\)/);
  assert.doesNotMatch(css, /top: calc\(var\(--glyphary-editor-padding-y\) \+ 92px\)/);
  assert.doesNotMatch(css, /100% - var\(--glyphary-editor-max-width\)/);
  assert.match(css, /\.app-error-screen/);
  assert.match(main, /class ErrorBoundary extends React\.Component/);
  assert.match(main, /<ErrorBoundary>/);
});

test("split editor refuses to close a secondary group with dirty tabs", () => {
  assert.equal(splitHasDirtyTabs([{ dirty: false }, { dirty: false }]), false);
  assert.equal(splitHasDirtyTabs([{ dirty: false }, { dirty: true }]), true);
});

test("closing the active tab selects a neighboring remaining tab", () => {
  const todayTab = { id: tabIdForFile("Calendar/Tue, Jun 16th 2026.md") };
  const heyTab = { id: tabIdForFile("hey.md") };
  const notesTab = { id: tabIdForFile("notes.md") };

  assert.deepEqual(tabsAfterClose([todayTab, heyTab], heyTab.id, heyTab.id), {
    nextTabs: [todayTab],
    nextActiveTab: todayTab,
    nextActiveTabId: todayTab.id,
    wasActiveTab: true,
  });
  assert.deepEqual(tabsAfterClose([todayTab, heyTab, notesTab], heyTab.id, heyTab.id), {
    nextTabs: [todayTab, notesTab],
    nextActiveTab: notesTab,
    nextActiveTabId: notesTab.id,
    wasActiveTab: true,
  });
  assert.deepEqual(tabsAfterClose([todayTab, heyTab], todayTab.id, heyTab.id), {
    nextTabs: [todayTab],
    nextActiveTab: todayTab,
    nextActiveTabId: todayTab.id,
    wasActiveTab: false,
  });
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
