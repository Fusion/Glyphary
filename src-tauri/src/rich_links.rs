//! Rich-link metadata extraction.
//!
//! Responsibilities:
//! - Fetch a remote URL and extract title, description, site name, and image
//!   candidates for rich-link cards.
//! - Prefer explicit Open Graph/Twitter metadata, then fall back to common HTML
//!   title and early image references.
//!
//! Contracts:
//! - Output is normalized and bounded before returning over IPC.
//! - This is a lightweight metadata extractor, not a general HTML renderer or
//!   sanitizer for embedded page content.
//! - Relative image URLs are resolved against the source URL so markdown stores
//!   usable card metadata.
use super::*;

pub(crate) fn normalize_metadata_text(value: &str) -> String {
    decode_html_entities(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(500)
        .collect()
}
pub(crate) fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}
pub(crate) fn parse_html_attrs(tag: &str) -> HashMap<String, String> {
    // Rich-link previews only need attributes from already-located tags. This
    // small scanner avoids pulling in a full HTML parser while still handling
    // quoted, unquoted, and boolean-style attributes used by metadata tags.
    let bytes = tag.as_bytes();
    let mut attrs = HashMap::new();
    let mut index = 0;

    while index < bytes.len() {
        while index < bytes.len() && !bytes[index].is_ascii_alphabetic() {
            index += 1;
        }

        let name_start = index;
        while index < bytes.len()
            && (bytes[index].is_ascii_alphanumeric() || matches!(bytes[index], b':' | b'-' | b'_'))
        {
            index += 1;
        }

        if name_start == index {
            break;
        }

        let name = tag[name_start..index].to_ascii_lowercase();

        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }

        if index >= bytes.len() || bytes[index] != b'=' {
            attrs.insert(name, String::new());
            continue;
        }

        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }

        if index >= bytes.len() {
            attrs.insert(name, String::new());
            break;
        }

        let value = if matches!(bytes[index], b'"' | b'\'') {
            let quote = bytes[index];
            index += 1;
            let value_start = index;
            while index < bytes.len() && bytes[index] != quote {
                index += 1;
            }
            let value = tag[value_start..index].to_string();
            if index < bytes.len() {
                index += 1;
            }
            value
        } else {
            let value_start = index;
            while index < bytes.len()
                && !bytes[index].is_ascii_whitespace()
                && !matches!(bytes[index], b'>')
            {
                index += 1;
            }
            tag[value_start..index].to_string()
        };

        attrs.insert(name, decode_html_entities(&value));
    }

    attrs
}
pub(crate) fn find_meta_content(html: &str, key: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut search_from = 0;
    let wanted = key.to_ascii_lowercase();

    while let Some(offset) = lower[search_from..].find("<meta") {
        let start = search_from + offset;
        let Some(end_offset) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_offset + 1;
        let attrs = parse_html_attrs(&html[start..end]);
        let matches_key = attrs
            .get("property")
            .is_some_and(|value| value.eq_ignore_ascii_case(&wanted))
            || attrs
                .get("name")
                .is_some_and(|value| value.eq_ignore_ascii_case(&wanted));

        if matches_key {
            if let Some(content) = attrs
                .get("content")
                .map(|value| normalize_metadata_text(value))
            {
                if !content.is_empty() {
                    return Some(content);
                }
            }
        }

        search_from = end;
    }

    None
}
pub(crate) fn find_html_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let content_start = lower[start..].find('>')? + start + 1;
    let content_end = lower[content_start..].find("</title>")? + content_start;
    let title = normalize_metadata_text(&html[content_start..content_end]);

    (!title.is_empty()).then_some(title)
}
pub(crate) fn absolute_metadata_url(base_url: &str, value: &str) -> String {
    let value = value.trim();

    if value.is_empty() {
        return String::new();
    }

    if let Ok(url) = reqwest::Url::parse(value) {
        return url.to_string();
    }

    reqwest::Url::parse(base_url)
        .and_then(|base| base.join(value))
        .map(|url| url.to_string())
        .unwrap_or_else(|_| value.to_string())
}
pub(crate) fn first_srcset_url(srcset: &str) -> Option<String> {
    srcset
        .split(',')
        .filter_map(|candidate| candidate.split_whitespace().next())
        .find(|candidate| !candidate.is_empty())
        .map(str::to_string)
}
pub(crate) fn is_usable_rich_link_image(value: &str) -> bool {
    let value = value.trim();
    let lower = value.to_ascii_lowercase();

    !value.is_empty()
        && !lower.starts_with("data:")
        && !lower.starts_with("blob:")
        && !lower.ends_with(".svg")
}
pub(crate) fn find_first_page_image(html: &str, base_url: &str) -> Option<String> {
    // Page-image fallback is intentionally shallow: early content is likely to
    // contain the article/card image, while scanning an entire page increases
    // latency and the chance of picking navigation or tracking images.
    let scan_end = html
        .char_indices()
        .map(|(index, _)| index)
        .take_while(|index| *index <= RICH_LINK_IMAGE_SCAN_BYTES)
        .last()
        .unwrap_or(html.len());
    let html = &html[..scan_end];
    let lower = html.to_ascii_lowercase();
    let mut search_from = 0;

    while let Some(offset) = lower[search_from..].find("<img") {
        let start = search_from + offset;
        let Some(end_offset) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_offset + 1;
        let attrs = parse_html_attrs(&html[start..end]);
        let image = attrs
            .get("src")
            .or_else(|| attrs.get("data-src"))
            .or_else(|| attrs.get("data-original"))
            .cloned()
            .or_else(|| {
                attrs
                    .get("srcset")
                    .and_then(|value| first_srcset_url(value))
            });

        if let Some(image) = image {
            if is_usable_rich_link_image(&image) {
                return Some(absolute_metadata_url(base_url, &image));
            }
        }

        search_from = end;
    }

    None
}
pub(crate) fn extract_rich_link_metadata(url: &str, html: &str) -> RichLinkMetadata {
    // Prefer explicit social metadata. The page image fallback is a last resort
    // so an author-provided Open Graph/Twitter image wins over decorative body
    // images that happen to appear earlier in the HTML.
    let title = find_meta_content(html, "og:title")
        .or_else(|| find_meta_content(html, "twitter:title"))
        .or_else(|| find_html_title(html))
        .unwrap_or_else(|| url.to_string());
    let description = find_meta_content(html, "og:description")
        .or_else(|| find_meta_content(html, "twitter:description"))
        .or_else(|| find_meta_content(html, "description"))
        .unwrap_or_default();
    let image = find_meta_content(html, "og:image")
        .or_else(|| find_meta_content(html, "twitter:image"))
        .map(|image| absolute_metadata_url(url, &image))
        .or_else(|| find_first_page_image(html, url))
        .unwrap_or_default();
    let site_name = find_meta_content(html, "og:site_name").unwrap_or_default();

    RichLinkMetadata {
        url: url.to_string(),
        title,
        description,
        image,
        site_name,
    }
}
#[tauri::command]
pub(crate) async fn fetch_rich_link_metadata(url: String) -> Result<RichLinkMetadata, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "Enter a valid http or https URL".to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Rich links only support http and https URLs".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Glyphary/0.1 rich-link preview")
        .build()
        .map_err(|err| format!("Could not prepare rich link request: {err}"))?;
    let response = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|err| format!("Could not fetch rich link: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Rich link request returned {}", response.status()));
    }

    if response.content_length().unwrap_or(0) > MAX_RICH_LINK_HTML_BYTES {
        return Err("Rich link page is too large to preview".into());
    }

    let final_url = response.url().to_string();
    let html = response
        .text()
        .await
        .map_err(|err| format!("Could not read rich link page: {err}"))?;

    if html.len() as u64 > MAX_RICH_LINK_HTML_BYTES {
        return Err("Rich link page is too large to preview".into());
    }

    Ok(extract_rich_link_metadata(&final_url, &html))
}
