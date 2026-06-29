/**
 * Markdown extension factories for Glyphary-specific block and inline syntax.
 *
 * Responsibilities:
 * - Round-trip custom Markdown containers and inline marks through Tiptap.
 * - Keep editor node views for HTML and collapse blocks next to their schemas.
 *
 * Contracts:
 * - Extensions preserve plain Markdown source and avoid app-level state.
 * - HTML previews stay sanitized; this module must not execute vault content.
 */

import { useState } from "react";
import { Mark, mergeAttributes, Node } from "@tiptap/core";
import type { JSONContent, MarkdownToken, NodeViewProps } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { richLinkMarkdown } from "../lib/rich-links";

type ContainerMarkdownLexer = {
  blockTokens: (src: string) => MarkdownToken[];
};

type ContainerOpening = {
  length: number;
  attrs?: Record<string, unknown>;
};

function createMarkdownContainerToken(
  src: string,
  type: string,
  opening: ContainerOpening | null,
  lexer: ContainerMarkdownLexer,
) {
  if (!opening) {
    return undefined;
  }

  const openingLength = opening.length;
  const body = src.slice(openingLength);
  const markerPattern = /^:::[^\S\n]*([\w-]+)?[^\n\r]*$/gm;
  let depth = 1;
  let markerMatch: RegExpExecArray | null = null;

  while ((markerMatch = markerPattern.exec(body))) {
    const [, nestedType] = markerMatch;

    // The container syntax reuses a bare ::: closing marker for every type.
    // Track nested named openings so a child column/callout close does not
    // terminate its parent columns container.
    if (nestedType) {
      depth += 1;
    } else {
      depth -= 1;
    }

    if (depth === 0) {
      const innerMarkdown = body.slice(0, markerMatch.index);
      const closingLength = markerMatch[0].length;

      // Marked tokenizers receive the remaining source from the current
      // position. Returning only through the matching closing fence lets the
      // normal block parser continue with the markdown that follows.
      return {
        type,
        raw: src.slice(0, openingLength + markerMatch.index + closingLength),
        ...opening.attrs,
        content: innerMarkdown,
        tokens: lexer.blockTokens(innerMarkdown),
      };
    }
  }

  return undefined;
}

function namedContainerOpening(src: string, type: string) {
  const match = src.match(new RegExp(`^:::[^\\S\\n]*${type}[^\\S\\n]*\\r?\\n`));

  return match ? { length: match[0].length } : null;
}

