import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { VaultIndexedFile } from "../lib/app-types";

// Responsibilities:
// - Render Obsidian-style wikilinks as inline decorations.
// - Open the wikilink search after typing a double left bracket.
// Contracts:
// - Vault filename indexing and navigation stay app-owned through callbacks.
// - The active line keeps raw [[target|alias]] syntax editable; inactive lines hide syntax.

export function wikiLinkTargetFromMarkup(value: string) {
  return value.split("|")[0]?.split("#")[0]?.trim() ?? "";
}

export type WikiLinkResolution = {
  candidates: VaultIndexedFile[];
};

type WikiLinkExtensionOptions = {
  openSearch: () => void;
  resolveTarget: (target: string) => WikiLinkResolution;
};

const wikiLinkTokenPattern = /\[\[([^\]\n]+)\]\]/g;

export function createWikiLinkExtension(options: WikiLinkExtensionOptions) {
  return Extension.create({
    name: "glypharyWikilinks",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("glypharyWikilinks"),
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = [];

              state.doc.descendants((node, position, parent) => {
                if (!node.isText || !node.text || parent?.type.spec.code) {
                  return true;
                }

                for (const match of node.text.matchAll(wikiLinkTokenPattern)) {
                  const markup = match[1] ?? "";
                  const target = wikiLinkTargetFromMarkup(markup);

                  if (!target) {
                    continue;
                  }

                  const from = position + match.index;
                  const to = from + match[0].length;
                  const candidates = options.resolveTarget(target).candidates;
                  const stateClass =
                    candidates.length === 0
                      ? "missing"
                      : candidates.length === 1
                        ? "resolved"
                        : "ambiguous";

                  decorations.push(
                    Decoration.inline(from, to, {
                      class: `wikilink wikilink-${stateClass}`,
                      "data-wikilink-target": target,
                      title:
                        candidates.length === 0
                          ? "No matching note"
                          : candidates.length === 1
                            ? candidates[0].relativePath
                            : `${candidates.length} matching notes`,
                    }),
                  );

                  if (state.selection.$from.parent !== parent) {
                    decorations.push(
                      Decoration.inline(from, from + 2, { class: "wikilink-hidden-syntax" }),
                      Decoration.inline(to - 2, to, { class: "wikilink-hidden-syntax" }),
                    );

                    const pipeIndex = markup.indexOf("|");

                    if (pipeIndex >= 0) {
                      // Obsidian-style aliases display only the alias outside
                      // the active line: [[Actual Page|Shown Text]] -> Shown Text.
                      decorations.push(
                        Decoration.inline(from + 2, from + 2 + pipeIndex + 1, {
                          class: "wikilink-hidden-syntax",
                        }),
                      );
                    }
                  }
                }

                return true;
              });

              return DecorationSet.create(state.doc, decorations);
            },
            handleTextInput: (view, from, _to, text) => {
              if (text !== "[") {
                return false;
              }

              if (view.state.doc.textBetween(Math.max(0, from - 1), from) !== "[") {
                return false;
              }

              window.setTimeout(options.openSearch, 0);
              return false;
            },
          },
        }),
      ];
    },
  });
}
