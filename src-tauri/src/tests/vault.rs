//! Vault file and folder regression tests.
//!
//! Responsibilities:
//! - Verify file/folder reads, writes, creation, renames, moves, deletes, and indexing.
//! - Lock special behaviors such as shadow notes, Excalidraw files, and path escapes.
//!
//! Contracts:
//! - Filesystem commands must stay vault-relative.
//! - Folder operations must preserve special note behaviors and reject unsafe moves.
use super::*;

#[test]
fn reads_and_writes_files_inside_vault() {
    let root = test_root();
    fs::write(root.join("note.md"), "# Old\n").expect("file should be created");

    let opened = read_vault_file(root.to_string_lossy().into_owned(), "note.md".into())
        .expect("file should be readable");
    assert_eq!(opened.content, "# Old\n");

    write_vault_file(
        root.to_string_lossy().into_owned(),
        "note.md".into(),
        "# New\n".into(),
    )
    .expect("file should be writable");

    let opened = read_vault_file(root.to_string_lossy().into_owned(), "note.md".into())
        .expect("file should be readable");
    assert_eq!(opened.content, "# New\n");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn creates_directory_shadow_file() {
    let root = test_root();
    fs::create_dir(root.join("chapter")).expect("directory should be created");

    let opened = open_directory_shadow_file(root.to_string_lossy().into_owned(), "chapter".into())
        .expect("shadow file should open");

    assert_eq!(opened.name, "chapter.md");
    assert_eq!(opened.relative_path, "chapter/chapter.md");
    assert_eq!(opened.content, "# chapter\n");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn creates_note_inside_directory() {
    let root = test_root();
    fs::create_dir(root.join("chapter")).expect("directory should be created");

    let opened = create_note_in_directory(
        root.to_string_lossy().into_owned(),
        "chapter".into(),
        "Scene One".into(),
    )
    .expect("note should be created");

    assert_eq!(opened.name, "Scene One.md");
    assert_eq!(opened.relative_path, "chapter/Scene One.md");
    assert!(root.join("chapter").join("Scene One.md").exists());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn creates_nested_vault_markdown_file() {
    let root = test_root();

    let opened = create_vault_markdown_file(
        root.to_string_lossy().into_owned(),
        "__transit__/Objects/tidbit-2026-06-15-09-04-07.md".into(),
    )
    .expect("tidbit should be created");

    assert_eq!(opened.name, "tidbit-2026-06-15-09-04-07.md");
    assert_eq!(
        opened.relative_path,
        "__transit__/Objects/tidbit-2026-06-15-09-04-07.md"
    );
    assert_eq!(opened.content, "");
    assert!(root
        .join("__transit__")
        .join("Objects")
        .join("tidbit-2026-06-15-09-04-07.md")
        .is_file());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn creates_excalidraw_files_inside_vault() {
    let root = test_root();

    let opened = create_excalidraw_file(
        root.to_string_lossy().into_owned(),
        "_assets_/drawings/System.excalidraw".into(),
        r#"{"type":"excalidraw","elements":[],"appState":{},"files":{}}"#.into(),
    )
    .expect("drawing file should be created");

    assert_eq!(opened.name, "System.excalidraw");
    assert_eq!(opened.relative_path, "_assets_/drawings/System.excalidraw");
    assert!(opened.content.contains(r#""type":"excalidraw""#));

    let error = create_excalidraw_file(
        root.to_string_lossy().into_owned(),
        "_assets_/drawings/System.md".into(),
        String::new(),
    )
    .expect_err("drawing files require the excalidraw extension");

    assert!(error.contains("must end with .excalidraw"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn creates_folder_inside_directory() {
    let root = test_root();
    fs::create_dir(root.join("chapter")).expect("directory should be created");

    let created = create_directory_in_directory(
        root.to_string_lossy().into_owned(),
        "chapter".into(),
        "Scenes".into(),
    )
    .expect("folder should be created");

    assert_eq!(created.name, "Scenes");
    assert_eq!(created.relative_path, "chapter/Scenes");
    assert!(root.join("chapter").join("Scenes").is_dir());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn renames_directory_and_shadow_note() {
    let root = test_root();
    fs::create_dir(root.join("chapter")).expect("directory should be created");
    fs::write(root.join("chapter").join("chapter.md"), "# Shadow\n")
        .expect("shadow note should be written");

    let renamed = rename_vault_directory(
        root.to_string_lossy().into_owned(),
        "chapter".into(),
        "Book One".into(),
    )
    .expect("folder should rename");

    assert_eq!(renamed.name, "Book One");
    assert_eq!(renamed.relative_path, "Book One");
    assert!(!root.join("chapter").exists());
    assert!(root.join("Book One").is_dir());
    assert!(!root.join("Book One").join("chapter.md").exists());
    assert_eq!(
        fs::read_to_string(root.join("Book One").join("Book One.md"))
            .expect("renamed shadow note should be readable"),
        "# Shadow\n",
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn moves_vault_directory_to_existing_directory() {
    let root = test_root();
    fs::create_dir(root.join("archive")).expect("directory should be created");
    fs::create_dir(root.join("notes")).expect("directory should be created");
    fs::write(root.join("notes").join("note.md"), "# Note\n").expect("file should be created");

    let moved = move_vault_directory(
        root.to_string_lossy().into_owned(),
        "notes".into(),
        "archive".into(),
    )
    .expect("directory should move");

    assert_eq!(moved.name, "notes");
    assert_eq!(moved.relative_path, "archive/notes");
    assert!(!root.join("notes").exists());
    assert_eq!(
        fs::read_to_string(root.join("archive").join("notes").join("note.md"))
            .expect("moved child file should be readable"),
        "# Note\n",
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn refuses_to_move_vault_directory_into_itself() {
    let root = test_root();
    fs::create_dir_all(root.join("notes").join("child")).expect("directories should be created");

    let error = move_vault_directory(
        root.to_string_lossy().into_owned(),
        "notes".into(),
        "notes/child".into(),
    )
    .expect_err("directory should not move into itself");

    assert!(error.contains("itself"));
    assert!(root.join("notes").join("child").is_dir());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn lists_vault_markdown_files_for_wikilink_index() {
    let root = test_root();
    fs::create_dir_all(root.join("Calendar")).expect("calendar directory should be created");
    fs::create_dir_all(root.join(SETTINGS_DIRECTORY_NAME).join("plugins"))
        .expect("glyphary directory should be created");
    fs::write(root.join("Root.md"), "# Root\n").expect("root note should be created");
    fs::write(root.join("Calendar").join("Mon, Dec 22nd 2025.md"), "")
        .expect("calendar note should be created");
    fs::write(root.join("notes.txt"), "not markdown").expect("text file should be created");
    fs::write(
        root.join(SETTINGS_DIRECTORY_NAME)
            .join("plugins")
            .join("Plugin.md"),
        "not a note",
    )
    .expect("plugin markdown should be created");

    let files = list_vault_markdown_files(root.to_string_lossy().into_owned())
        .expect("markdown files should list");
    let paths = files
        .into_iter()
        .map(|file| file.relative_path)
        .collect::<Vec<_>>();

    assert_eq!(paths, vec!["Calendar/Mon, Dec 22nd 2025.md", "Root.md"]);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_parent_path_escape() {
    let root = test_root();
    let error = list_vault_dir(root.to_string_lossy().into_owned(), "../".into())
        .expect_err("parent traversal should be rejected");

    assert!(error.contains("escapes the vault"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn renames_vault_file_in_same_directory() {
    let root = test_root();
    fs::create_dir(root.join("notes")).expect("directory should be created");
    fs::write(root.join("notes").join("Old.md"), "# Old\n").expect("file should be created");

    let renamed = rename_vault_file(
        root.to_string_lossy().into_owned(),
        "notes/Old.md".into(),
        "New Name".into(),
    )
    .expect("file should rename");

    assert_eq!(renamed.name, "New Name.md");
    assert_eq!(renamed.relative_path, "notes/New Name.md");
    assert!(!root.join("notes").join("Old.md").exists());
    assert_eq!(renamed.content, "# Old\n");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn refuses_vault_file_rename_collision() {
    let root = test_root();
    fs::write(root.join("Old.md"), "# Old\n").expect("file should be created");
    fs::write(root.join("Existing.md"), "# Existing\n").expect("file should be created");

    let error = rename_vault_file(
        root.to_string_lossy().into_owned(),
        "Old.md".into(),
        "Existing".into(),
    )
    .expect_err("rename should fail on collision");

    assert!(error.contains("already exists"));
    assert!(root.join("Old.md").exists());

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn moves_vault_file_to_existing_directory() {
    let root = test_root();
    fs::create_dir(root.join("archive")).expect("directory should be created");
    fs::write(root.join("note.md"), "# Note\n").expect("file should be created");

    let moved = move_vault_file(
        root.to_string_lossy().into_owned(),
        "note.md".into(),
        "archive".into(),
    )
    .expect("file should move");

    assert_eq!(moved.name, "note.md");
    assert_eq!(moved.relative_path, "archive/note.md");
    assert!(!root.join("note.md").exists());
    assert_eq!(
        fs::read_to_string(root.join("archive").join("note.md"))
            .expect("moved file should be readable"),
        "# Note\n",
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn deletes_vault_file() {
    let root = test_root();
    fs::write(root.join("note.md"), "# Note\n").expect("file should be created");

    delete_vault_file(root.to_string_lossy().into_owned(), "note.md".into())
        .expect("file should delete");

    assert!(!root.join("note.md").exists());

    fs::remove_dir_all(root).expect("test root should be removed");
}
