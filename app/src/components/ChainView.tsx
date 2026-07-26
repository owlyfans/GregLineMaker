import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Recipe, RecipeDatabase } from "../types/recipe";
import type { ChainNodeData, ItemNodeData, MachineNodeData } from "../types/chain";
import { EDGE_COLOR_CHOICES, NODE_COLOR_CHOICES, useChainStore } from "../state/chainStore";
import { useFavoritesStore } from "../state/favoritesStore";
import { nodeKey } from "../solver/solve";
import { buildInputIndex, detectActiveRefundLoops, findRefundPaths, type RefundPath } from "../solver/refund";
import { formatDuration, parallelizedTicks } from "../lib/productionTime";
import { machineHeatRequirement, recipeForItem } from "../lib/machineRecipes";
import { effectiveDurationTicks } from "../lib/coils";
import { ItemNode } from "./nodes/ItemNode";
import { MachineNode } from "./nodes/MachineNode";
import { NoteNode } from "./nodes/NoteNode";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { RecipePickerModal } from "./RecipePickerModal";
import { EditNodeModal } from "./EditNodeModal";
import { RefundSuggestionsModal } from "./RefundSuggestionsModal";
import { AddNodeModal } from "./AddNodeModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { SelectionToolbar } from "./SelectionToolbar";
import { EdgeColorToolbar } from "./EdgeColorToolbar";
import { BendableEdge } from "./edges/BendableEdge";
import { readClipboard, writeClipboard } from "../lib/clipboard";

const nodeTypes = { item: ItemNode, machine: MachineNode, note: NoteNode };
// Overrides what the (implicit, unset) "default" edge type renders as, so every existing edge
// picks up bending/reconnect support without chainStore needing to stamp a `type` on each one.
const edgeTypes = { default: BendableEdge };
const DELETE_KEYS = ["Delete", "Backspace"];

interface MenuState {
  x: number;
  y: number;
  nodeId: string;
}

interface EdgeMenuState {
  x: number;
  y: number;
  edgeId: string;
}

interface PaneMenuState {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
}

interface RecipeModalState {
  nodeId: string;
  data: ItemNodeData;
  direction: "from" | "into";
}

/** Dragging an item node's connection onto a machine node (configured or not - a multiblock can
 * run several unrelated recipes at once via separate hatches, see lib/machineRecipes.ts) - the edge
 * itself already got wired plainly (see handleConnect), this just tracks which machine/item pair
 * the recipe picker below is being shown for so onPick can call applyRecipeToMachine instead of
 * expandForward (which would otherwise build a whole new machine node). */
interface MachineAttachState {
  machineNodeId: string;
  fromNodeId: string;
  data: ItemNodeData;
  restrictToMachine?: string;
}

