import { Extension, type Editor } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";

// Responsibilities:
// - Provide Glyphary's local Vim-style editor extension.
// - Keep Normal-mode movement, edit, yank, paste, undo, and redo handling in one place.
// Contracts:
// - The extension only reports status through the supplied callback; app state stays outside this module.
// - The local yank register remains the source of truth when clipboard writes are unavailable.

function isEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed);
}

function isVimNormalMode(editor: Editor) {
  const storage = editor.storage as unknown as {
    glypharyVimMode?: { state?: { mode?: string } };
  };

  return storage.glypharyVimMode?.state?.mode === "normal";
}

function setVimMode(editor: Editor, mode: "insert" | "normal") {
  const storage = editor.storage as unknown as {
    glypharyVimMode?: { state?: { mode?: string } };
  };

  if (storage.glypharyVimMode?.state) {
    storage.glypharyVimMode.state.mode = mode;
  }
}

type VimPendingCommand = {
  key: "c" | "d" | "g" | "y";
  expires: number;
};

type VimCopyBuffer = {
  text: string;
  linewise: boolean;
};

export function createGlypharyVimMode(reportStatus: (message: string) => void) {
  let pendingCommand: VimPendingCommand | null = null;
  let copyBuffer: VimCopyBuffer = { text: "", linewise: false };

  return Extension.create({
    name: "glypharyVimMode",

    // Glyphary owns Vim handling locally instead of delegating to an external
    // keymap. That keeps multi-key commands deterministic and prevents broad
    // Normal-mode catchalls from swallowing the second key in commands like gg.
    priority: 10000,

    addStorage() {
      return {
        state: {
          mode: "insert",
        },
      };
    },

    addProseMirrorPlugins() {
      const pendingIs = (key: VimPendingCommand["key"]) => {
        if (!pendingCommand || pendingCommand.expires <= Date.now()) {
          pendingCommand = null;
          return false;
        }

        return pendingCommand.key === key;
      };

      const waitForNextKey = (key: VimPendingCommand["key"]) => {
        // Multi-key Vim commands are short-lived so an abandoned prefix like
        // `g` does not unexpectedly affect a later unrelated keypress.
        pendingCommand = { key, expires: Date.now() + 700 };
        return true;
      };

      const currentTextblockRange = () => {
        const { $head } = this.editor.state.selection;

        return {
          start: $head.start(),
          end: $head.end(),
          text: $head.parent.textContent,
          offset: $head.parentOffset,
          before: $head.before($head.depth),
          after: $head.after($head.depth),
        };
      };

      const writeCopyBuffer = (buffer: VimCopyBuffer) => {
        copyBuffer = buffer;

        // Keep a local Vim register as the source of truth. The system clipboard
        // write is best-effort because webviews may reject it outside secure or
        // explicitly permissioned clipboard contexts.
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(buffer.text).catch(() => undefined);
        }
      };

      const setSelection = (position: number) => {
        const { state, view } = this.editor;
        const nextPosition = Math.max(0, Math.min(state.doc.content.size, position));

        view.dispatch(
          state.tr
            .setSelection(TextSelection.create(state.doc, nextPosition))
            .scrollIntoView(),
        );
        return true;
      };

      const enterInsertMode = () => {
        setVimMode(this.editor, "insert");
        reportStatus("Vim insert mode");
      };

      const wordRangeAtOrAfterCursor = () => {
        const { start, text, offset } = currentTextblockRange();
        let wordStart = Math.min(offset, text.length);

        while (wordStart < text.length && /\s/.test(text[wordStart])) {
          wordStart += 1;
        }

        if (wordStart >= text.length) {
          return null;
        }

        while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
          wordStart -= 1;
        }

        let wordEnd = wordStart;

        while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
          wordEnd += 1;
        }

        return {
          from: start + wordStart,
          to: start + wordEnd,
          text: text.slice(wordStart, wordEnd),
        };
      };

      const moveBy = (delta: number) => {
        pendingCommand = null;
        return setSelection(this.editor.state.selection.from + delta);
      };

      const moveLine = (direction: -1 | 1) => {
        const { state, view } = this.editor;
        const start = view.coordsAtPos(state.selection.from);
        const lineHeight = parseInt(getComputedStyle(view.dom).lineHeight, 10) || 20;
        // ProseMirror positions are document offsets, not visual rows. Use
        // coordinate mapping for j/k so wrapped lines behave like editor lines.
        const target = view.posAtCoords({
          left: start.left,
          top: start.top + direction * lineHeight,
        });

        pendingCommand = null;

        if (!target) {
          return true;
        }

        return setSelection(target.pos);
      };

      const moveToNextWordStart = () => {
        const { start, text, offset } = currentTextblockRange();
        let nextOffset = Math.min(offset, text.length);

        while (nextOffset < text.length && !/\s/.test(text[nextOffset])) {
          nextOffset += 1;
        }

        while (nextOffset < text.length && /\s/.test(text[nextOffset])) {
          nextOffset += 1;
        }

        pendingCommand = null;
        return setSelection(start + nextOffset);
      };

      const moveToPreviousWordStart = () => {
        const { start, text, offset } = currentTextblockRange();
        let previousOffset = Math.max(0, Math.min(offset - 1, text.length - 1));

        while (previousOffset > 0 && /\s/.test(text[previousOffset])) {
          previousOffset -= 1;
        }

        while (previousOffset > 0 && !/\s/.test(text[previousOffset - 1])) {
          previousOffset -= 1;
        }

        pendingCommand = null;
        return setSelection(start + previousOffset);
      };

      const moveToFileStart = () => {
        const { state, view } = this.editor;

        pendingCommand = null;
        view.dispatch(
          state.tr
            .setSelection(Selection.atStart(state.doc))
            .scrollIntoView(),
        );
        return true;
      };

      const moveToLastTextblock = () => {
        let lastTextblockPosition = 0;

        this.editor.state.doc.descendants((node, position) => {
          if (node.isTextblock) {
            lastTextblockPosition = position + 1;
          }

          return true;
        });

        pendingCommand = null;
        return setSelection(lastTextblockPosition);
      };

      const moveToFirstNonBlank = () => {
        const { start, text } = currentTextblockRange();
        const firstNonBlank = text.search(/\S/);

        pendingCommand = null;
        return setSelection(start + (firstNonBlank === -1 ? 0 : firstNonBlank));
      };

      const moveToMatchingPair = () => {
        const { start, text, offset } = currentTextblockRange();
        const pairs: Record<string, string> = {
          "(": ")",
          "[": "]",
          "{": "}",
        };
        const reversePairs: Record<string, string> = {
          ")": "(",
          "]": "[",
          "}": "{",
        };
        const character = text[offset];

        if (pairs[character]) {
          let depth = 0;

          for (let index = offset; index < text.length; index += 1) {
            if (text[index] === character) {
              depth += 1;
            } else if (text[index] === pairs[character]) {
              depth -= 1;

              if (depth === 0) {
                pendingCommand = null;
                return setSelection(start + index);
              }
            }
          }
        }

        if (reversePairs[character]) {
          let depth = 0;

          for (let index = offset; index >= 0; index -= 1) {
            if (text[index] === character) {
              depth += 1;
            } else if (text[index] === reversePairs[character]) {
              depth -= 1;

              if (depth === 0) {
                pendingCommand = null;
                return setSelection(start + index);
              }
            }
          }
        }

        pendingCommand = null;
        return true;
      };

      const deleteCurrentLine = () => {
        const { state, view } = this.editor;
        const { start, end, text } = currentTextblockRange();
        const transaction = state.tr.delete(start, end);
        const selectionPosition = Math.min(start, transaction.doc.content.size);

        writeCopyBuffer({ text, linewise: true });
        pendingCommand = null;
        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, selectionPosition))
            .scrollIntoView(),
        );
        reportStatus("Yanked and deleted line");
        return true;
      };

      const deleteWordUnderCursor = () => {
        const { state, view } = this.editor;
        const range = wordRangeAtOrAfterCursor();

        pendingCommand = null;

        if (!range) {
          return true;
        }

        const transaction = state.tr.delete(range.from, range.to);

        writeCopyBuffer({ text: range.text, linewise: false });
        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, range.from))
            .scrollIntoView(),
        );
        reportStatus("Deleted word");
        return true;
      };

      const yankCurrentLine = () => {
        writeCopyBuffer({ text: currentTextblockRange().text, linewise: true });
        pendingCommand = null;
        reportStatus("Yanked line");
        return true;
      };

      const yankWordUnderCursor = () => {
        const range = wordRangeAtOrAfterCursor();

        pendingCommand = null;

        if (range) {
          writeCopyBuffer({ text: range.text, linewise: false });
          reportStatus("Yanked word");
        }

        return true;
      };

      const deleteCharacterUnderCursor = () => {
        const { state, view } = this.editor;
        const { end } = currentTextblockRange();
        const from = state.selection.from;
        const to = Math.min(from + 1, end);

        if (from >= to) {
          return true;
        }

        writeCopyBuffer({
          text: state.doc.textBetween(from, to, "\n", "\n"),
          linewise: false,
        });
        const transaction = state.tr.delete(from, to);

        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, from))
            .scrollIntoView(),
        );
        return true;
      };

      const deleteCharacterAndInsert = () => {
        deleteCharacterUnderCursor();
        enterInsertMode();
        return true;
      };

      const deleteLineAndInsert = () => {
        const { state, view } = this.editor;
        const { start, end, text } = currentTextblockRange();
        const transaction = state.tr.delete(start, end);
        const selectionPosition = Math.min(start, transaction.doc.content.size);

        writeCopyBuffer({ text, linewise: true });
        pendingCommand = null;
        view.dispatch(
          transaction
            .setSelection(TextSelection.create(transaction.doc, selectionPosition))
            .scrollIntoView(),
        );
        enterInsertMode();
        return true;
      };

      const changeWordUnderCursor = () => {
        deleteWordUnderCursor();
        enterInsertMode();
        return true;
      };

      const pasteCopyBuffer = (beforeCursor: boolean) => {
        if (!copyBuffer.text) {
          return true;
        }

        if (copyBuffer.linewise) {
          const { state, view } = this.editor;
          const { before, after } = currentTextblockRange();
          const position = beforeCursor ? before : after;
          // The local register stores plain text; inserting it as a paragraph
          // preserves a linewise paste without importing arbitrary HTML/schema
          // content from the system clipboard.
          const paragraph = state.schema.nodes.paragraph.create(
            null,
            copyBuffer.text ? state.schema.text(copyBuffer.text) : undefined,
          );

          view.dispatch(state.tr.insert(position, paragraph).scrollIntoView());
          return true;
        }

        const { state, view } = this.editor;
        const position = beforeCursor
          ? state.selection.from
          : Math.min(state.selection.from + 1, state.doc.content.size);

        view.dispatch(state.tr.insertText(copyBuffer.text, position).scrollIntoView());
        return true;
      };

      const commandForKey = (event: KeyboardEvent) => {
        if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r") {
          return redo(this.editor.state, (transaction) => this.editor.view.dispatch(transaction));
        }

        if (event.ctrlKey || event.metaKey || event.altKey) {
          return false;
        }

        switch (event.key === " " ? "Space" : event.key) {
          case "i":
            enterInsertMode();
            return true;
          case "A":
            setSelection(currentTextblockRange().end);
            enterInsertMode();
            return true;
          case "u":
            pendingCommand = null;
            return undo(this.editor.state, (transaction) => this.editor.view.dispatch(transaction));
          case "0":
            pendingCommand = null;
            return setSelection(currentTextblockRange().start);
          case "$":
            pendingCommand = null;
            return setSelection(currentTextblockRange().end);
          case "^":
            return moveToFirstNonBlank();
          case "Space":
            pendingCommand = null;
            return setSelection(this.editor.state.selection.from + 1);
          case "%":
            return moveToMatchingPair();
          case "h":
            return moveBy(-1);
          case "l":
            return moveBy(1);
          case "j":
            return moveLine(1);
          case "k":
            return moveLine(-1);
          case "G":
            return moveToLastTextblock();
          case "g":
            if (!pendingIs("g")) {
              return waitForNextKey("g");
            }
            // `gg` is implemented explicitly here rather than through a generic
            // movement helper because earlier keymap attempts treated the
            // second `g` as a normal character or end-of-document movement.
            return moveToFileStart();
          case "d":
            if (pendingIs("d")) {
              return deleteCurrentLine();
            }
            return waitForNextKey("d");
          case "c":
            return waitForNextKey("c");
          case "w":
            if (pendingIs("c")) {
              return changeWordUnderCursor();
            }
            if (pendingIs("d")) {
              return deleteWordUnderCursor();
            }
            if (pendingIs("y")) {
              return yankWordUnderCursor();
            }
            return moveToNextWordStart();
          case "b":
            return moveToPreviousWordStart();
          case "x":
            pendingCommand = null;
            return deleteCharacterUnderCursor();
          case "s":
            pendingCommand = null;
            return deleteCharacterAndInsert();
          case "S":
            pendingCommand = null;
            return deleteLineAndInsert();
          case "p":
            pendingCommand = null;
            return pasteCopyBuffer(false);
          case "O":
            pendingCommand = null;
            return pasteCopyBuffer(true);
          case "y":
            if (pendingIs("y")) {
              return yankCurrentLine();
            }
            return waitForNextKey("y");
          default:
            if (event.key.length === 1) {
              return true;
            }
            return false;
        }
      };

      return [
        new Plugin({
          key: new PluginKey("glypharyVimMode"),
          props: {
            handleKeyDown: (_view, event) => {
              if (!isEditorReady(this.editor)) {
                return false;
              }

              if (event.key === "Escape") {
                setVimMode(this.editor, "normal");
                setSelection(this.editor.state.selection.from - 1);
                reportStatus("Vim normal mode");
                event.preventDefault();
                return true;
              }

              if (!isVimNormalMode(this.editor)) {
                return false;
              }

              const handled = commandForKey(event);

              if (!handled) {
                return false;
              }

              event.preventDefault();
              return true;
            },
            handleTextInput: () => {
              return isEditorReady(this.editor) && isVimNormalMode(this.editor);
            },
          },
        }),
      ];
    },
  });
}
