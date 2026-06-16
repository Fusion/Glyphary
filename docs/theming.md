# Glyphary Theming Reference

Glyphary supports vault-specific CSS snippets from the configured snippets directory, which defaults to `_snippets_`. A snippet is loaded only after it is approved in Settings.

This document is the public styling contract for snippets and future theme work. Prefer the variables in this file before targeting app structure directly. Selectors listed here are intended to remain stable; unlisted app chrome classes are internal and may change without notice.

## Loading Snippets

1. Create a `.css` file in the vault snippets directory, usually:

   ```text
   <vault root>/_snippets_/my-theme.css
   ```

2. Open Settings, go to Appearance, and enable the snippet.
3. Snippets are injected into the running app after Glyphary's built-in styles, so normal CSS cascade rules apply.

Use `:root` for global variables:

```css
:root {
  --glyphary-accent: #6f7cff;
  --glyphary-heading: #f0f4ff;
  --glyphary-editor-max-width: 760px;
}
```

Use the resolved theme attributes when a snippet needs separate light and dark values:

```css
:root[data-resolved-theme="light"] {
  --glyphary-app-bg: #f7f4ed;
}

:root[data-resolved-theme="dark"] {
  --glyphary-app-bg: #101214;
}
```

## Stable Glyphary Variables

These variables are the safest customization points. They are also the variables used by the Theme Builder.

### Canvas

| Variable | Purpose |
| --- | --- |
| `--glyphary-app-bg` | Main app background. |
| `--glyphary-surface` | Primary panels, cards, and editor-adjacent surfaces. |
| `--glyphary-surface-muted` | Muted panels, previews, and secondary surfaces. |
| `--glyphary-hover` | Hover backgrounds. |
| `--glyphary-selection` | Selection and selected-node highlights. |

### Text

| Variable | Purpose |
| --- | --- |
| `--glyphary-text` | General interface text. |
| `--glyphary-text-soft` | Lower-emphasis body text. |
| `--glyphary-editor-text` | Main editor body text. |
| `--glyphary-heading` | Editor headings and strong titles. |
| `--glyphary-muted` | Muted labels and secondary metadata. |
| `--glyphary-muted-strong` | Stronger muted text. |
| `--glyphary-mono-text` | Inline monospace text outside code blocks. |

### Accent And Borders

| Variable | Purpose |
| --- | --- |
| `--glyphary-accent` | Primary accent color. |
| `--glyphary-accent-text` | Text shown on accent backgrounds. |
| `--glyphary-focus` | Focus rings and selected-node borders. |
| `--glyphary-border` | Default border color. |
| `--glyphary-border-soft` | Low-emphasis borders. |
| `--glyphary-border-strong` | Stronger borders and hover borders. |
| `--glyphary-table-border` | Table grid borders. |

### Blocks

| Variable | Purpose |
| --- | --- |
| `--glyphary-code-bg` | Code block background. |
| `--glyphary-code-text` | Code block text. |
| `--glyphary-quote-border` | Blockquote left border. |
| `--glyphary-quote-text` | Blockquote text. |

### Callouts

| Variable | Purpose |
| --- | --- |
| `--glyphary-callout-background` | Base callout background. |
| `--glyphary-callout-note-color` | Accent for `note` callouts. |
| `--glyphary-callout-info-color` | Accent for `info` callouts. |
| `--glyphary-callout-tip-color` | Accent for `tip` callouts. |
| `--glyphary-callout-warning-color` | Accent for `warning` callouts. |
| `--glyphary-callout-padding` | Callout internal spacing. |
| `--glyphary-callout-radius` | Callout corner radius. |
| `--glyphary-callout-border-width` | Base callout border width. |
| `--glyphary-callout-icon-size` | Rich callout icon size. |
| `--glyphary-callout-title-transform` | Callout title text transform. |

Glyphary also sets callout icon variables from Settings:

