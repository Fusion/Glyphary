# Uppercase Selection Plugin

This is a minimal Glyphary WASM transform plugin. It adds one command palette action:

```text
Uppercase Selection
```

The command receives the current editor selection as UTF-8, uppercases ASCII letters inside the WASM module, and returns the replacement text through Glyphary's `replaceSelection` output mode.

## Try It

Copy this directory into a vault:

```sh
mkdir -p /path/to/vault/.glyphary/plugins
cp -R examples/plugins/uppercase_selection /path/to/vault/.glyphary/plugins/
```

Then in Glyphary:

1. Open that vault.
2. Open `Settings -> Main -> Plugins`.
3. Click `Refresh`.
4. Enable `Uppercase Selection`.
5. Save settings.
6. Select text in the editor.
7. Run `Uppercase Selection` from the command palette.

## Rebuild The WASM

The checked-in `plugin.wasm` is generated from `build-wasm.mjs`:

```sh
node examples/plugins/uppercase_selection/build-wasm.mjs
```

The script writes `plugin.wasm` in this directory. It does not require `wat2wasm`, Rust, Zig, or a WASM C compiler.
