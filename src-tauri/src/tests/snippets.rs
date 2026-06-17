//! CSS snippet regression tests.
//!
//! Responsibilities:
//! - Verify snippet listing and approved snippet loading.
//! - Lock rejection of path-like snippet names.
//!
//! Contracts:
//! - Only approved simple `.css` filenames may be listed or read.
//! - Snippet deletion should not make settings unreadable.
use super::*;

#[test]
fn lists_and_reads_only_approved_css_snippets() {
    let root = test_root();
    let snippets_dir = root.join(DEFAULT_CSS_SNIPPET_DIRECTORY);
    fs::create_dir_all(&snippets_dir).expect("snippet directory should be created");
    fs::write(
        snippets_dir.join("wide.css"),
        ".editor-surface { max-width: 90ch; }\n",
    )
    .expect("snippet should be created");
    fs::write(snippets_dir.join("quiet.css"), "body { opacity: 0.99; }\n")
        .expect("snippet should be created");
    fs::write(snippets_dir.join("note.md"), "not css\n").expect("non-css file should be created");

    let snippets = list_css_snippets(
        root.to_string_lossy().into_owned(),
        DEFAULT_CSS_SNIPPET_DIRECTORY.into(),
    )
    .expect("snippets should list");
    let names = snippets
        .iter()
        .map(|snippet| snippet.name.as_str())
        .collect::<Vec<_>>();

    assert_eq!(names, vec!["quiet.css", "wide.css"]);

    let approved = read_css_snippets(
        root.to_string_lossy().into_owned(),
        DEFAULT_CSS_SNIPPET_DIRECTORY.into(),
        vec!["wide.css".into()],
    )
    .expect("approved snippet should read");

    assert_eq!(approved.len(), 1);
    assert_eq!(approved[0].name, "wide.css");
    assert!(approved[0].content.contains("90ch"));

    let escaped = read_css_snippets(
        root.to_string_lossy().into_owned(),
        DEFAULT_CSS_SNIPPET_DIRECTORY.into(),
        vec!["../wide.css".into()],
    )
    .expect_err("escaped snippet name should fail");

    assert!(escaped.contains("simple .css file name"));

    fs::remove_dir_all(root).expect("test root should be removed");
}
