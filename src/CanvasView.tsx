/**
 * Obsidian / JSON Canvas viewer for Glyphary.
 *
 * Responsibilities:
 * - Parse `.canvas` JSON into a React Flow graph.
 * - Render JSON Canvas node kinds (`text`, `file`, `link`, `group`) with
 *   Glyphary styling while preserving the original file as the source of truth.
 * - Load vault Markdown previews for file nodes without mounting full editors.
 * - Own React Flow interaction state; the JSON Canvas format and serialization
 *   rules live in `src/lib/canvas.ts`.
 *
 * Contracts:
 * - The writer preserves unknown node, edge, and document-level fields because
 *   Obsidian and plugins may store data Glyphary does not understand.
 * - File-node Markdown previews are bounded so large canvases do not mount many
 *   full document renderers at once.
 * - Unknown JSON Canvas fields are tolerated and ignored by the viewer, not
 *   treated as parse failures.
 */

import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  ConnectionMode,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import type { CanvasEdgeStyle, CanvasSettings, VaultEntry } from "./lib/app-types.js";
import {
  CanvasDialogs,
  type CanvasFlowPosition,
  type CanvasPromptDialogState,
  type CanvasVaultPickerDialogState,
} from "./canvas/CanvasDialogs.js";
import { canvasNodeTypes, type CanvasNodeData } from "./canvas/CanvasNodes.js";
import {
  canvasSideHandleId,
  canvasSnapGridSize,
  canvasVaultRootDirectory,
  createCanvasEdgeId,
  createCanvasNodeId,
  defaultCanvasGroupHeight,
  defaultCanvasGroupWidth,
  defaultCanvasNodeHeight,
  defaultCanvasNodeWidth,
  isSupportedCanvasNode,
  obsidianCanvasColors,
  parseCanvasDocument,
  serializeCanvasDocument,
  type JsonCanvasNode,
} from "./lib/canvas.js";
import { defaultCanvasSettings, normalizeCanvasSettings } from "./lib/settings.js";

export { canvasTitle, isCanvasPath } from "./lib/canvas.js";

type CanvasContextMenuState = CanvasFlowPosition & {
  x: number;
  y: number;
};

type CanvasNodeContextMenuState = {
  x: number;
  y: number;
  nodeId: string;
};

export type CanvasCommandAction = "card" | "note" | "media" | "web" | "group";

export type CanvasCommandRequest = {
  id: number;
  action: CanvasCommandAction;
};

const canvasEdgeMarker = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
};

function canvasFlowEdgeType(style: CanvasEdgeStyle) {
  if (style === "straight") {
    return "straight";
  }

  if (style === "stepped") {
    return "smoothstep";
  }

  return "default";
}

