# MEdit

MEdit is a Tauri desktop Markdown editor built with React, TypeScript, and Tiptap. It edits Markdown files from a local vault, keeps frontmatter intact, supports multiple open documents, and provides drawer-based navigation for files, search, document contents, source/export, and calendar notes.

## Current Capabilities

- Tauri 2 macOS desktop app with a default window size of `1470 x 956`.
- Tiptap WYSIWYG Markdown editing.
- Markdown source editing and export/stats view in the right drawer.
- Multiple editable documents using tabs.
- Optional split editor layout with independent tabs in each pane.
- Frontmatter is hidden from the main editor, preserved on save, and editable from a collapsed plain-text metadata area.
- Configurable frontmatter pills can show a chosen metadata list, defaulting to `tags`.
- Page name can be edited by double-clicking the displayed page title; saving can rename the file.
- Table support through Tiptap table extensions.
- Code blocks support language selection and Markdown fences such as ```` ```python ```` or ```` ```sh ````.
- Syntax highlighting for code blocks using `highlight.js` and `lowlight`.
- A ```` ```toc ```` fenced block renders as an inline table of contents when not being edited.
- Light, dark, and auto appearance modes.
- Vault-specific theme builder with live preview and a first-pass Obsidian CSS variable compatibility layer.
- Native macOS/Tauri menu actions plus the in-window File menu.
- Toolbar and drawer actions use icon buttons with hover titles.

## Vaults

A vault is a directory on disk. Use `File -> Open Vault...` to select one.

When a vault is open:

- The left side is a collapsible vault drawer.
- The vault drawer opens expanded by default.
- The file icon view shows files and directories.
- The search icon view searches the vault.
- Single-clicking a directory makes it the current top-level view.
- The Back button returns up one directory level until the selected vault root is reached.
- Double-clicking a file opens it in an editor tab.
- Double-clicking a directory opens or creates a shadow note inside that directory named `<directory name>.md`.
- The currently open file is highlighted when it appears in the file drawer.
- File and directory rows use icons rather than text badges.
- The vault drawer can be collapsed and resized with the drag bar.

MEdit remembers the last vault and active file in local storage and restores them on app restart.

## Search

Vault search lives in the left drawer search view.

Search modes:

- `Names`: search by filename/path.
- `Content`: search file contents.

When available, the Rust backend uses `rg` for faster search. A fallback search path exists for content search.

## Right Drawer

The right drawer is closed by default, uses icon rail buttons, can be resized with the drag bar, and can show different views:

- Source: Markdown source editing and export/stats.
- Table of contents: heading outline for the active document.
- Calendar: monthly calendar note browser.

### Table Of Contents

The `TOC` drawer view is built from Markdown headings in the current editor body.

- Supports heading levels `#` through `######`.
- Ignores headings inside fenced code blocks.
- Duplicate headings are tracked by occurrence.
- Clicking an entry jumps to the matching heading in the editor.

The same heading engine powers inline `toc` code blocks. A fenced block like this:

````markdown
```toc
```
````

renders as an embedded table of contents while the cursor is outside the block. The block remains a normal fenced code block in Markdown and can be edited again with its inline Edit button.

## Calendar Notes

The `CAL` drawer view shows a monthly calendar.

- Prev/Next navigate between months.
- Double-clicking a day opens or creates the matching note.
- Newly created day notes are empty; the day string is used only for the filename.
- Calendar notes live under `ROOT/Calendar`.
- Filenames use this format: `Sun, Jun 14th 2026.md`.
- Days with existing calendar files display a dot.
- Calendar dots refresh when the displayed month changes.

## Images And Assets

The default asset directory is `_assets_`.

Local wiki-style image references are supported:

```markdown
![[image.png]]
![[folder/image.png]]
![[image.png|alias]]
```

These are resolved relative to the configured asset directory inside the current vault.

Local standard Markdown image URLs are also resolved from the vault asset directory when they are not external URLs:

```markdown
![Pasted image 20220413143858.png](Pasted%20image%2020220413143858.png)
```

Dragging or pasting an image into the editor:

- Saves it into the vault asset directory.
- Inserts an image reference into the page.
- Uses names like `Pasted image 20230102173741.png`.
- If the source file has a meaningful name, that name is sanitized and followed by the timestamp.
- Existing asset filenames are not overwritten; numeric suffixes are added when needed.

## Vault Settings

Settings are tied to the current vault and stored as JSON in:

```text
<vault root>/.medit
```

Currently supported setting:

- `assetDirectory`: where local image assets are stored and resolved from. Defaults to `_assets_`.
- `frontmatterPills.enabled`: whether to show a frontmatter list as pills above the editor. Defaults to `true`.
- `frontmatterPills.headerName`: the frontmatter header used for pills. Defaults to `tags`.
- `theme.tokens`: vault-specific theme token overrides created by the Settings theme builder.

The settings screen is separate from the right drawer and can be opened through the menu or `Cmd+,`. Settings are grouped into tabs:

- `Main`: vault asset directory and metadata pill settings.
- `Appearance`: theme builder and vault-specific color tokens.

Theme tokens are allowlisted and validated by the Tauri backend before they are written to `.medit`.

