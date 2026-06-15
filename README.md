# Glyphary

Glyphary is a Tauri desktop Markdown editor built with React, TypeScript, and Tiptap. It edits Markdown files from a local vault, keeps frontmatter intact, supports multiple open documents, and provides drawer-based navigation for files, recent files, search, document contents, source/export, and calendar notes.

## Current Capabilities

- Tauri 2 macOS desktop app with a default window size of `1470 x 956`.
- Tiptap WYSIWYG Markdown editing.
- Optional local Vim-style editor keybindings.
- Markdown source editing and export/stats view in the right drawer.
- Vault-scoped autosave can save the active page once per minute and is enabled by default.
- Tidbits can be created quickly from the command palette using a vault-scoped path pattern.
- Multiple editable documents using tabs.
- Optional split editor layout with independent tabs in each pane.
- Frontmatter is hidden from the main editor, preserved on save, and editable from a collapsed plain-text metadata area.
- Configurable frontmatter pills can show a chosen metadata list, defaulting to `tags`.
- Page name can be edited by double-clicking the displayed page title; saving can rename the file.
- Table support through Tiptap table extensions.
- Task lists support GitHub-flavored Markdown checkboxes such as `- [ ]` and `- [x]`.
- Column layout blocks using `::: columns` and nested `::: column` containers.
- Callout blocks using `::: callout <type> "Optional title"` containers.
- Rich link cards that fetch page metadata and render URL previews.
- Code blocks support language selection and Markdown fences such as ```` ```python ```` or ```` ```sh ````.
- Syntax highlighting for code blocks using `highlight.js` and `lowlight`.
- A ```` ```toc ```` fenced block renders as an inline table of contents when not being edited.
- Light, dark, and auto appearance modes.
- Vault-specific theme builder with live preview and a first-pass Obsidian CSS variable compatibility layer.
- Vault CSS snippets loaded only after individual `.css` files are approved in Settings.
- Optional vault-scoped glass window effect on supported native windows.
- Quick command palette opened with `Cmd+P` or `Ctrl+P`.
- Native macOS/Tauri menu actions plus the in-window File menu.
- Toolbar and drawer actions use icon buttons with hover titles.

## Vaults

A vault is a directory on disk. Use `File -> Open Vault...` to select one.

When a vault is open:

- The left side is a collapsible vault drawer.
- The vault drawer opens expanded by default.
- The file icon view shows files and directories.
- Dot-prefixed files and directories are hidden by default and can be enabled in Settings.
- The search icon view searches the vault.
- The recent icon view shows recently opened vault files, newest first.
- Single-clicking a directory makes it the current top-level view.
- The Back button returns up one directory level until the selected vault root is reached.
- Double-clicking a file opens it in an editor tab.
- Double-clicking a directory opens or creates a shadow note inside that directory named `<directory name>.md`.
- Right-clicking a directory opens actions to create a note inside it, create a child folder, rename it, or move it to another vault folder selected from a folder tree.
- Right-clicking a file opens actions to move it to a folder-tree destination or delete it after confirmation.
- Directory renames also rename a matching shadow note from `<old>/<old>.md` to `<new>/<new>.md` when that note exists.
- The currently open file is highlighted when it appears in the file drawer.
- File and directory rows use icons rather than text badges.
- The vault drawer can be collapsed and resized with the drag bar.

Glyphary remembers the last vault, active file, and recent file list in local storage and restores them on app restart.

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

## Columns

Glyphary supports an editable column layout using Markdown container fences:

```markdown
::: columns
::: column
Left content
:::

