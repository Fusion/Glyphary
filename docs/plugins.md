# Glyphary Plugin Authoring Guide

Glyphary plugins are vault-scoped packages that live under the vault's `.glyphary/plugins` directory. They can add command palette actions, load declared stylesheets, insert declared templates, and run short WASM text transforms.

The current plugin system is intentionally narrow. Plugins do not get shell access, direct DOM access, arbitrary filesystem access, background daemons, or network access. A plugin can only use files declared in its own manifest and can only operate through the command actions described here.

## Plugin Location

Each plugin has its own directory:

```text
<vault root>/.glyphary/plugins/<plugin id>/plugin.json
```

For example:

```text
.glyphary/plugins/meeting_tools/
  plugin.json
  styles.css
  templates/agenda.md
  plugin.wasm
```

The plugin directory name must match the manifest `id`.

## Enabling A Plugin

1. Copy the plugin directory into `<vault root>/.glyphary/plugins`.
2. Open the vault in Glyphary.
3. Open Settings.
4. Go to the Plugins tab.
5. Click Refresh if the plugin was added while Settings was already open.
6. Enable the plugin.
7. Save Settings.

Enabled plugin commands appear in the command palette.

## Manifest

Every plugin must have a `plugin.json` file.

```json
{
  "id": "meeting_tools",
  "name": "Meeting Tools",
  "runtime": "glyphary-wasm-transform@1",
  "version": "0.1.0",
  "description": "Commands and styles for meeting notes.",
  "permissions": ["document:write", "styles:load"],
  "styles": ["styles.css"],
  "commands": [
    {
      "id": "insert_agenda",
      "title": "Insert Agenda",
      "description": "Insert a meeting agenda template.",
      "template": "templates/agenda.md"
    },
    {
      "id": "insert_decision_callout",
      "title": "Insert Decision Callout",
      "insertMarkdown": "::: callout note \"Decision\"\\nDecision:\\n\\nOwner:\\n:::\\n"
    },
    {
      "id": "uppercase_selection",
      "title": "Uppercase Selection",
      "description": "Uppercase the current selection in a Web Worker.",
      "wasm": {
        "module": "plugin.wasm",
        "input": "selection",
        "output": "replaceSelection",
        "timeoutMs": 200
      }
    }
  ]
}
```

### Top-Level Fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Plugin id. Must match the directory name. |
| `name` | Yes | Display name shown in Settings. |
| `runtime` | Yes | Runtime identifier. Currently only `glyphary-wasm-transform@1` is supported. |
| `version` | No | Plugin version string. Stored as display metadata. |
| `description` | No | Short description shown in Settings. |
| `permissions` | No | Declared permissions. Unsupported values make the plugin invalid. |
| `styles` | No | Declared CSS files to load when the plugin is enabled. |
| `commands` | No | Command palette actions contributed by the plugin. |

### Id Rules

Plugin ids and command ids must:

- Use only ASCII letters, ASCII numbers, dash, or underscore.
- Be 1-80 characters.
- Avoid spaces and path separators.

Valid examples:

```text
meeting_tools
daily-notes
uppercase_selection
```

Invalid examples:

```text
Meeting Tools
../plugin
notes.plugin
```

### Runtime

The current runtime is:

```text
glyphary-wasm-transform@1
```

This identifies Glyphary's raw WASM transform ABI. It is not WASI, and it is not Extism. Runtime versioning is separate from the plugin's own `version`; future runtimes should use different runtime identifiers so Glyphary can reject unsupported plugins cleanly.

### Permissions

Supported permissions are:

```text
document:read
document:write
selection:read
selection:write
styles:load
```

Permissions are currently declarative and validation-oriented. They communicate intent and prevent unknown capabilities from being silently accepted.

### Declared File Paths

Manifest file paths must be relative to the plugin directory. Paths are normalized and must not escape the plugin directory.

Supported extensions:

| Field | Extensions |
| --- | --- |
| `styles` | `.css` |
| `template` | `.md`, `.markdown`, `.txt` |
| `wasm.module` | `.wasm` |

Examples:

```json
{
  "styles": ["styles.css"],
  "commands": [
    {
      "id": "insert_template",
      "title": "Insert Template",
      "template": "templates/note.md"
    }
  ]
}
```

## Command Actions

Each command must have an `id`, a `title`, and at least one action.

Supported actions:

| Action | Description |
| --- | --- |
| `insertMarkdown` | Inserts literal Markdown at the current cursor or selection. |
| `template` | Reads a declared template file and inserts it at the current cursor or selection. |
| `wasm` | Runs a pure WASM transform in a Web Worker. |

`title` must be 1-96 characters. `description` is optional and is truncated to 180 characters.

### Insert Literal Markdown

```json
{
  "id": "insert_status_callout",
  "title": "Insert Status Callout",
  "insertMarkdown": "::: callout info \"Status\"\\n\\n:::\\n"
}
```

Use this for small snippets that do not need separate files.

### Insert A Template

```json
{
  "id": "insert_retro",
  "title": "Insert Retro Template",
  "template": "templates/retro.md"
}
```

The template file is read through the backend and must be declared in the manifest. Use this when Markdown is long enough that keeping it in JSON would be hard to maintain.

### Run A WASM Transform

