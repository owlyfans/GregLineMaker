import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow";
import type { ChainNodeData, ItemNodeData, MachineNodeData, NoteNodeData } from "../types/chain";
import type { Recipe, RecipeIo } from "../types/recipe";
import { humanizeMachine, isConfigItem, isToolItem } from "../solver/solve";
import type { RefundPath } from "../solver/refund";
import { machineRecipeIds } from "../lib/machineRecipes";

export type FlowNode = Node<ChainNodeData>;

interface HistoryEntry {
  nodes: FlowNode[];
  edges: Edge[];
}

/** How many past states to keep for undo - old entries just fall off the front once exceeded. */
const HISTORY_LIMIT = 50;

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/** Clears selection off whatever was previously selected, so freshly-added nodes (marked
 * `selected: true` at creation) become the only thing selected instead of piling onto whatever
 * was already highlighted. */
function deselectAll(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
}

export const EDGE_COLOR = "#7a8296";
export const REFUND_COLOR = "#e0c14a";

/** The 6 manual recolor choices for connections (EdgeColorToolbar) - bright enough to read clearly
 * as a foreground line against the dark canvas. The first is the same gray every normal edge
 * already starts as, so picking it doubles as "reset". */
export const EDGE_COLOR_CHOICES = ["#7a8296", "#e2694f", "#e2954f", "#5fb87a", "#5b9dd9", "#a696d6"];

export interface NodeColorChoice {
  swatch: string;
  background: string;
  border: string;
}

/** The 6 manual recolor choices for nodes (SelectionToolbar) - background+border pairs, not flat
 * colors: nodes are filled cards, not lines, so they need to stay dark/muted like every node
 * already is rather than the bright tones edges use. Several of these are literally the same
 * tones the app's own default node types already use (item/tool/machine/note), so a manually
 * recolored node never looks out of place next to an unrecolored one. First is the neutral
 * machine-node gray, standing in for "reset" since there's no single default across node kinds.
 * `swatch` is a brighter stand-in color shown on the toolbar button itself (same hues as
 * EDGE_COLOR_CHOICES) - the muted background/border pair reads fine on a large node card but is
 * too close to the toolbar's own dark background to tell apart at swatch size. */
export const NODE_COLOR_CHOICES: NodeColorChoice[] = [
  { swatch: "#7a8296", background: "#22242e", border: "#444a5a" }, // gray (machine-node default)
  { swatch: "#e2694f", background: "#2e1c1a", border: "#6b3a30" }, // red
  { swatch: "#e2954f", background: "#2a2712", border: "#5a4f1f" }, // amber (note-node default)
  { swatch: "#5fb87a", background: "#1f2b22", border: "#35513f" }, // green (item-node default)
  { swatch: "#5b9dd9", background: "#1c2530", border: "#35506e" }, // blue
  { swatch: "#a696d6", background: "#26232f", border: "#4a4360" }, // purple (item-node.tool default)
];

function makeEdge(
  source: string,
  target: string,
  opts?: { label?: string; dashed?: boolean; sourceHandle?: string | null; targetHandle?: string | null },
): Edge {
  const dashed = opts?.dashed ?? false;
  const color = dashed ? REFUND_COLOR : EDGE_COLOR;
  return {
    id: newId("edge"),
    source,
    target,
    sourceHandle: opts?.sourceHandle ?? undefined,
    targetHandle: opts?.targetHandle ?? undefined,
    label: opts?.label,
    animated: dashed,
    style: { stroke: color, ...(dashed ? { strokeDasharray: "5 4" } : {}) },
    labelStyle: dashed ? { fill: color, fontWeight: 600 } : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
  };
}

export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/** Shared by removeEdge/removeEdges - if any edge about to be removed is the "primary" input edge
 * of one of a machine's appliedRecipes (a multi-hatch machine can have several - see
 * types/chain.ts's MachineNodeData / chainStore's applyRecipeToMachine), also reverses everything
 * THAT ONE recipe's application auto-added: subtracts each other-input node's contributed amount
 * (never deletes the node outright - it might be feeding something else too, including this same
 * machine's other attached recipes), drops that input's now-unneeded edge to this machine, and
 * removes every output node that attach created. Any other recipe still attached to the machine is
 * left completely untouched; only once the LAST one is removed does the machine reset back to a
 * bare (recipe-less) node - tier restored to whatever it was before its first attach. A no-op
 * beyond the plain removal for any edge that isn't such a primary edge. */
function reverseAppliedRecipes(nodes: FlowNode[], edges: Edge[], removedEdgeIds: Set<string>): { nodes: FlowNode[]; edges: Edge[] } {
  const removedEdges = edges.filter((e) => removedEdgeIds.has(e.id));
  const amountDeltas = new Map<string, number>();
  const extraEdgeIdsToRemove = new Set<string>();
  const extraNodeIdsToRemove = new Set<string>();
  const machinePatches = new Map<string, Partial<MachineNodeData>>();

  for (const n of nodes) {
    if (n.data.kind !== "machine") continue;
    const machineData = n.data as MachineNodeData;
    const applied = machineData.appliedRecipes;
    if (!applied || applied.length === 0) continue;
    const reversed = applied.find((a) => removedEdges.some((e) => e.source === a.primaryInputNodeId && e.target === n.id));
    if (!reversed) continue;

    for (const contrib of reversed.otherInputContribs) {
      amountDeltas.set(contrib.nodeId, (amountDeltas.get(contrib.nodeId) ?? 0) + contrib.amount);
      const feedEdge = edges.find((e) => e.source === contrib.nodeId && e.target === n.id);
      if (feedEdge) extraEdgeIdsToRemove.add(feedEdge.id);
    }
    for (const contrib of reversed.outputContribs) {
      if (contrib.isNew) {
        // This attach created the node fresh - nothing else could be relying on it yet, remove it
        // outright (its edges go with it via extraNodeIdsToRemove's own filtering below).
        extraNodeIdsToRemove.add(contrib.nodeId);
      } else {
        // Was an existing node this attach merged into instead of duplicating - only take back what
        // THIS attach added, same as an other-input contribution; it may still be needed elsewhere.
        amountDeltas.set(contrib.nodeId, (amountDeltas.get(contrib.nodeId) ?? 0) + contrib.amount);
        const feedEdge = edges.find((e) => e.source === n.id && e.target === contrib.nodeId);
        if (feedEdge) extraEdgeIdsToRemove.add(feedEdge.id);
      }
    }

    const remaining = applied.filter((a) => a !== reversed);
    const remainingIds = remaining.map((a) => a.recipeId);
    if (remaining.length === 0) {
      // Last recipe on this machine just left - revert it fully back to bare/unconfigured.
      machinePatches.set(n.id, {
        recipeId: undefined,
        recipeIds: undefined,
        appliedRecipes: undefined,
        tier: machineData.preRecipeTier,
        preRecipeTier: undefined,
        label: machineData.machineId ? humanizeMachine(machineData.machineId) : machineData.label,
      });
    } else {
      // Other recipes still running on this machine via their own hatches - leave tier/coil alone,
      // just drop the one that got disconnected (and the label's recipe count along with it).
      machinePatches.set(n.id, {
        recipeId: remainingIds[0],
        recipeIds: remainingIds,
        appliedRecipes: remaining,
        label:
          remaining.length > 1 && machineData.machineId
            ? `${humanizeMachine(machineData.machineId)} (${remaining.length} recipes)`
            : machineData.machineId
              ? humanizeMachine(machineData.machineId)
              : machineData.label,
      });
    }
  }

  if (machinePatches.size === 0) {
    return { nodes, edges: edges.filter((e) => !removedEdgeIds.has(e.id)) };
  }

  const nextNodes = nodes
    .filter((n) => !extraNodeIdsToRemove.has(n.id))
    .map((n) => {
      const machinePatch = machinePatches.get(n.id);
      if (machinePatch) return { ...n, data: { ...n.data, ...machinePatch } as ChainNodeData };
      const delta = amountDeltas.get(n.id);
      if (delta && n.data.kind === "item") {
        const current = (n.data as ItemNodeData).amount ? Number((n.data as ItemNodeData).amount) : 0;
        const next = Math.max(0, (Number.isFinite(current) ? current : 0) - delta);
        return { ...n, data: { ...n.data, amount: formatAmount(next) } as ChainNodeData };
      }
      return n;
    });

  const nextEdges = edges.filter(
    (e) =>
      !removedEdgeIds.has(e.id) &&
      !extraEdgeIdsToRemove.has(e.id) &&
      !extraNodeIdsToRemove.has(e.source) &&
      !extraNodeIdsToRemove.has(e.target),
  );

  return { nodes: nextNodes, edges: nextEdges };
}

