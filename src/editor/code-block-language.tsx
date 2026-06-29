import type { NodeViewProps } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { codeBlockContainsSelection } from "./code-block-renderers";

// Responsibilities:
// - Render the active fenced code block language control inside the block.
// - Keep Tab indentation behavior scoped to code blocks.
// Contracts:
// - Fenced Markdown remains a normal CodeBlockLowlight node with language attrs.
// - The TOC renderer hides the language input by using the existing toc language marker.

function codeBlockDecorationsContainLanguageControl(
  decorations: NodeViewProps["decorations"],
) {
  return decorations.some((decoration) => {
    const className = decoration.type.attrs.class;

    return (
      typeof className === "string" &&
      className.split(/\s+/).includes("code-block-language-active")
    );
  });
}

function codeBlockDecorationClassNames(decorations: NodeViewProps["decorations"]) {
  return decorations
    .map((decoration) => decoration.type.attrs.class)
    .filter((className): className is string => typeof className === "string");
}

function CodeBlockNodeView({ decorations, node, updateAttributes }: NodeViewProps) {
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const isLanguageControlActive = codeBlockDecorationsContainLanguageControl(decorations);
  const isRenderedTableOfContents = language === "toc";
  const className = [
    "code-block-node",
    isLanguageControlActive ? "active" : "",
    ...codeBlockDecorationClassNames(decorations),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <NodeViewWrapper className={className}>
      {!isRenderedTableOfContents ? (
        <label className="code-block-language-control" contentEditable={false}>
          <span>Lang</span>
          <input
            aria-label="Code block language"
            list="code-language-options"
            onChange={(event) => updateAttributes({ language: event.currentTarget.value })}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder="plain"
            spellCheck={false}
            value={language}
          />
        </label>
      ) : null}
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

// Code block language is a property of the block being edited, not global
// toolbar state. Rendering it as a node view keeps the control local to the
// current block while Markdown still round-trips through the normal fence attrs.
export const CodeBlockWithLanguageControl = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    const codeBlockName = this.name;

    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("codeBlockLanguageControl"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, position) => {
              if (node.type.name !== codeBlockName) {
                return true;
              }

              if (codeBlockContainsSelection(state.selection, position, node.nodeSize)) {
                decorations.push(
                  Decoration.node(position, position + node.nodeSize, {
                    class: "code-block-language-active",
                  }),
                );
              }

              return false;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        if (!this.editor.isActive(this.name)) {
          return false;
        }

        return this.editor.commands.insertContent("    ");
      },
      "Shift-Tab": () => this.editor.isActive(this.name),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView, {
      update: ({ updateProps }) => {
        updateProps();
        return true;
      },
    });
  },
});