function CanvasGraph({
  content,
  name,
  vaultRoot,
  settings,
  commandRequest,
  onOpenFile,
  onChange,
}: {
  content: string;
  name: string;
  vaultRoot: string;
  settings: CanvasSettings;
  commandRequest?: CanvasCommandRequest | null;
  onOpenFile: (relativePath: string) => void;
  onChange: (content: string) => void;
}) {
  const reactFlow = useReactFlow<Node<CanvasNodeData>, Edge>();
  const canvasElementRef = useRef<HTMLElement | null>(null);
  const lastContextMenuOpenedAtRef = useRef(0);
  const handledCommandRequestIdRef = useRef<number | null>(null);
  const parsed = useMemo(() => {
    try {
      return { canvas: parseCanvasDocument(content), error: "" };
    } catch (error) {
      return {
        canvas: { nodes: [], edges: [] },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [content]);
  const parsedNodes = useMemo<Array<Node<CanvasNodeData>>>(() => {
    return (parsed.canvas.nodes ?? [])
      .filter(
        (node) =>
          isSupportedCanvasNode(node) &&
          node.id &&
          typeof node.x === "number" &&
          typeof node.y === "number",
      )
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: { x: node.x, y: node.y },
        // Obsidian groups behave like visual regions. Keeping them behind and
        // non-draggable avoids accidentally moving every node they visually wrap.
        draggable: node.type !== "group",
        connectable: node.type !== "group",
        selectable: node.type !== "group",
        focusable: false,
        zIndex: node.type === "group" ? 0 : 1,
        data: {
          label: node.label ?? node.file ?? node.url ?? node.type,
          text: node.text,
          file: node.file,
          url: node.url,
          color: node.color,
          vaultRoot,
          onOpenFile,
        },
        style: {
          width: node.width,
          height: node.height,
        },
      }));
  }, [onOpenFile, parsed.canvas.nodes, vaultRoot]);
  const parsedEdges = useMemo<Edge[]>(() => {
    const edgeType = canvasFlowEdgeType(settings.edgeStyle);

    return (parsed.canvas.edges ?? []).map((edge) => ({
      id: edge.id,
      source: edge.fromNode,
      target: edge.toNode,
      sourceHandle: canvasSideHandleId(edge.fromSide, "right"),
      targetHandle: canvasSideHandleId(edge.toSide, "left"),
      label: edge.label,
      markerEnd: canvasEdgeMarker,
      style: {
        ...(edge.color ? { stroke: edge.color } : {}),
        strokeWidth: settings.edgeThickness,
      },
      labelStyle: edge.color ? { fill: edge.color } : undefined,
      type: edgeType,
    }));
  }, [parsed.canvas.edges, settings.edgeStyle, settings.edgeThickness]);
  const [nodes, setNodes] = useState(parsedNodes);
  const [edges, setEdges] = useState(parsedEdges);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<CanvasNodeContextMenuState | null>(null);
  const [promptDialog, setPromptDialog] = useState<CanvasPromptDialogState | null>(null);
  const [vaultPickerDialog, setVaultPickerDialog] = useState<CanvasVaultPickerDialogState | null>(
    null,
  );

  useEffect(() => {
    setNodes(parsedNodes);
    setEditingCardId(null);
  }, [parsedNodes]);

  useEffect(() => {
    setEdges(parsedEdges);
  }, [parsedEdges]);

  const emitCanvasChange = useCallback(
    (nextNodes: Array<Node<CanvasNodeData>>, nextEdges: Edge[]) => {
      onChange(serializeCanvasDocument(parsed.canvas, nextNodes, nextEdges));
    },
    [onChange, parsed.canvas],
  );
  const handleNodesChange = useCallback(
    (changes: Array<NodeChange<Node<CanvasNodeData>>>) => {
      const removedNodeIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);

      setNodes((currentNodes) => {
        const nextNodes = applyNodeChanges(changes, currentNodes);

        if (removedNodeIds.length === 0) {
          return nextNodes;
        }

        const removed = new Set(removedNodeIds);

        setEdges((currentEdges) => {
          // JSON Canvas edges reference nodes by id, so deleting a node must
          // remove every attached edge in the same serialized update.
          const nextEdges = currentEdges.filter(
            (edge) => !removed.has(edge.source) && !removed.has(edge.target),
          );

          emitCanvasChange(nextNodes, nextEdges);

          return nextEdges;
        });

        return nextNodes;
      });
    },
    [emitCanvasChange],
  );
  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, draggedNode: Node<CanvasNodeData>) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          node.id === draggedNode.id
            ? {
                ...node,
                position: draggedNode.position,
              }
            : node,
        );

        emitCanvasChange(nextNodes, edges);

        return nextNodes;
      });
    },
    [edges, emitCanvasChange],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((currentEdges) => {
        const nextEdges = applyEdgeChanges(changes, currentEdges);

        if (changes.some((change) => change.type === "remove")) {
          emitCanvasChange(nodes, nextEdges);
        }

        return nextEdges;
      });
    },
    [emitCanvasChange, nodes],
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        const edge: Edge = {
          ...connection,
          id: createCanvasEdgeId(connection.source, connection.target),
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          markerEnd: canvasEdgeMarker,
          style: { strokeWidth: settings.edgeThickness },
          type: canvasFlowEdgeType(settings.edgeStyle),
        };
        const nextEdges = addEdge(edge, currentEdges);

        emitCanvasChange(nodes, nextEdges);

        return nextEdges;
      });
    },
    [emitCanvasChange, nodes, settings.edgeStyle, settings.edgeThickness],
  );
  const addCanvasNode = useCallback(
    (node: Node<CanvasNodeData>) => {
      setNodes((currentNodes) => {
        const nextNodes = [...currentNodes, node];

        emitCanvasChange(nextNodes, edges);

        return nextNodes;
      });
    },
    [edges, emitCanvasChange],
  );
  const deleteCanvasNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.filter((node) => node.id !== nodeId);

        setEdges((currentEdges) => {
          const nextEdges = currentEdges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
          );

          emitCanvasChange(nextNodes, nextEdges);

          return nextEdges;
        });

        return nextNodes;
      });
      setEditingCardId((currentId) => (currentId === nodeId ? null : currentId));
    },
    [emitCanvasChange],
  );
  const setCanvasNodeColor = useCallback(
    (nodeId: string, color: string | undefined) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  color,
                },
              }
            : node,
        );

        emitCanvasChange(nextNodes, edges);

        return nextNodes;
      });
    },
    [edges, emitCanvasChange],
  );
  const cancelCanvasTextEdit = useCallback(() => setEditingCardId(null), []);
  const commitCanvasTextEdit = useCallback(
    (nodeId: string, text: string) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  text,
                },
              }
            : node,
        );

        emitCanvasChange(nextNodes, edges);

        return nextNodes;
      });
      setEditingCardId(null);
    },
    [edges, emitCanvasChange],
  );
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.type === "text"
          ? {
              ...node,
              data: {
                ...node.data,
                isEditing: node.id === editingCardId,
                onCancelTextEdit: cancelCanvasTextEdit,
                onCommitText: commitCanvasTextEdit,
              },
            }
          : node,
      ),
    [cancelCanvasTextEdit, commitCanvasTextEdit, editingCardId, nodes],
  );
  const createFlowNode = useCallback(
    (
      type: JsonCanvasNode["type"],
      position: Pick<CanvasContextMenuState, "flowX" | "flowY">,
      data: Partial<CanvasNodeData>,
    ): Node<CanvasNodeData> => {
      const isGroup = type === "group";

      return {
        id: createCanvasNodeId(type),
        type,
        position: { x: Math.round(position.flowX), y: Math.round(position.flowY) },
        draggable: !isGroup,
        connectable: !isGroup,
        selectable: !isGroup,
        focusable: false,
        zIndex: isGroup ? 0 : 1,
        data: {
          label: data.label ?? type,
          text: data.text,
          file: data.file,
          url: data.url,
          color: data.color,
          vaultRoot,
          onOpenFile,
        },
        style: {
          width: isGroup ? defaultCanvasGroupWidth : defaultCanvasNodeWidth,
          height: isGroup ? defaultCanvasGroupHeight : defaultCanvasNodeHeight,
        },
      };
    },
    [onOpenFile, vaultRoot],
  );
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setNodeContextMenu(null);
  }, []);
  const closeCanvasDialog = useCallback(() => {
    setPromptDialog(null);
    setVaultPickerDialog(null);
  }, []);
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const canvasBounds = canvasElementRef.current?.getBoundingClientRect();

      lastContextMenuOpenedAtRef.current = Date.now();
      setNodeContextMenu(null);
      setContextMenu({
        // The menu is rendered inside the canvas element, so screen coordinates
        // need to be converted to canvas-local coordinates to avoid drift when
        // the editor is inside transformed or inset app chrome.
        x: event.clientX - (canvasBounds?.left ?? 0),
        y: event.clientY - (canvasBounds?.top ?? 0),
        flowX: position.x,
        flowY: position.y,
      });
    },
    [reactFlow],
  );
  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      event.stopPropagation();

      const canvasBounds = canvasElementRef.current?.getBoundingClientRect();

      lastContextMenuOpenedAtRef.current = Date.now();
      setContextMenu(null);
      setNodeContextMenu({
        x: event.clientX - (canvasBounds?.left ?? 0),
        y: event.clientY - (canvasBounds?.top ?? 0),
        nodeId: node.id,
      });
    },
    [],
  );
  const runCanvasNodeMenuAction = useCallback(
    (action: "delete" | "color", color?: string) => {
      if (!nodeContextMenu) {
        return;
      }

      const nodeId = nodeContextMenu.nodeId;

      closeContextMenu();

      if (action === "delete") {
        deleteCanvasNode(nodeId);
        return;
      }

      setCanvasNodeColor(nodeId, color);
    },
    [closeContextMenu, deleteCanvasNode, nodeContextMenu, setCanvasNodeColor],
  );
  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      // React Flow can emit a pane click immediately after the contextmenu
      // gesture. Ignore that synthetic tail so right-click-release leaves the
      // newly opened menu available for selection.
      if (Date.now() - lastContextMenuOpenedAtRef.current < 350) {
        return;
      }

      if (event.button === 0) {
        closeContextMenu();
      }
    },
    [closeContextMenu],
  );
  const handleNodeDoubleClick = useCallback(
    (event: ReactMouseEvent, node: Node<CanvasNodeData>) => {
      if (node.type !== "text") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
      setEditingCardId(node.id);
    },
    [closeContextMenu],
  );
  const centeredCanvasPosition = useCallback(() => {
    const bounds = canvasElementRef.current?.getBoundingClientRect();

    if (!bounds) {
      return { flowX: 0, flowY: 0 };
    }

    const position = reactFlow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });

    return {
      flowX: Math.round(position.x),
      flowY: Math.round(position.y),
    };
  }, [reactFlow]);
  const runCanvasMenuAction = useCallback(
    (
      action: CanvasCommandAction | "snap",
      requestedPosition?: Pick<CanvasContextMenuState, "flowX" | "flowY">,
    ) => {
      if (!contextMenu && !requestedPosition) {
        return;
      }

      const menuPosition = requestedPosition ?? {
        flowX: contextMenu?.flowX ?? 0,
        flowY: contextMenu?.flowY ?? 0,
      };

      closeContextMenu();

      if (action === "snap") {
        setNodes((currentNodes) => {
          // Snap is a destructive layout command, so it serializes immediately
          // instead of waiting for a later drag-stop event.
          const nextNodes = currentNodes.map((node) => ({
            ...node,
            position: {
              x: Math.round(node.position.x / canvasSnapGridSize) * canvasSnapGridSize,
              y: Math.round(node.position.y / canvasSnapGridSize) * canvasSnapGridSize,
            },
          }));

          emitCanvasChange(nextNodes, edges);

          return nextNodes;
        });
        return;
      }

      if (action === "card") {
        const node = createFlowNode("text", menuPosition, { label: "Card", text: "" });

        addCanvasNode(node);
        setEditingCardId(node.id);
        return;
      }

      if (action === "note" || action === "media") {
        // Start with only the root expanded; deeper folders are loaded on
        // demand so opening the picker is cheap in large vaults.
        setVaultPickerDialog({
          kind: action,
          position: menuPosition,
          directories: {
            [canvasVaultRootDirectory]: {
              entries: [],
              loading: true,
              error: "",
              expanded: true,
              loaded: false,
            },
          },
        });
        return;
      }

      if (action === "web") {
        setPromptDialog({ kind: "web", position: menuPosition, value: "https://" });
        return;
      }

      setPromptDialog({ kind: "group", position: menuPosition, value: "Group" });
    },
    [addCanvasNode, closeContextMenu, contextMenu, createFlowNode, edges, emitCanvasChange],
  );
  useEffect(() => {
    if (!commandRequest || handledCommandRequestIdRef.current === commandRequest.id) {
      return;
    }

    handledCommandRequestIdRef.current = commandRequest.id;
    runCanvasMenuAction(commandRequest.action, centeredCanvasPosition());
  }, [centeredCanvasPosition, commandRequest, runCanvasMenuAction]);
  const pendingVaultDirectoryLoad = useMemo(() => {
    if (!vaultPickerDialog) {
      return null;
    }

    // Directory loading is effect-driven rather than started inside render or
    // click handlers, which keeps retries/cancellation tied to React state.
    const relativePath = Object.entries(vaultPickerDialog.directories).find(
      ([, directory]) => directory.loading && !directory.loaded,
    )?.[0];

    return relativePath === undefined
      ? null
      : {
          kind: vaultPickerDialog.kind,
          relativePath,
        };
  }, [vaultPickerDialog]);
  const submitPromptDialog = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();

      if (!promptDialog) {
        return;
      }

      const value = promptDialog.value.trim();

      if (promptDialog.kind === "web") {
        if (!value || value === "https://") {
          return;
        }

        addCanvasNode(createFlowNode("link", promptDialog.position, { label: value, url: value }));
      } else {
        addCanvasNode(createFlowNode("group", promptDialog.position, { label: value || "Group" }));
      }

      closeCanvasDialog();
    },
    [addCanvasNode, closeCanvasDialog, createFlowNode, promptDialog],
  );
  const updatePromptDialogValue = useCallback((value: string) => {
    setPromptDialog((dialog) => (dialog ? { ...dialog, value } : dialog));
  }, []);
  const insertVaultPickerFile = useCallback(
    (file: VaultEntry) => {
      if (!vaultPickerDialog) {
        return;
      }

      addCanvasNode(
        createFlowNode("file", vaultPickerDialog.position, {
          label: file.relativePath,
          file: file.relativePath,
        }),
      );
      closeCanvasDialog();
    },
    [addCanvasNode, closeCanvasDialog, createFlowNode, vaultPickerDialog],
  );
  const toggleVaultPickerDirectory = useCallback((relativePath: string) => {
    setVaultPickerDialog((dialog) => {
      if (!dialog) {
        return dialog;
      }

      const current = dialog.directories[relativePath];

      return {
        ...dialog,
        directories: {
          ...dialog.directories,
          [relativePath]: current?.loaded
            ? {
                ...current,
                expanded: !current.expanded,
              }
            : {
                entries: current?.entries ?? [],
                loading: true,
                error: "",
                expanded: true,
                loaded: false,
              },
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!pendingVaultDirectoryLoad || !vaultPickerDialog) {
      return;
    }

    let cancelled = false;
    const pickerKind = pendingVaultDirectoryLoad.kind;
    const relativePath = pendingVaultDirectoryLoad.relativePath;

    async function loadVaultPickerDirectory() {
      try {
        const entries = await invoke<VaultEntry[]>("list_vault_dir", {
          root: vaultRoot,
          relative: relativePath,
        });

        if (!cancelled) {
          setVaultPickerDialog((dialog) =>
            dialog?.kind === pickerKind
              ? {
                  ...dialog,
                  directories: {
                    ...dialog.directories,
                    [relativePath]: {
                      entries,
                      loading: false,
                      error: "",
                      expanded: true,
                      loaded: true,
                    },
                  },
                }
              : dialog,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setVaultPickerDialog((dialog) =>
            dialog?.kind === pickerKind
              ? {
                  ...dialog,
                  directories: {
                    ...dialog.directories,
                    [relativePath]: {
                      entries: dialog.directories[relativePath]?.entries ?? [],
                      loading: false,
                      error: error instanceof Error ? error.message : String(error),
                      expanded: true,
                      loaded: false,
                    },
                  },
                }
              : dialog,
          );
        }
      }
    }

    void loadVaultPickerDirectory();

    return () => {
      cancelled = true;
    };
  }, [pendingVaultDirectoryLoad, vaultPickerDialog, vaultRoot]);

  useEffect(() => {
    if (!contextMenu && !nodeContextMenu) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (event.target instanceof Element && event.target.closest(".canvas-context-menu")) {
        return;
      }

      closeContextMenu();
    };

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnPointerDown);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnPointerDown);
    };
  }, [closeContextMenu, contextMenu, nodeContextMenu]);

  useEffect(() => {
    if (!promptDialog && !vaultPickerDialog) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCanvasDialog();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeCanvasDialog, promptDialog, vaultPickerDialog]);

  if (parsed.error) {
    return (
      <div className="canvas-view-error">
        <h2>{name}</h2>
        <p>Could not parse canvas JSON.</p>
        <pre>{parsed.error}</pre>
      </div>
    );
  }

  const canvasDialogs = (
    <CanvasDialogs
      promptDialog={promptDialog}
      rootDirectoryPath={canvasVaultRootDirectory}
      vaultPickerDialog={vaultPickerDialog}
      onClose={closeCanvasDialog}
      onPromptValueChange={updatePromptDialogValue}
      onSelectVaultFile={insertVaultPickerFile}
      onSubmitPrompt={submitPromptDialog}
      onToggleVaultDirectory={toggleVaultPickerDirectory}
    />
  );

  return (
    <section
      className="canvas-view"
      aria-label={`${name} canvas`}
      ref={canvasElementRef}
      style={
        {
          "--canvas-node-border-width": `${settings.nodeBorderWidth}px`,
        } as CSSProperties
      }
    >
      <ReactFlow
        colorMode="system"
        connectionMode={ConnectionMode.Loose}
        edges={edges}
        fitView
        minZoom={0.1}
        nodes={displayedNodes}
        onConnect={handleConnect}
        onEdgesChange={handleEdgesChange}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        onNodesChange={handleNodesChange}
        nodeTypes={canvasNodeTypes}
        // Individual group nodes opt out above. The global flags stay enabled
        // so text, file, and link nodes keep normal React Flow interaction.
        nodesDraggable
        nodesConnectable
        proOptions={{ hideAttribution: true }}
        snapGrid={[canvasSnapGridSize, canvasSnapGridSize]}
        snapToGrid={settings.snapToGrid}
      >
        {settings.showGrid ? <Background /> : null}
        {settings.showNavigationPreview ? <MiniMap pannable zoomable /> : null}
        <Controls showInteractive={false} />
      </ReactFlow>
      {contextMenu ? (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Canvas actions"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => void runCanvasMenuAction("card")}>
            Add Card
          </button>
          <button type="button" role="menuitem" onClick={() => void runCanvasMenuAction("note")}>
            Add Note From Vault
          </button>
          <button type="button" role="menuitem" onClick={() => void runCanvasMenuAction("media")}>
            Add Media From Vault
          </button>
          <button type="button" role="menuitem" onClick={() => void runCanvasMenuAction("web")}>
            Add Web Page
          </button>
          <button type="button" role="menuitem" onClick={() => void runCanvasMenuAction("group")}>
            Create Group
          </button>
          <button type="button" role="menuitem" onClick={() => void runCanvasMenuAction("snap")}>
            Snap To Grid
          </button>
        </div>
      ) : null}
      {nodeContextMenu ? (
        <div
          className="canvas-context-menu canvas-node-context-menu"
          style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
          role="menu"
          aria-label="Node actions"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="canvas-menu-label">Color</span>
          <div className="canvas-color-menu" role="group" aria-label="Node color">
            <button
              className="canvas-color-choice clear"
              type="button"
              aria-label="Clear node color"
              onClick={() => runCanvasNodeMenuAction("color")}
            >
              None
            </button>
            {Object.entries(obsidianCanvasColors).map(([colorKey, colorValue]) => (
              <button
                className="canvas-color-choice"
                type="button"
                key={colorKey}
                aria-label={`Set node color ${colorKey}`}
                onClick={() => runCanvasNodeMenuAction("color", colorKey)}
                style={{ "--canvas-choice-color": colorValue } as CSSProperties}
              />
            ))}
          </div>
          <button
            className="danger"
            type="button"
            role="menuitem"
            onClick={() => runCanvasNodeMenuAction("delete")}
          >
            Delete Node
          </button>
        </div>
      ) : null}
      {createPortal(canvasDialogs, document.body)}
    </section>
  );
}

export function CanvasView(props: {
  content: string;
  name: string;
  vaultRoot: string;
  settings?: CanvasSettings | null;
  commandRequest?: CanvasCommandRequest | null;
  onOpenFile: (relativePath: string) => void;
  onChange: (content: string) => void;
}) {
  const settings = normalizeCanvasSettings(props.settings ?? defaultCanvasSettings);

  return (
    <ReactFlowProvider>
      <CanvasGraph {...props} settings={settings} />
    </ReactFlowProvider>
  );
}
