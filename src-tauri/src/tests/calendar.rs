//! Calendar note regression tests.
//!
//! Responsibilities:
//! - Verify calendar day note creation, path rejection, and existing-day listing.
//!
//! Contracts:
//! - Calendar commands create and list files only under `Calendar/`.
//! - Newly created calendar notes must remain empty unless a template feature
//!   explicitly changes that behavior.
use super::*;

#[test]
fn opens_or_creates_calendar_day_file() {
    let root = test_root();

    let opened = open_calendar_day_file(
        root.to_string_lossy().into_owned(),
        "Calendar/Sun, Jun 14th 2026.md".into(),
        "Sun, Jun 14th 2026".into(),
    )
    .expect("calendar day should open");

    assert_eq!(opened.name, "Sun, Jun 14th 2026.md");
    assert_eq!(opened.relative_path, "Calendar/Sun, Jun 14th 2026.md");
    assert_eq!(opened.content, "");

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn rejects_calendar_day_files_outside_calendar_directory() {
    let root = test_root();
    let error = open_calendar_day_file(
        root.to_string_lossy().into_owned(),
        "Notes/Sun, Jun 14th 2026.md".into(),
        "Sun, Jun 14th 2026".into(),
    )
    .expect_err("calendar path outside Calendar should fail");

    assert!(error.contains("must live under Calendar"));

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn lists_calendar_day_files() {
    let root = test_root();
    fs::create_dir(root.join("Calendar")).expect("calendar directory should be created");
    fs::write(
        root.join("Calendar").join("Sun, Jun 14th 2026.md"),
        "# Day\n",
    )
    .expect("calendar file should be created");
    fs::create_dir(root.join("Calendar").join("Archive"))
        .expect("nested directory should be created");

    let existing = list_calendar_day_files(root.to_string_lossy().into_owned())
        .expect("calendar day files should be listed");

    assert_eq!(existing, vec!["Calendar/Sun, Jun 14th 2026.md"]);

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn lists_no_calendar_day_files_when_calendar_directory_is_missing() {
    let root = test_root();

    let existing = list_calendar_day_files(root.to_string_lossy().into_owned())
        .expect("missing calendar directory should be empty");

    assert!(existing.is_empty());

    fs::remove_dir_all(root).expect("test root should be removed");
}