```css
--glyphary-callout-note-icon
--glyphary-callout-info-icon
--glyphary-callout-tip-icon
--glyphary-callout-warning-icon
```

These are CSS `content` values, so include quotes if you override them in a snippet:

```css
:root {
  --glyphary-callout-warning-icon: "!";
}
```

### Syntax

| Variable | Purpose |
| --- | --- |
| `--syntax-blue` | Blue syntax and heading accent. |
| `--syntax-green` | Green syntax and heading accent. |
| `--syntax-yellow` | Yellow syntax and warning accent. |
| `--syntax-red` | Red syntax and heading accent. |
| `--syntax-purple` | Purple syntax and heading accent. |
| `--syntax-orange` | Orange syntax and ambiguous link accent. |
| `--syntax-muted` | Muted syntax text. |

### Typography

| Variable | Purpose |
| --- | --- |
| `--glyphary-font-ui` | Interface font stack. |
| `--glyphary-font-editor` | Editor font stack. |
| `--glyphary-font-mono` | Code and monospace font stack. |
| `--glyphary-editor-font-size` | Main editor font size. |
| `--glyphary-editor-line-height` | Main editor line height. |
| `--glyphary-heading-h1-size` | H1 font size. |
| `--glyphary-heading-h2-size` | H2 font size. |
| `--glyphary-code-font-size` | Inline and block code font size. |

### Spacing And Shape

| Variable | Purpose |
| --- | --- |
| `--glyphary-editor-max-width` | Maximum width of editor content. Use `none` for full width. |
| `--glyphary-editor-padding-y` | Editor vertical padding. |
| `--glyphary-editor-padding-x` | Editor horizontal padding. |
| `--glyphary-block-gap` | Default vertical rhythm between top-level editor blocks. |
| `--glyphary-column-gap` | Gap between Markdown columns. |
| `--glyphary-radius-sm` | Small radius. |
| `--glyphary-radius-md` | Medium radius. |
| `--glyphary-radius-lg` | Large radius. |
| `--glyphary-border-width` | Default border width. |
| `--glyphary-code-tab-size` | Visual tab size in code blocks. |

### Motion

These are stable but are not currently exposed in the Theme Builder:

```css
--glyphary-motion-duration-fast
--glyphary-motion-duration-base
--glyphary-motion-duration-slow
--glyphary-motion-ease
```

## Obsidian Compatibility Variables

Glyphary maps its own tokens onto a first-pass Obsidian-style variable surface. These are useful when adapting small Obsidian snippets, but Glyphary does not emulate Obsidian's full DOM.

```css
--background-primary
--background-primary-alt
--background-secondary
--background-secondary-alt
--background-modifier-border
--background-modifier-border-hover
--background-modifier-hover
--background-modifier-active-hover
--blockquote-border-color
--blockquote-color
--code-background
--code-normal
--interactive-accent
--interactive-accent-hover
--interactive-normal
--interactive-hover
--shadow-s
--shadow-l
--table-border-color
--text-accent
--text-faint
--text-muted
--text-normal
--text-on-accent
--text-selection
--text-title-h1
--text-title-h2
```

## Supported Editor Selectors

Use these selectors when variables are not enough. Scope snippets under `.editor-surface` unless you explicitly intend to affect the whole app.

### Editor Body

```css
.editor-surface .ProseMirror
.editor-surface .ProseMirror > * + *
.editor-surface h1
.editor-surface h2
.editor-surface h3
.editor-surface h4
.editor-surface h5
.editor-surface h6
.editor-surface p
.editor-surface blockquote
.editor-surface ul
.editor-surface ol
```

### Wikilinks

```css
.editor-surface .wikilink
.editor-surface .wikilink-ambiguous
.editor-surface .wikilink-missing
```

### Tasks

```css
.editor-surface ul[data-type="taskList"]
.editor-surface li[data-type="taskItem"]
.editor-surface li[data-type="taskItem"] input[type="checkbox"]
```

### Tables

