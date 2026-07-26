// A single GTCEu multiblock instance can run several DIFFERENT recipes at once through separate
// input/output hatch pairs (e.g. a Large Chemical Reactor producing two unrelated fluids off two
// different ingredient sets) - one MachineNodeData node on canvas can therefore carry more than one
// attached recipe (see types/chain.ts's recipeIds/appliedRecipes, chainStore's
// applyRecipeToMachine). These helpers centralize "which of a machine's several recipes does this
// edge/item actually belong to" so every consumer (power/time-to-produce calcs, hover labels,
// rescaling) resolves it the same way instead of each guessing independently.

import type { MachineNodeData } from "../types/chain";
import type { Recipe } from "../types/recipe";

/** Every recipe id currently attached to a machine node - `recipeIds` (multi-hatch) if set, else
 * the single `recipeId` as a one-element list, else empty for an unconfigured machine. */
export function machineRecipeIds(data: MachineNodeData): string[] {
  return data.recipeIds ?? (data.recipeId ? [data.recipeId] : []);
}

/** Resolves every attached recipe id via `recipesById`, dropping any that no longer exist in the
 * loaded database (e.g. after a modpack-version switch). */
export function machineRecipes(data: MachineNodeData, recipesById: Map<string, Recipe>): Recipe[] {
  return machineRecipeIds(data)
    .map((id) => recipesById.get(id))
    .filter((r): r is Recipe => !!r);
}

/** Which of a machine's several attached recipes actually produces/consumes this specific
 * item/fluid id - a multi-hatch machine can run different recipes through different hatches, so an
 * edge touching it only belongs to ONE of them, not "the machine's recipe" as a whole. `side`
 * picks whether to search that recipe's outputs (an edge machine -> item) or inputs (item ->
 * machine). Returns the first match; a real recipe never lists the same id on both an input and an
 * output slot, so this is unambiguous in practice. */
export function recipeForItem(
  data: MachineNodeData,
  recipesById: Map<string, Recipe>,
  side: "input" | "output",
  kind: "item" | "fluid",
  itemId: string,
): Recipe | undefined {
  for (const recipe of machineRecipes(data, recipesById)) {
    const list = side === "input" ? recipe.inputs : recipe.outputs;
    if (list.some((io) => io.kind === kind && io.ids.includes(itemId))) return recipe;
  }
  return undefined;
}

/** Max heat requirement across every attached recipe that carries one - a coil multiblock running
 * several Hot-Ingot-style recipes via different hatches needs to satisfy the hottest one. */
export function machineHeatRequirement(data: MachineNodeData, recipesById: Map<string, Recipe>): number | undefined {
  const reqs = machineRecipes(data, recipesById)
    .map((r) => r.heatRequirement)
    .filter((h): h is number => h !== undefined);
  return reqs.length > 0 ? Math.max(...reqs) : undefined;
}
