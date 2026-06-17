//! Vault asset regression tests.
//!
//! Responsibilities:
//! - Verify image/asset writes for default and custom asset directories.
//! - Lock the collision-suffix behavior that protects existing assets.
//!
//! Contracts:
//! - Saved assets must remain inside the configured asset directory.
//! - Asset writes must avoid overwrites and return the stored vault-relative path.
use super::*;

#[test]
fn saves_vault_asset_in_assets_directory() {
    let root = test_root();
    let saved = save_vault_asset(
        root.to_string_lossy().into_owned(),
        DEFAULT_ASSET_DIRECTORY.into(),
        "../My Image 20230102173741.png".into(),
        vec![1, 2, 3],
    )
    .expect("asset should save");

    assert_eq!(saved.file_name, "My Image 20230102173741.png");
    assert_eq!(saved.relative_path, "_assets_/My Image 20230102173741.png");
    assert_eq!(
        fs::read(root.join("_assets_").join(&saved.file_name)).expect("asset should be read"),
        vec![1, 2, 3]
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn saves_vault_asset_in_custom_assets_directory() {
    let root = test_root();
    let saved = save_vault_asset(
        root.to_string_lossy().into_owned(),
        "media/images".into(),
        "Pasted image 20230102173741.png".into(),
        vec![9, 8, 7],
    )
    .expect("asset should save in custom directory");

    assert_eq!(
        saved.relative_path,
        "media/images/Pasted image 20230102173741.png"
    );
    assert_eq!(
        fs::read(root.join("media").join("images").join(saved.file_name))
            .expect("asset should be read"),
        vec![9, 8, 7]
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}

#[test]
fn saves_vault_asset_without_overwriting_existing_file() {
    let root = test_root();
    fs::create_dir(root.join("_assets_")).expect("asset directory should be created");
    fs::write(
        root.join("_assets_")
            .join("Pasted image 20230102173741.png"),
        vec![1],
    )
    .expect("existing asset should be created");

    let saved = save_vault_asset(
        root.to_string_lossy().into_owned(),
        DEFAULT_ASSET_DIRECTORY.into(),
        "Pasted image 20230102173741.png".into(),
        vec![2],
    )
    .expect("asset should save");

    assert_eq!(saved.file_name, "Pasted image 20230102173741 2.png");
    assert_eq!(
        fs::read(root.join("_assets_").join(saved.file_name)).expect("asset should be read"),
        vec![2]
    );

    fs::remove_dir_all(root).expect("test root should be removed");
}