::: column
Right content
:::
:::
```

The WYSIWYG editor renders the child `column` containers side by side when there is enough horizontal space and stacks them on narrower layouts. The Markdown serializer writes the same container syntax back to disk.

## Callouts

Glyphary supports editable callout blocks using the same container-fence family as columns:

```markdown
::: callout note
This is the callout body.
:::
```

The word after `callout` controls the visual variant. Current variants include `note`, `info`, `tip`, and `warning`; unknown variants still render as callouts with the default accent.

Callouts can also include an optional quoted title:

```markdown
::: callout warning "Database Migration"
Back up the database before running this.
:::
```

The body can contain normal block Markdown such as paragraphs, lists, links, and code blocks. Saving writes the same `::: callout` syntax back to disk.

## Quick Commands

Press `Cmd+P` on macOS or `Ctrl+P` on other platforms to open the quick command palette. Type to filter commands, use arrow keys to move selection, press `Enter` to run the selected command, and press `Escape` to close it.

Initial commands:

- `Insert callout`: inserts a note callout block.
- `Insert columns`: inserts a two-column container.
- `Insert rich link`: opens a URL dialog, fetches page metadata, and inserts a rich link card.

When the cursor is inside a table, the palette lists table actions first: `Add row after`, `Delete row`, `Add column after`, `Delete column`, and `Delete table`. These contextual commands stay out of the main formatting toolbar so table-only controls do not occupy permanent space.

## Rich Links

The `Insert rich link` command opens an in-app URL dialog, fetches the URL through the Tauri backend, and extracts common preview metadata:

- Open Graph title, description, image, and site name.
- Twitter card title, description, and image.
- HTML `<title>` and meta description as fallbacks.
- If no metadata image exists, the backend looks for an early page `<img>` or `srcset` image and uses it as a best-effort preview.

Rich links are stored in Markdown as a readable container:

```markdown
::: rich-link
url: https://example.com/article
title: Example Article
description: Short summary
image: https://example.com/card.png
siteName: Example
:::
```

The WYSIWYG editor renders this as a rounded preview card. If metadata is missing, the URL is still inserted and shown as the title/fallback text.

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
<vault root>/.glyphary
```

Currently supported setting:

- `assetDirectory`: where local image assets are stored and resolved from. Defaults to `_assets_`.
- `frontmatterPills.enabled`: whether to show a frontmatter list as pills above the editor. Defaults to `true`.
- `frontmatterPills.headerName`: the frontmatter header used for pills. Defaults to `tags`.
- `files.showDotfiles`: whether the vault file drawer shows files and directories whose names start with `.`. Defaults to `false`.
- `autosave.enabled`: whether the active page is saved automatically once per minute. Defaults to `true`.
- `tidbits.pathPattern`: where `Create Tidbit` creates fast notes. Defaults to `__transit__/Objects/tidbit-{{date:YYYY-mm-DD-hh-mm-ss}}.md`.
- `editor.vimMode`: whether editor panes use Vim-style keybindings. Defaults to `false`.
- `appearance.glassEffect`: whether the app window previews a translucent native glass material. Defaults to `false`.
- `cssSnippets.directory`: vault-relative directory searched for CSS snippets. Defaults to `_snippets_`.
- `cssSnippets.enabled`: approved `.css` file names from the snippets directory.
- `theme.presetId`: the selected theme template, when one is active.
- `theme.tokens`: vault-specific theme token overrides created by theme templates or the Settings theme builder.

The settings screen is separate from the right drawer and can be opened through the menu or `Cmd+,`. Settings are grouped into tabs:

- `Main`: vault asset directory, metadata pill settings, and editor behavior.
- `Appearance`: window glass effect, theme builder, and vault-specific color tokens.

Tidbit path patterns support `{{date:...}}` expansions. Supported date tokens include `YYYY`, `YY`, `MM`, `DD`, `HH`, `hh`, `mm`, and `ss`; the default lowercase `YYYY-mm-DD` date segment is kept compatible and expands `mm` as the month in that position.

Theme tokens are allowlisted and validated by the Tauri backend before they are written to `.glyphary`.

## Frontmatter And Metadata

Glyphary recognizes frontmatter at the top of Markdown files using either:

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

## Vim-Style Editing

Vim-style editing is optional and can be enabled per vault in `Settings -> Main -> Editor` with `Use Vim keybindings`. The setting is persisted in the vault `.glyphary` file as `editor.vimMode`.

The implementation is a local Glyphary Tiptap extension. It owns Normal/Insert mode state, motions, yanks, deletes, paste behavior, status updates, and a small Vim copy buffer.

### Modes

| Key | Behavior |
| --- | --- |
| `Esc` | Enter Normal mode. |
| `i` | Enter Insert mode. |
| `Shift-A` | Move to the end of the current line and enter Insert mode. |

The bottom status bar reports transitions as `Vim normal mode` and `Vim insert mode`.

### Motions

