/**
 * Rich-link markdown helpers.
 *
 * Responsibilities:
 * - Convert fetched metadata into Glyphary's rich-link container syntax.
 * - Normalize field values so generated markdown remains one field per line.
 *
 * Contracts:
 * - This module only builds markdown; network fetching and metadata extraction live elsewhere.
 * - Empty optional fields are omitted to keep generated markdown compact.
 */

export type RichLinkMarkdownFields = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

export function escapeRichLinkField(value: string) {
  return value.replace(/\r?\n/g, " ").trim();
}

export function richLinkMarkdown(fields: RichLinkMarkdownFields) {
  const lines = [
    ["url", fields.url],
    ["title", fields.title],
    ["description", fields.description],
    ["image", fields.image],
    ["siteName", fields.siteName],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}: ${escapeRichLinkField(value ?? "")}`);

  return `::: rich-link\n${lines.join("\n")}\n:::`;
}