function unescapeCalloutTitle(title: string) {
  return title.replace(/\\(["\\])/g, "$1");
}

function escapeCalloutTitle(title: string) {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function calloutContainerOpening(src: string) {
  const match = src.match(
    /^:::[^\S\n]*callout(?:[^\S\n]+(?:(\w[\w-]*)|"((?:\\.|[^"\\])*)"))?(?:[^\S\n]+"((?:\\.|[^"\\])*)")?[^\S\n]*\r?\n/,
  );

  if (!match) {
    return null;
  }

  const [, kind, titleWithoutKind, titleWithKind] = match;
  const title = titleWithKind ?? titleWithoutKind ?? "";

  // Support both `::: callout "Title"` and
  // `::: callout warning "Title"` so older notes can omit a visual kind.
  return {
    length: match[0].length,
    attrs: {
      kind: kind ?? "note",
      title: title ? unescapeCalloutTitle(title) : null,
    },
  };
}

function collapseContainerOpening(src: string) {
  const match = src.match(
    /^:::[^\S\n]*collapse(?:[^\S\n]+(?:"((?:\\.|[^"\\])*)"|([^\r\n]*?)))?(?:[^\S\n]+(open))?[^\S\n]*\r?\n/,
  );

  if (!match) {
    return null;
  }

  const [, quotedTitle, plainTitle, openFlag] = match;
  const plainParts = plainTitle?.trim().split(/\s+/).filter(Boolean) ?? [];
  const plainTitleIncludesOpenFlag =
    !quotedTitle && plainParts[plainParts.length - 1]?.toLowerCase() === "open";
  const title = quotedTitle
    ? unescapeCalloutTitle(quotedTitle)
    : plainTitleIncludesOpenFlag
      ? plainParts.slice(0, -1).join(" ")
      : plainTitle?.trim() ?? "";

  return {
    length: match[0].length,
    attrs: {
      title: title || "Details",
      defaultOpen: Boolean(openFlag) || plainTitleIncludesOpenFlag,
    },
  };
}

const htmlBlockTags = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "pre",
  "section",
  "script",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "style",
  "textarea",
  "ul",
]);
const htmlVoidBlockTags = new Set([
  "base",
  "br",
  "col",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "track",
]);
const blockedHtmlPreviewSelector = [
  "base",
  "embed",
  "iframe",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
].join(",");

// HTML blocks are preserved as raw Markdown source but previewed through a
// conservative sanitizer. This keeps notes compatible with Markdown renderers
// that allow raw HTML without letting a synced vault execute arbitrary code.
function htmlBlockStartIndex(src: string) {
  const commentIndex = src.search(/^<!--/m);
  const tagIndex = src.search(/^<\/?[A-Za-z][\w:-]*(?:\s|>|\/>)/m);
  const indexes = [commentIndex, tagIndex].filter((index) => index >= 0);

  return indexes.length ? Math.min(...indexes) : -1;
}

function lineLength(src: string) {
  const newlineIndex = src.search(/\r?\n/);

  return newlineIndex >= 0
    ? newlineIndex + (src[newlineIndex] === "\r" ? 2 : 1)
    : src.length;
}

function trailingLineEndingLength(src: string, index: number) {
  const match = src.slice(index).match(/^[ \t]*(?:\r?\n|$)/);

  return match ? match[0].length : 0;
}

function htmlBlockMarkdownToken(src: string) {
  const commentMatch = src.match(/^<!--[\s\S]*?-->/);

  if (commentMatch) {
    const raw = src.slice(
      0,
      commentMatch[0].length + trailingLineEndingLength(src, commentMatch[0].length),
    );

    return {
      type: "htmlBlock",
      raw,
      rawHtml: raw.trimEnd(),
    };
  }

  const tagMatch = src.match(/^<([A-Za-z][\w:-]*)(?:\s[^>]*)?>/);

  if (!tagMatch) {
    return undefined;
  }

  const tagName = tagMatch[1].toLowerCase();

  if (!htmlBlockTags.has(tagName)) {
    return undefined;
  }

  const isSelfClosing = /\/>\s*$/.test(tagMatch[0]) || htmlVoidBlockTags.has(tagName);
  let rawLength = lineLength(src);

  if (!isSelfClosing) {
    const closePattern = new RegExp(`</${tagName}\\s*>`, "i");
    const closeMatch = closePattern.exec(src.slice(tagMatch[0].length));

    if (closeMatch) {
      const closeEnd = tagMatch[0].length + closeMatch.index + closeMatch[0].length;
      rawLength = closeEnd + trailingLineEndingLength(src, closeEnd);
    }
  }

  const raw = src.slice(0, rawLength);

  return {
    type: "htmlBlock",
    raw,
    rawHtml: raw.trimEnd(),
  };
}

export function isAiBuilderMarkerComment(rawHtml: string) {
  return /^<!--\s*glyphary-ai-builder:(?:start|end)\s+[^>]+-->$/.test(rawHtml.trim());
}

function safeHtmlAttributeValue(name: string, value: string) {
  if (/^on/i.test(name) || name.toLowerCase() === "srcdoc") {
    return false;
  }

  if (["href", "src", "xlink:href", "formaction"].includes(name.toLowerCase())) {
    return !/^\s*(?:javascript|data|vbscript):/i.test(value);
  }

  if (name.toLowerCase() === "style") {
    return !/(?:expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|data|vbscript):)/i.test(
      value,
    );
  }

  return true;
}

function sanitizeHtmlBlock(rawHtml: string) {
  if (typeof document === "undefined") {
    return "";
  }

  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  template.content.querySelectorAll(blockedHtmlPreviewSelector).forEach((element) => {
    element.remove();
  });

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];

  while (walker.nextNode()) {
    if (walker.currentNode instanceof Element) {
      elements.push(walker.currentNode);
    }
  }

  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (!safeHtmlAttributeValue(attribute.name, attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return template.innerHTML;
}

function HtmlBlockNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const rawHtml = typeof node.attrs.rawHtml === "string" ? node.attrs.rawHtml : "";

  if (isAiBuilderMarkerComment(rawHtml)) {
    // AI Builder markers are invisible replacement anchors. Keeping them in
    // the document preserves clean follow-up replacement without displaying
    // implementation comments as editable HTML widgets.
    return (
      <NodeViewWrapper
        className="markdown-html-block markdown-html-block-hidden"
        contentEditable={false}
      />
    );
  }

  return (
    <NodeViewWrapper className="markdown-html-block" contentEditable={false}>
      <div
        className="markdown-html-preview"
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlBlock(rawHtml) }}
      />
      {selected ? (
        <label className="markdown-html-source">
          <span>HTML source</span>
          <textarea
            aria-label="HTML block source"
            onChange={(event) => updateAttributes({ rawHtml: event.currentTarget.value })}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            spellCheck={false}
            value={rawHtml}
          />
        </label>
      ) : null}
    </NodeViewWrapper>
  );
}