interface ChainStoreState {
  nodes: FlowNode[];
  edges: Edge[];

  /** Transient, non-persisted set of node ids to visually ring on canvas - driven by hovering an
   * entry in ChainSummaryPanel, not a real selection (so it doesn't touch `selected`/checkpoint or
   * pop open SelectionToolbar). */
  highlightedNodeIds: Set<string>;
  setHighlightedNodes: (ids: string[]) => void;
  /** Transient, non-persisted "possible bottleneck" ring/stroke on canvas - App.tsx computes which
   * machines are outliers (see lib/productionTime's computeBottlenecks) plus their directly
   * connected nodes/edges, and syncs the result here while its toggle button is on. Deliberately a
   * separate field from `highlightedNodeIds` (different color/meaning) and never touches a node's
   * actual `color`/`borderColor` or an edge's actual `style.stroke`, so it can't be confused with
   * (or clobber) a color the user picked manually. */
  bottleneckNodeIds: Set<string>;
  bottleneckEdgeIds: Set<string>;
  setBottleneckHighlight: (nodeIds: string[], edgeIds: string[]) => void;
  /** Replaces the current selection with exactly these nodes and clears any edge selection - used
   * by ChainSummaryPanel's "click an entry to select its nodes" action. A selection change, not a
   * data edit, so (like selectAllNodes) it doesn't checkpoint. */
  selectNodes: (ids: string[]) => void;
  /** One-shot "pan/zoom canvas to these nodes" signal - ChainSummaryPanel lives outside the
   * ReactFlowProvider (it's rendered alongside <ChainView>, not inside it), so it can't call
   * useReactFlow().fitView() itself; it just records the request here and ChainView's own effect
   * (which does have that hook) carries it out. `token` is bumped on every call so the effect fires
   * again even if the same node ids are requested twice in a row. */
  focusRequest: { nodeIds: string[]; token: number } | null;
  requestFocus: (ids: string[]) => void;

  /** Undo/redo history - snapshots of nodes+edges taken just before each discrete user action
   * (add/remove/expand/edit/align/connect/...), not on every intermediate render. A node drag is
   * one snapshot too (taken at drag start, see ChainView's onNodeDragStart), not one per frame. */
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Captures the current nodes+edges onto the undo stack and clears redo - call this immediately
   * before applying a change that should be its own undo step. Exposed (not just used internally)
   * so callers outside the store - e.g. a drag gesture's start event - can mark a checkpoint too. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  /** Wires a manual connection same as onConnect, but if `recipe` is given and its outputs include
   * the target item node's id, also recalculates the target's amount off that recipe's output -
   * same whole-batch rounding as expandWithRecipe (adopts the recipe's own output amount if the
   * target had none yet, otherwise rounds up to enough whole runs to cover what's already there and
   * tracks any surplus as `leftover`). Lets a plain drag-to-connect from a machine onto an EXISTING
   * item node behave like "this machine actually makes this" instead of leaving whatever amount was
   * already on that node unrelated to the new wiring. Falls back to a bare connection (no amount
   * change) whenever `recipe` is undefined, the target isn't an item node, or the recipe just
   * doesn't produce that item - callers don't need to pre-check any of that themselves. */
  connectWithRecipe: (connection: Connection, recipe: Recipe | undefined) => void;
  /** Selects every node (Ctrl+A) - a selection change, not a data edit, so it doesn't checkpoint. */
  selectAllNodes: () => void;
  /** Moves an existing edge's endpoint(s) to a different node/handle - dragging a connection's tip
   * onto a new source or target. Keeps the edge's id/label/style; only the wiring changes. */
  reconnectEdge: (oldEdgeId: string, connection: Connection) => void;
  /** Repositions/adds/removes an edge's bend points (see BendableEdge). Callers decide whether this
   * needs its own checkpoint - a bend-drag gesture checkpoints once at drag start, not per frame. */
  setEdgeBendPoints: (edgeId: string, bendPoints: { x: number; y: number }[]) => void;
  /** Manually recolors one or more connections at once (batched into a single undo step) -
   * repaints stroke, arrowhead, and label (if any) to match, the same fields makeEdge itself sets,
   * so this overrides whatever semantic default (plain gray vs. refund yellow) the edge started with. */
  setEdgesColor: (edgeIds: string[], color: string) => void;
  /** Manually tags/untags one or more connections as a refund/recycle loop-back (batched into a
   * single undo step) - repaints them the same way applyRefundPath's own auto-created refund edges
   * look (dashed yellow, animated, labeled "refund"), or reverts to the plain default otherwise.
   * Ground truth is `data.refund` (so the context menu knows which label to show), independent of
   * any manual recolor - whichever of the two was applied more recently wins on the actual stroke. */
  setEdgesRefund: (edgeIds: string[], isRefund: boolean) => void;
  /** Manually recolors one or more nodes at once (batched into a single undo step) - sets both
   * `data.color` (background) and `data.borderColor` (border), overriding any semantic border
   * color (refundable/tool/role) the node might otherwise show - see ItemNode/MachineNode/NoteNode. */
  setNodesColor: (nodeIds: string[], choice: NodeColorChoice) => void;
  /** Recolors a mix of nodes AND edges together as one undo step - used when a marquee selection
   * catches both (an edge auto-selects once both its endpoints are selected), so a single swatch
   * pick recolors everything currently selected instead of nodes and edges needing separate clicks
   * from two side-by-side toolbars. */
  setSelectionColor: (nodeIds: string[], edgeIds: string[], nodeChoice: NodeColorChoice, edgeColor: string) => void;

