import type { Recipe, RecipeDatabase } from "../types/recipe";
import type { Chain, ChainNode, ChainEdge } from "../types/chain";

// Keep in sync with GTValues.VN in the mod - order matters, index = tier rank.
const TIER_ORDER = [
  "ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX",
];

function tierRank(tier?: string): number {
  if (!tier) return 0; // untiered recipes (packers, simple assemblers, etc.) are always available
  const i = TIER_ORDER.indexOf(tier);
  return i === -1 ? Infinity : i;
}

export type NodeKind = "item" | "fluid";

export function nodeKey(kind: NodeKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseNodeKey(key: string): { kind: NodeKind; id: string } {
  const idx = key.indexOf(":");
  const kind = key.slice(0, idx) as NodeKind;
  return { kind, id: key.slice(idx + 1) };
}

function buildOutputIndex(db: RecipeDatabase): Map<string, Recipe[]> {
  const index = new Map<string, Recipe[]>();
  for (const r of db.recipes) {
    for (const io of r.outputs) {
      for (const id of io.ids) {
        const key = nodeKey(io.kind, id);
        let list = index.get(key);
        if (!list) {
          list = [];
          index.set(key, list);
        }
        list.push(r);
      }
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  }
  return index;
}

// Casting molds/shapes are GTCEu "tool" items: you make one and reuse it, or duplicate it from
// an existing one (the copy_mold recipes literally require a mold of the same shape as an input
// to produce another one - genuinely self-referential). Recursing into their own production chain
// every time they're needed as an ingredient produces bogus unsolvable cycles for basically every
// casting/forming recipe in the game, so treat them as a reusable leaf instead of a thing to craft
// fresh each run.
export function isToolItem(id: string): boolean {
  return id.includes("_mold") || id.includes("_shape");
}

// Programmed Circuits aren't a material the recipe consumes from a supply chain - they're GTCEu's
// way of picking which of a machine's several possible outputs you get (a config value, not an
// ingredient), inserted once and reused. Not worth drawing as a node/edge at all.
export function isConfigItem(id: string): boolean {
  return id.includes("programmed_circuit");
}

export function humanizeMachine(machineId: string): string {
  const path = machineId.includes(":") ? machineId.split(":")[1] : machineId;
  return path
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface SolveOptions {
  targetKind: NodeKind;
  targetId: string;
  /** Treated as a leaf even if a recipe exists for it - the user's chosen raw starting point. */
  startResourceId?: string | null;
  maxTier: string;
}

export interface SolveResult {
  chain: Chain;
  warnings: string[];
}

/**
 * AND/OR-graph expansion from a target item/fluid down to raw resources: each recipe node
 * requires all of its inputs (AND); each item can be produced by any one of several recipes
 * (OR, picks the lowest-tier viable one by default). Recipes above maxTier are excluded, so
 * items only reachable through them fall back to being leaves ("no recipe within your tier").
 * Byproducts that are also consumed elsewhere in the assembled chain are flagged as
 * refund/recycle candidates with a dashed loop-back edge, mirroring chain-example.json's
 * "(REFUND X)" annotations.
 */
export function solveChain(db: RecipeDatabase, opts: SolveOptions): SolveResult {
  const outputIndex = buildOutputIndex(db);
  const maxTierRank = tierRank(opts.maxTier);
  const warnings: string[] = [];

  const nodes = new Map<string, ChainNode>();
  const edges: ChainEdge[] = [];
  const chosenRecipeOf = new Map<string, Recipe>();
  const inProgress = new Set<string>();
  const expandedMachines = new Set<string>();

  function displayName(kind: NodeKind, id: string): string {
    const map = kind === "item" ? db.items : db.fluids;
    return map[id] ?? id;
  }

  function ensureItemNode(kind: NodeKind, id: string, amount?: number, chancePercent?: number): string {
    const key = nodeKey(kind, id);
    if (!nodes.has(key)) {
      nodes.set(key, {
        id: key,
        data: {
          kind: "item",
          materialKind: kind,
          itemId: id,
          label: displayName(kind, id),
          amount: amount !== undefined ? String(amount) : undefined,
          chancePercent,
          tool: kind === "item" && isToolItem(id) ? true : undefined,
        },
      });
    }
    return key;
  }

  // Lowest-tier-first isn't a safe default: some low-tier recipes only exist to melt an
  // already-fabricated item back down (e.g. Extractor recipes reclaiming fluid from pipes/plates,
  // or Arc Furnace "scrap a machine block" recipes), and picking one of those over the real
  // ore->dust->ingot path leads the whole chain back into itself. Before committing to a
  // candidate, check (against the *real* ancestor chain, since a candidate that only loops back
  // through an ancestor further up the actual call stack is just as unusable) whether it's
  // provably unresolvable without needing an ancestor of itself; if so, try the next candidate.
  //
  // "Clean" (non-cyclic) results are cached globally - an item that resolves without needing any
  // of the CURRENT ancestors will resolve the same way regardless of who asks, so this is safe and
  // turns the large non-cyclic majority of the graph into O(1) lookups after the first visit.
  // "Cyclic" results are NOT cached globally, because cyclic-ness genuinely depends on which
  // ancestors are live (an item can look cyclic against one ancestor chain and clean against
  // another) - only the small pathological pockets of the graph pay the re-exploration cost.
  const knownClean = new Set<string>();

  function candidateHasInternalCycle(candidate: Recipe, visiting: Set<string>, depth: number): boolean {
    if (depth <= 0) return false; // give up probing further - assume it's fine rather than over-reject
    for (const io of candidate.inputs) {
      if (io.kind === "item" && (isToolItem(io.ids[0]) || isConfigItem(io.ids[0]))) continue; // never cyclic
      const k = nodeKey(io.kind, io.ids[0]);
      if (opts.startResourceId && k === opts.startResourceId) continue; // user-chosen leaf, never cyclic
      if (knownClean.has(k)) continue; // proven resolvable without any live ancestor before - trust it
      if (visiting.has(k)) return true; // revisiting any ancestor is a cycle, not just the original target
      if (chosenRecipeOf.has(k)) continue; // already resolved cleanly elsewhere in the real chain
      const cands = (outputIndex.get(k) ?? []).filter((r) => tierRank(r.tier) <= maxTierRank);
      if (cands.length === 0) {
        knownClean.add(k); // leaf, fine
        continue;
      }
      visiting.add(k);
      const kIsCyclic = cands.every((c) => candidateHasInternalCycle(c, visiting, depth - 1));
      visiting.delete(k);
      if (kIsCyclic) return true;
      knownClean.add(k); // at least one candidate for k resolved cleanly against the current ancestors
    }
    return false;
  }

  function resolve(kind: NodeKind, id: string, amountNeeded?: number): string {
    const key = nodeKey(kind, id);
    ensureItemNode(kind, id, amountNeeded);

    if (opts.startResourceId && key === opts.startResourceId) return key;
    if (inProgress.has(key)) {
      warnings.push(`Circular dependency at ${id} - stopped expanding there.`);
      return key;
    }
    if (chosenRecipeOf.has(key)) return key; // already expanded elsewhere in this DAG

    const candidates = outputIndex.get(key) ?? [];
    const viable = candidates.filter((r) => tierRank(r.tier) <= maxTierRank);
    if (viable.length === 0) {
      if (candidates.length > 0) {
        warnings.push(`${displayName(kind, id)} only has recipes above your max tier - treated as a raw input.`);
      }
      return key; // leaf: raw resource, or nothing viable within tier
    }

    // Seed with the real ancestor chain (inProgress), not just this key - a candidate that only
    // loops back through an ancestor further up the actual call stack is just as unusable.
    let chosen = viable.find((c) => !candidateHasInternalCycle(c, new Set([...inProgress, key]), 20));
    if (!chosen) {
      chosen = viable[0];
      warnings.push(`${displayName(kind, id)}: every available recipe eventually loops back on itself - picked ${chosen.id} anyway.`);
    }
    chosenRecipeOf.set(key, chosen);
    inProgress.add(key);

    const machineKey = `recipe:${chosen.id}`;
    if (!expandedMachines.has(machineKey)) {
      expandedMachines.add(machineKey);
      nodes.set(machineKey, {
        id: machineKey,
        data: { kind: "machine", label: humanizeMachine(chosen.machine), tier: chosen.tier },
      });

      for (const io of chosen.inputs) {
        const inputId = io.ids[0]; // primary alternative; other tag substitutes not modeled yet
        if (io.kind === "item" && isConfigItem(inputId)) continue; // not a material - skip entirely
        const inputKey =
          io.kind === "item" && isToolItem(inputId)
            ? ensureItemNode(io.kind, inputId, io.amount) // reusable tool - own one, don't re-produce it
            : resolve(io.kind, inputId, io.amount);
        edges.push({ id: `${inputKey}->${machineKey}`, source: inputKey, target: machineKey });
      }

      for (const io of chosen.outputs) {
        for (const outId of io.ids) {
          const outKey = ensureItemNode(io.kind, outId, io.amount, io.chancePercent);
          edges.push({ id: `${machineKey}->${outKey}`, source: machineKey, target: outKey });
        }
      }
    }

    inProgress.delete(key);
    return key;
  }

  resolve(opts.targetKind, opts.targetId);

  if (chosenRecipeOf.size === 0 && (outputIndex.get(nodeKey(opts.targetKind, opts.targetId))?.length ?? 0) === 0) {
    warnings.push("No recipe produces this item/fluid at all in the dumped data.");
  }

  // Refund/recycle detection.
  const consumedBy = new Map<string, string[]>();
  for (const recipe of chosenRecipeOf.values()) {
    const machineKey = `recipe:${recipe.id}`;
    for (const io of recipe.inputs) {
      for (const id of io.ids) {
        const k = nodeKey(io.kind, id);
        let list = consumedBy.get(k);
        if (!list) {
          list = [];
          consumedBy.set(k, list);
        }
        list.push(machineKey);
      }
    }
  }
  const alreadyLinked = new Set(edges.map((e) => `${e.source}->${e.target}`));
  for (const recipe of chosenRecipeOf.values()) {
    for (const io of recipe.outputs) {
      for (const id of io.ids) {
        const k = nodeKey(io.kind, id);
        const consumers = consumedBy.get(k);
        if (!consumers) continue;
        const n = nodes.get(k);
        if (n && n.data.kind === "item") n.data.refundable = true;
        for (const consumerMachineKey of consumers) {
          const edgeKey = `${k}->${consumerMachineKey}`;
          if (alreadyLinked.has(edgeKey)) continue;
          alreadyLinked.add(edgeKey);
          edges.push({ id: `refund:${edgeKey}`, source: k, target: consumerMachineKey, label: "refund", dashed: true });
        }
      }
    }
  }

  return { chain: { nodes: Array.from(nodes.values()), edges }, warnings };
}
