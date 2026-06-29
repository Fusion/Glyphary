import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { ancestorDepthByName } from "./block-boundary-insertion";
import { imageNodeMarkdown } from "./vault-images";

// Responsibilities:
// - Keep editor command primitives out of App.
// - Limit each command helper to one editor operation.
// Contracts:
// - Helpers are no-ops when the editor or current selection cannot support them.
// - Table alignment restores the text selection instead of leaving a column selected.

export type TableColumnAlignment = "left" | "center" | "right";

export function alignCurrentTableColumn(
  targetEditor: Editor | null,
  alignment: TableColumnAlignment,
) {
  if (!targetEditor) {
    return false;
  }

  const { state, view } = targetEditor;
  const restorePosition = state.selection.from;
  const tableDepth = ancestorDepthByName(state.selection.$from, "table");
  const cellDepth =
    ancestorDepthByName(state.selection.$from, "tableCell") ??
    ancestorDepthByName(state.selection.$from, "tableHeader");

  if (tableDepth === null || cellDepth === null) {
    return false;
  }

  const table = state.selection.$from.node(tableDepth);
  const tableStart = state.selection.$from.start(tableDepth);
  const map = TableMap.get(table);
  const cellOffset = state.selection.$from.before(cellDepth) - tableStart;
  const column = map.colCount(cellOffset);
  const tr = state.tr;

  // Avoid CellSelection here: ProseMirror records it in undo history, so
  // Cmd+Z would restore a visible whole-column selection after undoing align.
  for (const cellPosition of map.cellsInRect({
    left: column,
    right: column + 1,
    top: 0,
    bottom: map.height,
  })) {
    const cell = table.nodeAt(cellPosition);

    if (cell && cell.attrs.align !== alignment) {
      tr.setNodeMarkup(tableStart + cellPosition, undefined, {
        ...cell.attrs,
        align: alignment,
      });
    }
  }

  if (!tr.docChanged) {
    return false;
  }

  tr.setSelection(TextSelection.create(tr.doc, restorePosition));
  view.dispatch(tr);
  view.focus();
  return true;
}

export function insertMarkdownAtCursor(editor: Editor | null, content: string) {
  if (!editor || !content.trim()) {
    return false;
  }

  editor.chain().focus().insertContent(content, { contentType: "markdown" }).run();
  return true;
}

export function formatSelectionWithMark(
  editor: Editor | null,
  markType: string,
  label: string,
  setStatus: (message: string) => void,
) {
  if (!editor) {
    return false;
  }

  const { doc, selection } = editor.state;

  if (selection.empty) {
    setStatus(`Select text before formatting it as ${label}`);
    return false;
  }

  const selectedText = doc.textBetween(selection.from, selection.to, "\n", "\n");

  editor
    .chain()
    .focus()
    .insertContent({
      type: "text",
      text: selectedText,
      marks: [{ type: markType }],
    })
    .run();
  return true;
}

export function selectedGalleryImages(targetEditor: Editor) {
  const { doc, selection } = targetEditor.state;
  const images: string[] = [];
  let from = selection.from;
  let to = selection.to;

  // The command should behave like a layout operation over the current
  // selection. Expanding the replacement range to whole image nodes avoids
  // leaving behind atom boundaries when the user selects by drag.
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type.name !== "image") {
      return true;
    }

    images.push(imageNodeMarkdown(node));
    from = Math.min(from, pos);
    to = Math.max(to, pos + node.nodeSize);
    return false;
  });

  return { images, from, to };
}

export function currentSelectionText(editor: Editor | null) {
  if (!editor) {
    return "";
  }

  const { state } = editor;

  return state.doc.textBetween(state.selection.from, state.selection.to, "\n", "\n");
}

export function currentCursorContext(editor: Editor | null) {
  if (!editor) {
    return "";
  }

  const { doc, selection } = editor.state;
  const before = doc.textBetween(0, selection.from, "\n", "\n").trimEnd();
  const after = doc.textBetween(selection.to, doc.content.size, "\n", "\n").trimStart();

  // The backend transform only sees a string, so cursor-sensitive commands
  // receive an explicit boundary marker instead of relying on editor state.
  return [
    "Text before cursor:",
    before || "(empty)",
    "",
    "[[CURSOR]]",
    "",
    "Text after cursor:",
    after || "(empty)",
  ].join("\n");
}
