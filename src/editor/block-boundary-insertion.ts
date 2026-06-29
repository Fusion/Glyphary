import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { isAiBuilderMarkerComment } from "./markdown-extensions";

// Responsibilities:
// - Provide insertion affordances around widget-like top-level editor blocks.
// - Handle gap-cursor movement around tables and selected block nodes.
// Contracts:
// - Decorations are UI only; insertion creates real paragraphs only after explicit user action.
// - AI Builder marker comments stay hidden anchors and never receive boundary controls.

const RuntimeGapCursor = GapCursor as typeof GapCursor & {
  valid: (position: ResolvedPos) => boolean;
};

export function ancestorDepthByName($position: ResolvedPos, nodeName: string) {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name === nodeName) {
      return depth;
    }
  }

  return null;
}

function moveGapCursorTo(view: EditorView, position: number) {
  const resolvedPosition = view.state.doc.resolve(position);

  if (!RuntimeGapCursor.valid(resolvedPosition)) {
    return false;
  }

  view.dispatch(
    view.state.tr.setSelection(new GapCursor(resolvedPosition)).scrollIntoView(),
  );

  return true;
}

function insertParagraphAtGapCursor(view: EditorView) {
  const { selection, schema } = view.state;

  if (!(selection instanceof GapCursor)) {
    return false;
  }

  const paragraph = schema.nodes.paragraph?.createAndFill();

  if (!paragraph) {
    return false;
  }

  const transaction = view.state.tr.insert(selection.from, paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc, selection.from + 1));
  view.dispatch(transaction.scrollIntoView());

  return true;
}

function insertParagraphAtPosition(view: EditorView, position: number) {
  const paragraph = view.state.schema.nodes.paragraph?.createAndFill();

  if (!paragraph) {
    return false;
  }

  const transaction = view.state.tr.insert(position, paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc, position + 1));
  view.dispatch(transaction.scrollIntoView());
  view.focus();

  return true;
}

const blockBoundaryInsertNodeNames = new Set([
  "table",
  "htmlBlock",
  "richLink",
  "excalidrawEmbed",
  "gallery",
]);

function supportsBlockBoundaryInsert(node: ProseMirrorNode) {
  // AI Builder markers are stored as hidden HTML comments so follow-up prompts
  // can replace generated regions. They are anchors, not visible widgets, so
  // they must not receive the margin + insertion controls.
  if (
    node.type.name === "htmlBlock" &&
    typeof node.attrs.rawHtml === "string" &&
    isAiBuilderMarkerComment(node.attrs.rawHtml)
  ) {
    return false;
  }

  return blockBoundaryInsertNodeNames.has(node.type.name);
}

function selectedTopLevelWidgetBlock(view: EditorView) {
  const { selection } = view.state;

  // The insertion affordance is intentionally limited to special, widget-like
  // blocks. Plain Markdown text already has natural caret positions; showing a
  // structural + there would add visual noise without solving an editing gap.
  if (selection instanceof NodeSelection && supportsBlockBoundaryInsert(selection.node)) {
    return {
      from: selection.from,
      to: selection.to,
      node: selection.node,
    };
  }

  if (selection.$from.depth === 0) {
    return null;
  }

  const node = selection.$from.node(1);

  // Table cells and custom node views can hold an inner text selection while
  // still behaving like one top-level widget for surrounding block insertion.
  // Scope controls to that containing block so only the active block gets them.
  if (!supportsBlockBoundaryInsert(node)) {
    return null;
  }

  return {
    from: selection.$from.before(1),
    to: selection.$from.after(1),
    node,
  };
}

function blockBoundaryInsertWidget(position: number, side: -1 | 1) {
  // Use a decoration instead of permanent document content. The + is a small
  // hit target for a precise boundary insertion, not a Markdown node.
  return Decoration.widget(
    position,
    (targetView, getPosition) => {
      const wrapper = document.createElement("div");
      wrapper.className = "block-boundary-insert";
      wrapper.contentEditable = "false";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "block-boundary-insert-button";
      button.setAttribute("aria-label", "Insert paragraph between blocks");
      button.title = "Insert paragraph";
      button.textContent = "+";
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentPosition = getPosition();

        if (typeof currentPosition === "number") {
          insertParagraphAtPosition(targetView, currentPosition);
        }
      });

      wrapper.append(button);

      return wrapper;
    },
    {
      key: `block-boundary-insert-${position}-${side}`,
      side,
      stopEvent: () => true,
    },
  );
}

function blockBoundaryInsertDecorations(view: EditorView) {
  const selectedBlock = selectedTopLevelWidgetBlock(view);

  if (!selectedBlock) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(view.state.doc, [
    blockBoundaryInsertWidget(selectedBlock.from, -1),
    blockBoundaryInsertWidget(selectedBlock.to, 1),
  ]);
}

function moveGapCursorAfterTableBoundary(view: EditorView) {
  const { state } = view;

  if (!state.selection.empty || !view.endOfTextblock("down")) {
    return false;
  }

  const { $head } = state.selection;
  const tableDepth = ancestorDepthByName($head, "table");
  const rowDepth = ancestorDepthByName($head, "tableRow");

  if (tableDepth === null || rowDepth === null) {
    return false;
  }

  const tableNode = $head.node(tableDepth);
  const rowIndex = $head.index(tableDepth);

  if (rowIndex !== tableNode.childCount - 1) {
    return false;
  }

  const afterTable = $head.after(tableDepth);
  const nodeAfterTable = state.doc.resolve(afterTable).nodeAfter;

  // If a normal paragraph already follows the table, native navigation has a
  // real caret destination. For adjacent block widgets, move to a gap cursor so
  // the insertion point is visible without mutating the Markdown source.
  if (!nodeAfterTable || nodeAfterTable.isTextblock) {
    return false;
  }

  return moveGapCursorTo(view, afterTable);
}

function moveGapCursorBeforeSelectedBlock(view: EditorView) {
  const { selection } = view.state;

  if (!(selection instanceof NodeSelection) || selection.node.isTextblock) {
    return false;
  }

  return moveGapCursorTo(view, selection.from);
}

function moveGapCursorAfterSelectedBlock(view: EditorView) {
  const { selection } = view.state;

  if (!(selection instanceof NodeSelection) || selection.node.isTextblock) {
    return false;
  }

  const afterSelectedBlock = selection.to;
  const nodeAfterSelectedBlock = view.state.doc.resolve(afterSelectedBlock).nodeAfter;

  if (!nodeAfterSelectedBlock || nodeAfterSelectedBlock.isTextblock) {
    return false;
  }

  return moveGapCursorTo(view, afterSelectedBlock);
}

export function createBlockBoundaryInsertionExtension() {
  return Extension.create({
    name: "glypharyBlockBoundaryInsertion",
    priority: 10000,

    addKeyboardShortcuts() {
      return {
        Enter: () =>
          insertParagraphAtGapCursor(this.editor.view) ||
          moveGapCursorBeforeSelectedBlock(this.editor.view),
        ArrowDown: () =>
          moveGapCursorAfterTableBoundary(this.editor.view) ||
          moveGapCursorAfterSelectedBlock(this.editor.view),
        ArrowUp: () => moveGapCursorBeforeSelectedBlock(this.editor.view),
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("glypharyBlockBoundaryInsertAffordance"),
          props: {
            decorations: (_state) => blockBoundaryInsertDecorations(this.editor.view),
          },
        }),
      ];
    },
  });
}
