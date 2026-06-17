//! Vault plugin discovery and asset loading.
//!
//! Responsibilities:
//! - Validate plugin ids, manifests, permissions, command declarations, and
//!   plugin-local asset paths.
//! - Return a catalog with per-plugin errors instead of failing the entire
//!   plugin list.
//! - Serve only manifest-declared templates, stylesheets, and WASM modules.
//!
//! Contracts:
//! - The runtime version is explicit and currently limited to the Glyphary WASM
//!   transform ABI.
//! - Plugin files are sandboxed to `.glyphary/plugins/<plugin-id>/`, not merely
//!   to the vault root.
//! - Backend loading is declarative. Execution still happens in the frontend
//!   worker so Rust never runs plugin code directly.
use super::*;

pub(crate) fn clean_plugin_settings(settings: PluginSettings) -> Result<PluginSettings, String> {
    let mut enabled = Vec::new();

    for id in settings.enabled {
        let id = clean_plugin_id(&id)?;

        if !enabled.contains(&id) {
            enabled.push(id);
        }
    }

    enabled.sort();

    Ok(PluginSettings { enabled })
}
pub(crate) fn clean_plugin_id(id: &str) -> Result<String, String> {
    let id = id.trim();

    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Plugin id must use only letters, numbers, dash, or underscore".into());
    }

    Ok(id.into())
}
pub(crate) fn clean_plugin_file_path(
    path: &str,
    allowed_extensions: &[&str],
) -> Result<String, String> {
    let path = path.trim();
    let clean = clean_relative(path)?;
    // Manifest paths are persisted and compared as forward-slash strings so
    // declared assets match the frontend command payloads across platforms.
    let normalized = clean
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");

    if normalized.is_empty() || normalized.len() > 180 {
        return Err("Plugin file path is invalid".into());
    }

    let extension = Path::new(&normalized)
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if !allowed_extensions.contains(&extension.as_str()) {
        return Err(format!(
            "Plugin file has unsupported extension: {normalized}"
        ));
    }

    Ok(normalized)
}
pub(crate) fn clean_plugin_permission(permission: &str) -> Result<String, String> {
    let permission = permission.trim();

    if !matches!(
        permission,
        "document:read" | "document:write" | "selection:read" | "selection:write" | "styles:load"
    ) {
        return Err(format!("Unsupported plugin permission: {permission}"));
    }

    Ok(permission.into())
}
pub(crate) fn clean_plugin_command(
    command: PluginCommandManifest,
) -> Result<PluginCommandManifest, String> {
    let id = clean_plugin_id(&command.id)?;
    let title = command.title.trim().to_string();

    if title.is_empty() || title.len() > 96 {
        return Err("Plugin command title must be 1-96 characters".into());
    }

    let description = command
        .description
        .trim()
        .chars()
        .take(180)
        .collect::<String>();
    let insert_markdown = command
        .insert_markdown
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let template = command
        .template
        .map(|path| clean_plugin_file_path(&path, &["md", "markdown", "txt"]))
        .transpose()?;
    let wasm = command.wasm.map(clean_plugin_wasm_command).transpose()?;

    if insert_markdown.is_none() && template.is_none() && wasm.is_none() {
        return Err(format!("Plugin command has no action: {id}"));
    }

    Ok(PluginCommandManifest {
        id,
        title,
        description,
        insert_markdown,
        template,
        wasm,
    })
}
pub(crate) fn clean_plugin_wasm_command(
    command: PluginWasmCommand,
) -> Result<PluginWasmCommand, String> {
    let module = clean_plugin_file_path(&command.module, &["wasm"])?;
    let input = command.input.trim();
    let output = command.output.trim();

    if !matches!(input, "selection" | "document") {
        return Err(format!("Unsupported WASM input mode: {input}"));
    }

    if !matches!(
        output,
        "replaceSelection" | "insertAtCursor" | "replaceDocument"
    ) {
        return Err(format!("Unsupported WASM output mode: {output}"));
    }

    Ok(PluginWasmCommand {
        module,
        input: input.into(),
        output: output.into(),
        // Keep author-specified timeouts bounded so plugins cannot become
        // accidental long-running editor operations.
        timeout_ms: command.timeout_ms.clamp(50, 2_000),
    })
}
pub(crate) fn clean_plugin_manifest(
    manifest: PluginManifest,
    expected_id: &str,
) -> Result<PluginManifest, String> {
    let id = clean_plugin_id(&manifest.id)?;

    if id != expected_id {
        return Err(format!(
            "Plugin manifest id {id} does not match directory {expected_id}"
        ));
    }

    let name = manifest.name.trim().to_string();

    if name.is_empty() || name.len() > 96 {
        return Err("Plugin name must be 1-96 characters".into());
    }

    let runtime = manifest.runtime.trim();

    if runtime.is_empty() {
        return Err(format!(
            "Plugin manifest must declare runtime: {PLUGIN_RUNTIME_WASM_TRANSFORM_V1}"
        ));
    }

    // Rejecting unknown runtimes at discovery time makes unsupported plugins
    // visible in Settings while keeping them out of the executable command set.
    if runtime != PLUGIN_RUNTIME_WASM_TRANSFORM_V1 {
        return Err(format!("Unsupported plugin runtime: {runtime}"));
    }

    let version = manifest.version.trim().chars().take(40).collect::<String>();
    let description = manifest
        .description
        .trim()
        .chars()
        .take(240)
        .collect::<String>();
    let mut permissions = Vec::new();

    for permission in manifest.permissions {
        let permission = clean_plugin_permission(&permission)?;

        if !permissions.contains(&permission) {
            permissions.push(permission);
        }
    }

    let mut styles = Vec::new();

    for style in manifest.styles {
        let style = clean_plugin_file_path(&style, &["css"])?;

        if !styles.contains(&style) {
            styles.push(style);
        }
    }

    if styles.len() > 8 {
        return Err("Plugins may declare at most 8 stylesheets".into());
    }

    let commands = manifest
        .commands
        .into_iter()
        .take(32)
        .map(clean_plugin_command)
        .collect::<Result<Vec<_>, String>>()?;

    Ok(PluginManifest {
        id,
        name,
        runtime: runtime.into(),
        version,
        description,
        permissions,
        commands,
        styles,
    })
}
pub(crate) fn plugin_directory(root: &Path, plugin_id: &str) -> Result<PathBuf, String> {
    let plugin_id = clean_plugin_id(plugin_id)?;
    let path = root.join(PLUGIN_DIRECTORY).join(plugin_id);

    if !path.starts_with(root) {
        return Err("Plugin path escapes the vault".into());
    }

    Ok(path)
}
pub(crate) fn plugin_file_path(
    root: &Path,
    plugin_id: &str,
    relative: &str,
) -> Result<PathBuf, String> {
    let base = plugin_directory(root, plugin_id)?;
    let relative = clean_relative(relative)?;
    let path = base.join(relative);

    // Plugins may reference only files inside their own directory. This is a
    // second check after `clean_relative` because the plugin directory is a
    // narrower sandbox than the vault root.
    if !path.starts_with(&base) || !path.starts_with(root) {
        return Err("Plugin file path escapes the plugin directory".into());
    }

    Ok(path)
}
pub(crate) fn read_plugin_manifest_from_dir(
    plugin_dir: &Path,
    expected_id: &str,
) -> Result<PluginManifest, String> {
    let manifest_path = plugin_dir.join(PLUGIN_MANIFEST_FILE);

    if !manifest_path.is_file() {
        return Err(format!(
            "Plugin {expected_id} is missing {PLUGIN_MANIFEST_FILE}"
        ));
    }

    let metadata = manifest_path
        .metadata()
        .map_err(|err| format!("Could not read plugin manifest metadata: {err}"))?;

    if metadata.len() > 100_000 {
        return Err(format!("Plugin manifest is too large: {expected_id}"));
    }

    let content = fs::read_to_string(&manifest_path)
        .map_err(|err| format!("Could not read plugin manifest {expected_id}: {err}"))?;
    let manifest = serde_json::from_str::<PluginManifest>(&content)
        .map_err(|err| format!("Could not parse plugin manifest {expected_id}: {err}"))?;

    clean_plugin_manifest(manifest, expected_id)
}
#[tauri::command]
pub(crate) fn list_vault_plugins(root: String) -> Result<PluginCatalog, String> {
    let root = vault_root(&root)?;
    let plugins_dir = root.join(PLUGIN_DIRECTORY);

    if !plugins_dir.exists() {
        return Ok(PluginCatalog {
            plugins: Vec::new(),
            errors: Vec::new(),
        });
    }

    if !plugins_dir.is_dir() {
        return Err("Plugin path is not a directory".into());
    }

    let mut plugins = Vec::new();
    let mut errors = Vec::new();

    // A malformed plugin should not hide every other plugin in the vault. The
    // catalog carries per-plugin errors so Settings can show what was rejected.
    for entry in fs::read_dir(&plugins_dir)
        .map_err(|err| format!("Could not read plugin directory: {err}"))?
    {
        let entry = entry.map_err(|err| format!("Could not read plugin entry: {err}"))?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let Some(id) = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };

        match clean_plugin_id(&id).and_then(|id| read_plugin_manifest_from_dir(&path, &id)) {
            Ok(manifest) => plugins.push(manifest),
            Err(error) => errors.push(format!("{id}: {error}")),
        }
    }

    plugins.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    errors.sort();

    Ok(PluginCatalog { plugins, errors })
}
#[tauri::command]
pub(crate) fn read_plugin_styles(
    root: String,
    enabled: Vec<String>,
) -> Result<Vec<PluginStyleContent>, String> {
    let root = vault_root(&root)?;
    let mut styles = Vec::new();

    for plugin_id in enabled {
        let plugin_id = clean_plugin_id(&plugin_id)?;
        let plugin_dir = plugin_directory(&root, &plugin_id)?;

        if !plugin_dir.exists() {
            continue;
        }

        // Enabled plugin ids are persisted settings; reread the manifest before
        // loading styles so deleted or edited plugins cannot bypass validation.
        let manifest = read_plugin_manifest_from_dir(&plugin_dir, &plugin_id)?;

        for style in manifest.styles {
            let path = plugin_file_path(&root, &plugin_id, &style)?;

            if !path.exists() {
                continue;
            }

            if !path.is_file() {
                return Err(format!("Plugin style is not a file: {plugin_id}/{style}"));
            }

            let content = fs::read_to_string(&path)
                .map_err(|err| format!("Could not read plugin style {plugin_id}/{style}: {err}"))?;

            if content.len() > 200_000 {
                return Err(format!("Plugin style is too large: {plugin_id}/{style}"));
            }

            styles.push(PluginStyleContent {
                plugin_id: plugin_id.clone(),
                name: style,
                content,
            });
        }
    }

    Ok(styles)
}
#[tauri::command]
pub(crate) fn read_plugin_template(
    root: String,
    plugin_id: String,
    template: String,
) -> Result<String, String> {
    let root = vault_root(&root)?;
    let plugin_id = clean_plugin_id(&plugin_id)?;
    let template = clean_plugin_file_path(&template, &["md", "markdown", "txt"])?;
    let plugin_dir = plugin_directory(&root, &plugin_id)?;
    let manifest = read_plugin_manifest_from_dir(&plugin_dir, &plugin_id)?;
    let declared = manifest
        .commands
        .iter()
        .any(|command| command.template.as_deref() == Some(template.as_str()));

    // Command payloads can be influenced by the frontend, so the backend only
    // serves assets that the manifest explicitly declared.
    if !declared {
        return Err(format!(
            "Plugin template is not declared: {plugin_id}/{template}"
        ));
    }

    let path = plugin_file_path(&root, &plugin_id, &template)?;

    if !path.is_file() {
        return Err(format!(
            "Plugin template is not a file: {plugin_id}/{template}"
        ));
    }

    let content = fs::read_to_string(&path)
        .map_err(|err| format!("Could not read plugin template {plugin_id}/{template}: {err}"))?;

    if content.len() > 500_000 {
        return Err(format!(
            "Plugin template is too large: {plugin_id}/{template}"
        ));
    }

    Ok(content)
}
#[tauri::command]
pub(crate) fn read_plugin_wasm(
    root: String,
    plugin_id: String,
    module: String,
) -> Result<Vec<u8>, String> {
    let root = vault_root(&root)?;
    let plugin_id = clean_plugin_id(&plugin_id)?;
    let module = clean_plugin_file_path(&module, &["wasm"])?;
    let plugin_dir = plugin_directory(&root, &plugin_id)?;
    let manifest = read_plugin_manifest_from_dir(&plugin_dir, &plugin_id)?;
    let declared = manifest.commands.iter().any(|command| {
        command.wasm.as_ref().map(|wasm| wasm.module.as_str()) == Some(module.as_str())
    });

    // Treat the manifest as the capability list: an arbitrary .wasm file in the
    // plugin directory is not executable unless a command references it.
    if !declared {
        return Err(format!(
            "Plugin WASM module is not declared: {plugin_id}/{module}"
        ));
    }

    let path = plugin_file_path(&root, &plugin_id, &module)?;

    if !path.is_file() {
        return Err(format!(
            "Plugin WASM module is not a file: {plugin_id}/{module}"
        ));
    }

    let bytes = fs::read(&path)
        .map_err(|err| format!("Could not read plugin WASM module {plugin_id}/{module}: {err}"))?;

    if bytes.len() > 5 * 1024 * 1024 {
        return Err(format!(
            "Plugin WASM module is too large: {plugin_id}/{module}"
        ));
    }

    Ok(bytes)
}
