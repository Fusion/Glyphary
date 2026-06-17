//! Vault search regression tests.
//!
//! Responsibilities:
//! - Verify filename and content search command behavior.
//! - Lock result fields used by the vault drawer for navigation.
//!
//! Contracts:
//! - Search returns vault-relative navigation results.
//! - Content matches must include line numbers and compact preview text.
use super::*;

#[test]
fn searches_vault_file_names() {
    let root = test_root();
    fs::create_dir(root.join("notes")).expect("directory should be created");
    fs::write(root.join("notes").join("Project Plan.md"), "# Plan\n")
        .expect("file should be created");
    fs::write(root.join("other.md"), "# Other\n").expect("file should be created");

    let results = search_vault(root.to_string_lossy().into_owned(), "project".into(), false)
        .expect("vault search should succeed");

    assert!(results
        .iter()
        .any(|result| result.relative_path == "notes/Project Plan.md" && !result.is_content_match));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn searches_vault_file_content() {
    let root = test_root();
    fs::write(root.join("alpha.md"), "# Alpha\nNeedle lives here\n")
        .expect("file should be created");
    fs::write(root.join("beta.md"), "# Beta\n").expect("file should be created");

    let results = search_vault(root.to_string_lossy().into_owned(), "needle".into(), true)
        .expect("vault search should succeed");

    assert!(results.iter().any(|result| {
        result.relative_path == "alpha.md"
            && result.is_content_match
            && result.line_number == Some(2)
            && result
                .line_text
                .as_deref()
                .is_some_and(|line| line.contains("Needle"))
    }));

    fs::remove_dir_all(root).expect("test root should be removed");
}