| Key | Behavior |
| --- | --- |
| `h` | Move left. |
| `j` | Move down one visual line. |
| `k` | Move up one visual line. |
| `l` | Move right. |
| `Space` | Move forward one character without inserting a space. |
| `0` | Move to the start of the current line. |
| `$` | Move to the end of the current line. |
| `^` | Move to the first non-blank character in the current line. |
| `%` | Move to the matching `()`, `[]`, or `{}` character on the current line. |
| `w` | Move forward to the start of the next word. |
| `b` | Move backward to the start of a word. |
| `G` | Move to the last line. |
| `gg` | Move to the first editable character of the file. |

### Editing

| Key | Behavior |
| --- | --- |
| `x` | Delete the character under the cursor and store it in the copy buffer. |
| `s` | Delete the character under the cursor and enter Insert mode. |
| `S` | Delete the current line and enter Insert mode. |
| `dd` | Yank the current line into the copy buffer, then delete it. |
| `dw` | Yank the word under the cursor into the copy buffer, then delete it. |
| `cw` | Delete the word under the cursor and enter Insert mode. |

### Yank And Paste

| Key | Behavior |
| --- | --- |
| `yy` | Yank the current line into the copy buffer. |
| `yw` | Yank the word under the cursor into the copy buffer. |
| `p` | Paste the copy buffer after the cursor. |
| `O` | Paste the copy buffer before the cursor. |

Glyphary keeps its own Vim copy buffer as the source of truth. Yank and delete operations also attempt a best-effort write to the system clipboard when the webview allows it.

### Undo And Redo

| Key | Behavior |
| --- | --- |
| `u` | Undo in Normal mode. |
| `Ctrl-r` | Redo in Normal mode. |

### Current Limits

This is not full Vim emulation. Printable text input is blocked in Normal mode, but only the commands listed above are intentionally supported. Multi-key commands such as `gg`, `dd`, `dw`, `cw`, `yy`, and `yw` use a short pending-key timeout.

## Menus

The app includes native Tauri/macOS menus for core actions:

- Open Vault
- Save
- New document
- Settings
- Appearance: Auto, Light, Dark

`Cmd+S` on macOS, or `Ctrl+S` on other platforms, is also handled inside the webview and saves the current document.

The in-window File menu remains as a fallback UI.
On macOS, the in-window File and New buttons are hidden because those actions are available from the native menu bar.

## Theming

Glyphary has built-in light, dark, and auto appearance modes. The current theme system exposes common Obsidian-style CSS variables such as:

- `--background-primary`
- `--background-secondary`
- `--text-normal`
- `--text-muted`
- `--interactive-accent`
- `--code-background`
- `--blockquote-border-color`

The app maps its own internal theme tokens through those variables, and it applies `theme-light` / `theme-dark` classes based on the resolved appearance. This is a compatibility foundation for future Obsidian-theme imports, not full Obsidian theme support yet. Obsidian themes can still depend on Obsidian-specific DOM structure and selectors that Glyphary does not currently emulate.

The Settings screen includes a macOS-oriented glass window effect, a dozen theme templates, approved CSS snippets, and a Theme Builder for the current vault. The glass setting previews immediately and is saved as `appearance.glassEffect` in `<vault root>/.glyphary`; unsupported platforms keep the regular opaque window. Theme templates apply complete token sets for canvas, surfaces, text, accents, borders, code, quotes, tables, and syntax colors, and the selected template id is saved with the vault settings. The Theme Builder then lets each token be refined manually. Color changes preview immediately by applying CSS variables to the running app. Saving writes the selected template and token values to `<vault root>/.glyphary`; Reset Theme clears custom token overrides, and Revert returns to the last saved vault settings.

CSS snippets are read from the configured vault-relative snippets directory, defaulting to `_snippets_`. Only simple `.css` files in that directory are listed, and only files explicitly checked in Settings are injected into the app. This gives a controlled escape hatch for vault-specific styling without automatically loading every CSS file found on disk.

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
- Markdown column container integration.
- Markdown callout container integration.
- Rich link Markdown formatting and metadata extraction.
- Frontmatter list extraction for display pills.
- Vim-mode integration surface.
- Split-pane tab lookup and pane closing behavior.
- Resizable drawer width clamping.
- Product defaults such as drawer state and asset directory.
- Obsidian-compatible theme variable surface.

Rust unit tests cover backend behavior such as:

- Directory listing.
- File read/write.
- Directory shadow notes.
- Folder note creation, child folder creation, shadow-note preserving folder renames, and folder moves.
- File moves and confirmed file deletion.
- Calendar note creation/listing.
- Search.
- Recent file ordering and capping.
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

## Roadmap

- Follow internal links
