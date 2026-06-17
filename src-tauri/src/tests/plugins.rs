//! Plugin manifest and asset-loading regression tests.
//!
//! Responsibilities:
//! - Verify plugin discovery, manifest validation, and declared asset reads.
//! - Lock user-facing errors for unsupported runtimes and unsafe manifests.
//!
//! Contracts:
//! - Plugin assets must stay manifest-declared and plugin-directory scoped.
//! - Invalid plugins should report catalog errors without hiding valid plugins.
use super::*;

#[test]
fn lists_plugins_and_reads_only_declared_plugin_assets() {
    let root = test_root();
    let plugin_dir = root.join(PLUGIN_DIRECTORY).join("meeting_tools");
    fs::create_dir_all(plugin_dir.join("templates")).expect("plugin directory should exist");
    fs::write(
        plugin_dir.join(PLUGIN_MANIFEST_FILE),
        r#"{
  "id": "meeting_tools",
  "name": "Meeting Tools",
  "runtime": "glyphary-wasm-transform@1",
  "version": "0.1.0",
  "permissions": ["document:write", "styles:load"],
  "styles": ["styles.css"],
  "commands": [
{
  "id": "insert_agenda",
  "title": "Insert Agenda",
  "template": "templates/agenda.md"
},
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
  ]
}"#,
    )
    .expect("manifest should be written");
    fs::write(
        plugin_dir.join("styles.css"),
        ".plugin-meeting { color: red; }\n",
    )
    .expect("style should be written");
    fs::write(
        plugin_dir.join("templates").join("agenda.md"),
        "## Agenda\n\n- ",
    )
    .expect("template should be written");
    fs::write(plugin_dir.join("plugin.wasm"), [0_u8, 97, 115, 109])
        .expect("wasm should be written");

    let catalog =
        list_vault_plugins(root.to_string_lossy().into_owned()).expect("plugins should list");

    assert!(catalog.errors.is_empty());
    assert_eq!(catalog.plugins.len(), 1);
    assert_eq!(catalog.plugins[0].id, "meeting_tools");
    assert_eq!(catalog.plugins[0].commands.len(), 2);
    assert_eq!(catalog.plugins[0].styles, vec!["styles.css"]);

    let styles = read_plugin_styles(
        root.to_string_lossy().into_owned(),
        vec!["meeting_tools".into()],
    )
    .expect("declared styles should read");

    assert_eq!(styles.len(), 1);
    assert_eq!(styles[0].plugin_id, "meeting_tools");
    assert!(styles[0].content.contains("plugin-meeting"));

    let template = read_plugin_template(
        root.to_string_lossy().into_owned(),
        "meeting_tools".into(),
        "templates/agenda.md".into(),
    )
    .expect("declared template should read");

    assert!(template.contains("Agenda"));

    let wasm = read_plugin_wasm(
        root.to_string_lossy().into_owned(),
        "meeting_tools".into(),
        "plugin.wasm".into(),
    )
    .expect("declared wasm should read");

    assert_eq!(wasm, vec![0_u8, 97, 115, 109]);

    let undeclared_template = read_plugin_template(
        root.to_string_lossy().into_owned(),
        "meeting_tools".into(),
        "templates/other.md".into(),
    )
    .expect_err("undeclared template should fail");

    assert!(undeclared_template.contains("not declared"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_plugin_path_escapes_and_unsupported_permissions() {
    let root = test_root();
    let plugin_dir = root.join(PLUGIN_DIRECTORY).join("bad_plugin");
    fs::create_dir_all(&plugin_dir).expect("plugin directory should exist");
    fs::write(
        plugin_dir.join(PLUGIN_MANIFEST_FILE),
        r#"{
  "id": "bad_plugin",
  "name": "Bad Plugin",
  "runtime": "glyphary-wasm-transform@1",
  "permissions": ["network:fetch"],
  "commands": [
{
  "id": "bad",
  "title": "Bad",
  "template": "../secret.md"
}
  ]
}"#,
    )
    .expect("manifest should be written");

    let catalog =
        list_vault_plugins(root.to_string_lossy().into_owned()).expect("plugins should list");

    assert!(catalog.plugins.is_empty());
    assert_eq!(catalog.errors.len(), 1);
    assert!(catalog.errors[0].contains("Unsupported plugin permission"));

    let escaped = read_plugin_template(
        root.to_string_lossy().into_owned(),
        "../bad_plugin".into(),
        "secret.md".into(),
    )
    .expect_err("escaped plugin id should fail");

    assert!(escaped.contains("Plugin id"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_unsupported_plugin_runtime() {
    let root = test_root();
    let plugin_dir = root.join(PLUGIN_DIRECTORY).join("future_plugin");
    fs::create_dir_all(&plugin_dir).expect("plugin directory should exist");
    fs::write(
        plugin_dir.join(PLUGIN_MANIFEST_FILE),
        r#"{
  "id": "future_plugin",
  "name": "Future Plugin",
  "runtime": "glyphary-extism@1",
  "commands": [
{
  "id": "future",
  "title": "Future",
  "insertMarkdown": "future"
}
  ]
}"#,
    )
    .expect("manifest should be written");

    let catalog =
        list_vault_plugins(root.to_string_lossy().into_owned()).expect("plugins should list");

    assert!(catalog.plugins.is_empty());
    assert_eq!(catalog.errors.len(), 1);
    assert!(catalog.errors[0].contains("Unsupported plugin runtime"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_missing_plugin_runtime_with_actionable_error() {
    let root = test_root();
    let plugin_dir = root.join(PLUGIN_DIRECTORY).join("legacy_plugin");
    fs::create_dir_all(&plugin_dir).expect("plugin directory should exist");
    fs::write(
        plugin_dir.join(PLUGIN_MANIFEST_FILE),
        r#"{
  "id": "legacy_plugin",
  "name": "Legacy Plugin",
  "commands": [
{
  "id": "legacy",
  "title": "Legacy",
  "insertMarkdown": "legacy"
}
  ]
}"#,
    )
    .expect("manifest should be written");

    let catalog =
        list_vault_plugins(root.to_string_lossy().into_owned()).expect("plugins should list");

    assert!(catalog.plugins.is_empty());
    assert_eq!(catalog.errors.len(), 1);
    assert!(catalog.errors[0]
        .contains("Plugin manifest must declare runtime: glyphary-wasm-transform@1"));

    fs::remove_dir_all(root).expect("test root should be removed");
}