export function createHtmlBlockExtension() {
  return Node.create({
    name: "htmlBlock",
    group: "block",
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        rawHtml: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-raw-html") || element.innerHTML,
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "div[data-glyphary-html-block]" }];
    },

    renderHTML({ node }) {
      const rawHtml = typeof node.attrs.rawHtml === "string" ? node.attrs.rawHtml : "";

      return [
        "div",
        {
          "data-glyphary-html-block": "true",
          "data-raw-html": rawHtml,
          class: "markdown-html-block",
        },
        ["div", { class: "markdown-html-preview" }, sanitizeHtmlBlock(rawHtml)],
      ];
    },

    markdownTokenName: "htmlBlock",

    markdownTokenizer: {
      name: "htmlBlock",
      level: "block",
      start: htmlBlockStartIndex,
      tokenize: htmlBlockMarkdownToken,
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const rawHtml = typeof token.rawHtml === "string" ? token.rawHtml : String(token.raw ?? "");

      if (!rawHtml.trim()) {
        return [];
      }

      return helpers.createNode("htmlBlock", { rawHtml });
    },

    renderMarkdown: (node: JSONContent) => {
      const rawHtml = typeof node.attrs?.rawHtml === "string" ? node.attrs.rawHtml.trimEnd() : "";

      return rawHtml;
    },

    addNodeView() {
      return ReactNodeViewRenderer(HtmlBlockNodeView);
    },
  });
}

export function createKeyboardKeyExtension() {
  return Mark.create({
    name: "keyboardKey",

    parseHTML() {
      return [{ tag: "kbd" }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["kbd", mergeAttributes(HTMLAttributes), 0];
    },

    markdownOptions: {
      htmlReopen: { open: "<kbd>", close: "</kbd>" },
    },

    renderMarkdown: (node: JSONContent, helpers) =>
      `<kbd>${helpers.renderChildren(node.content ?? [])}</kbd>`,
  });
}

export function createDelimitedMarkdownMarkExtension({
  delimiter,
  name,
  start,
  tag,
  tokenPattern,
}: {
  delimiter: string;
  name: string;
  start: string | ((src: string) => number);
  tag: string;
  tokenPattern: RegExp;
}) {
  return Mark.create({
    name,

    parseHTML() {
      return [{ tag }];
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes), 0];
    },

    markdownTokenizer: {
      name,
      level: "inline",
      start,
      tokenize(src, _tokens, lexer) {
        const match = src.match(tokenPattern);

        if (!match) {
          return;
        }

        const text = match[1];

        return {
          type: name,
          raw: match[0],
          text,
          tokens: lexer.inlineTokens(text),
        };
      },
    },

    parseMarkdown: (token: MarkdownToken, helpers) =>
      helpers.applyMark(name, helpers.parseInline(token.tokens ?? [])),

    renderMarkdown: (node: JSONContent, helpers) =>
      `${delimiter}${helpers.renderChildren(node.content ?? [])}${delimiter}`,
  });
}

