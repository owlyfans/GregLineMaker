import type { Edge } from "reactflow";
import type { FlowNode } from "../state/chainStore";
import type { ItemNodeData, MachineNodeData } from "../types/chain";
import type { Recipe, RecipeDatabase } from "../types/recipe";
import { effectiveDurationTicks } from "./coils";
import { machineRecipes, recipeForItem } from "./machineRecipes";

export interface FinalOutputTime {
  nodeId: string;
  itemId: string;
  materialKind: "item" | "fluid";
  label: string;
  /** The node's own required amount - shown alongside the time so it's clear how much that time
   * is actually for (e.g. "32x" next to "1m 12s"), not just a bare duration. */
  amount?: string;
  ticks: number;
}

// 20 ticks/second, Minecraft's fixed tick rate.
export function formatDuration(ticks: number): string {
  const totalSeconds = ticks / 20;
  if (totalSeconds < 60) return `${Math.round(totalSeconds * 10) / 10}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - totalMinutes * 60);
  if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes - hours * 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** How many ticks a machine actually takes to finish `runs` recipe runs, accounting for multiple
 * instances of it working in parallel on the same recipe (see MachineNodeData.parallelCount) - N
 * machines split the runs between them, so elapsed time is whatever the busiest one gets
 * (`ceil(runs / N)` runs), not the sum across all of them. */
export function parallelizedTicks(runs: number, durationTicks: number, parallelCount: number | undefined): number {
  const machines = parallelCount && parallelCount > 1 ? parallelCount : 1;
  return Math.ceil(runs / machines) * durationTicks;
}

/** How many whole runs a machine needs, driven by the biggest requirement among its own outputs -
 * a smaller sibling output's demand is automatically covered as a side effect of that same run
 * (same whole-batch reasoning as expandWithRecipe/rescaleFromOutput: recipes don't run fractionally). */
export function machineRuns(machineId: string, recipe: Recipe, nodeById: Map<string, FlowNode>, edges: Edge[]): number {
  let runs = 1;
  for (const e of edges) {
    if (e.source !== machineId) continue;
    const outNode = nodeById.get(e.target);
    if (!outNode || outNode.data.kind !== "item") continue;
    const outData = outNode.data as ItemNodeData;
    const outputIo = recipe.outputs.find((io) => io.kind === outData.materialKind && io.ids.includes(outData.itemId));
    if (!outputIo || !outData.amount) continue;
    const amount = Number(outData.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    runs = Math.max(runs, Math.ceil(amount / outputIo.amount));
  }
  return runs;
}

/** Critical-path time (in ticks) to have `itemNodeId`'s required amount ready from scratch,
 * assuming unlimited machines run in parallel elsewhere - independent upstream branches overlap,
 * so this is the LONGEST single dependency chain feeding it, not the sum of every machine touched.
 * A raw material with no producing machine (or a machine with no attached recipe/duration) costs 0
 * ticks - gathering time isn't modeled, only processing time. `visiting` breaks cycles (an active
 * refund loop feeding back into its own ancestor is treated as free rather than infinite - an
 * approximation, not a scheduling guarantee). */
function timeToProduce(
  itemNodeId: string,
  nodeById: Map<string, FlowNode>,
  edges: Edge[],
  recipesById: Map<string, Recipe>,
  machineTimeCache: Map<string, number>,
  visiting: Set<string>,
): number {
  if (visiting.has(itemNodeId)) return 0;
  visiting.add(itemNodeId);
  let maxTime = 0;
  for (const e of edges) {
    if (e.target !== itemNodeId) continue;
    const machineNode = nodeById.get(e.source);
    if (!machineNode || machineNode.data.kind !== "machine") continue;
    maxTime = Math.max(
      maxTime,
      timeForMachine(machineNode.id, itemNodeId, nodeById, edges, recipesById, machineTimeCache, visiting),
    );
  }
  visiting.delete(itemNodeId);
  return maxTime;
}

// A multiblock can run several unrelated recipes at once through separate hatches (see
// lib/machineRecipes.ts) - each with its own independent timing, so this is keyed by
// `${machineId}::${forItemNodeId}` rather than machineId alone: two different downstream items fed
// by two different hatches on the SAME machine node get their own cached time instead of sharing
// one blended number.
function timeForMachine(
  machineId: string,
  forItemNodeId: string,
  nodeById: Map<string, FlowNode>,
  edges: Edge[],
  recipesById: Map<string, Recipe>,
  machineTimeCache: Map<string, number>,
  visiting: Set<string>,
): number {
  const cacheKey = `${machineId}::${forItemNodeId}`;
  const cached = machineTimeCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const machineNode = nodeById.get(machineId);
  if (!machineNode || machineNode.data.kind !== "machine") return 0;
  const machineData = machineNode.data as MachineNodeData;

  const forNode = nodeById.get(forItemNodeId);
  const forData = forNode?.data.kind === "item" ? (forNode.data as ItemNodeData) : undefined;
  const recipe = forData ? recipeForItem(machineData, recipesById, "output", forData.materialKind, forData.itemId) : undefined;

  const ownTime = recipe?.durationTicks
    ? parallelizedTicks(
        machineRuns(machineId, recipe, nodeById, edges),
        effectiveDurationTicks(recipe, machineData.tier, machineData.coilTier),
        machineData.parallelCount,
      )
    : 0;

  // This machine can't start THIS recipe's run until ITS OWN inputs are ready - if a specific
  // recipe was resolved above, only its own input edges count; an edge belonging to a different
  // recipe attached to the same multiblock (a different hatch) runs independently and shouldn't
  // gate this one. Falls back to every input edge when no recipe could be resolved (an unattached
  // machine node), same as before this multi-recipe support existed.
  let inputsReadyBy = 0;
  for (const e of edges) {
    if (e.target !== machineId) continue;
    const inputNode = nodeById.get(e.source);
    if (!inputNode || inputNode.data.kind !== "item") continue;
    if (recipe) {
      const inData = inputNode.data as ItemNodeData;
      const isRecipeInput = recipe.inputs.some((io) => io.kind === inData.materialKind && io.ids.includes(inData.itemId));
      if (!isRecipeInput) continue;
    }
    inputsReadyBy = Math.max(
      inputsReadyBy,
      timeToProduce(inputNode.id, nodeById, edges, recipesById, machineTimeCache, visiting),
    );
  }

  const total = inputsReadyBy + ownTime;
  machineTimeCache.set(cacheKey, total);
  return total;
}

/** Every item node tagged `finalOutput`, with the critical-path time (ticks) to produce its
 * current required amount from scratch. Each gets its own fresh cache/cycle-guard - deliberately
 * not shared across final outputs, since a value cut short by a cycle in one traversal shouldn't
 * leak into an unrelated one. */
export function computeFinalOutputTimes(nodes: FlowNode[], edges: Edge[], db: RecipeDatabase | undefined): FinalOutputTime[] {
  if (!db) return [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const recipesById = new Map(db.recipes.map((r) => [r.id, r]));
  const results: FinalOutputTime[] = [];
  for (const n of nodes) {
    if (n.data.kind !== "item") continue;
    const data = n.data as ItemNodeData;
    if (!data.finalOutput) continue;
    const ticks = timeToProduce(n.id, nodeById, edges, recipesById, new Map(), new Set());
    results.push({ nodeId: n.id, itemId: data.itemId, materialKind: data.materialKind, label: data.label, amount: data.amount, ticks });
  }
  return results;
}

export interface MachineBottleneck {
  machineId: string;
  label: string;
  tier?: string;
  ticks: number;
}

// A machine only counts as a "bottleneck" if it's notably above the pack, not just whichever
// happen to be slowest - a chain where every step takes roughly the same time should report none.
const BOTTLENECK_FACTOR = 1.75;
const MAX_BOTTLENECKS = 3;

/** Up to 3 machines whose own processing time (parallelizedTicks - just that one step, not its
 * upstream dependencies) is a significant outlier against the rest of the chain's machines. A
 * multiblock running several recipes at once via separate hatches (see lib/machineRecipes.ts)
 * contributes one entry PER attached recipe, independently - they're separate hatch pairs with
 * their own timing, not one blended figure for the whole node. Ignores machines with no attached
 * recipe/duration (nothing to compare) and reports nothing at all with fewer than 2 comparable
 * entries. */
export function computeBottlenecks(nodes: FlowNode[], edges: Edge[], db: RecipeDatabase | undefined): MachineBottleneck[] {
  if (!db) return [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const recipesById = new Map(db.recipes.map((r) => [r.id, r]));

  const entries: MachineBottleneck[] = [];
  for (const n of nodes) {
    if (n.data.kind !== "machine") continue;
    const data = n.data as MachineNodeData;
    for (const recipe of machineRecipes(data, recipesById)) {
      if (!recipe.durationTicks) continue;
      const ticks = parallelizedTicks(
        machineRuns(n.id, recipe, nodeById, edges),
        effectiveDurationTicks(recipe, data.tier, data.coilTier),
        data.parallelCount,
      );
      entries.push({ machineId: n.id, label: data.label, tier: data.tier, ticks });
    }
  }
  if (entries.length < 2) return [];

  const average = entries.reduce((sum, e) => sum + e.ticks, 0) / entries.length;
  const threshold = average * BOTTLENECK_FACTOR;
  return entries
    .filter((e) => e.ticks > threshold)
    .sort((a, b) => b.ticks - a.ticks)
    .slice(0, MAX_BOTTLENECKS);
}