  addItemNode: (
    kind: "item" | "fluid",
    itemId: string,
    label: string,
    position: { x: number; y: number },
    amount?: string,
  ) => string;
  addMachineNode: (
    label: string,
    tier: string | undefined,
    position: { x: number; y: number },
    machineId?: string,
    coilTier?: string,
  ) => string;
  addNoteNode: (text: string, position: { x: number; y: number }) => string;
  /** Adds a copied/cut batch of nodes (+ any edges wholly internal to that batch) as one undo
   * step - used by clipboard paste. Every node/edge gets a fresh id (remapped consistently so
   * internal wiring survives); positions are shifted so the batch's own bounding-box center lands
   * on `anchor` (cursor location, or canvas center as a fallback - see ChainView). Pasted nodes
   * become the only selection, same as any other add. */
  pasteNodes: (nodes: FlowNode[], edges: Edge[], anchor: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  removeEdge: (id: string) => void;
  removeEdges: (ids: string[]) => void;
  /** Node ids feeding into `ids` (directly or transitively), not including `ids` themselves. */
  getUpstreamAncestors: (ids: string[]) => string[];
  /** Node ids fed BY `ids` (directly or transitively, i.e. what `ids` produce/lead to) - the
   * mirror of getUpstreamAncestors, not including `ids` themselves. */
  getDownstreamDescendants: (ids: string[]) => string[];
  updateNodeData: (id: string, patch: Partial<ChainNodeData>) => void;
  /** Batch-moves nodes (e.g. align/distribute) in one update instead of one `set` per node. */
  updateNodePositions: (updates: { id: string; position: { x: number; y: number } }[]) => void;
  addLink: (source: string, target: string) => void;

  /**
   * Adds a machine node + its input nodes producing `targetNodeId`, wired up and quantity-scaled.
   * `possibleRefund`/`refundable`/`inRefundLoop` aren't set here - ChainView recomputes those live
   * for every item node whenever the graph changes, not just once for the node being created.
   */
  expandWithRecipe: (
    targetNodeId: string,
    recipe: Recipe,
    resolveName: (kind: "item" | "fluid", id: string) => string,
    /** Which concrete id to use for an input slot that accepts several (e.g. "any sugar") -
     * keyed by the RecipeIo object itself (stable across a single db load). Falls back to
     * `ids[0]` for any slot not present here. */
    altChoices?: Map<RecipeIo, string>,
  ) => void;

  /** Applies a suggested refund path: adds each hop's machine (+ its other inputs) and finally
   * links into the existing node the path matched, instead of creating a duplicate for it. */
  applyRefundPath: (
    fromNodeId: string,
    path: RefundPath,
    resolveName: (kind: "item" | "fluid", id: string) => string,
  ) => void;

  /**
   * The mirror of expandWithRecipe: `fromNodeId` is one of `recipe`'s inputs rather than its
   * output. Adds the machine, the recipe's other inputs, and *all* of its outputs as new nodes
   * ("what can I turn this into"), quantity-scaled off fromNodeId's current amount the same way.
   */
  expandForward: (
    fromNodeId: string,
    recipe: Recipe,
    resolveName: (kind: "item" | "fluid", id: string) => string,
    altChoices?: Map<RecipeIo, string>,
  ) => void;

  /**
   * Attaches `recipe` to an EXISTING machine node instead of creating a fresh one (as
   * expandForward always does) - used when the user manually drags an item node's connection onto
   * an unconfigured machine node and picks a recipe for it (see ChainView). `fromNodeId` must be
   * one of `recipe`'s inputs, and the fromNodeId -> machineNodeId edge must already exist (the drag
   * itself creates it) - this only scales fromNodeId's amount and adds the rest.
   *
   * For each of the recipe's OTHER inputs, reuses an existing item node with the same id anywhere
   * on canvas if one exists (bumping its amount by what's newly needed) instead of always creating
   * a duplicate - unlike expandWithRecipe/expandForward, which never reuse. Every output gets a
   * fresh node, same as those two. Records exactly what got added as the machine's own
   * `appliedRecipe` (see types/chain.ts) so disconnecting the primary input edge later can reverse
   * it precisely - see removeEdge/removeEdges.
   */
  applyRecipeToMachine: (
    machineNodeId: string,
    fromNodeId: string,
    recipe: Recipe,
    resolveName: (kind: "item" | "fluid", id: string) => string,
    altChoices?: Map<RecipeIo, string>,
  ) => void;

  /**
   * Sets an item/fluid node's amount and cascades the change through the *whole* connected chain,
   * not just the one machine touching it: every machine reachable by walking edges outward from
   * the edited node (upstream producers and downstream consumers alike) gets its own multiplier
   * recomputed and applied to everything wired to it, recursively, so editing the final result at
   * the end of a long chain rescales every ingredient all the way back to raw materials, and
   * editing a raw material rescales everything downstream of it. Uses each machine's attached
   * recipe ratios when available (accurate, no compounding rounding); falls back to scaling
   * whatever's currently displayed by the same ratio otherwise. Cycle-safe (each machine is only
   * ever processed once per call).
   */
  rescaleFromOutput: (nodeId: string, newAmount: number, resolveRecipe: (recipeId: string) => Recipe | undefined) => void;

  /** Replaces the whole canvas with a previously saved chain (see state/persistence.ts). Checkpoints
   * first, so undo can get back to whatever was on screen a moment ago - used by file-Load and
   * share-link import. */
  loadChain: (nodes: FlowNode[], edges: Edge[]) => void;

  /** Replaces the whole canvas for a page switch (see state/pagesStore.ts) - unlike loadChain, does
   * NOT checkpoint: the outgoing page's content has nothing to do with the incoming page's undo
   * history, so past/future and other transient per-canvas state (highlights/bottleneck rings/focus
   * request) are cleared outright instead of pushed onto the stack. */
  hardLoad: (nodes: FlowNode[], edges: Edge[]) => void;

  clear: () => void;
}

export const useChainStore = create<ChainStoreState>((set, get) => {
  /** Applies a data patch without touching history - used both by the public `updateNodeData`
   * (which checkpoints first) and internally by expandWithRecipe/expandForward's own mid-expansion
   * amount tweak, which must NOT count as its own separate undo step from the expansion itself. */
  function patchNodeData(id: string, patch: Partial<ChainNodeData>) {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } as ChainNodeData } : n)),
    });
  }

  return {
    nodes: [],
    edges: [],
    past: [],
    future: [],
    highlightedNodeIds: new Set(),
    bottleneckNodeIds: new Set(),
    bottleneckEdgeIds: new Set(),
    focusRequest: null,

    checkpoint: () => {
      const { nodes, edges, past } = get();
      const trimmed = past.length >= HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT + 1) : past;
      set({ past: [...trimmed, { nodes, edges }], future: [] });
    },

    undo: () => {
      const { past, nodes, edges, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({ nodes: prev.nodes, edges: prev.edges, past: past.slice(0, -1), future: [...future, { nodes, edges }] });
    },

    redo: () => {
      const { future, nodes, edges, past } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      set({ nodes: next.nodes, edges: next.edges, future: future.slice(0, -1), past: [...past, { nodes, edges }] });
    },

    onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
    selectAllNodes: () => set({ nodes: get().nodes.map((n) => (n.selected ? n : { ...n, selected: true })) }),

    setHighlightedNodes: (ids) => set({ highlightedNodeIds: new Set(ids) }),

    setBottleneckHighlight: (nodeIds, edgeIds) =>
      set({ bottleneckNodeIds: new Set(nodeIds), bottleneckEdgeIds: new Set(edgeIds) }),

    selectNodes: (ids) => {
      const idSet = new Set(ids);
      set({
        nodes: get().nodes.map((n) => (n.selected === idSet.has(n.id) ? n : { ...n, selected: idSet.has(n.id) })),
        edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      });
    },

    requestFocus: (ids) => set({ focusRequest: { nodeIds: ids, token: (get().focusRequest?.token ?? 0) + 1 } }),

    reconnectEdge: (oldEdgeId, connection) => {
      if (!connection.source || !connection.target) return;
      get().checkpoint();
      set({
        edges: get().edges.map((e) =>
          e.id === oldEdgeId
            ? {
                ...e,
                source: connection.source!,
                target: connection.target!,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
              }
            : e,
        ),
      });
    },

    setEdgeBendPoints: (edgeId, bendPoints) => {
      set({
        edges: get().edges.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, bendPoints } } : e)),
      });
    },

    setEdgesColor: (edgeIds, color) => {
      const idSet = new Set(edgeIds);
      get().checkpoint();
      set({
        edges: get().edges.map((e) => {
          if (!idSet.has(e.id)) return e;
          const markerEnd = typeof e.markerEnd === "object" && e.markerEnd !== null ? { ...e.markerEnd, color } : e.markerEnd;
          return {
            ...e,
            style: { ...e.style, stroke: color },
            markerEnd,
            labelStyle: e.label ? { ...e.labelStyle, fill: color, fontWeight: 600 } : e.labelStyle,
          };
        }),
      });
    },

    setEdgesRefund: (edgeIds, isRefund) => {
      const idSet = new Set(edgeIds);
      get().checkpoint();
      const color = isRefund ? REFUND_COLOR : EDGE_COLOR;
      set({
        edges: get().edges.map((e) => {
          if (!idSet.has(e.id)) return e;
          const markerEnd = typeof e.markerEnd === "object" && e.markerEnd !== null ? { ...e.markerEnd, color } : e.markerEnd;
          return {
            ...e,
            data: { ...e.data, refund: isRefund || undefined },
            animated: isRefund,
            label: isRefund ? "refund" : undefined,
            style: { ...e.style, stroke: color, strokeDasharray: isRefund ? "5 4" : undefined },
            markerEnd,
            labelStyle: isRefund ? { fill: color, fontWeight: 600 } : undefined,
          };
        }),
      });
    },

    setNodesColor: (nodeIds, choice) => {
      const idSet = new Set(nodeIds);
      get().checkpoint();
      set({
        nodes: get().nodes.map((n) =>
          idSet.has(n.id)
            ? { ...n, data: { ...n.data, color: choice.background, borderColor: choice.border } as ChainNodeData }
            : n,
        ),
      });
    },

    setSelectionColor: (nodeIds, edgeIds, nodeChoice, edgeColor) => {
      const nodeIdSet = new Set(nodeIds);
      const edgeIdSet = new Set(edgeIds);
      get().checkpoint();
      set({
        nodes: get().nodes.map((n) =>
          nodeIdSet.has(n.id)
            ? { ...n, data: { ...n.data, color: nodeChoice.background, borderColor: nodeChoice.border } as ChainNodeData }
            : n,
        ),
        edges: get().edges.map((e) => {
          if (!edgeIdSet.has(e.id)) return e;
          const markerEnd =
            typeof e.markerEnd === "object" && e.markerEnd !== null ? { ...e.markerEnd, color: edgeColor } : e.markerEnd;
          return {
            ...e,
            style: { ...e.style, stroke: edgeColor },
            markerEnd,
            labelStyle: e.label ? { ...e.labelStyle, fill: edgeColor, fontWeight: 600 } : e.labelStyle,
          };
        }),
      });
    },

    onConnect: (connection) => {
      if (!connection.source || !connection.target) return;
      get().checkpoint();
      set({
        edges: [
          ...get().edges,
          makeEdge(connection.source, connection.target, {
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
          }),
        ],
      });
    },

    connectWithRecipe: (connection, recipe) => {
      if (!connection.source || !connection.target) return;
      get().checkpoint();
      const { nodes, edges } = get();
      const targetNode = nodes.find((n) => n.id === connection.target);
      const targetData = targetNode?.data.kind === "item" ? (targetNode.data as ItemNodeData) : undefined;
      const outputIo = recipe && targetData
        ? recipe.outputs.find((io) => io.kind === targetData.materialKind && io.ids.includes(targetData.itemId))
        : undefined;

      let newNodes = nodes;
      if (targetData && outputIo) {
        const existingAmount = targetData.amount ? Number(targetData.amount) : undefined;
        const hasExisting = existingAmount !== undefined && !Number.isNaN(existingAmount) && existingAmount > 0;
        // Same whole-batch rounding as expandWithRecipe: recipes don't run fractionally, so round
        // UP to enough whole runs to cover what's already there, tracking any surplus as leftover.
        const runs = hasExisting ? Math.max(1, Math.ceil(existingAmount! / outputIo.amount)) : 1;
        const actualOutput = outputIo.amount * runs;
        const patch: Partial<ItemNodeData> | null = !hasExisting
          ? { amount: formatAmount(outputIo.amount), chancePercent: outputIo.chancePercent, leftover: undefined }
          : actualOutput !== existingAmount
            ? {
                amount: formatAmount(actualOutput),
                leftover: actualOutput > existingAmount! ? formatAmount(actualOutput - existingAmount!) : undefined,
              }
            : null;
        if (patch) {
          newNodes = nodes.map((n) => (n.id === connection.target ? { ...n, data: { ...n.data, ...patch } as ChainNodeData } : n));
        }
      }

      set({
        nodes: newNodes,
        edges: [
          ...edges,
          makeEdge(connection.source, connection.target, {
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
          }),
        ],
      });
    },

    addItemNode: (kind, itemId, label, position, amount) => {
      get().checkpoint();
      const id = newId(kind);
      const data: ItemNodeData = {
        kind: "item",
        materialKind: kind,
        itemId,
        label,
        amount,
        tool: isToolItem(itemId) || undefined,
      };
      set({ nodes: [...deselectAll(get().nodes), { id, type: "item", data, position, selected: true }] });
      return id;
    },

    addMachineNode: (label, tier, position, machineId, coilTier) => {
      get().checkpoint();
      const id = newId("machine");
      const data: MachineNodeData = { kind: "machine", label, tier, machineId, coilTier };
      set({ nodes: [...deselectAll(get().nodes), { id, type: "machine", data, position, selected: true }] });
      return id;
    },

    addNoteNode: (text, position) => {
      get().checkpoint();
      const id = newId("note");
      const data: NoteNodeData = { kind: "note", text };
      set({ nodes: [...deselectAll(get().nodes), { id, type: "note", data, position, selected: true }] });
      return id;
    },

    pasteNodes: (pastedNodes, pastedEdges, anchor) => {
      if (pastedNodes.length === 0) return;
      get().checkpoint();

      const idMap = new Map<string, string>();
      for (const n of pastedNodes) idMap.set(n.id, newId(n.type ?? "node"));

      const xs = pastedNodes.map((n) => n.position.x);
      const ys = pastedNodes.map((n) => n.position.y);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const dx = anchor.x - centerX;
      const dy = anchor.y - centerY;

      const newNodes: FlowNode[] = pastedNodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        position: { x: n.position.x + dx, y: n.position.y + dy },
        selected: true,
        data: { ...n.data },
      }));

      const newEdges: Edge[] = pastedEdges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          ...e,
          id: newId("edge"),
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
          selected: false,
        }));

      set({ nodes: [...deselectAll(get().nodes), ...newNodes], edges: [...get().edges, ...newEdges] });
    },

    removeNode: (id) => {
      get().checkpoint();
      set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      });
    },

    removeNodes: (ids) => {
      get().checkpoint();
      const idSet = new Set(ids);
      set({
        nodes: get().nodes.filter((n) => !idSet.has(n.id)),
        edges: get().edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      });
    },

    removeEdge: (id) => {
      get().checkpoint();
      set(reverseAppliedRecipes(get().nodes, get().edges, new Set([id])));
    },

    removeEdges: (ids) => {
      get().checkpoint();
      set(reverseAppliedRecipes(get().nodes, get().edges, new Set(ids)));
    },

    getUpstreamAncestors: (ids) => {
      const { edges } = get();
      const visited = new Set(ids);
      const ancestors: string[] = [];
      let frontier = ids;
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const nodeId of frontier) {
          for (const e of edges) {
            if (e.target === nodeId && !visited.has(e.source)) {
              visited.add(e.source);
              ancestors.push(e.source);
              next.push(e.source);
            }
          }
        }
        frontier = next;
      }
      return ancestors;
    },

    getDownstreamDescendants: (ids) => {
      const { edges } = get();
      const visited = new Set(ids);
      const descendants: string[] = [];
      let frontier = ids;
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const nodeId of frontier) {
          for (const e of edges) {
            if (e.source === nodeId && !visited.has(e.target)) {
              visited.add(e.target);
              descendants.push(e.target);
              next.push(e.target);
            }
          }
        }
        frontier = next;
      }
      return descendants;
    },

    updateNodeData: (id, patch) => {
      get().checkpoint();
      patchNodeData(id, patch);
    },

    updateNodePositions: (updates) => {
      get().checkpoint();
      const positionById = new Map(updates.map((u) => [u.id, u.position]));
      set({
        nodes: get().nodes.map((n) => (positionById.has(n.id) ? { ...n, position: positionById.get(n.id)! } : n)),
      });
    },

    addLink: (source, target) => {
      get().checkpoint();
      set({ edges: [...get().edges, makeEdge(source, target)] });
    },

    expandWithRecipe: (targetNodeId, recipe, resolveName, altChoices) => {
      get().checkpoint();
      const targetNode = get().nodes.find((n) => n.id === targetNodeId);
    if (!targetNode || targetNode.data.kind !== "item") return;
    const targetData = targetNode.data as ItemNodeData;

    const outputIo = recipe.outputs.find((io) => io.kind === targetData.materialKind && io.ids.includes(targetData.itemId));
    if (!outputIo) return;

    const existingAmount = targetData.amount ? Number(targetData.amount) : undefined;
    const hasExisting = existingAmount !== undefined && !Number.isNaN(existingAmount) && existingAmount > 0;
    // Recipes run a whole number of times, never fractionally - if what's needed doesn't divide
    // evenly into one run's output, round UP to enough whole runs to cover it (never down, since
    // that would under-produce) and track the excess as leftover instead of quietly scaling every
    // input below the recipe's own minimums (e.g. wanting 1000 of a 4000-per-run output would
    // otherwise ask for a quarter of each input, which isn't a real, runnable batch).
    const runs = hasExisting ? Math.max(1, Math.ceil(existingAmount! / outputIo.amount)) : 1;
    const multiplier = runs;
    const actualOutput = outputIo.amount * runs;

    const newNodes: FlowNode[] = [];
    const newEdges: Edge[] = [];

    const machinePos = { x: targetNode.position.x - 260, y: targetNode.position.y };
    const machineId = newId("machine");
    const machineData: MachineNodeData = {
      kind: "machine",
      label: humanizeMachine(recipe.machine),
      tier: recipe.tier,
      recipeId: recipe.id,
      machineId: recipe.machine,
    };
    newNodes.push({ id: machineId, type: "machine", data: machineData, position: machinePos, selected: true });
    newEdges.push(makeEdge(machineId, targetNodeId));

    if (!hasExisting) {
      // First time this item's demand is being set - adopt the recipe's own output amount. Uses
      // patchNodeData (not the public updateNodeData) so this doesn't count as its own undo step
      // separate from the rest of this expansion.
      patchNodeData(targetNodeId, {
        amount: formatAmount(outputIo.amount),
        chancePercent: outputIo.chancePercent,
        leftover: undefined,
      } as Partial<ItemNodeData>);
    } else if (actualOutput !== existingAmount) {
      // Whole-batch rounding produced more than was actually needed - reflect the real produced
      // amount on the node itself (it physically exists here) and record the surplus separately.
      patchNodeData(targetNodeId, {
        amount: formatAmount(actualOutput),
        leftover: actualOutput > existingAmount! ? formatAmount(actualOutput - existingAmount!) : undefined,
      } as Partial<ItemNodeData>);
    }

    const inputCount = recipe.inputs.filter((io) => !(io.kind === "item" && isConfigItem(io.ids[0]))).length;
    let inputIndex = 0;
    for (const io of recipe.inputs) {
      const inputId = altChoices?.get(io) ?? io.ids[0];
      if (io.kind === "item" && isConfigItem(inputId)) continue; // machine config, not a material
      const y = machinePos.y + (inputIndex - (inputCount - 1) / 2) * 90;
      inputIndex += 1;
      const nodeId = newId(io.kind);
      const data: ItemNodeData = {
        kind: "item",
        materialKind: io.kind,
        itemId: inputId,
        label: resolveName(io.kind, inputId),
        amount: formatAmount(io.amount * multiplier),
        tool: isToolItem(inputId) || undefined,
      };
      newNodes.push({ id: nodeId, type: "item", data, position: { x: machinePos.x - 260, y }, selected: true });
      newEdges.push(makeEdge(nodeId, machineId));
    }

    // Byproducts: the recipe's other outputs, shown alongside the target so nothing's hidden.
    const byproductCount = recipe.outputs.length - 1;
    let byproductIndex = 0;
    for (const io of recipe.outputs) {
      if (io === outputIo) continue;
      for (const outId of io.ids) {
        const y = machinePos.y + (byproductIndex - (byproductCount - 1) / 2) * 90;
        byproductIndex += 1;
        const nodeId = newId(io.kind);
        const data: ItemNodeData = {
          kind: "item",
          materialKind: io.kind,
          itemId: outId,
          label: resolveName(io.kind, outId),
          amount: formatAmount(io.amount * multiplier),
          chancePercent: io.chancePercent,
        };
        newNodes.push({ id: nodeId, type: "item", data, position: { x: machinePos.x + 260, y: y + 140 }, selected: true });
        newEdges.push(makeEdge(machineId, nodeId));
      }
    }

    set({ nodes: [...deselectAll(get().nodes), ...newNodes], edges: [...get().edges, ...newEdges] });
  },

  expandForward: (fromNodeId, recipe, resolveName, altChoices) => {
    get().checkpoint();
    const fromNode = get().nodes.find((n) => n.id === fromNodeId);
    if (!fromNode || fromNode.data.kind !== "item") return;
    const fromData = fromNode.data as ItemNodeData;

    const inputIo = recipe.inputs.find((io) => io.kind === fromData.materialKind && io.ids.includes(fromData.itemId));
    if (!inputIo) return;

    const existingAmount = fromData.amount ? Number(fromData.amount) : undefined;
    const hasExisting = existingAmount !== undefined && !Number.isNaN(existingAmount) && existingAmount > 0;
    const multiplier = hasExisting ? existingAmount! / inputIo.amount : 1;

    const newNodes: FlowNode[] = [];
    const newEdges: Edge[] = [];

    const machinePos = { x: fromNode.position.x + 260, y: fromNode.position.y };
    const machineId = newId("machine");
    const machineData: MachineNodeData = {
      kind: "machine",
      label: humanizeMachine(recipe.machine),
      tier: recipe.tier,
      recipeId: recipe.id,
      machineId: recipe.machine,
    };
    newNodes.push({ id: machineId, type: "machine", data: machineData, position: machinePos, selected: true });
    newEdges.push(makeEdge(fromNodeId, machineId));

    if (!hasExisting) {
      // First time this item's supply is being set - adopt the recipe's own input requirement.
      // patchNodeData (not the public updateNodeData) so this isn't its own separate undo step.
      patchNodeData(fromNodeId, { amount: formatAmount(inputIo.amount) } as Partial<ItemNodeData>);
    }

    const otherInputs = recipe.inputs.filter((io) => io !== inputIo && !(io.kind === "item" && isConfigItem(io.ids[0])));
    otherInputs.forEach((io, i) => {
      const inputId = altChoices?.get(io) ?? io.ids[0];
      const y = machinePos.y + (i - (otherInputs.length - 1) / 2) * 90;
      const nodeId = newId(io.kind);
      const data: ItemNodeData = {
        kind: "item",
        materialKind: io.kind,
        itemId: inputId,
        label: resolveName(io.kind, inputId),
        amount: formatAmount(io.amount * multiplier),
        tool: isToolItem(inputId) || undefined,
      };
      newNodes.push({ id: nodeId, type: "item", data, position: { x: machinePos.x - 260, y }, selected: true });
      newEdges.push(makeEdge(nodeId, machineId));
    });

    // All outputs - there's no single "the" target here, everything this recipe makes is new info.
    const outputCount = recipe.outputs.reduce((n, io) => n + io.ids.length, 0);
    let outputIndex = 0;
    for (const io of recipe.outputs) {
      for (const outId of io.ids) {
        const y = machinePos.y + (outputIndex - (outputCount - 1) / 2) * 90;
        outputIndex += 1;
        const nodeId = newId(io.kind);
        const data: ItemNodeData = {
          kind: "item",
          materialKind: io.kind,
          itemId: outId,
          label: resolveName(io.kind, outId),
          amount: formatAmount(io.amount * multiplier),
          chancePercent: io.chancePercent,
        };
        newNodes.push({ id: nodeId, type: "item", data, position: { x: machinePos.x + 260, y }, selected: true });
        newEdges.push(makeEdge(machineId, nodeId));
      }
    }

    set({ nodes: [...deselectAll(get().nodes), ...newNodes], edges: [...get().edges, ...newEdges] });
  },

  applyRecipeToMachine: (machineNodeId, fromNodeId, recipe, resolveName, altChoices) => {
    get().checkpoint();
    const snapshot = get().nodes;
    const machineNode = snapshot.find((n) => n.id === machineNodeId);
    const fromNode = snapshot.find((n) => n.id === fromNodeId);
    if (!machineNode || machineNode.data.kind !== "machine" || !fromNode || fromNode.data.kind !== "item") return;
    const machineData = machineNode.data as MachineNodeData;
    const fromData = fromNode.data as ItemNodeData;

    const inputIo = recipe.inputs.find((io) => io.kind === fromData.materialKind && io.ids.includes(fromData.itemId));
    if (!inputIo) return;

    const existingAmount = fromData.amount ? Number(fromData.amount) : undefined;
    const hasExisting = existingAmount !== undefined && !Number.isNaN(existingAmount) && existingAmount > 0;
    const multiplier = hasExisting ? existingAmount! / inputIo.amount : 1;

    if (!hasExisting) {
      // First time this item's supply is being set - adopt the recipe's own input requirement.
      // patchNodeData (not the public updateNodeData) so this isn't its own separate undo step.
      patchNodeData(fromNodeId, { amount: formatAmount(inputIo.amount) } as Partial<ItemNodeData>);
    }

    const newNodes: FlowNode[] = [];
    const newEdges: Edge[] = [];
    const otherInputContribs: { nodeId: string; amount: number }[] = [];
    const machinePos = machineNode.position;

    const otherInputs = recipe.inputs.filter((io) => io !== inputIo && !(io.kind === "item" && isConfigItem(io.ids[0])));
    otherInputs.forEach((io, i) => {
      const inputId = altChoices?.get(io) ?? io.ids[0];
      const neededAmount = io.amount * multiplier;
      const y = machinePos.y + (i - (otherInputs.length - 1) / 2) * 90 - 140;

      // Reuse an existing item node with the same id anywhere on canvas (other than the node that
      // triggered this) instead of always creating a fresh duplicate - bump its amount by what's
      // additionally needed here rather than leaving two separate nodes for the same item.
      const existing = snapshot.find(
        (n) =>
          n.id !== fromNodeId &&
          n.data.kind === "item" &&
          (n.data as ItemNodeData).materialKind === io.kind &&
          (n.data as ItemNodeData).itemId === inputId,
      );
      if (existing) {
        const existingData = existing.data as ItemNodeData;
        const priorAmount = existingData.amount ? Number(existingData.amount) : 0;
        const nextAmount = (Number.isFinite(priorAmount) ? priorAmount : 0) + neededAmount;
        patchNodeData(existing.id, { amount: formatAmount(nextAmount) } as Partial<ItemNodeData>);
        newEdges.push(makeEdge(existing.id, machineNodeId));
        otherInputContribs.push({ nodeId: existing.id, amount: neededAmount });
      } else {
        const nodeId = newId(io.kind);
        const data: ItemNodeData = {
          kind: "item",
          materialKind: io.kind,
          itemId: inputId,
          label: resolveName(io.kind, inputId),
          amount: formatAmount(neededAmount),
          tool: isToolItem(inputId) || undefined,
        };
        newNodes.push({ id: nodeId, type: "item", data, position: { x: machinePos.x - 260, y }, selected: true });
        newEdges.push(makeEdge(nodeId, machineNodeId));
        otherInputContribs.push({ nodeId, amount: neededAmount });
      }
    });

    const outputCount = recipe.outputs.reduce((n, io) => n + io.ids.length, 0);
    let outputIndex = 0;
    const outputContribs: { nodeId: string; amount: number; isNew: boolean }[] = [];
    for (const io of recipe.outputs) {
      for (const outId of io.ids) {
        const y = machinePos.y + (outputIndex - (outputCount - 1) / 2) * 90;
        outputIndex += 1;
        const neededAmount = io.amount * multiplier;

        // Same reuse-instead-of-duplicate logic as the other-inputs loop above, just for outputs -
        // an existing matching item node (including one created earlier in THIS same loop, for a
        // recipe that lists the same output twice) gets its amount bumped instead of a duplicate.
        const existing = [...snapshot, ...newNodes].find(
          (n) =>
            n.data.kind === "item" &&
            (n.data as ItemNodeData).materialKind === io.kind &&
            (n.data as ItemNodeData).itemId === outId,
        );
        if (existing) {
          const existingData = existing.data as ItemNodeData;
          const priorAmount = existingData.amount ? Number(existingData.amount) : 0;
          const nextAmount = (Number.isFinite(priorAmount) ? priorAmount : 0) + neededAmount;
          patchNodeData(existing.id, { amount: formatAmount(nextAmount) } as Partial<ItemNodeData>);
          newEdges.push(makeEdge(machineNodeId, existing.id));
          outputContribs.push({ nodeId: existing.id, amount: neededAmount, isNew: false });
        } else {
          const nodeId = newId(io.kind);
          const data: ItemNodeData = {
            kind: "item",
            materialKind: io.kind,
            itemId: outId,
            label: resolveName(io.kind, outId),
            amount: formatAmount(neededAmount),
            chancePercent: io.chancePercent,
          };
          newNodes.push({ id: nodeId, type: "item", data, position: { x: machinePos.x + 260, y }, selected: true });
          newEdges.push(makeEdge(machineNodeId, nodeId));
          outputContribs.push({ nodeId, amount: neededAmount, isNew: true });
        }
      }
    }

    // First recipe on this machine (no others attached yet) adopts the recipe's own required tier
    // (and label), same as expandWithRecipe/expandForward always have - a later recipe attached via
    // a different hatch runs on the SAME physical block, so it doesn't get to change either; the
    // block's tier was already decided by whichever recipe (or manual pick) got there first.
    const priorRecipeIds = machineRecipeIds(machineData);
    const isFirstRecipe = priorRecipeIds.length === 0;
    const recipeIds = [...priorRecipeIds, recipe.id];
    const appliedRecipes = [
      ...(machineData.appliedRecipes ?? []),
      { recipeId: recipe.id, primaryInputNodeId: fromNodeId, otherInputContribs, outputContribs },
    ];

    const newMachineData: MachineNodeData = {
      ...machineData,
      label: isFirstRecipe
        ? humanizeMachine(recipe.machine)
        : `${humanizeMachine(recipe.machine)} (${recipeIds.length} recipes)`,
      tier: isFirstRecipe ? recipe.tier : machineData.tier,
      preRecipeTier: isFirstRecipe ? machineData.tier : machineData.preRecipeTier,
      recipeId: recipeIds[0],
      recipeIds,
      machineId: recipe.machine,
      appliedRecipes,
    };

    set({
      nodes: [
        ...deselectAll(get().nodes).map((n) => (n.id === machineNodeId ? { ...n, data: newMachineData } : n)),
        ...newNodes,
      ],
      edges: [...get().edges, ...newEdges],
    });
  },

  applyRefundPath: (fromNodeId, path, resolveName) => {
    get().checkpoint();
    const { nodes } = get();
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    if (!fromNode || fromNode.data.kind !== "item") return;

    const newNodes: FlowNode[] = [];
    const newEdges: Edge[] = [];

    let currentNodeId = fromNodeId;
    let currentData = fromNode.data as ItemNodeData;
    let currentAmount = currentData.amount ? Number(currentData.amount) : undefined;
    let pos = { ...fromNode.position };

    path.steps.forEach((step, i) => {
      const recipe = step.recipe;
      const chainedIo = recipe.inputs.find((io) => io.kind === currentData.materialKind && io.ids.includes(currentData.itemId));
      const multiplier = chainedIo && currentAmount ? currentAmount / chainedIo.amount : 1;

      pos = { x: pos.x + 260, y: pos.y };
      const machineId = newId("machine");
      const machineData: MachineNodeData = {
        kind: "machine",
        label: humanizeMachine(recipe.machine),
        tier: recipe.tier,
        recipeId: recipe.id,
        machineId: recipe.machine,
      };
      newNodes.push({ id: machineId, type: "machine", data: machineData, position: pos, selected: true });
      newEdges.push(makeEdge(currentNodeId, machineId));

      // The recipe's other inputs (besides the item we're chaining through) still need sourcing.
      const otherInputs = recipe.inputs.filter(
        (io) => io !== chainedIo && !(io.kind === "item" && isConfigItem(io.ids[0])),
      );
      otherInputs.forEach((io, j) => {
        const inputId = io.ids[0];
        const inputNodeId = newId(io.kind);
        const data: ItemNodeData = {
          kind: "item",
          materialKind: io.kind,
          itemId: inputId,
          label: resolveName(io.kind, inputId),
          amount: formatAmount(io.amount * multiplier),
          tool: isToolItem(inputId) || undefined,
        };
        const y = pos.y + (j - (otherInputs.length - 1) / 2) * 90 - 140;
        newNodes.push({ id: inputNodeId, type: "item", data, position: { x: pos.x, y }, selected: true });
        newEdges.push(makeEdge(inputNodeId, machineId));
      });

      const outputIo = recipe.outputs.find((io) => io.kind === step.producedKind && io.ids.includes(step.producedId));
      const outputAmount = (outputIo?.amount ?? 1) * multiplier;

      if (i === path.steps.length - 1) {
        // Last hop: link into the existing matching node instead of creating a duplicate.
        const matchNode = nodes.find(
          (n) => n.data.kind === "item" && (n.data as ItemNodeData).materialKind === path.matchKind && (n.data as ItemNodeData).itemId === path.matchId,
        );
        if (matchNode) {
          newEdges.push(makeEdge(machineId, matchNode.id, { label: "refund", dashed: true }));
        }
      } else {
        pos = { x: pos.x + 260, y: pos.y };
        const outNodeId = newId(step.producedKind);
        const outData: ItemNodeData = {
          kind: "item",
          materialKind: step.producedKind,
          itemId: step.producedId,
          label: resolveName(step.producedKind, step.producedId),
          amount: formatAmount(outputAmount),
        };
        newNodes.push({ id: outNodeId, type: "item", data: outData, position: pos, selected: true });
        newEdges.push(makeEdge(machineId, outNodeId));
        currentNodeId = outNodeId;
        currentData = outData;
        currentAmount = outputAmount;
      }
    });

    set({ nodes: [...deselectAll(get().nodes), ...newNodes], edges: [...get().edges, ...newEdges] });
  },

  rescaleFromOutput: (nodeId, newAmount, resolveRecipe) => {
    const { nodes, edges } = get();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const startNode = nodeMap.get(nodeId);
    if (!startNode || startNode.data.kind !== "item") return;
    get().checkpoint();

    const newAmounts = new Map<string, number>();
    const visitedMachines = new Set<string>();

    function findIo(recipe: Recipe, itemData: ItemNodeData) {
      return [...recipe.inputs, ...recipe.outputs].find(
        (io) => io.kind === itemData.materialKind && io.ids.includes(itemData.itemId),
      );
    }

    function currentAmount(id: string): number | undefined {
      if (newAmounts.has(id)) return newAmounts.get(id);
      const n = nodeMap.get(id);
      if (!n || n.data.kind !== "item") return undefined;
      const a = (n.data as ItemNodeData).amount;
      return a ? Number(a) : undefined;
    }

    // Rescales every other node wired to `machineId`, using how `viaNodeId` changed as the anchor,
    // then recurses outward from each of those (so the cascade keeps going past this one machine).
    function processMachine(machineId: string, viaNodeId: string, viaNewAmount: number) {
      if (visitedMachines.has(machineId)) return;
      visitedMachines.add(machineId);
      const machineNode = nodeMap.get(machineId);
      if (!machineNode || machineNode.data.kind !== "machine") return;
      const machineData = machineNode.data as MachineNodeData;
      const viaData = nodeMap.get(viaNodeId)!.data as ItemNodeData;

      // A multi-hatch machine can run several independent recipes at once (see
      // lib/machineRecipes.ts) - only the ONE that actually involves viaData governs this
      // propagation; an edge belonging to a DIFFERENT attached recipe on the same physical block is
      // unrelated to it (see the `belongsToAnotherRecipe` skip below).
      const candidateIds = machineRecipeIds(machineData);
      let recipe: Recipe | undefined;
      for (const id of candidateIds) {
        const r = resolveRecipe(id);
        if (r && findIo(r, viaData)) {
          recipe = r;
          break;
        }
      }

      const viaIo = recipe ? findIo(recipe, viaData) : undefined;
      const viaBase = viaIo?.amount ?? currentAmount(viaNodeId);
      const rawMultiplier = viaBase && viaBase > 0 ? viaNewAmount / viaBase : 1;
      // Recipes run a whole number of times, never fractionally - round up to enough whole runs to
      // cover the requested amount (never down, that would under-supply this machine). Without this,
      // fractional ratios compound hop after hop through a long chain (e.g. ore -> dust -> ingot),
      // and a raw-material input several steps upstream ends up asking for something like "115.2
      // Crushed Bauxite Ore", which isn't a quantity anyone can actually go gather. Only rounds when
      // there's a real per-run amount to round against (an actual recipe slot) - a manually-added
      // machine with no attached recipe has no "one run" concept, so it keeps the old continuous
      // ratio, same as before.
      const multiplier = viaIo ? Math.max(1, Math.ceil(rawMultiplier)) : rawMultiplier;

      for (const e of edges) {
        let otherId: string | undefined;
        if (e.target === machineId) otherId = e.source;
        else if (e.source === machineId) otherId = e.target;
        if (!otherId || otherId === viaNodeId) continue;

        const otherNode = nodeMap.get(otherId);
        if (!otherNode || otherNode.data.kind !== "item") continue;
        const otherData = otherNode.data as ItemNodeData;
        const otherIo = recipe ? findIo(recipe, otherData) : undefined;
        if (!otherIo && candidateIds.length > 1) {
          // This edge's item doesn't belong to the recipe driving this propagation - if it belongs
          // to one of the machine's OTHER attached recipes (a different hatch), it's genuinely
          // unrelated and shouldn't be touched at all, unlike a merely-stray edge under an ordinary
          // single-recipe machine (which still gets the graceful continuous-ratio fallback below).
          const belongsToAnotherRecipe = candidateIds.some((id) => {
            if (recipe && id === recipe.id) return false;
            const other = resolveRecipe(id);
            return other ? !!findIo(other, otherData) : false;
          });
          if (belongsToAnotherRecipe) continue;
        }
        const otherBase = otherIo?.amount ?? currentAmount(otherId);
        if (otherBase === undefined) continue;

        const otherNewAmount = recipe && otherIo ? otherIo.amount * multiplier : otherBase * multiplier;
        newAmounts.set(otherId, otherNewAmount);
        propagateFrom(otherId, otherNewAmount);
      }
    }

    // Finds every machine directly touching `id` (as producer or consumer) and rescales through it.
    function propagateFrom(id: string, newAmt: number) {
      for (const e of edges) {
        if (e.target === id && nodeMap.get(e.source)?.data.kind === "machine") {
          processMachine(e.source, id, newAmt);
        } else if (e.source === id && nodeMap.get(e.target)?.data.kind === "machine") {
          processMachine(e.target, id, newAmt);
        }
      }
    }

    newAmounts.set(nodeId, newAmount);
    propagateFrom(nodeId, newAmount);

    set({
      nodes: nodes.map((n) =>
        newAmounts.has(n.id) ? { ...n, data: { ...n.data, amount: formatAmount(newAmounts.get(n.id)!) } } : n,
      ),
    });
  },

  loadChain: (nodes, edges) => {
    get().checkpoint();
    set({ nodes, edges });
  },

  hardLoad: (nodes, edges) => {
    set({
      nodes,
      edges,
      past: [],
      future: [],
      highlightedNodeIds: new Set(),
      bottleneckNodeIds: new Set(),
      bottleneckEdgeIds: new Set(),
      focusRequest: null,
    });
  },

  clear: () => {
    get().checkpoint();
    set({ nodes: [], edges: [] });
  },
  };
});
