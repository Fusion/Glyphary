import { mergeAttributes, Node } from "@tiptap/core";
import type { JSONContent, MarkdownToken } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  cleanVaultAssetReference,
  escapeMarkdownImageText,
  escapeMarkdownUrl,
} from "../lib/paths";

// Responsibilities:
// - Own vault image Markdown parsing/rendering for the editor.
// Contracts:
// - Obsidian-style `![[asset]]` round-trips as vault syntax.
// - Normal Markdown images keep safe local asset references when possible.
// - Remote YouTube image URLs render as thumbnails without rewriting Markdown.

export function createVaultImageExtension(
  resolveVaultImageSrc: (target: string) => string,
  resolveVaultAssetSrc: (target: string) => string,
) {
  return Node.create({
    name: "image",
    priority: 1000,
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        src: {
          default: "",
        },
        alt: {
          default: "",
        },
        title: {
          default: null,
        },
        vaultTarget: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-vault-target"),
          renderHTML: (attrs) =>
            attrs.vaultTarget ? { "data-vault-target": attrs.vaultTarget } : {},
        },
        assetReference: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-asset-reference"),
          renderHTML: (attrs) =>
            attrs.assetReference ? { "data-asset-reference": attrs.assetReference } : {},
        },
        remoteSource: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-remote-source"),
          renderHTML: (attrs) =>
            attrs.remoteSource ? { "data-remote-source": attrs.remoteSource } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: "img[src]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["img", mergeAttributes(HTMLAttributes)];
    },

    markdownTokenName: "image",

    markdownTokenizer: {
      name: "vaultImage",
      level: "inline",
      start: (src: string) => src.indexOf("![["),
      tokenize: (src: string) => {
        const match = src.match(/^!\[\[([^\]\n]+)\]\]/);

        if (!match) {
          return undefined;
        }

        const vaultTarget = cleanVaultAssetReference(match[1]);

        if (!vaultTarget) {
          return undefined;
        }

        return {
          type: "image",
          raw: match[0],
          href: resolveVaultAssetSrc(vaultTarget),
          text: vaultTarget,
          title: null,
          vaultTarget,
        };
      },
    },

    parseMarkdown: (token: MarkdownToken, helpers) => {
      const vaultTarget = token.vaultTarget
        ? cleanVaultAssetReference(String(token.vaultTarget))
        : null;
      const href = String(token.href ?? token.src ?? "");
      const assetReference = !vaultTarget ? cleanVaultAssetReference(href) : null;
      const remoteSource = !vaultTarget && !assetReference ? href : null;
      const src = vaultTarget
        ? resolveVaultImageSrc(vaultTarget)
        : assetReference
          ? resolveVaultAssetSrc(assetReference)
          : youtubeThumbnailUrl(href) ?? href;

      if (!src && !vaultTarget && !assetReference) {
        return [];
      }

      return helpers.createNode("image", {
        src,
        alt: String(token.text ?? token.alt ?? vaultTarget ?? ""),
        title: token.title ?? null,
        vaultTarget,
        assetReference,
        remoteSource,
      });
    },

    renderMarkdown: (node: JSONContent) => imageNodeMarkdownAttrs(node.attrs ?? {}),
  });
}

function imageNodeMarkdownAttrs(attrs: Record<string, unknown>) {
  const vaultTarget =
    typeof attrs.vaultTarget === "string"
      ? cleanVaultAssetReference(attrs.vaultTarget)
      : null;

  if (vaultTarget) {
    return `![[${vaultTarget}]]`;
  }

  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  const assetReference =
    typeof attrs.assetReference === "string"
      ? cleanVaultAssetReference(attrs.assetReference)
      : null;
  const remoteSource = typeof attrs.remoteSource === "string" ? attrs.remoteSource : "";
  const src =
    assetReference ?? (remoteSource || (typeof attrs.src === "string" ? attrs.src : ""));
  const title = typeof attrs.title === "string" ? attrs.title : "";
  const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";

  return `![${escapeMarkdownImageText(alt)}](${escapeMarkdownUrl(src)}${titlePart})`;
}

export function imageNodeMarkdown(node: ProseMirrorNode) {
  return imageNodeMarkdownAttrs(node.attrs ?? {});
}

function youtubeThumbnailUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      videoId =
        url.searchParams.get("v") ??
        (url.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/)?.[1] || "");
    }

    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}
