<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Glyphary logo" width="96" height="96" />
</p>

# Glyphary

[Documentation](https://glyphary.github.io/)

Glyphary is a fully open-source, fast, responsive, macOS-only Markdown workspace
for local vaults. It edits extended Markdown in true WYSIWYG mode, so tables,
columns, callouts, card links, image galleries, task lists, and expand/collapse
blocks are edited visually instead of through raw syntax.

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/main-workspace.png" alt="Glyphary workspace with an open vault" />
</p>

## Highlights

- **Visual extended Markdown editing**: edit rich Markdown structures directly, including tables, columns, callouts, rich card links, galleries, code blocks, task lists, and collapsible sections.
- **Obsidian compatibility where it matters**: open local vaults, resolve wikilinks, preserve frontmatter, support compatible daily notes, load approved CSS snippets, and fully open/edit Obsidian `.canvas` files.
- **Fast local search**: built-in vault search is extremely fast and does not require an external `rg` install.
- **Command palette**: use quick commands for inserts, table actions, rich links, Excalidraw drawings, tidbits, canvas actions, and more.
- **Canvas support**: open, edit, move, color, connect, and save Obsidian-compatible canvas nodes and edges.
- **Native Excalidraw integration**: create drawings from Glyphary and store them as vault files.
- **Daily notes and tidbits**: open calendar notes, create quick notes, and capture tidbits from anywhere when the app is running.
- **AI assistance**: connect an OpenAI-compatible backend for writing help, summaries, outlines, title generation, and page building.
- **Optional Vim mode**: use a practical Normal/Insert mode editing layer for keyboard-driven note work.
- **Themes and appearance**: choose light, dark, auto, glass, theme templates, CSS snippets, and editor treatments.
- **Plugin system**: enable vault-local plugins that run fast inside a WASM sandbox.

## Visual Editing

Glyphary keeps Markdown readable on disk while making the editing experience feel
like a native rich editor. This is especially useful for structures that are
awkward to maintain by hand, such as tables, columns, and callout-heavy notes.

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/columns.png" alt="Glyphary editing Markdown columns visually" />
</p>

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/callouts.png" alt="Glyphary callouts" />
</p>

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/collapse.png" alt="Glyphary expand and collapse blocks" />
</p>

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/rich-links.png" alt="Glyphary rich card links" />
</p>

## Canvas

Glyphary opens Obsidian-compatible `.canvas` files as editable graph documents.
You can add cards, notes, media, web pages, groups, colors, and arrowed edges,
then save back to the original canvas file.

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/canvas.png" alt="Glyphary canvas editor" />
</p>

## Search And Commands

Search, recent files, tasks, and quick commands are built into the workspace so
large vaults stay navigable. The command palette adapts to the current context:
Markdown notes get editing commands, tables get table commands, and canvases get
canvas commands.

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/vault-search.png" alt="Glyphary vault search" />
</p>

## AI

Glyphary supports AI through bring-your-own-key OpenAI-compatible backends. The
regular AI commands can improve writing, fix grammar, change tone, summarize,
expand, shorten, create outlines, generate titles, continue from the cursor, and
explain selected text.

The AI Builder is more ambitious: describe the page or section you want, and it
can generate rich Markdown content that uses Glyphary-native blocks. It can also
research the local vault with bounded retrieval, summarize a concept across
related notes, build tables of linked pages, and refine the same generated block
through follow-up prompts.

<p align="center">
  <img src="https://glyphary.github.io/assets/screenshots/ai-builder.png" alt="Glyphary AI Builder" />
</p>

## Appearance

Glyphary supports light, dark, and auto modes, theme templates, approved CSS
snippets, a theme builder, and basic Obsidian-style theme compatibility.

## Releasing

```
make prod-app && make run-app && make windows
```

## Learn More

The full user manual covers vaults, editing, canvas files, AI features, settings,
themes, plugins, shortcuts, and troubleshooting:

[Open the Glyphary documentation](https://glyphary.github.io/)
