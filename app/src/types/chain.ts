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
  /** The FIRST recipe this machine instance represents, if any - `recipeIds` below is the full
   * picture for a multi-hatch machine (see there); this stays in sync as `recipeIds[0]` and exists
   * so single-recipe-only code (icon lookup context, EditNodeModal's recipe display, ...) doesn't
   * need to special-case the array. */
  recipeId?: string;
  /** ALL recipes currently running on this ONE machine instance via separate input/output hatches -
   * a real GTCEu multiblock (Large Chemical Reactor, Large Boiler, ...) can run several unrelated
   * recipes at once this way, each through its own hatch pair, sharing just the one physical block
   * (and therefore one build tier/coil). Built up by repeatedly dragging a different item's
   * connection onto this same machine node and picking another recipe for it (see ChainView's
   * machineAttachFor / chainStore's applyRecipeToMachine) - undefined/[recipeId] for the ordinary
   * single-recipe case (expandWithRecipe/expandForward/applyRefundPath still only ever attach one).
   * EU/t and time-to-produce calcs sum/resolve across every entry here (see lib/machineRecipes.ts),
   * not just `recipeId` alone. */
  recipeIds?: string[];
  /** The recipe's raw namespaced machine id (e.g. "gtceu:macerator"), if known - used to look up
   * an icon (see lib/machineIcon.ts) and to decide whether this node needs a Coil selector below
   * (see lib/coils' COIL_MACHINE_TYPES). Set by both the recipe picker and the manual Add/Edit
   * Node machine dropdown. */
  machineId?: string;
  /** Which coil this instance is built with, for the handful of multiblocks whose overclock speed
   * depends on it (Electric Blast Furnace/Alloy Blast Smelter/Rotary Hearth Furnace - see
   * lib/coils' COIL_MACHINE_TYPES/effectiveDurationTicks). Irrelevant/unset for every other
   * machine. One of lib/coils' COIL_TYPES ids (e.g. "nichrome"). */
  coilTier?: string;
  /** The attached recipe's own heat requirement in Kelvin (see types/recipe's
   * Recipe.heatRequirement), mirrored here so MachineNode can flag an insufficient coil without
   * needing its own recipe-database access. Like ItemNodeData's refundable/possibleRefund, this is
   * recomputed live from the graph on every change (see ChainView's displayNodes), not persisted
   * as meaningful state of its own. */
  recipeHeatRequirement?: number;
  /** How many of this exact machine are running in parallel on the same recipe - same inputs and
   * outputs, just more instances splitting the workload, not separate nodes. Lets a slow step's
   * share of the critical-path "time to produce" be divided across N machines instead of one
   * running every batch serially (see lib/productionTime.ts). Manual, set via the node's
   * right-click menu; undefined/1 means just the one machine. */
  parallelCount?: number;
  color?: string;
  borderColor?: string;
  /** One entry per recipe that was attached to this machine by dragging an existing item node into
   * it (chainStore's applyRecipeToMachine), not via the "Create from/into" pickers elsewhere (which
   * always build a fresh machine node instead of reusing one) - a machine can accumulate several of
   * these as more items get connected into it (see `recipeIds` above). Each records exactly what
   * that one attach auto-added so disconnecting ITS OWN primary input edge can precisely reverse
   * JUST that recipe (leaving any others still attached to this machine untouched) - see
   * chainStore.ts's removeEdge/removeEdges. */
  appliedRecipes?: {
    recipeId: string;
    /** The item node whose connection into this machine triggered the recipe picker for this
     * specific recipe - disconnecting THIS edge (not any other input this machine might also have,
     * including ones belonging to its other attached recipes) is what triggers reversing it. */
    primaryInputNodeId: string;
    /** Every other input this recipe needed, and how much of it THIS attach contributed - an
     * existing matching node had its amount increased by this much rather than a duplicate being
     * created (see applyRecipeToMachine); reversal subtracts exactly this much back, never deletes
     * the node outright, since it may be feeding something else too (this recipe's other inputs, a
     * different attached recipe, or an unrelated part of the chain). */
    otherInputContribs: { nodeId: string; amount: number }[];
    /** Every output this recipe produced, and how much of it THIS attach contributed - same reuse
     * logic as otherInputContribs: an existing matching item node gets its amount increased rather
     * than a duplicate being created. `isNew` marks which: reversal fully removes a node this attach
     * created fresh (`isNew: true`), but only subtracts the contributed amount back from one that
     * already existed (`isNew: false`) - it may be needed elsewhere (another recipe's own output, a
     * different attached recipe on this same machine, or an unrelated part of the chain). */
    outputContribs: { nodeId: string; amount: number; isNew: boolean }[];
  }[];
  /** This machine's tier from before its FIRST recipe attach overwrote it with that recipe's own
   * required tier (e.g. manually set at Add Node time) - restored as-is once the LAST attached
   * recipe gets disconnected, reverting the whole machine back to bare/unconfigured. Untouched by
   * every attach after the first, since the block's build tier doesn't change just because another
   * hatch pair started running a different recipe on it. */
  preRecipeTier?: string;
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