interface DeleteRequest {
  primaryIds: string[];
  upstreamIds: string[];
  downstreamIds: string[];
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function resolveName(db: RecipeDatabase, kind: "item" | "fluid", id: string): string {
  return (kind === "fluid" ? db.fluids[id] : db.items[id]) ?? id;
}

export function ChainView({ db }: { db: RecipeDatabase }) {
  return (
    <ReactFlowProvider>
      <ChainViewInner db={db} />
    </ReactFlowProvider>
  );
}

function ChainViewInner({ db }: { db: RecipeDatabase }) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    connectWithRecipe,
    reconnectEdge,
    addItemNode,
    addMachineNode,
    addNoteNode,
    pasteNodes,
    removeNodes,
    removeEdge,
    removeEdges,
    getUpstreamAncestors,
    getDownstreamDescendants,
    expandWithRecipe,
    expandForward,
    applyRecipeToMachine,
    applyRefundPath,
    updateNodeData,
    updateNodePositions,
    rescaleFromOutput,
    checkpoint,
    undo,
    redo,
    selectAllNodes,
    setEdgesColor,
    setEdgesRefund,
    setNodesColor,
    setSelectionColor,
    focusRequest,
  } = useChainStore();
  const favoriteRecipeIds = useFavoritesStore((s) => s.favoriteRecipeIds);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const { screenToFlowPosition, getNode, fitView } = useReactFlow();

  // Last known mouse position over the canvas (screen coords), tracked purely so Ctrl+V/"Paste"
  // can drop the pasted selection under the cursor - null whenever the mouse isn't over the canvas
  // (never moved there yet, or has left it), which is exactly "cursor off screen" from the paste
  // logic's point of view (see pasteAtCursor's fallback to the canvas' own center).
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ChainSummaryPanel lives outside this component's ReactFlowProvider, so "pan/zoom to this
  // node" from clicking a summary entry is relayed through the store instead of a direct call -
  // see chainStore's focusRequest. maxZoom keeps a single small node from getting zoomed in to
  // fill the screen; `token` (not just nodeIds) is the effect dependency so re-clicking the same
  // entry twice in a row still re-triggers the pan even though the id list didn't change.
  useEffect(() => {
    if (!focusRequest || focusRequest.nodeIds.length === 0) return;
    fitView({ nodes: focusRequest.nodeIds.map((id) => ({ id })), padding: 0.4, duration: 400, maxZoom: 1.2 });
  }, [focusRequest, fitView]);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuState | null>(null);
  const [paneMenu, setPaneMenu] = useState<PaneMenuState | null>(null);
  const [addNodeAt, setAddNodeAt] = useState<{ x: number; y: number } | null>(null);
  const [recipeModalFor, setRecipeModalFor] = useState<RecipeModalState | null>(null);
  const [machineAttachFor, setMachineAttachFor] = useState<MachineAttachState | null>(null);
  const [editingNode, setEditingNode] = useState<{ nodeId: string; data: ChainNodeData } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [refundSuggestionsFor, setRefundSuggestionsFor] = useState<{
    nodeId: string;
    data: ItemNodeData;
    paths: RefundPath[];
  } | null>(null);

  const recipesById = useMemo(() => new Map(db.recipes.map((r) => [r.id, r])), [db]);
  const inputIndex = useMemo(() => buildInputIndex(db), [db]);

  // Which item nodes are part of an actual loop in the chain right now (not just a suggestion) -
  // computed fresh from the live graph, not persisted, so it can't go stale as edges change.
  // `refundSources` is specifically the recycled surplus (the edge that closes the loop); the rest
  // of `inLoop` is just ordinary chain nodes the loop's path happens to run through.
  const { inLoop: activeLoopIds, refundSources } = useMemo(
    () => detectActiveRefundLoops(nodes.map((n) => n.id), edges),
    [nodes, edges],
  );
  // Items marked as the line's declared input/output are boundary nodes, not loop-back targets -
  // refunding into your starting raw material or your finished product isn't a useful suggestion.
  // Also excludes item nodes with no edges at all yet: expandWithRecipe/expandForward create a
  // fresh node per expansion rather than reusing one with the same id, so two separate expansions
  // that both need e.g. Sulfuric Acid produce two Sulfuric Acid nodes - matching the disconnected
  // twin would produce a refund edge that doesn't actually close any loop.
  const buildExistingKeys = useCallback(
    (excludeNodeId: string) => {
      const connectedIds = new Set<string>();
      for (const e of edges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }
      return new Set(
        nodes
          .filter(
            (n): n is typeof n & { data: ItemNodeData } =>
              n.data.kind === "item" && n.id !== excludeNodeId && !n.data.role && connectedIds.has(n.id),
          )
          .map((n) => nodeKey(n.data.materialKind, n.data.itemId)),
      );
    },
    [nodes, edges],
  );

  // Every item node's "possible refund" status, recomputed fresh across the WHOLE chain whenever
  // any node/edge changes - not just once for the node being created - so adding or removing any
  // node can retroactively surface (or retire) a suggestion for a completely different node.
  const possibleRefundIds = useMemo(() => {
    // A "possible refund" is specifically an already-produced byproduct that isn't consumed by
    // anything yet - it needs an incoming edge (something actually produces it; a fresh
    // disconnected node isn't a byproduct of anything) but must NOT already have an outgoing edge
    // (already wired to something else is not a dangling surplus anymore, suggesting one is
    // redundant).
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();
    for (const e of edges) {
      hasOutgoing.add(e.source);
      hasIncoming.add(e.target);
    }
    const ids = new Set<string>();
    for (const n of nodes) {
      if (n.data.kind !== "item" || n.data.role) continue;
      if (!hasIncoming.has(n.id) || hasOutgoing.has(n.id)) continue;
      const existingKeys = buildExistingKeys(n.id);
      if (findRefundPaths(inputIndex, n.data.materialKind, n.data.itemId, existingKeys).length > 0) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [nodes, edges, buildExistingKeys, inputIndex]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.data.kind === "item") {
          return {
            ...n,
            data: {
              ...n.data,
              refundable: refundSources.has(n.id) || !!n.data.manualRefund,
              inRefundLoop: (activeLoopIds.has(n.id) && !refundSources.has(n.id)) || !!n.data.manualInLoop,
              possibleRefund: possibleRefundIds.has(n.id),
            } as ItemNodeData,
          };
        }
        if (n.data.kind === "machine") {
          return {
            ...n,
            data: {
              ...n.data,
              recipeHeatRequirement: machineHeatRequirement(n.data as MachineNodeData, recipesById),
            } as MachineNodeData,
          };
        }
        return n;
      }),
    [nodes, activeLoopIds, refundSources, possibleRefundIds, recipesById],
  );

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Time-to-make hint on connections coming OUT of a machine (machine -> item) - sized to the
  // target item's current required amount, not one bare recipe run, and whole-batch rounded the
  // same way rescaleFromOutput/expandWithRecipe are (a partial run doesn't take partial time
  // either). Only edges/BendableEdge see this (via edge.data.timeLabel, shown on hover) - it never
  // touches the store, so it can't go stale or need its own undo step.
  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const sourceNode = nodeById.get(e.source);
        const targetNode = nodeById.get(e.target);
        if (!sourceNode || sourceNode.data.kind !== "machine" || !targetNode || targetNode.data.kind !== "item") return e;
        const machineData = sourceNode.data as MachineNodeData;
        const targetData = targetNode.data as ItemNodeData;
        const recipe = recipeForItem(machineData, recipesById, "output", targetData.materialKind, targetData.itemId);
        if (!recipe?.durationTicks || !targetData.amount) return e;
        const outputIo = recipe.outputs.find((io) => io.kind === targetData.materialKind && io.ids.includes(targetData.itemId));
        if (!outputIo) return e;
        const amount = Number(targetData.amount);
        if (!Number.isFinite(amount) || amount <= 0) return e;
        const runs = Math.max(1, Math.ceil(amount / outputIo.amount));
        const ticks = parallelizedTicks(
          runs,
          effectiveDurationTicks(recipe, machineData.tier, machineData.coilTier),
          machineData.parallelCount,
        );
        return { ...e, data: { ...e.data, timeLabel: formatDuration(ticks) } };
      }),
    [edges, nodeById, recipesById],
  );

  // Recipes that would make the target out of a byproduct already sitting around flagged as a
  // possible refund elsewhere in the chain - surfaced as the picker's "Suggested" tab.
  const suggestedRecipeIdsFor = useCallback(
    (kind: "item" | "fluid", id: string): Set<string> => {
      const refundKeys = new Set(
        nodes
          .filter((n): n is typeof n & { data: ItemNodeData } => n.data.kind === "item" && possibleRefundIds.has(n.id))
          .map((n) => nodeKey(n.data.materialKind, n.data.itemId)),
      );
      const ids = new Set<string>();
      if (refundKeys.size === 0) return ids;
      for (const r of db.recipes) {
        if (!r.outputs.some((io) => io.kind === kind && io.ids.includes(id))) continue;
        if (r.inputs.some((io) => io.ids.some((inputId) => refundKeys.has(nodeKey(io.kind, inputId))))) ids.add(r.id);
      }
      return ids;
    },
    [nodes, db, possibleRefundIds],
  );

  const requestDelete = useCallback(
    (primaryIds: string[]) => {
      const upstreamIds = getUpstreamAncestors(primaryIds).filter((id) => !primaryIds.includes(id));
      const downstreamIds = getDownstreamDescendants(primaryIds).filter((id) => !primaryIds.includes(id));
      if (upstreamIds.length === 0 && downstreamIds.length === 0) {
        removeNodes(primaryIds);
        return;
      }
      setDeleteRequest({ primaryIds, upstreamIds, downstreamIds });
    },
    [getUpstreamAncestors, getDownstreamDescendants, removeNodes],
  );

  // Copy/cut/paste go through the system clipboard (see lib/clipboard), not an in-memory variable,
  // so a selection can be pasted into a different tab, window, or even browser - not just back
  // into this same page. Reads fresh nodes/edges off the store rather than closing over this
  // component's own `nodes`/`edges` props, matching the delete-key handler below, so these stay
  // correct however stale the callbacks' own closures get.
  const copyNodesToClipboard = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const { nodes: currentNodes, edges: currentEdges } = useChainStore.getState();
    const copiedNodes = currentNodes.filter((n) => idSet.has(n.id));
    const copiedEdges = currentEdges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    void writeClipboard(copiedNodes, copiedEdges);
  }, []);

  const cutNodesToClipboard = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      copyNodesToClipboard(ids);
      removeNodes(ids);
    },
    [copyNodesToClipboard, removeNodes],
  );

  // Pastes at a specific flow-space point - shared by the pane context menu ("Paste" at the
  // right-clicked spot) and pasteAtCursor below (Ctrl+V).
  const pasteAt = useCallback(
    async (flowAnchor: { x: number; y: number }) => {
      const data = await readClipboard();
      if (!data || data.nodes.length === 0) return;
      pasteNodes(data.nodes, data.edges, flowAnchor);
    },
    [pasteNodes],
  );

  // Ctrl+V's anchor: the cursor's last known canvas position, or - if the cursor was never over
  // the canvas, or has left it (cursorPosRef null) - the canvas' own center, per spec ("paste at
  // cursor location, if cursor is off screen paste in the middle").
  const pasteAtCursor = useCallback(() => {
    const screenAnchor =
      cursorPosRef.current ??
      (() => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        return rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      })();
    void pasteAt(screenToFlowPosition(screenAnchor));
  }, [pasteAt, screenToFlowPosition]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  // Drives the floating SelectionToolbar (always visible for a multi-selection, not tucked behind
  // a right-click) - recomputed whenever the node list changes so it tracks selection live.
  const selectedNodeIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);
  // Drives EdgeColorToolbar the same way - shown instead of SelectionToolbar/PrimaryToolbar
  // whenever any connection is selected (see the render below and App.tsx's own check).
  const selectedEdgeIds = useMemo(() => edges.filter((e) => e.selected).map((e) => e.id), [edges]);

  // React Flow measures each node's actual rendered size post-layout and keeps it on its internal
  // node record (reachable via getNode, not the plain `nodes` array this app manages) - fall back
  // to a rough average for a node that hasn't rendered/measured yet.
  const nodeSize = useCallback(
    (id: string) => ({ width: getNode(id)?.width ?? 130, height: getNode(id)?.height ?? 90 }),
    [getNode],
  );

  const collectSelectionItems = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => {
          const n = nodes.find((nn) => nn.id === id);
          if (!n) return null;
          const { width, height } = nodeSize(id);
          return { id, x: n.position.x, y: n.position.y, width, height };
        })
        .filter((it): it is { id: string; x: number; y: number; width: number; height: number } => it !== null),
    [nodes, nodeSize],
  );

  // Shared by both axes: "start" = left/top edges flush, "end" = right/bottom edges flush,
  // "center" = centers aligned on the selection's own bounding-box midline.
  const alignNodes = useCallback(
    (ids: string[], axis: "x" | "y", mode: "start" | "center" | "end") => {
      const items = collectSelectionItems(ids);
      if (items.length < 2) return;

      const start = (it: (typeof items)[number]) => (axis === "x" ? it.x : it.y);
      const size = (it: (typeof items)[number]) => (axis === "x" ? it.width : it.height);
      const toPosition = (it: (typeof items)[number], newStart: number) =>
        axis === "x" ? { x: newStart, y: it.y } : { x: it.x, y: newStart };

      let updates: { id: string; position: { x: number; y: number } }[];
      if (mode === "start") {
        const min = Math.min(...items.map(start));
        updates = items.map((it) => ({ id: it.id, position: toPosition(it, min) }));
      } else if (mode === "end") {
        const maxEnd = Math.max(...items.map((it) => start(it) + size(it)));
        updates = items.map((it) => ({ id: it.id, position: toPosition(it, maxEnd - size(it)) }));
      } else {
        const minStart = Math.min(...items.map(start));
        const maxEnd = Math.max(...items.map((it) => start(it) + size(it)));
        const center = (minStart + maxEnd) / 2;
        updates = items.map((it) => ({ id: it.id, position: toPosition(it, center - size(it) / 2) }));
      }
      updateNodePositions(updates);
    },
    [collectSelectionItems, updateNodePositions],
  );

  // Redistributes the selection along one axis with equal gaps between neighbors, keeping the
  // first and last node (by position along that axis) fixed - the usual "distribute spacing"
  // behavior, just done for whichever axis is asked for instead of x only.
  const spaceOutNodes = useCallback(
    (ids: string[], axis: "x" | "y") => {
      const start = (it: { x: number; y: number }) => (axis === "x" ? it.x : it.y);
      const size = (it: { width: number; height: number }) => (axis === "x" ? it.width : it.height);
      const items = collectSelectionItems(ids).sort((a, b) => start(a) - start(b));
      if (items.length < 3) return;

      const first = items[0];
      const last = items[items.length - 1];
      const totalSize = items.reduce((sum, it) => sum + size(it), 0);
      const span = start(last) + size(last) - start(first);
      const gap = (span - totalSize) / (items.length - 1);

      let cursor = start(first);
      const updates = items.map((it) => {
        const position = axis === "x" ? { x: cursor, y: it.y } : { x: it.x, y: cursor };
        cursor += size(it) + gap;
        return { id: it.id, position };
      });
      updateNodePositions(updates);
    },
    [collectSelectionItems, updateNodePositions],
  );

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  // A drag is one continuous stream of onNodesChange position updates, none of which should be
  // its own undo step - so checkpoint once here, right as the gesture begins, instead.
  const onNodeDragStart = useCallback(() => {
    checkpoint();
  }, [checkpoint]);

  // Manually dragging a connection between an existing item and machine node - two distinct cases:
  //
  // - Machine -> item: if any of the machine's attached recipes (a multiblock can run several at
  //   once through separate hatches - see lib/machineRecipes.ts) actually produces this item,
  //   connectWithRecipe recalculates the target's amount off THAT recipe's own output instead of
  //   leaving whatever amount was already there unrelated to the new wiring.
  // - Item -> machine (configured or not - a real multiblock can run several unrelated recipes at
  //   once via different hatch pairs, so an already-configured machine is still a valid target for
  //   another one): wire a bare edge immediately (so it's visible right away), then open the recipe
  //   picker scoped to that machine's own type (machineAttachFor below) - picking a recipe there
  //   calls applyRecipeToMachine, which attaches it to THIS machine node (not a fresh one, and
  //   alongside any recipes already attached) and reuses/bumps any of its other inputs that already
  //   exist elsewhere on canvas instead of duplicating them.
  //
  // Anything else (machine -> machine, item -> item, ...) just wires a bare connection, same as the
  // plain onConnect this replaces.
  const handleConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = connection.source ? nodeById.get(connection.source) : undefined;
      const targetNode = connection.target ? nodeById.get(connection.target) : undefined;

      if (sourceNode?.data.kind === "machine" && targetNode?.data.kind === "item") {
        const machineData = sourceNode.data as MachineNodeData;
        const targetData = targetNode.data as ItemNodeData;
        const recipe = recipeForItem(machineData, recipesById, "output", targetData.materialKind, targetData.itemId);
        connectWithRecipe(connection, recipe);
        return;
      }

      if (sourceNode?.data.kind === "item" && targetNode?.data.kind === "machine" && connection.source && connection.target) {
        connectWithRecipe(connection, undefined);
        setMachineAttachFor({
          machineNodeId: connection.target,
          fromNodeId: connection.source,
          data: sourceNode.data as ItemNodeData,
          restrictToMachine: (targetNode.data as MachineNodeData).machineId,
        });
        return;
      }

      connectWithRecipe(connection, undefined);
    },
    [nodeById, recipesById, connectWithRecipe],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const { clientX, clientY } = event as React.MouseEvent;
      setPaneMenu({ x: clientX, y: clientY, flowPosition: screenToFlowPosition({ x: clientX, y: clientY }) });
    },
    [screenToFlowPosition],
  );

  // Delete/Backspace acts on whatever's selected: edges are removed immediately (freely - no
  // prompt, trivial to redo by dragging a new connection), nodes go through requestDelete's
  // upstream/downstream confirmation. react-flow's own delete key is disabled (deleteKeyCode=null
  // below) so this is the only path deletion goes through. Ctrl+Z/Ctrl+Y undo/redo the whole chain,
  // Ctrl+A selects every node.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllNodes();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        const selIds = useChainStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
        if (selIds.length === 0) return;
        e.preventDefault();
        copyNodesToClipboard(selIds);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "x") {
        const selIds = useChainStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
        if (selIds.length === 0) return;
        e.preventDefault();
        cutNodesToClipboard(selIds);
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteAtCursor();
        return;
      }

      if (!DELETE_KEYS.includes(e.key)) return;
      const state = useChainStore.getState();
      const selectedNodeIds = state.nodes.filter((n) => n.selected).map((n) => n.id);
      const selectedEdgeIds = state.edges.filter((ed) => ed.selected).map((ed) => ed.id);
      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;
      e.preventDefault();

      if (selectedNodeIds.length > 0) {
        requestDelete(selectedNodeIds);
      } else {
        removeEdges(selectedEdgeIds);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestDelete, removeEdges, undo, redo, selectAllNodes, copyNodesToClipboard, cutNodesToClipboard, pasteAtCursor]);

  // From displayNodes (not the raw store nodes) so refundable/inRefundLoop/possibleRefund reflect
  // what's actually live-computed and currently shown, not whatever was last stored on the node.
  const menuNode = menu ? displayNodes.find((n) => n.id === menu.nodeId) : undefined;

  const menuItems: ContextMenuItem[] = menuNode
    ? [
        ...(menuNode.data.kind === "item"
          ? [
              {
                label: "Create from...",
                onClick: () =>
                  setRecipeModalFor({ nodeId: menuNode.id, data: menuNode.data as ItemNodeData, direction: "from" }),
              },
              {
                label: "Create into...",
                onClick: () =>
                  setRecipeModalFor({ nodeId: menuNode.id, data: menuNode.data as ItemNodeData, direction: "into" }),
              },
              ...((menuNode.data as ItemNodeData).possibleRefund
                ? [
                    {
                      label: "Show refund suggestions...",
                      onClick: () => {
                        const data = menuNode.data as ItemNodeData;
                        const paths = findRefundPaths(inputIndex, data.materialKind, data.itemId, buildExistingKeys(menuNode.id));
                        setRefundSuggestionsFor({ nodeId: menuNode.id, data, paths });
                      },
                    },
                  ]
                : []),
              {
                label: "Mark as",
                children: [
                  ...((menuNode.data as ItemNodeData).manualRefund
                    ? [{ label: "Clear refund tag", onClick: () => updateNodeData(menuNode.id, { manualRefund: undefined } as Partial<ItemNodeData>) }]
                    : [{ label: "Mark as refund", onClick: () => updateNodeData(menuNode.id, { manualRefund: true } as Partial<ItemNodeData>) }]),
                  ...((menuNode.data as ItemNodeData).manualInLoop
                    ? [{ label: "Clear in-loop tag", onClick: () => updateNodeData(menuNode.id, { manualInLoop: undefined } as Partial<ItemNodeData>) }]
                    : [{ label: "Mark as in loop", onClick: () => updateNodeData(menuNode.id, { manualInLoop: true } as Partial<ItemNodeData>) }]),
                  ...((menuNode.data as ItemNodeData).catalyst
                    ? [{ label: "Clear catalyst tag", onClick: () => updateNodeData(menuNode.id, { catalyst: undefined } as Partial<ItemNodeData>) }]
                    : [{ label: "Mark as catalysis", onClick: () => updateNodeData(menuNode.id, { catalyst: true } as Partial<ItemNodeData>) }]),
                  ...((menuNode.data as ItemNodeData).role !== "input"
                    ? [{ label: "Mark as input", onClick: () => updateNodeData(menuNode.id, { role: "input" } as Partial<ItemNodeData>) }]
                    : []),
                  ...((menuNode.data as ItemNodeData).role !== "output"
                    ? [{ label: "Mark as output", onClick: () => updateNodeData(menuNode.id, { role: "output" } as Partial<ItemNodeData>) }]
                    : []),
                  ...((menuNode.data as ItemNodeData).role
                    ? [{ label: "Clear input/output mark", onClick: () => updateNodeData(menuNode.id, { role: undefined } as Partial<ItemNodeData>) }]
                    : []),
                  ...((menuNode.data as ItemNodeData).finalOutput
                    ? [{ label: "Clear final output mark", onClick: () => updateNodeData(menuNode.id, { finalOutput: undefined } as Partial<ItemNodeData>) }]
                    : [{ label: "Mark as final output", onClick: () => updateNodeData(menuNode.id, { finalOutput: true } as Partial<ItemNodeData>) }]),
                ],
              },
            ]
          : []),
        ...(menuNode.data.kind === "machine"
          ? (() => {
              const count = (menuNode.data as MachineNodeData).parallelCount ?? 1;
              return [
                {
                  label: "Add parallel machine",
                  onClick: () => updateNodeData(menuNode.id, { parallelCount: count + 1 } as Partial<MachineNodeData>),
                },
                ...(count > 1
                  ? [
                      {
                        label: "Remove parallel machine",
                        onClick: () =>
                          updateNodeData(menuNode.id, {
                            parallelCount: count - 1 > 1 ? count - 1 : undefined,
                          } as Partial<MachineNodeData>),
                      },
                    ]
                  : []),
              ];
            })()
          : []),
        ...(menuNode.data.color
          ? [{ label: "Clear color", onClick: () => updateNodeData(menuNode.id, { color: undefined }) }]
          : []),
        { label: "Edit...", onClick: () => setEditingNode({ nodeId: menuNode.id, data: menuNode.data }) },
        // Right-clicking a node that's part of a larger current selection copies/cuts the whole
        // selection, same as most drawing/diagramming apps - right-clicking one not in the current
        // selection acts on just that node.
        {
          label: "Copy",
          onClick: () =>
            copyNodesToClipboard(
              selectedNodeIds.includes(menuNode.id) && selectedNodeIds.length > 1 ? selectedNodeIds : [menuNode.id],
            ),
        },
        {
          label: "Cut",
          onClick: () =>
            cutNodesToClipboard(
              selectedNodeIds.includes(menuNode.id) && selectedNodeIds.length > 1 ? selectedNodeIds : [menuNode.id],
            ),
        },
        { label: "Remove", danger: true, onClick: () => requestDelete([menuNode.id]) },
      ]
    : [];

  const paneMenuItems: ContextMenuItem[] = paneMenu
    ? [
        { label: "Add node here...", onClick: () => setAddNodeAt(paneMenu.flowPosition) },
        { label: "Paste", onClick: () => void pasteAt(paneMenu.flowPosition) },
      ]
    : [];

  const menuEdge = edgeMenu ? edges.find((e) => e.id === edgeMenu.edgeId) : undefined;
  const edgeMenuItems: ContextMenuItem[] = edgeMenu
    ? [
        ...(menuEdge?.data?.refund
          ? [{ label: "Clear refund mark", onClick: () => setEdgesRefund([edgeMenu.edgeId], false) }]
          : [{ label: "Mark as refund", onClick: () => setEdgesRefund([edgeMenu.edgeId], true) }]),
        { label: "Remove connection", danger: true, onClick: () => removeEdge(edgeMenu.edgeId) },
      ]
    : [];

  function handleRecipePicked(recipe: Recipe) {
    if (!recipeModalFor) return;
    const args: [string, Recipe, (kind: "item" | "fluid", id: string) => string] = [
      recipeModalFor.nodeId,
      recipe,
      (kind, id) => resolveName(db, kind, id),
    ];
    if (recipeModalFor.direction === "from") expandWithRecipe(...args);
    else expandForward(...args);
    setRecipeModalFor(null);
  }

  return (
    <div
      className="chain-view"
      ref={wrapperRef}
      onMouseMove={(e) => {
        cursorPosRef.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseLeave={() => {
        cursorPosRef.current = null;
      }}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onReconnect={(oldEdge, connection) => reconnectEdge(oldEdge.id, connection)}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDragStart={onNodeDragStart}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        panOnDrag={[1]}
        selectionOnDrag
        // Partial (not Full) - a node counts as selected once the marquee touches any part of it,
        // not only once the whole node is enclosed. Nodes vary in size (machine vs item vs note)
        // and are often packed close together, so requiring full containment made it easy to drag
        // a box that visibly overlaps a node yet leaves it out.
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap pannable zoomable nodeColor="#3a4152" nodeStrokeColor="#565f74" maskColor="rgba(10, 11, 14, 0.65)" />
      </ReactFlow>

      {menu && menuNode && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {edgeMenu && (
        <ContextMenu x={edgeMenu.x} y={edgeMenu.y} items={edgeMenuItems} onClose={() => setEdgeMenu(null)} />
      )}

      {(() => {
        const hasNodes = selectedNodeIds.length >= 1;
        const hasEdges = selectedEdgeIds.length > 0;
        if (!hasNodes && !hasEdges) return null;

        if (hasNodes && hasEdges) {
          // Both caught in the same selection (an edge auto-selects once both its endpoints are
          // marquee-selected, but a lone edge can also be Shift-clicked in alongside nodes) - one
          // swatch bar recolors everything selected instead of nodes and edges needing separate
          // clicks on two side-by-side toolbars. NODE_COLOR_CHOICES' `swatch` values are the exact
          // same hex as EDGE_COLOR_CHOICES (see chainStore) - same swatch click, matching colors on
          // both node and edge.
          return (
            <SelectionToolbar
              count={selectedNodeIds.length + selectedEdgeIds.length}
              colors={NODE_COLOR_CHOICES}
              onRecolor={(choice) => setSelectionColor(selectedNodeIds, selectedEdgeIds, choice, choice.swatch)}
              onSpaceOutHorizontal={() => spaceOutNodes(selectedNodeIds, "x")}
              onSpaceOutVertical={() => spaceOutNodes(selectedNodeIds, "y")}
              onAlignLeft={() => alignNodes(selectedNodeIds, "x", "start")}
              onAlignHCenter={() => alignNodes(selectedNodeIds, "x", "center")}
              onAlignRight={() => alignNodes(selectedNodeIds, "x", "end")}
              onAlignTop={() => alignNodes(selectedNodeIds, "y", "start")}
              onAlignVCenter={() => alignNodes(selectedNodeIds, "y", "center")}
              onAlignBottom={() => alignNodes(selectedNodeIds, "y", "end")}
            />
          );
        }

        if (hasNodes) {
          return (
            <SelectionToolbar
              count={selectedNodeIds.length}
              colors={NODE_COLOR_CHOICES}
              onRecolor={(choice) => setNodesColor(selectedNodeIds, choice)}
              onSpaceOutHorizontal={() => spaceOutNodes(selectedNodeIds, "x")}
              onSpaceOutVertical={() => spaceOutNodes(selectedNodeIds, "y")}
              onAlignLeft={() => alignNodes(selectedNodeIds, "x", "start")}
              onAlignHCenter={() => alignNodes(selectedNodeIds, "x", "center")}
              onAlignRight={() => alignNodes(selectedNodeIds, "x", "end")}
              onAlignTop={() => alignNodes(selectedNodeIds, "y", "start")}
              onAlignVCenter={() => alignNodes(selectedNodeIds, "y", "center")}
              onAlignBottom={() => alignNodes(selectedNodeIds, "y", "end")}
            />
          );
        }

        return (
          <EdgeColorToolbar
            count={selectedEdgeIds.length}
            colors={EDGE_COLOR_CHOICES}
            onPick={(color) => setEdgesColor(selectedEdgeIds, color)}
          />
        );
      })()}

      {paneMenu && (
        <ContextMenu x={paneMenu.x} y={paneMenu.y} items={paneMenuItems} onClose={() => setPaneMenu(null)} />
      )}

      {deleteRequest && (
        <ConfirmDeleteModal
          primaryCount={deleteRequest.primaryIds.length}
          upstreamCount={deleteRequest.upstreamIds.length}
          downstreamCount={deleteRequest.downstreamIds.length}
          onClose={() => setDeleteRequest(null)}
          onConfirm={({ includeUpstream, includeDownstream }) => {
            const ids = [
              ...deleteRequest.primaryIds,
              ...(includeUpstream ? deleteRequest.upstreamIds : []),
              ...(includeDownstream ? deleteRequest.downstreamIds : []),
            ];
            removeNodes(ids);
            setDeleteRequest(null);
          }}
        />
      )}

      {addNodeAt && (
        <AddNodeModal
          db={db}
          onClose={() => setAddNodeAt(null)}
          onAddItem={(kind, itemId, label, amount) => addItemNode(kind, itemId, label, addNodeAt, amount)}
          onAddMachine={(label, tier, machineId, coilTier) => addMachineNode(label, tier, addNodeAt, machineId, coilTier)}
          onAddNote={(text) => addNoteNode(text, addNodeAt)}
        />
      )}

      {recipeModalFor && (
        <RecipePickerModal
          db={db}
          direction={recipeModalFor.direction}
          targetKind={recipeModalFor.data.materialKind}
          targetId={recipeModalFor.data.itemId}
          targetLabel={recipeModalFor.data.label}
          favoriteRecipeIds={recipeModalFor.direction === "from" ? favoriteRecipeIds : undefined}
          onToggleFavorite={recipeModalFor.direction === "from" ? toggleFavorite : undefined}
          suggestedRecipeIds={
            recipeModalFor.direction === "from"
              ? suggestedRecipeIdsFor(recipeModalFor.data.materialKind, recipeModalFor.data.itemId)
              : undefined
          }
          onClose={() => setRecipeModalFor(null)}
          onPick={handleRecipePicked}
        />
      )}

      {machineAttachFor && (
        <RecipePickerModal
          db={db}
          direction="into"
          targetKind={machineAttachFor.data.materialKind}
          targetId={machineAttachFor.data.itemId}
          targetLabel={machineAttachFor.data.label}
          restrictToMachine={machineAttachFor.restrictToMachine}
          onClose={() => setMachineAttachFor(null)}
          onPick={(recipe) => {
            applyRecipeToMachine(
              machineAttachFor.machineNodeId,
              machineAttachFor.fromNodeId,
              recipe,
              (kind, id) => resolveName(db, kind, id),
            );
            setMachineAttachFor(null);
          }}
        />
      )}

      {editingNode && (
        <EditNodeModal
          db={db}
          data={editingNode.data}
          recipe={
            editingNode.data.kind === "machine" && editingNode.data.recipeId
              ? recipesById.get(editingNode.data.recipeId)
              : undefined
          }
          onClose={() => setEditingNode(null)}
          onSave={(patch) => {
            const nodeId = editingNode.nodeId;
            // EditNodeModal only ever includes `amount` in patch when editing.data.kind === "item"
            // (see its own submit()), so patch is really Partial<ItemNodeData>-shaped here - TS
            // can't infer that from a check on the separate `editingNode.data` value, hence the cast.
            const itemPatch = patch as Partial<ItemNodeData>;
            if (editingNode.data.kind === "item" && itemPatch.amount !== undefined) {
              const parsed = Number(itemPatch.amount);
              const { amount: _amount, ...rest } = itemPatch;
              if (Object.keys(rest).length > 0) updateNodeData(nodeId, rest);
              if (!Number.isNaN(parsed)) {
                rescaleFromOutput(nodeId, parsed, (recipeId) => recipesById.get(recipeId));
              }
            } else {
              updateNodeData(nodeId, patch);
            }
          }}
        />
      )}

      {refundSuggestionsFor && (
        <RefundSuggestionsModal
          db={db}
          fromKind={refundSuggestionsFor.data.materialKind}
          fromId={refundSuggestionsFor.data.itemId}
          fromLabel={refundSuggestionsFor.data.label}
          paths={refundSuggestionsFor.paths}
          matchLabelFor={(path) => resolveName(db, path.matchKind, path.matchId)}
          onClose={() => setRefundSuggestionsFor(null)}
          onPick={(path) => {
            applyRefundPath(refundSuggestionsFor.nodeId, path, (kind, id) => resolveName(db, kind, id));
            setRefundSuggestionsFor(null);
          }}
        />
      )}
    </div>
  );
}
