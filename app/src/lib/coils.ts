// GTCEu's heating-coil mechanic - governs both which recipes a coil multiblock (Electric Blast
// Furnace / Alloy Blast Smelter / Rotary Hearth Furnace - all three run off GTCEu's single
// "electric_blast_furnace" recipe type, see COIL_MACHINE_TYPES) can run at all, and how much of
// its voltage-tier overclocking lands "perfect" (4x speed instead of the usual 2x, still 4x
// energy either way - see gtTiers' overclockedDurationTicks for the usual case).
//
// All constants below are pulled directly from GTCEu 7.5.3's compiled classes/lang, not guessed:
// - Coil base heat capacities: com.gregtechceu.gtceu.common.block.CoilBlock$CoilType's enum
//   constructor args (decompiled from the actual mod jar).
// - The +100K/tier-above-MV and "1800K per perfect overclock tier" rules: the Electric Blast
//   Furnace's own in-game tooltip (gtceu.machine.electric_blast_furnace.tooltip.0-2) plus
//   GTRecipeModifiers.ebfOverclock/OverclockingLogic.heatingCoilOC's bytecode.
import type { Recipe } from "../types/recipe";
import { overclockTierDiff, overclockedDurationTicks, tierIndex } from "./gtTiers";

export interface CoilTypeInfo {
  id: string;
  label: string;
  /** Base heat capacity in Kelvin, no coil upgrades/voltage bonus applied yet. */
  temperature: number;
}

export const COIL_TYPES: CoilTypeInfo[] = [
  { id: "cupronickel", label: "Cupronickel", temperature: 1800 },
  { id: "kanthal", label: "Kanthal", temperature: 2700 },
  { id: "nichrome", label: "Nichrome", temperature: 3600 },
  { id: "rtm_alloy", label: "RTM Alloy", temperature: 4500 },
  { id: "hssg", label: "HSS-G", temperature: 5400 },
  { id: "naquadah", label: "Naquadah", temperature: 7200 },
  { id: "trinium", label: "Trinium", temperature: 9001 },
  { id: "tritanium", label: "Tritanium", temperature: 10800 },
];

/** Machines whose overclock "perfection" depends on coil temperature vs. the recipe's own heat
 * requirement (see perfectOverclockTierCount) - shows a Coil dropdown for these. Alloy Blast
 * Smelter turns out to be its own separate GTCEu recipe type (not a shared one with Electric
 * Blast Furnace, as first assumed - confirmed against the actual dumped recipe data, which has
 * heat-requirement recipes filed under both "gtceu:electric_blast_furnace" AND
 * "gtceu:alloy_blast_smelter" independently); Rotary Hearth Furnace has no recipe type of its own
 * in the data, confirming it does share "gtceu:electric_blast_furnace"'s. */
export const COIL_MACHINE_TYPES = new Set(["gtceu:electric_blast_furnace", "gtceu:alloy_blast_smelter"]);

/** The Large Chemical Reactor perfect-overclocks unconditionally - it's fixed at exactly one
 * Cupronickel coil by its multiblock structure requirement, not a player choice, so it always
 * gets the full 4x-speed/4x-energy treatment with no coil selection needed. */
const ALWAYS_PERFECT_MACHINE_TYPES = new Set(["gtceu:large_chemical_reactor"]);

export function coilTemperature(coilId: string | undefined): number | undefined {
  return COIL_TYPES.find((c) => c.id === coilId)?.temperature;
}

/** A coil multiblock's actual operating temperature: its coil's own base heat capacity, plus 100K
 * per voltage tier the machine runs above MV (the EBF's own tooltip states this exactly). */
export function coilMachineTemperature(coilId: string | undefined, machineTier: string | undefined): number | undefined {
  const base = coilTemperature(coilId);
  if (base === undefined) return undefined;
  return base + 100 * Math.max(0, tierIndex(machineTier) - tierIndex("MV"));
}

/** How many of a coil multiblock's overclock tiers land "perfect" (4x speed) instead of merely
 * "normal" (2x speed) - one perfect tier per full 1800K the machine's actual temperature sits
 * above the recipe's own heat requirement (0 if that requirement is unknown/absent), consumed
 * starting from the first overclock tier (matches OverclockingLogic.heatingCoilOC exactly). */
export function perfectOverclockTierCount(
  coilId: string | undefined,
  machineTier: string | undefined,
  recipeHeatRequirement: number | undefined,
): number {
  const machineTemp = coilMachineTemperature(coilId, machineTier);
  if (machineTemp === undefined) return 0;
  return Math.max(0, Math.floor((machineTemp - (recipeHeatRequirement ?? 0)) / 1800));
}

/** The lowest coil (by heat capacity) that reaches a given required temperature at a given
 * machine tier, if any of COIL_TYPES do - used to tell the user "this recipe needs at least an
 * X Coil" when picking a coil (see EditNodeModal/AddNodeModal). */
export function minimumCoilFor(requiredTemperature: number, machineTier: string | undefined): CoilTypeInfo | undefined {
  return COIL_TYPES.find((c) => (coilMachineTemperature(c.id, machineTier) ?? 0) >= requiredTemperature);
}

/** Recipe duration adjusted for voltage-tier overclocking, same as gtTiers' own
 * overclockedDurationTicks for the vast majority of machines - except for the handful above that
 * can "perfect" overclock some or all of their tiers (4x speed instead of 2x, still 4x energy
 * either way), which this resolves via perfectOverclockTierCount first. */
export function effectiveDurationTicks(recipe: Recipe, machineTier: string | undefined, coilId: string | undefined): number {
  const durationTicks = recipe.durationTicks ?? 0;
  const diff = overclockTierDiff(recipe.tier, machineTier);
  if (diff === 0) return durationTicks;

  let perfectTiers = 0;
  if (ALWAYS_PERFECT_MACHINE_TYPES.has(recipe.machine)) {
    perfectTiers = diff;
  } else if (COIL_MACHINE_TYPES.has(recipe.machine)) {
    perfectTiers = perfectOverclockTierCount(coilId, machineTier, recipe.heatRequirement);
  }
  if (perfectTiers === 0) return overclockedDurationTicks(durationTicks, recipe.tier, machineTier);

  let ticks = durationTicks;
  for (let i = 0; i < diff; i++) ticks /= i < perfectTiers ? 4 : 2;
  return Math.max(1, Math.round(ticks));
}