## Frontmatter And Metadata

MEdit recognizes frontmatter at the top of Markdown files using either:

```markdown
---
title: Example
---
```

or:

```toml
+++
title = "Example"
+++
```

Frontmatter is:

- Not shown in the WYSIWYG editor body.
- Not lost when saving.
- Editable through a collapsed plain-text metadata area above the editor.
- Collapsed by default, with a dedicated expand/collapse icon.
- Used to show simple YAML list values as non-editable pills beside the Frontmatter label, when enabled in Settings.

The pill extraction is intentionally conservative and only reads the configured header key, which defaults to `tags`. It recognizes simple inline lists such as `tags: [draft, project]` and simple block lists such as:

```yaml
tags:
  - draft
  - project
```

The header name can be changed in Settings, so a vault can use another field such as `topics`. More complex frontmatter remains editable in the plain-text metadata area.

## Tabs And Split Editing

Editor tabs let multiple documents stay open at once.

- Opening a file that is already open switches to the existing tab instead of creating a second editable copy.
- Each tab tracks its own dirty state.
- Closing the last tab in one split pane closes that pane; if the editor is split, this unsplits the workspace.
- The active pane controls the toolbar, the highlighted file in the left drawer, and the right drawer contents.
- The split/unsplit and save controls use icon buttons.
- Formatting controls stay fixed above the scrollable document surface.
- Each editor pane scrolls independently; the whole app shell does not scroll during document editing.

## Menus

The app includes native Tauri/macOS menus for core actions:

- Open Vault
- Save
- New document
- Settings
- Appearance: Auto, Light, Dark

The in-window File menu remains as a fallback UI.
On macOS, the in-window File and New buttons are hidden because those actions are available from the native menu bar.

## Theming

MEdit has built-in light, dark, and auto appearance modes. The current theme system exposes common Obsidian-style CSS variables such as:

- `--background-primary`
- `--background-secondary`
- `--text-normal`
- `--text-muted`
- `--interactive-accent`
- `--code-background`
- `--blockquote-border-color`

The app maps its own internal theme tokens through those variables, and it applies `theme-light` / `theme-dark` classes based on the resolved appearance. This is a compatibility foundation for future Obsidian-theme imports, not full Obsidian theme support yet. Obsidian themes can still depend on Obsidian-specific DOM structure and selectors that MEdit does not currently emulate.

The Settings screen includes a Theme Builder for the current vault. It groups editable colors for canvas, text, accents, borders, code blocks, quotes, tables, and syntax highlighting. Changes preview immediately by applying CSS variables to the running app. Saving writes the selected token values to `<vault root>/.medit`; Reset Theme clears custom token overrides, and Revert returns to the last saved vault settings.

The app also exposes an icon-only Auto/Light/Dark appearance control for quick switching.

## Development

Install dependencies:

```sh
make install
```

Run the desktop app in development:

```sh
make dev
```

Run the Vite web preview:

```sh
make web
```

Build the frontend:

```sh
make build
```

Typecheck/build frontend and check Rust:

```sh
make check
```

Run tests:

```sh
make test
```

Run npm audit:

```sh
make audit
```

Build a production `.app`:

```sh
make prod-app
```

Build release bundles:

```sh
make release
```

Open the built `.app`:

```sh
make run-app
```

Open the built `.dmg`:

```sh
make open-dmg
```

Clean generated output:

```sh
make clean
```

## Testing

`make test` runs:

- Frontend unit tests with Node's built-in test runner.
- Rust unit tests for Tauri backend commands.

Frontend unit tests cover helper behavior such as:

- Frontmatter splitting/composition.
- Local vault image reference parsing.
- Dropped/pasted image naming.
- Image file filtering.
- Calendar filename/key generation.
- Markdown heading extraction for the table of contents.
- Inline `toc` fenced-block support.
- Frontmatter list extraction for display pills.
- Split-pane tab lookup and pane closing behavior.
- Resizable drawer width clamping.
- Product defaults such as drawer state and asset directory.
- Obsidian-compatible theme variable surface.

Rust unit tests cover backend behavior such as:

- Directory listing.
- File read/write.
- Directory shadow notes.
- Calendar note creation/listing.
- Search.
- Asset saving and collision avoidance.
- Vault settings validation.
- Vault theme token validation.
- File rename behavior.
- Path traversal rejection.

## Project Structure

Important files:

- `src/App.tsx`: main React application and UI behavior.
- `src/App.css`: app styling, drawers, editor surface, themes.
- `src/logic.ts`: pure frontend helper logic used by app and tests.
- `tests/logic.test.mjs`: frontend unit tests.
- `src-tauri/src/lib.rs`: Tauri commands, menus, vault filesystem behavior, Rust tests.
- `src-tauri/tauri.conf.json`: Tauri app configuration.
- `Makefile`: development, build, test, and release targets.

## Current Limitations

- TOC jumping is based on matching rendered heading text and occurrence.
- Frontend tests cover pure logic; full interactive Tiptap flows are not yet automated end-to-end.
- The right drawer and left drawer states are app state only, not persisted.
- Obsidian theme support is currently a compatibility variable surface and theme builder, not full import of arbitrary Obsidian theme CSS.
