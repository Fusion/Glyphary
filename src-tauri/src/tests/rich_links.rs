//! Rich-link metadata regression tests.
//!
//! Responsibilities:
//! - Verify rich-link extraction from Open Graph metadata and plain HTML.
//! - Lock fallback image selection from early page content and srcset values.
//!
//! Contracts:
//! - Extraction must prefer explicit metadata over page-image fallbacks.
//! - Parsed metadata should be normalized before it crosses the command boundary.
use super::*;

#[test]
fn extracts_rich_link_metadata_from_open_graph_tags() {
    let metadata = extract_rich_link_metadata(
        "https://example.com/articles/post",
        r#"
          <html>
            <head>
              <meta property="og:title" content="Example &amp; Title">
              <meta property="og:description" content="A useful summary">
              <meta property="og:image" content="/images/card.png">
              <meta property="og:site_name" content="Example Site">
            </head>
          </html>
        "#,
    );

    assert_eq!(metadata.url, "https://example.com/articles/post");
    assert_eq!(metadata.title, "Example & Title");
    assert_eq!(metadata.description, "A useful summary");
    assert_eq!(metadata.image, "https://example.com/images/card.png");
    assert_eq!(metadata.site_name, "Example Site");
}

#[test]
fn extracts_rich_link_metadata_from_standard_html_fallbacks() {
    let metadata = extract_rich_link_metadata(
        "https://example.com/",
        r#"
          <html>
            <head>
              <title>Fallback Title</title>
              <meta name="description" content="Fallback description">
            </head>
          </html>
        "#,
    );

    assert_eq!(metadata.title, "Fallback Title");
    assert_eq!(metadata.description, "Fallback description");
    assert_eq!(metadata.image, "");
    assert_eq!(metadata.site_name, "");
}

#[test]
fn extracts_rich_link_image_from_early_page_image_when_metadata_is_missing() {
    let metadata = extract_rich_link_metadata(
        "https://example.com/articles/post",
        r#"
          <html>
            <head><title>Fallback Image</title></head>
            <body>
              <img src="data:image/gif;base64,abc">
              <img src="/images/hero.jpg">
            </body>
          </html>
        "#,
    );

    assert_eq!(metadata.title, "Fallback Image");
    assert_eq!(metadata.image, "https://example.com/images/hero.jpg");
}

#[test]
fn extracts_rich_link_image_from_srcset_when_src_is_missing() {
    let metadata = extract_rich_link_metadata(
        "https://example.com/articles/post",
        r#"
          <html>
            <head><title>Srcset Image</title></head>
            <body>
              <img srcset="/small.webp 480w, /large.webp 1200w">
            </body>
          </html>
        "#,
    );

    assert_eq!(metadata.image, "https://example.com/small.webp");
}

#[test]
fn keeps_metadata_image_before_page_image_fallback() {
    let metadata = extract_rich_link_metadata(
        "https://example.com/articles/post",
        r#"
          <html>
            <head>
              <meta property="og:image" content="/images/social.jpg">
            </head>
            <body>
              <img src="/images/hero.jpg">
            </body>
          </html>
        "#,
    );

    assert_eq!(metadata.image, "https://example.com/images/social.jpg");
}
