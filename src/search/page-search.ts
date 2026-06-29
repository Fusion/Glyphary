import { useEffect, useMemo, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Responsibilities:
// - Provide in-page editor search matching and decorations.
// - Preserve editor selection visuals while the command palette owns focus.
// Contracts:
// - Empty queries produce no matches.
// - Matches map back to document positions and skip synthetic line separators.

export type PageSearchMatch = {
  from: number;
  to: number;
};

type PageSearchPluginState = {
  activeIndex: number;
  matches: PageSearchMatch[];
};

type CommandPaletteSelectionState = {
  ranges: PageSearchMatch[];
};

export function isEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed);
}

export function pageSearchMatches(targetEditor: Editor | null, query: string): PageSearchMatch[] {
  const needle = query.trim().toLowerCase();

  if (!targetEditor || !needle) {
    return [];
  }

  const chars: string[] = [];
  const positions: number[] = [];

  targetEditor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) {
      return true;
    }

    if (chars.length > 0) {
      chars.push("\n");
      positions.push(-1);
    }

    for (let index = 0; index < node.text.length; index += 1) {
      chars.push(node.text[index]);
      positions.push(position + 1 + index);
    }

    return true;
  });

  const haystack = chars.join("").toLowerCase();
  const matches: PageSearchMatch[] = [];
  let index = haystack.indexOf(needle);

  while (index >= 0) {
    const from = positions[index];
    const endPosition = positions[index + needle.length - 1];

    if (from >= 0 && endPosition >= 0) {
      matches.push({ from, to: endPosition + 1 });
    }

    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }

  return matches;
}

export const pageSearchPluginKey = new PluginKey<PageSearchPluginState>("pageSearch");

export const PageSearchRenderer = Extension.create({
  name: "pageSearchRenderer",

  addProseMirrorPlugins() {
    return [
      new Plugin<PageSearchPluginState>({
        key: pageSearchPluginKey,
        state: {
          init: () => ({ activeIndex: -1, matches: [] }),
          apply(transaction, previous) {
            return transaction.getMeta(pageSearchPluginKey) ?? previous;
          },
        },
        props: {
          decorations(state) {
            const search = pageSearchPluginKey.getState(state);

            if (!search || search.matches.length === 0) {
              return DecorationSet.empty;
            }

            const decorations = search.matches.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class:
                  index === search.activeIndex
                    ? "page-search-match active"
                    : "page-search-match",
              }),
            );

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export const commandPaletteSelectionPluginKey =
  new PluginKey<CommandPaletteSelectionState>("commandPaletteSelection");

export const CommandPaletteSelectionRenderer = Extension.create({
  name: "commandPaletteSelectionRenderer",

  addProseMirrorPlugins() {
    return [
      new Plugin<CommandPaletteSelectionState>({
        key: commandPaletteSelectionPluginKey,
        state: {
          init: () => ({ ranges: [] }),
          apply(transaction, previous) {
            return transaction.getMeta(commandPaletteSelectionPluginKey) ?? previous;
          },
        },
        props: {
          decorations(state) {
            const selection = commandPaletteSelectionPluginKey.getState(state);

            if (!selection || selection.ranges.length === 0) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(
              state.doc,
              selection.ranges.map((range) =>
                Decoration.inline(range.from, range.to, {
                  class: "command-palette-preserved-selection",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

export function usePageSearch({
  activeDocumentIsCanvas,
  editor,
  markdown,
  primaryEditor,
  secondaryEditor,
  setStatus,
}: {
  activeDocumentIsCanvas: boolean;
  editor: Editor | null;
  markdown: string;
  primaryEditor: Editor | null;
  secondaryEditor: Editor | null;
  setStatus: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const results = useMemo(() => pageSearchMatches(editor, query), [editor, query, markdown]);
  const activeIndex = results.length > 0 ? Math.min(index, results.length - 1) : -1;

  function selectMatch(nextIndex: number) {
    if (results.length === 0) {
      return;
    }

    setIndex((nextIndex + results.length) % results.length);
  }

  function openSearch() {
    if (!editor || activeDocumentIsCanvas) {
      setStatus("Open a note before searching in page");
      return;
    }

    setOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function closeSearch() {
    setOpen(false);
    setQuery("");
    setIndex(0);
    editor?.commands.focus();
  }

  function move(direction: 1 | -1) {
    selectMatch(activeIndex + direction);
  }

  useEffect(() => {
    if (!open || !query.trim()) {
      return;
    }

    if (results.length === 0) {
      setIndex(0);
      return;
    }

    if (activeIndex < 0) {
      setIndex(0);
    }
  }, [activeIndex, open, query, results.length]);

  useEffect(() => {
    [primaryEditor, secondaryEditor].forEach((targetEditor) => {
      if (!isEditorReady(targetEditor)) {
        return;
      }

      const state =
        targetEditor === editor && open
          ? { activeIndex, matches: results }
          : { activeIndex: -1, matches: [] };

      targetEditor.view.dispatch(targetEditor.state.tr.setMeta(pageSearchPluginKey, state));
    });

    if (editor && open && results.length > 0) {
      window.requestAnimationFrame(() => {
        editor.view.dom
          .querySelector(".page-search-match.active")
          ?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    }
  }, [activeIndex, editor, open, primaryEditor, results, secondaryEditor]);

  return {
    activeIndex,
    closeSearch,
    inputRef,
    move,
    open,
    openSearch,
    query,
    results,
    setIndex,
    setQuery,
  };
}

export type PageSearchController = ReturnType<typeof usePageSearch>;
