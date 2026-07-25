// Presentation schema for a user-built processing chain, rendered/edited by <ChainView> and
// stored in chainStore. Nodes are created and linked manually (add node, right-click -> add
// recipe / edit / remove, drag to link) rather than solved automatically.

export interface ItemNodeData {
  kind: "item";
  /** Whether itemId refers to a real Minecraft Item or a Fluid - orthogonal to `kind`, which just
   * discriminates this node shape (item/fluid) from MachineNodeData at the React Flow level. */
  materialKind: "item" | "fluid";
  itemId: string;
  label: string;
  amount?: string;
  /** Surplus beyond what was actually needed here, set when expandWithRecipe had to round a
   * requested amount up to a whole number of recipe runs (recipes don't run fractionally - if 1
   * run yields more than was asked for, the excess is tracked here rather than silently inflating
   * `amount` with no explanation). Cleared/recomputed on each expansion, not user-editable. */
  leftover?: string;
  chancePercent?: number;
  /** This node's own surplus is what closes an actual loop right now - it's the recycled thing,
   * not just a step the loop happens to pass through (see `inRefundLoop` for that). Computed live
   * from the graph on every change (see ChainView) - `manualRefund` additionally forces this on
   * regardless of what's detected, for annotating a recycling relationship the detector misses. */
  refundable?: boolean;
  manualRefund?: boolean;
  /** Sits somewhere on an active refund loop but isn't itself the recycled surplus - an ordinary
   * production-chain node the loop's path runs through on its way back to the earlier input.
   * Computed live, same as `refundable`; `manualInLoop` forces it the same way. */
  inRefundLoop?: boolean;
  manualInLoop?: boolean;
  /** A reusable tool/pattern (casting mold, shape, etc.) - own one once, don't re-produce it per run. */
  tool?: boolean;
  /** Manual annotation: required present in a recipe but not net-consumed by it (e.g. a GTCEu
   * catalyst that's also an output of the same recipe) - unlike `tool` this isn't auto-detected,
   * the user tags it via the node's "Mark as" context menu. */
  catalyst?: boolean;
  /** A few more processing steps could turn this byproduct into something already used elsewhere
   * in the chain - right-click the badge for suggestions (see findRefundPaths). Recomputed live for
   * every item node whenever the graph changes (see ChainView), not just once when the node is
   * created, so adding/removing any node can retroactively surface or retire this elsewhere too. */
  possibleRefund?: boolean;
  /** User-designated boundary of the line: where raw material enters, or the final product exits.
   * Excluded from refund-suggestion matching - refunding into your starting material or your
   * finished product isn't a useful loop-back. */
  role?: "input" | "output";
  /** Marks this specific node as (one of) the chain's end goal(s) - distinct from `role: "output"`,
   * which just excludes a node from refund matching and can apply to any number of boundary/output
   * nodes. ChainSummaryPanel shows a critical-path "time to produce" for every node tagged this way
   * (see lib/productionTime.ts). Manual, toggled via the node's "Mark as" context menu. */
  finalOutput?: boolean;
  /** Manual recolor (see SelectionToolbar/setNodesColor) - a background+border pair, overriding
   * any semantic border color (refundable/tool/role) this node would otherwise show. */
  color?: string;
  borderColor?: string;
}

export interface MachineNodeData {
  kind: "machine";
  label: string;
  tier?: string;
  sublabel?: string;
  /** The recipe this machine instance represents, if it was added via the recipe picker. */
  recipeId?: string;
  /** The recipe's raw namespaced machine id (e.g. "gtceu:macerator"), if known - used to look up
   * an icon (see lib/machineIcon.ts). Not set for manually added machine nodes. */
  machineId?: string;
  /** How many of this exact machine are running in parallel on the same recipe - same inputs and
   * outputs, just more instances splitting the workload, not separate nodes. Lets a slow step's
   * share of the critical-path "time to produce" be divided across N machines instead of one
   * running every batch serially (see lib/productionTime.ts). Manual, set via the node's
   * right-click menu; undefined/1 means just the one machine. */
  parallelCount?: number;
  color?: string;
  borderColor?: string;
}

export interface NoteNodeData {
  kind: "note";
  text: string;
  color?: string;
  borderColor?: string;
}

export type ChainNodeData = ItemNodeData | MachineNodeData | NoteNodeData;

export interface ChainNode {
  id: string;
  data: ChainNodeData;
}

export interface ChainEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** Refund/recycle loop-back suggestion, rendered dashed. */
  dashed?: boolean;
}

export interface Chain {
  nodes: ChainNode[];
  edges: ChainEdge[];
}
