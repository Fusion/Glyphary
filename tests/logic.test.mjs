import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calendarDateKey,
  calendarDayRelativePath,
  calendarDayTitle,
  calendarPathDateKey,
  cleanVaultAssetReference,
  composeMarkdown,
  defaultDrawerOpen,
  defaultVaultDrawerOpen,
  defaultVaultAssetDirectory,
  emptyTableMarkdown,
  fileNameForDroppedImage,
  isSupportedImageFile,
  markdownHeadings,
  splitMetaHeader,
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

test("local vault image references are accepted while URLs and path escapes are rejected", () => {
  assert.equal(cleanVaultAssetReference("image.png"), "image.png");
  assert.equal(cleanVaultAssetReference("folder/image.png|alias"), "folder/image.png");
  assert.equal(cleanVaultAssetReference("https://example.com/image.png"), null);
  assert.equal(cleanVaultAssetReference("../image.png"), null);
  assert.equal(cleanVaultAssetReference("folder/../image.png"), null);
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

test("table insertion seed keeps markdown table support available", () => {
  assert.match(emptyTableMarkdown, /^\| Column 1 \| Column 2 \| Column 3 \|/);
  assert.match(emptyTableMarkdown, /\| --- \| --- \| --- \|/);
});

test("default drawer and vault asset settings match the current product defaults", () => {
  assert.equal(defaultDrawerOpen, false);
  assert.equal(defaultVaultDrawerOpen, true);
  assert.equal(defaultVaultAssetDirectory, "_assets_");
});

test("tauri starts with the requested default window size", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const [windowConfig] = config.app.windows;

  assert.equal(windowConfig.width, 1470);
  assert.equal(windowConfig.height, 956);
});
