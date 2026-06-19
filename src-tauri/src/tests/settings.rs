//! Settings and theme persistence regression tests.
//!
//! Responsibilities:
//! - Verify vault settings defaults, persistence, validation, and normalization.
//! - Lock theme token, callout, dotfile, autosave, and frontmatter-pill behavior.
//!
//! Contracts:
//! - Settings writes must validate and normalize vault-local configuration.
//! - Theme allowlists must reject unsupported tokens, styles, and icons.
use super::*;

#[test]
fn lists_directories_before_files() {
    let root = test_root();
    fs::create_dir(root.join("notes")).expect("directory should be created");
    fs::write(root.join("alpha.md"), "# Alpha\n").expect("file should be created");
    fs::create_dir_all(root.join(SETTINGS_DIRECTORY_NAME))
        .expect("settings directory should be created");
    fs::write(vault_settings_path(&root), "{}").expect("settings file should be created");

    let entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
        .expect("directory should list");

    assert_eq!(entries.len(), 2);
    assert!(entries[0].is_dir);
    assert_eq!(entries[0].relative_path, "notes");
    assert!(!entries[1].is_dir);
    assert_eq!(entries[1].relative_path, "alpha.md");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn lists_underscore_canvas_files() {
    let root = test_root();
    fs::write(root.join("_Veterinary Clinic Purchase.canvas"), "{}\n")
        .expect("canvas file should be created");

    let entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
        .expect("directory should list");

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].relative_path, "_Veterinary Clinic Purchase.canvas");
    assert!(!entries[0].is_dir);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn hides_dotfiles_unless_vault_settings_enable_them() {
    let root = test_root();
    fs::write(root.join("alpha.md"), "# Alpha\n").expect("file should be created");
    fs::write(root.join(".hidden.md"), "# Hidden\n").expect("hidden file should be created");

    let hidden_entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
        .expect("directory should list");

    assert_eq!(hidden_entries.len(), 1);
    assert_eq!(hidden_entries[0].relative_path, "alpha.md");

    write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            files: FileDisplaySettings {
                show_dotfiles: true,
            },
            ..VaultSettings::default()
        },
    )
    .expect("settings should write");

    let visible_entries = list_vault_dir(root.to_string_lossy().into_owned(), "".into())
        .expect("directory should list");
    let paths = visible_entries
        .into_iter()
        .map(|entry| entry.relative_path)
        .collect::<Vec<_>>();

    assert_eq!(paths, vec![".hidden.md", "alpha.md"]);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn reads_default_vault_settings_when_missing() {
    let root = test_root();

    let settings =
        read_vault_settings(root.to_string_lossy().into_owned()).expect("settings should default");

    assert_eq!(settings.asset_directory, DEFAULT_ASSET_DIRECTORY);
    assert!(settings.frontmatter_pills.enabled);
    assert_eq!(
        settings.frontmatter_pills.header_name,
        DEFAULT_FRONTMATTER_PILL_HEADER
    );
    assert!(!settings.files.show_dotfiles);
    assert!(settings.autosave.enabled);
    assert_eq!(settings.tidbits.path_pattern, DEFAULT_TIDBIT_PATH_PATTERN);
    assert!(!settings.editor.vim_mode);
    assert!(!settings.appearance.glass_effect);
    assert_eq!(settings.appearance.glass_opacity, DEFAULT_GLASS_OPACITY);
    assert!(settings.appearance.status_bar_visible);
    assert_eq!(settings.appearance.section_corners, "rounded");
    assert_eq!(settings.appearance.workspace_margin, "comfortable");
    assert_eq!(settings.appearance.ui_font_weight, "regular");
    assert!(!settings.debug.enabled);
    assert_eq!(
        settings.css_snippets.directory,
        DEFAULT_CSS_SNIPPET_DIRECTORY
    );
    assert!(settings.css_snippets.enabled.is_empty());
    assert!(settings.plugins.enabled.is_empty());
    assert!(!settings.ai.enabled);
    assert_eq!(settings.ai.base_url, DEFAULT_AI_BASE_URL);
    assert_eq!(settings.ai.model, DEFAULT_AI_MODEL);
    assert!(settings.ai.api_key.is_empty());
    assert_eq!(
        settings.canvas.node_border_width,
        DEFAULT_CANVAS_NODE_BORDER_WIDTH
    );
    assert_eq!(
        settings.canvas.edge_thickness,
        DEFAULT_CANVAS_EDGE_THICKNESS
    );
    assert_eq!(settings.canvas.edge_style, DEFAULT_CANVAS_EDGE_STYLE);
    assert!(settings.canvas.show_grid);
    assert!(settings.canvas.show_navigation_preview);
    assert!(!settings.canvas.snap_to_grid);
    assert!(settings.theme.is_none());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn writes_ai_settings_for_openai_compatible_backends() {
    let root = test_root();

    let settings = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            ai: AiSettings {
                enabled: true,
                base_url: " https://llm.example.com/v1/ ".into(),
                model: " local-model ".into(),
                api_key: " secret ".into(),
            },
            ..VaultSettings::default()
        },
    )
    .expect("AI settings should write");

    assert!(settings.ai.enabled);
    assert_eq!(settings.ai.base_url, "https://llm.example.com/v1");
    assert_eq!(settings.ai.model, "local-model");
    assert_eq!(settings.ai.api_key, "secret");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn writes_vault_settings_file() {
    let root = test_root();

    let settings = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            asset_directory: "media/images".into(),
            frontmatter_pills: FrontmatterPillSettings {
                enabled: false,
                header_name: "topics".into(),
            },
            files: FileDisplaySettings {
                show_dotfiles: true,
            },
            autosave: AutosaveSettings { enabled: false },
            tidbits: TidbitSettings {
                path_pattern: "Inbox/tidbit-{{date:YYYY-MM-DD-HH-mm-ss}}.md".into(),
                global_shortcut_enabled: true,
                global_shortcut: "CommandOrControl+Shift+Space".into(),
            },
            editor: EditorSettings { vim_mode: true },
            appearance: AppearanceSettings {
                glass_effect: true,
                glass_opacity: 0.42,
                status_bar_visible: false,
                section_corners: "square".into(),
                workspace_margin: "spacious".into(),
                ui_font_weight: "bold".into(),
            },
            debug: DebugSettings { enabled: true },
            css_snippets: CssSnippetSettings {
                directory: "themes/css".into(),
                enabled: vec!["quiet.css".into(), "quiet.css".into(), "wide.css".into()],
            },
            ..VaultSettings::default()
        },
    )
    .expect("settings should write");

    assert_eq!(settings.asset_directory, "media/images");
    assert!(!settings.frontmatter_pills.enabled);
    assert_eq!(settings.frontmatter_pills.header_name, "topics");
    assert!(settings.files.show_dotfiles);
    assert!(!settings.autosave.enabled);
    assert_eq!(
        settings.tidbits.path_pattern,
        "Inbox/tidbit-{{date:YYYY-MM-DD-HH-mm-ss}}.md"
    );
    assert!(settings.editor.vim_mode);
    assert!(settings.appearance.glass_effect);
    assert_eq!(settings.appearance.glass_opacity, 0.42);
    assert!(!settings.appearance.status_bar_visible);
    assert_eq!(settings.appearance.section_corners, "square");
    assert_eq!(settings.appearance.workspace_margin, "spacious");
    assert_eq!(settings.appearance.ui_font_weight, "bold");
    assert!(settings.debug.enabled);
    assert_eq!(settings.css_snippets.directory, "themes/css");
    assert_eq!(settings.css_snippets.enabled, vec!["quiet.css", "wide.css"]);
    assert!(root.join(SETTINGS_DIRECTORY_NAME).is_dir());
    assert!(fs::read_to_string(vault_settings_path(&root))
        .expect("settings should be readable")
        .contains("media/images"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn clamps_glass_opacity_settings() {
    let root = test_root();

    let settings = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            appearance: AppearanceSettings {
                glass_effect: true,
                glass_opacity: 10.0,
                section_corners: "weird".into(),
                workspace_margin: "huge".into(),
                ui_font_weight: "black".into(),
                ..AppearanceSettings::default()
            },
            ..VaultSettings::default()
        },
    )
    .expect("settings should write");

    assert_eq!(settings.appearance.glass_opacity, MAX_GLASS_OPACITY);
    assert_eq!(settings.appearance.section_corners, "rounded");
    assert_eq!(settings.appearance.workspace_margin, "comfortable");
    assert_eq!(settings.appearance.ui_font_weight, "regular");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn normalizes_canvas_settings() {
    let root = test_root();

    let settings = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            canvas: CanvasSettings {
                node_border_width: 20.0,
                edge_thickness: -1.0,
                edge_style: "zigzag".into(),
                show_grid: false,
                show_navigation_preview: false,
                snap_to_grid: true,
            },
            ..VaultSettings::default()
        },
    )
    .expect("settings should write");

    assert_eq!(
        settings.canvas.node_border_width,
        MAX_CANVAS_NODE_BORDER_WIDTH
    );
    assert_eq!(settings.canvas.edge_thickness, MIN_CANVAS_EDGE_THICKNESS);
    assert_eq!(settings.canvas.edge_style, DEFAULT_CANVAS_EDGE_STYLE);
    assert!(!settings.canvas.show_grid);
    assert!(!settings.canvas.show_navigation_preview);
    assert!(settings.canvas.snap_to_grid);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_invalid_vault_settings_asset_directories() {
    let root = test_root();

    let empty = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            asset_directory: " ".into(),
            ..VaultSettings::default()
        },
    )
    .expect_err("empty asset directory should fail");
    let escaped = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            asset_directory: "../assets".into(),
            ..VaultSettings::default()
        },
    )
    .expect_err("escaping asset directory should fail");

    assert!(empty.contains("cannot be empty"));
    assert!(escaped.contains("escapes the vault"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_invalid_frontmatter_pill_headers() {
    let root = test_root();

    let empty = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            frontmatter_pills: FrontmatterPillSettings {
                enabled: true,
                header_name: " ".into(),
            },
            ..VaultSettings::default()
        },
    )
    .expect_err("empty pill header should fail");
    let unsafe_name = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            frontmatter_pills: FrontmatterPillSettings {
                enabled: true,
                header_name: "tags: bad".into(),
            },
            ..VaultSettings::default()
        },
    )
    .expect_err("unsafe pill header should fail");

    assert!(empty.contains("cannot be empty"));
    assert!(unsafe_name.contains("unsupported characters"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn writes_vault_theme_tokens() {
    let root = test_root();
    let mut tokens = HashMap::new();
    tokens.insert("--glyphary-accent".into(), "#336699".into());
    tokens.insert("--glyphary-surface".into(), "  #ffffff  ".into());
    tokens.insert(
        "--glyphary-font-editor".into(),
        "\"Avenir Next\", ui-serif, Georgia, serif".into(),
    );
    tokens.insert("--glyphary-editor-max-width".into(), "72ch".into());

    let settings = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            theme: Some(VaultTheme {
                preset_id: Some("field-notes".into()),
                callouts: VaultThemeCallouts::default(),
                options: VaultThemeOptions {
                    colorful_headings: true,
                    heading_underlines: true,
                    heading_anchors: false,
                    rich_callouts: true,
                },
                tokens,
            }),
            ..VaultSettings::default()
        },
    )
    .expect("settings should write");
    let saved_theme = settings.theme.expect("theme should be retained");
    assert!(saved_theme.options.colorful_headings);
    assert!(saved_theme.options.heading_underlines);
    assert!(!saved_theme.options.heading_anchors);
    assert!(saved_theme.options.rich_callouts);
    let saved_tokens = saved_theme.tokens;

    assert_eq!(saved_theme.preset_id, Some("field-notes".to_string()));
    assert_eq!(
        saved_tokens.get("--glyphary-accent"),
        Some(&"#336699".to_string())
    );
    assert_eq!(
        saved_tokens.get("--glyphary-surface"),
        Some(&"#ffffff".to_string())
    );
    assert_eq!(
        saved_tokens.get("--glyphary-font-editor"),
        Some(&"\"Avenir Next\", ui-serif, Georgia, serif".to_string())
    );
    assert_eq!(
        saved_tokens.get("--glyphary-editor-max-width"),
        Some(&"72ch".to_string())
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_unsupported_vault_theme_tokens() {
    let root = test_root();
    let mut tokens = HashMap::new();
    tokens.insert("--not-a-token".into(), "#336699".into());

    let error = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            theme: Some(VaultTheme {
                preset_id: None,
                callouts: VaultThemeCallouts::default(),
                options: VaultThemeOptions::default(),
                tokens,
            }),
            ..VaultSettings::default()
        },
    )
    .expect_err("unsupported token should fail");

    assert!(error.contains("Unsupported theme token"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn writes_vault_theme_options_without_tokens() {
    let root = test_root();

    let settings = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            theme: Some(VaultTheme {
                preset_id: None,
                callouts: VaultThemeCallouts {
                    style: "card".into(),
                    icons: HashMap::from([
                        ("note".into(), "quote".into()),
                        ("tip".into(), "check".into()),
                    ]),
                },
                options: VaultThemeOptions {
                    colorful_headings: false,
                    heading_underlines: false,
                    heading_anchors: true,
                    rich_callouts: true,
                },
                tokens: HashMap::new(),
            }),
            ..VaultSettings::default()
        },
    )
    .expect("theme options should write without token overrides");
    let saved_theme = settings.theme.expect("theme options should be retained");

    assert!(saved_theme.tokens.is_empty());
    assert_eq!(saved_theme.callouts.style, "card");
    assert_eq!(
        saved_theme.callouts.icons.get("note"),
        Some(&"quote".to_string())
    );
    assert_eq!(
        saved_theme.callouts.icons.get("info"),
        Some(&"info".to_string())
    );
    assert_eq!(
        saved_theme.callouts.icons.get("tip"),
        Some(&"check".to_string())
    );
    assert!(saved_theme.options.heading_anchors);
    assert!(saved_theme.options.rich_callouts);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_unsupported_vault_callout_settings() {
    let root = test_root();

    let bad_style = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            theme: Some(VaultTheme {
                preset_id: None,
                callouts: VaultThemeCallouts {
                    style: "scripted".into(),
                    icons: HashMap::new(),
                },
                options: VaultThemeOptions::default(),
                tokens: HashMap::new(),
            }),
            ..VaultSettings::default()
        },
    )
    .expect_err("unsupported callout style should fail");

    assert!(bad_style.contains("Unsupported callout style"));

    let bad_icon = write_vault_settings(
        root.to_string_lossy().into_owned(),
        VaultSettings {
            theme: Some(VaultTheme {
                preset_id: None,
                callouts: VaultThemeCallouts {
                    style: "plain".into(),
                    icons: HashMap::from([("note".into(), "skull".into())]),
                },
                options: VaultThemeOptions::default(),
                tokens: HashMap::new(),
            }),
            ..VaultSettings::default()
        },
    )
    .expect_err("unsupported callout icon should fail");

    assert!(bad_icon.contains("Unsupported callout icon"));

    fs::remove_dir_all(root).expect("test root should be removed");
}
