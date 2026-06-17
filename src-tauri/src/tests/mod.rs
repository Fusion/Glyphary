//! Backend regression test harness.
//!
//! Responsibilities:
//! - Provide shared temporary vault setup for focused backend test modules.
//! - Keep Rust tests grouped by backend domain instead of accumulating in one
//!   large file.
//!
//! Contracts:
//! - Child modules must use isolated temporary vault roots and clean them up.
//! - Tests should assert behavior, not implementation layout; source-layout
//!   checks live in the frontend logic tests.
use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

mod assets;
mod calendar;
mod plugins;
mod rich_links;
mod search;
mod settings;
mod snippets;
mod vault;

static TEST_COUNTER: AtomicUsize = AtomicUsize::new(0);

pub(super) fn test_root() -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be available")
        .as_nanos();
    let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!("glyphary-vault-test-{unique}-{counter}"));
    if root.exists() {
        fs::remove_dir_all(&root).expect("stale test root should be removed");
    }
    fs::create_dir_all(&root).expect("test root should be created");
    root
}