```json
{
  "id": "uppercase_selection",
  "title": "Uppercase Selection",
  "wasm": {
    "module": "plugin.wasm",
    "input": "selection",
    "output": "replaceSelection",
    "timeoutMs": 200
  }
}
```

WASM commands run off the UI thread in a Web Worker. Each command run gets a fresh worker and WASM instance. This keeps plugin memory isolated and lets Glyphary terminate stuck transforms.

Supported `input` values:

| Value | Meaning |
| --- | --- |
| `selection` | Pass the current editor selection to the plugin. |
| `document` | Pass the current document Markdown to the plugin. |

Supported `output` values:

| Value | Meaning |
| --- | --- |
| `replaceSelection` | Replace the current selection with the plugin output. |
| `insertAtCursor` | Insert the plugin output at the current cursor. |
| `replaceDocument` | Replace the current document with the plugin output. |

`timeoutMs` is clamped between `50` and `2000` milliseconds.

## WASM Transform ABI

Runtime `glyphary-wasm-transform@1` loads a raw WebAssembly module with no imports:

```ts
WebAssembly.instantiate(bytes, {})
```

The module must export:

```text
memory
alloc(length) -> pointer
transform(pointer, length) -> outputPointer
```

It may also export:

```text
dealloc(pointer, length)
```

Input:

- Glyphary encodes the selected input as UTF-8.
- Glyphary calls `alloc(inputLength)`.
- Glyphary copies the UTF-8 bytes into exported `memory` at the returned pointer.
- Glyphary calls `transform(inputPointer, inputLength)`.

Output:

- `transform` returns a pointer into exported `memory`.
- That pointer must point to a little-endian `u32` output byte length.
- The UTF-8 output bytes must start immediately after that 4-byte length.

Memory layout:

```text
outputPointer
  +0  u32 little-endian output byte length
  +4  UTF-8 output bytes
```

After decoding the output, Glyphary calls `dealloc` for the input and output buffers if the export exists.

## Rust Example

The sample Rust plugin lives at:

```text
examples/plugins/uppercase_selection_rust
```

Build it:

```sh
rustup target add wasm32-unknown-unknown
cargo build --manifest-path examples/plugins/uppercase_selection_rust/Cargo.toml \
  --release \
  --target wasm32-unknown-unknown
cp examples/plugins/uppercase_selection_rust/target/wasm32-unknown-unknown/release/glyphary_uppercase_selection_plugin.wasm \
  examples/plugins/uppercase_selection_rust/plugin.wasm
```

Install it into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/uppercase_selection_rust /path/to/vault/.glyphary/plugins/
```

The Rust sample does not use `wasm-bindgen` or JavaScript glue. It exports the raw ABI directly and uses a small bump allocator.

## Generated WASM Example

The dependency-free generated sample lives at:

```text
examples/plugins/uppercase_selection
```

Rebuild it:

```sh
node examples/plugins/uppercase_selection/build-wasm.mjs
```

Install it into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/uppercase_selection /path/to/vault/.glyphary/plugins/
```

This sample is useful for validating the end-to-end ABI without installing a WASM language toolchain.

## Plugin Styles

Plugins can declare stylesheets:

```json
{
  "permissions": ["styles:load"],
  "styles": ["styles.css"]
}
```

Glyphary loads declared styles only when the plugin is enabled. Styles are injected after built-in styles. Plugin styles should follow the same public styling contract as CSS snippets; see [the theming reference](theming.md).

Glyphary marks injected plugin styles with metadata:

```html
<style data-glyphary-plugin="plugin_id" data-glyphary-plugin-style="styles.css">
```

That marker is for inspection and debugging. Do not rely on it as the primary way to style editor content.

## Validation Limits

Current limits:

- Plugin manifest must be named `plugin.json`.
- Manifest id must match the plugin directory name.
- Plugin id and command ids must be 1-80 characters.
- Plugin name must be 1-96 characters.
- Plugin description is truncated to 240 characters.
- Command descriptions are truncated to 180 characters.
- Plugin version is truncated to 40 characters.
- A plugin may declare at most 8 stylesheets.
- Glyphary reads at most 32 commands from a manifest.
- Manifest file paths must be 1-180 characters after normalization.
- Unknown runtimes, permissions, input modes, output modes, and file extensions make the plugin invalid.

Invalid plugins are shown as catalog errors in Settings. They are not enabled and do not contribute commands.

## Security Model

The current system is designed for small, fast, local transforms:

- Plugins are installed per vault.
- Plugins are disabled until approved in Settings.
- Plugin files are restricted to their own plugin directory.
- Plugin styles and assets must be declared in the manifest.
- WASM runs in a Web Worker with no imports.
- WASM commands receive only the selected input mode.
- WASM commands have bounded timeouts.

This keeps the plugin surface predictable. If future plugins need richer capabilities such as network access, vault indexing, or filesystem writes, those should be added as new runtime versions or explicit host capabilities rather than smuggled into the current transform ABI.

## Practical Recommendations

- Use `insertMarkdown` for tiny fixed snippets.
- Use `template` for larger Markdown insertions.
- Use WASM only for deterministic text transforms.
- Keep WASM transforms small and fast.
- Prefer `selection` input and `replaceSelection` output unless a command truly needs the whole document.
- Keep plugin styles scoped to documented editor selectors.
- Include a short README in each plugin directory so users know what commands are added and what permissions mean.
