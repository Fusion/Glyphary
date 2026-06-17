/**
 * Markdown and frontmatter pure helpers.
 *
 * Responsibilities:
 * - Split and compose hidden frontmatter around the WYSIWYG editor body.
 * - Extract document headings for table-of-contents UI.
 * - Extract simple frontmatter list values for tag pills.
 *
 * Contracts:
 * - Frontmatter handling must round-trip complete YAML/TOML fences without editing the body.
 * - Heading extraction must ignore fenced code blocks.
 * - Frontmatter list parsing is intentionally a small display heuristic, not a full YAML parser.
 */

import { defaultFrontmatterPillHeader } from "./defaults.js";

export type MarkdownParts = {
  metaHeader: string;
  metaDelimiter: "---" | "+++";
  body: string;
};

export type TocEntry = {
  id: string;
  level: number;
  title: string;
  occurrence: number;
};

export const defaultMetaDelimiter: MarkdownParts["metaDelimiter"] = "---";

export function markdownHeadings(markdown: string): TocEntry[] {
  const headings: TocEntry[] = [];
  const occurrences = new Map<string, number>();
  let inFence = false;
  let fenceMarker = "";

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];

      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }

      continue;
    }

    if (inFence) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (!headingMatch) {
      continue;
    }

    const title = headingMatch[2].replace(/\s+#+\s*$/, "").trim();

    if (!title) {
      continue;
    }

    const level = headingMatch[1].length;
    const key = `${level}:${title}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;

    occurrences.set(key, occurrence);
    headings.push({
      id: `${key}:${occurrence}`,
      level,
      title,
      occurrence,
    });
  }

  return headings;
}

export function splitMetaHeader(content: string): MarkdownParts {
  // Frontmatter is hidden from the WYSIWYG editor but must round-trip exactly
  // enough for save. Only complete YAML/TOML-style opening and closing fences
  // are treated as metadata; unterminated fences remain part of the document.
  const delimiter = content.startsWith("---\n") || content.startsWith("---\r\n")
    ? "---"
    : content.startsWith("+++\n") || content.startsWith("+++\r\n")
      ? "+++"
      : null;

  if (!delimiter) {
    return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
  }

  const linePattern = /\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(content)) !== null) {
    const lineStart = match.index + match[0].length;
    const nextBreak = content.indexOf("\n", lineStart);
    const lineEnd = nextBreak === -1 ? content.length : nextBreak;
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");

    if (line === delimiter) {
      const headerEnd = nextBreak === -1 ? content.length : nextBreak + 1;

      return {
        metaHeader: content
          .slice(content.indexOf("\n") + 1, match.index)
          .replace(/\r\n/g, "\n")
          .replace(/\r$/, ""),
        metaDelimiter: delimiter,
        body: content.slice(headerEnd),
      };
    }
  }

  return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanFrontmatterListItem(value: string) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

export function frontmatterListValues(
  metaHeader: string,
  headerName = defaultFrontmatterPillHeader,
) {
  const cleanHeaderName = headerName.trim();

  if (!cleanHeaderName) {
    return [];
  }

  const values: string[] = [];
  const seen = new Set<string>();
  const lines = metaHeader.replace(/\r\n/g, "\n").split("\n");
  const escapedHeaderName = escapeRegExp(cleanHeaderName);
  const inlinePattern = new RegExp(`^\\s*${escapedHeaderName}\\s*:\\s*\\[([^\\]]*)\\]\\s*$`, "i");
  const blockPattern = new RegExp(`^(\\s*)${escapedHeaderName}\\s*:\\s*$`, "i");

  // This is a display heuristic, not a full YAML parser. It intentionally only
  // recognizes simple list shapes for the vault-configured frontmatter key.
  function pushValue(value: string) {
    const cleanValue = cleanFrontmatterListItem(value);
    const key = cleanValue.toLowerCase();

    if (!cleanValue || seen.has(key)) {
      return;
    }

    seen.add(key);
    values.push(cleanValue);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlineMatch = line.match(inlinePattern);

    if (inlineMatch) {
      inlineMatch[1].split(",").forEach(pushValue);
      continue;
    }

    const blockMatch = line.match(blockPattern);

    if (!blockMatch) {
      continue;
    }

    const baseIndent = blockMatch[1].length;

    for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
      const itemLine = lines[itemIndex];

      if (!itemLine.trim()) {
        continue;
      }

      const itemMatch = itemLine.match(/^(\s*)-\s+(.+?)\s*$/);

      if (!itemMatch || itemMatch[1].length < baseIndent) {
        break;
      }

      pushValue(itemMatch[2]);
      index = itemIndex;
    }
  }

  return values;
}

export function composeMarkdown(
  metaHeader: string,
  metaDelimiter: MarkdownParts["metaDelimiter"],
  body: string,
) {
  const cleanMeta = metaHeader.trim();

  if (!cleanMeta) {
    return body;
  }

  return `${metaDelimiter}\n${cleanMeta}\n${metaDelimiter}\n${body}`;
}
