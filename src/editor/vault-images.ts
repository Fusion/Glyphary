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
          renderHTML: () => ({}),
        },
        assetReference: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-asset-reference"),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "img[src]" }];
    },

    renderHTML({ HTMLAttributes }) {
      const { vaultTarget, ...renderedAttributes } = HTMLAttributes;

      // vaultTarget is an editor-only marker used to round-trip ![[asset]]
      // syntax. It must not leak into the rendered DOM; src already points to
      // the Tauri asset URL that the webview can display.
      return ["img", mergeAttributes(renderedAttributes)];
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
      const src = vaultTarget
        ? resolveVaultImageSrc(vaultTarget)
        : assetReference
          ? resolveVaultAssetSrc(assetReference)
          : href;

      if (!src && !vaultTarget && !assetReference) {
        return [];
      }

      return helpers.createNode("image", {
        src,
        alt: String(token.text ?? token.alt ?? vaultTarget ?? ""),
        title: token.title ?? null,
        vaultTarget,
        assetReference,
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
  const src = assetReference ?? (typeof attrs.src === "string" ? attrs.src : "");
  const title = typeof attrs.title === "string" ? attrs.title : "";
  const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : "";

  return `![${escapeMarkdownImageText(alt)}](${escapeMarkdownUrl(src)}${titlePart})`;
}

export function imageNodeMarkdown(node: ProseMirrorNode) {
  return imageNodeMarkdownAttrs(node.attrs ?? {});
}
