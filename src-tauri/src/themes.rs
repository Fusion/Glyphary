//! Theme settings validation.
//!
//! Responsibilities:
//! - Validate user-editable theme token values against the backend allowlist.
//! - Normalize callout style/icon choices.
//! - Drop empty theme payloads so default vaults do not persist noise.
//!
//! Contracts:
//! - Allowed token names remain defined with shared settings constants in
//!   `lib.rs`; this module owns validation behavior.
//! - Values are restricted to conservative CSS-like scalar characters. Full CSS
//!   belongs in approved snippets, not theme token values.
//! - Unknown callout styles or icon names are rejected before saving settings.
use super::*;

pub(crate) fn clean_theme(theme: Option<VaultTheme>) -> Result<Option<VaultTheme>, String> {
    let Some(theme) = theme else {
        return Ok(None);
    };
    let mut tokens = HashMap::new();
    let preset_id = theme
        .preset_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    for (key, value) in theme.tokens {
        if !THEME_TOKEN_ALLOWLIST.contains(&key.as_str()) {
            return Err(format!("Unsupported theme token: {key}"));
        }

        let value = value.trim();

        if value.is_empty() {
            continue;
        }

        if value.len() > 180 || !value.chars().all(is_safe_theme_value_char) {
            return Err(format!("Invalid theme value for {key}"));
        }

        tokens.insert(key, value.to_string());
    }
    let callouts = clean_theme_callouts(theme.callouts)?;

    if tokens.is_empty()
        && theme.options == VaultThemeOptions::default()
        && callouts == VaultThemeCallouts::default()
    {
        Ok(None)
    } else {
        Ok(Some(VaultTheme {
            preset_id,
            callouts,
            options: theme.options,
            tokens,
        }))
    }
}
pub(crate) fn clean_theme_callouts(
    callouts: VaultThemeCallouts,
) -> Result<VaultThemeCallouts, String> {
    let style = callouts.style.trim().to_string();

    if !THEME_CALLOUT_STYLE_ALLOWLIST.contains(&style.as_str()) {
        return Err(format!("Unsupported callout style: {style}"));
    }

    let mut icons = default_callout_icons();

    for (key, value) in callouts.icons {
        let key = key.trim().to_string();
        let value = value.trim().to_string();

        if !THEME_CALLOUT_ICON_KEY_ALLOWLIST.contains(&key.as_str()) {
            return Err(format!("Unsupported callout icon key: {key}"));
        }

        if !THEME_CALLOUT_ICON_ALLOWLIST.contains(&value.as_str()) {
            return Err(format!("Unsupported callout icon: {value}"));
        }

        icons.insert(key, value);
    }

    Ok(VaultThemeCallouts { style, icons })
}
pub(crate) fn is_safe_theme_value_char(character: char) -> bool {
    // Keep theme-builder values expressive enough for colors, lengths, font
    // stacks, and simple CSS functions while preventing arbitrary declarations.
    character.is_ascii_alphanumeric()
        || matches!(
            character,
            '#' | '('
                | ')'
                | ','
                | '.'
                | '%'
                | '-'
                | '+'
                | '/'
                | '_'
                | '*'
                | '"'
                | '\''
                | ' '
                | '\t'
        )
}
