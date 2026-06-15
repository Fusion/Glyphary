# MEdit

MEdit is a Tauri desktop Markdown editor built with React, TypeScript, and Tiptap. It edits Markdown files from a local vault, keeps frontmatter intact, supports multiple open documents, and provides drawer-based navigation for files, search, document contents, source/export, and calendar notes.

## Current Capabilities

- Tauri 2 macOS desktop app with a default window size of `1470 x 956`.
- Tiptap WYSIWYG Markdown editing.
- Markdown source and export view in the right drawer.
- Multiple editable documents using tabs.
- Frontmatter is hidden from the main editor, preserved on save, and editable from a collapsed plain-text metadata area.
- Page name can be edited by double-clicking the displayed page title; saving can rename the file.
- Table support through Tiptap table extensions.
- Code blocks support language selection and Markdown fences such as ```` ```python ```` or ```` ```sh ````.
- Syntax highlighting for code blocks using `highlight.js` and `lowlight`.
- Light, dark, and auto appearance modes.
- Native macOS/Tauri menu actions plus the in-window File menu.

## Vaults

A vault is a directory on disk. Use `File -> Open Vault...` to select one.

When a vault is open:

- The left side is a collapsible vault drawer.
- The vault drawer opens expanded by default.
- The `FILE` view shows files and directories.
- The `SRCH` view searches the vault.
- Single-clicking a directory makes it the current top-level view.
- The Back button returns up one directory level until the selected vault root is reached.
- Double-clicking a file opens it in an editor tab.
- Double-clicking a directory opens or creates a shadow note inside that directory named `<directory name>.md`.
- The currently open file is highlighted when it appears in the file drawer.
- File and directory rows use icons rather than text badges.

MEdit remembers the last vault and active file in local storage and restores them on app restart.

## Search

Vault search lives in the left drawer `SRCH` view.

Search modes:

- `Names`: search by filename/path.
- `Content`: search file contents.

When available, the Rust backend uses `rg` for faster search. A fallback search path exists for content search.

## Right Drawer

The right drawer is closed by default and can show different views:

- `SRC`: Markdown source editing and export/stats.
- `TOC`: table of contents for the active document.
- `CAL`: monthly calendar note browser.

### Table Of Contents

The `TOC` drawer view is built from Markdown headings in the current editor body.

- Supports heading levels `#` through `######`.
- Ignores headings inside fenced code blocks.
- Duplicate headings are tracked by occurrence.
- Clicking an entry jumps to the matching heading in the editor.

## Calendar Notes

The `CAL` drawer view shows a monthly calendar.

- Prev/Next navigate between months.
- Double-clicking a day opens or creates the matching note.
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

The settings screen is separate from the right drawer and can be opened through the menu or `Cmd+,`.

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

## Menus

The app includes native Tauri/macOS menus for core actions:

- Open Vault
- Save
- New document
- Settings
- Appearance: Auto, Light, Dark

The in-window File menu remains as a fallback UI.

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
- Product defaults such as drawer state and asset directory.

Rust unit tests cover backend behavior such as:

- Directory listing.
- File read/write.
- Directory shadow notes.
- Calendar note creation/listing.
- Search.
- Asset saving and collision avoidance.
- Vault settings validation.
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
- Settings currently only expose the asset directory, with room for future vault-specific options.