export function findSingleTildeDelimiter(src: string) {
  for (let index = 0; index < src.length; index += 1) {
    if (src[index] === "~" && src[index - 1] !== "~" && src[index + 1] !== "~") {
      return index;
    }
  }

  return -1;
}

function CollapseNodeView({ node }: NodeViewProps) {
  const title =
    typeof node.attrs.title === "string" && node.attrs.title.trim()
      ? node.attrs.title.trim()
      : "Details";
  const [open, setOpen] = useState(Boolean(node.attrs.defaultOpen));

  return (
    <NodeViewWrapper className={`markdown-collapse ${open ? "open" : "closed"}`}>
      <button
        aria-expanded={open}
        className="markdown-collapse-summary"
        contentEditable={false}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {title}
      </button>
      <NodeViewContent
        className="markdown-collapse-body"
        style={{ display: open ? undefined : "none" }}
      />
    </NodeViewWrapper>
  );
}

function emptyParagraphNode(helpers: {
  createNode: (type: string, attrs?: Record<string, unknown>, content?: JSONContent[]) => JSONContent;
}) {
  return helpers.createNode("paragraph");
}

export function createColumnExtension() {
  return Node.create({
    name: "column",
    content: "block+",
    defining: true,

    parseHTML() {
      return [{ tag: "div[data-glyphary-column]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-column": "true",
          class: "markdown-column",
        }),
        0,
      ];
    },

    markdownTokenName: "column",

    markdownTokenizer: {
      name: "column",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*column[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "column", namedContainerOpening(src, "column"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode("column", {}, content.length ? content : [emptyParagraphNode(helpers)]);
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: column\n${body}\n:::`;
    },
  });
}

export function createColumnsExtension() {
  return Node.create({
    name: "columns",
    group: "block",
    content: "column+",
    defining: true,

    parseHTML() {
      return [{ tag: "div[data-glyphary-columns]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-columns": "true",
          class: "markdown-columns",
        }),
        0,
      ];
    },

    markdownTokenName: "columns",

    markdownTokenizer: {
      name: "columns",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*columns[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "columns", namedContainerOpening(src, "columns"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      // Only direct column children are preserved. Loose markdown inside a
      // columns container is ambiguous to render, so malformed input falls back
      // to a single empty column instead of silently reshaping content.
      const columns = helpers
        .parseChildren(token.tokens ?? [])
        .filter((node) => node.type === "column");

      return helpers.createNode(
        "columns",
        {},
        columns.length
          ? columns
          : [helpers.createNode("column", {}, [emptyParagraphNode(helpers)])],
      );
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: columns\n${body}\n:::`;
    },
  });
}

export function createGalleryExtension() {
  return Node.create({
    name: "gallery",
    group: "block",
    // Galleries accept block content rather than image-only content because
    // Markdown image tokens can arrive wrapped in paragraphs, and this leaves
    // room for future captions without changing the persisted container syntax.
    content: "block+",
    defining: true,

    parseHTML() {
      return [{ tag: "div[data-glyphary-gallery]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-gallery": "true",
          class: "markdown-gallery",
        }),
        0,
      ];
    },

    markdownTokenName: "gallery",

    markdownTokenizer: {
      name: "gallery",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*gallery[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "gallery", namedContainerOpening(src, "gallery"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode("gallery", {}, content.length ? content : [emptyParagraphNode(helpers)]);
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: gallery\n${body}\n:::`;
    },
  });
}

export function createCalloutExtension() {
  return Node.create({
    name: "callout",
    group: "block",
    content: "block+",
    defining: true,

    addAttributes() {
      return {
        kind: {
          default: "note",
          parseHTML: (element) => element.getAttribute("data-callout-kind") || "note",
          renderHTML: () => ({}),
        },
        title: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-callout-title"),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "aside[data-glyphary-callout]" }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const kind = typeof node.attrs.kind === "string" ? node.attrs.kind : "note";
      const title = typeof node.attrs.title === "string" ? node.attrs.title : null;

      return [
        "aside",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-callout": "true",
          "data-callout-kind": kind,
          ...(title ? { "data-callout-title": title } : {}),
          class: `markdown-callout markdown-callout-${kind}`,
        }),
        ["div", { class: "markdown-callout-title", contenteditable: "false" }, title || kind],
        ["div", { class: "markdown-callout-body" }, 0],
      ];
    },

    markdownTokenName: "callout",

    markdownTokenizer: {
      name: "callout",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*callout(?:[^\n\r]*)?$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "callout", calloutContainerOpening(src), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const calloutToken = token as MarkdownToken & { kind?: unknown; title?: unknown };
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode(
        "callout",
        {
          kind: typeof calloutToken.kind === "string" ? calloutToken.kind : "note",
          title: typeof calloutToken.title === "string" ? calloutToken.title : null,
        },
        content.length ? content : [emptyParagraphNode(helpers)],
      );
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const attrs = node.attrs ?? {};
      const kind = typeof attrs.kind === "string" && attrs.kind ? attrs.kind : "note";
      const title = typeof attrs.title === "string" && attrs.title ? attrs.title : "";
      const titlePart = title ? ` "${escapeCalloutTitle(title)}"` : "";
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: callout ${kind}${titlePart}\n${body}\n:::`;
    },
  });
}

export function createCollapseExtension() {
  return Node.create({
    name: "collapse",
    group: "block",
    content: "block+",
    defining: true,

    addAttributes() {
      return {
        title: {
          default: "Details",
          parseHTML: (element) =>
            element.getAttribute("data-collapse-title") ||
            element.querySelector("summary")?.textContent?.trim() ||
            "Details",
          renderHTML: () => ({}),
        },
        defaultOpen: {
          default: false,
          parseHTML: (element) => element.hasAttribute("open"),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [
        { tag: "details[data-glyphary-collapse]" },
        { tag: "details" },
      ];
    },

    renderHTML({ node, HTMLAttributes }) {
      const title =
        typeof node.attrs.title === "string" && node.attrs.title.trim()
          ? node.attrs.title.trim()
          : "Details";

      return [
        "details",
        mergeAttributes(HTMLAttributes, {
          "data-glyphary-collapse": "true",
          "data-collapse-title": title,
          class: "markdown-collapse",
          ...(node.attrs.defaultOpen ? { open: "true" } : {}),
        }),
        ["summary", { class: "markdown-collapse-summary", contenteditable: "false" }, title],
        ["div", { class: "markdown-collapse-body" }, 0],
      ];
    },

    markdownTokenName: "collapse",

    markdownTokenizer: {
      name: "collapse",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*collapse(?:[^\n\r]*)?$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "collapse", collapseContainerOpening(src), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const collapseToken = token as MarkdownToken & {
        title?: unknown;
        defaultOpen?: unknown;
      };
      const content = helpers.parseBlockChildren
        ? helpers.parseBlockChildren(token.tokens ?? [])
        : helpers.parseChildren(token.tokens ?? []);

      return helpers.createNode(
        "collapse",
        {
          title: typeof collapseToken.title === "string" ? collapseToken.title : "Details",
          defaultOpen: collapseToken.defaultOpen === true,
        },
        content.length ? content : [emptyParagraphNode(helpers)],
      );
    },

    renderMarkdown: (node: JSONContent, helpers) => {
      const attrs = node.attrs ?? {};
      const title = typeof attrs.title === "string" && attrs.title ? attrs.title : "Details";
      const openPart = attrs.defaultOpen === true ? " open" : "";
      const body = helpers.renderChildren(node.content ?? [], "\n\n").trim();

      return `::: collapse "${escapeCalloutTitle(title)}"${openPart}\n${body}\n:::`;
    },

    addNodeView() {
      return ReactNodeViewRenderer(CollapseNodeView);
    },
  });
}

function parseRichLinkMarkdownFields(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .reduce<Record<string, string>>((fields, line) => {
      const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);

      if (!match) {
        return fields;
      }

      const [, key, value] = match;
      fields[key] = value.trim();
      return fields;
    }, {});
}

export function createRichLinkExtension() {
  return Node.create({
    name: "richLink",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        url: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-url") || "",
          renderHTML: () => ({}),
        },
        title: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-title") || "",
          renderHTML: () => ({}),
        },
        description: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-description") || "",
          renderHTML: () => ({}),
        },
        image: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-image") || "",
          renderHTML: () => ({}),
        },
        siteName: {
          default: "",
          parseHTML: (element) => element.getAttribute("data-rich-link-site-name") || "",
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "div[data-glyphary-rich-link]" }];
    },

    renderHTML({ node }) {
      const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
      const title = typeof node.attrs.title === "string" ? node.attrs.title : url;
      const description =
        typeof node.attrs.description === "string" ? node.attrs.description : "";
      const image = typeof node.attrs.image === "string" ? node.attrs.image : "";
      const siteName = typeof node.attrs.siteName === "string" ? node.attrs.siteName : "";

      const content = [
          "div",
          { class: "rich-link-content" },
          siteName ? ["span", { class: "rich-link-site" }, siteName] : ["span", { class: "rich-link-site" }, "Link"],
          ["strong", {}, title || url],
          description ? ["p", {}, description] : ["p", {}, url],
          ["span", { class: "rich-link-url" }, url],
        ];

      return image
        ? [
            "div",
            {
              "data-glyphary-rich-link": "true",
              "data-rich-link-url": url,
              "data-rich-link-title": title,
              "data-rich-link-description": description,
              "data-rich-link-image": image,
              "data-rich-link-site-name": siteName,
              class: "rich-link-card",
              contenteditable: "false",
            },
            content,
            ["img", { class: "rich-link-image", src: image, alt: "" }],
          ]
        : [
            "div",
            {
              "data-glyphary-rich-link": "true",
              "data-rich-link-url": url,
              "data-rich-link-title": title,
              "data-rich-link-description": description,
              "data-rich-link-image": image,
              "data-rich-link-site-name": siteName,
              class: "rich-link-card rich-link-card-no-image",
              contenteditable: "false",
            },
            content,
          ];
    },

    markdownTokenName: "rich-link",

    markdownTokenizer: {
      name: "rich-link",
      level: "block",
      start: (src: string) => src.search(/^:::[^\S\n]*rich-link[^\S\n]*$/m),
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: ContainerMarkdownLexer) =>
        createMarkdownContainerToken(src, "rich-link", namedContainerOpening(src, "rich-link"), lexer),
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const richLinkToken = token as MarkdownToken & { content?: string };
      const fields = parseRichLinkMarkdownFields(richLinkToken.content ?? "");
      const url = fields.url ?? "";

      // A rich-link container without a URL cannot be opened or refreshed, so
      // dropping it is safer than rendering a permanent inert preview card.
      if (!url) {
        return [];
      }

      return helpers.createNode("richLink", {
        url,
        title: fields.title ?? url,
        description: fields.description ?? "",
        image: fields.image ?? "",
        siteName: fields.siteName ?? "",
      });
    },

    renderMarkdown: (node: JSONContent) => {
      const attrs = node.attrs ?? {};
      const url = typeof attrs.url === "string" ? attrs.url : "";

      return richLinkMarkdown({
        url,
        title: typeof attrs.title === "string" ? attrs.title : "",
        description: typeof attrs.description === "string" ? attrs.description : "",
        image: typeof attrs.image === "string" ? attrs.image : "",
        siteName: typeof attrs.siteName === "string" ? attrs.siteName : "",
      });
    },
  });
}