```css
.editor-surface .tableWrapper
.editor-surface table
.editor-surface th
.editor-surface td
.editor-surface .selectedCell
.editor-surface .column-resize-handle
```

### Code

```css
.editor-surface code
.editor-surface pre
.editor-surface .code-block-node
.editor-surface .code-block-node.active
.code-block-language-control
```

### Columns

```css
.editor-surface .markdown-columns
.editor-surface .markdown-column
```

### Callouts

```css
.editor-surface .markdown-callout
.editor-surface .markdown-callout-note
.editor-surface .markdown-callout-info
.editor-surface .markdown-callout-tip
.editor-surface .markdown-callout-warning
.editor-surface .markdown-callout-title
.editor-surface .markdown-callout-body
```

Glyphary also applies these app-level classes when callout or heading theme options are enabled:

```css
.app-shell.theme-colorful-headings
.app-shell.theme-heading-underlines
.app-shell.theme-heading-anchors
.app-shell.theme-rich-callouts
.app-shell.callout-style-card
.app-shell.callout-style-striped
.app-shell.callout-style-compact
.app-shell.callout-style-obsidian
```

### Collapsible Blocks

```css
.editor-surface .markdown-collapse
.editor-surface .markdown-collapse.open
.editor-surface .markdown-collapse.closed
.editor-surface .markdown-collapse-summary
.editor-surface .markdown-collapse-body
```

### Rich Links

```css
.editor-surface .rich-link-card
.editor-surface .rich-link-card-no-image
.editor-surface .rich-link-content
.editor-surface .rich-link-site
.editor-surface .rich-link-url
.editor-surface .rich-link-image
```

### Excalidraw Embeds

```css
.editor-surface .excalidraw-embed
.editor-surface .excalidraw-embed-preview
.editor-surface .excalidraw-embed-svg
.editor-surface .excalidraw-embed-empty
.editor-surface .excalidraw-embed figcaption
```

### Drawer Table Of Contents

The right drawer's table of contents can be styled with:

```css
.toc-list
.toc-entry
.toc-entry.level-1
.toc-entry.level-2
.toc-entry.level-3
```

## Examples

### Narrow Editorial Editor

```css
:root {
  --glyphary-editor-max-width: 740px;
  --glyphary-editor-padding-y: 48px;
  --glyphary-editor-line-height: 1.82;
}
```

### Softer Code Blocks

```css
:root {
  --glyphary-code-bg: #18202a;
  --glyphary-code-text: #eef4fb;
  --glyphary-code-font-size: 0.9em;
}

.editor-surface .code-block-node {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--glyphary-code-text) 10%, transparent);
}
```

### Callout Variants

```css
:root {
  --glyphary-callout-radius: 6px;
  --glyphary-callout-padding: 0.75rem 0.95rem;
  --glyphary-callout-title-transform: none;
  --glyphary-callout-info-color: #4aa3ff;
  --glyphary-callout-warning-color: #f2b84b;
}

.editor-surface .markdown-callout {
  background: color-mix(in srgb, var(--callout-accent) 8%, transparent);
}
```

### Minimal Columns

```css
:root {
  --glyphary-column-gap: 24px;
}

.editor-surface .markdown-column {
  border-color: transparent;
  padding: 0;
}
```

### Rich Link Cards

```css
.editor-surface .rich-link-card {
  border-radius: var(--glyphary-radius-md);
  background: var(--glyphary-surface-muted);
}

.editor-surface .rich-link-content strong {
  color: var(--glyphary-accent);
}
```

## Stability Rules

- Prefer `--glyphary-*` variables for durable theme work.
- Prefer listed `.editor-surface ...` selectors for snippets that need structural styling.
- Avoid styling toolbar, drawer, dialog, and settings classes unless a selector is documented here.
- Avoid depending on generated ProseMirror selection classes except `ProseMirror-selectednode`, which is useful for selected embedded blocks.
- If a snippet needs a selector that is not listed here, promote that selector into this document before treating it as public API.
