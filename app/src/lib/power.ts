// Whole-chain power draw if every machine currently on canvas ran at once - not modeled anywhere
// else yet (RecipeCard only shows one recipe's own stats in isolation, at its own designated tier,
// not what an actually-placed machine draws once overclocked up to its built tier).

import type { FlowNode } from "../state/chainStore";
import type { MachineNodeData } from "../types/chain";
import type { GeneratorFuel, IoKind, RecipeDatabase } from "../types/recipe";
import { humanizeMachine } from "../solver/solve";
import { overclockedVoltage, tierAtOffset, tierIndex, tierVoltage } from "./gtTiers";

// The dump's generators.json picks up EVERY EU-output recipe it finds (solar panels, plasma/
// nuclear turbines, ...), not just steam/gas - confirmed against a real dump, which turned up
// "gtceu:large_solar_panel"/"gtceu:plasma_generator"/"gtceu:nuclear_turbine"/"gtceu:smr_generator"
// alongside "gtceu:steam_turbine"/"gtceu:gas_turbine". Scoped down to exactly what was asked for -
// exported so SettingsModal's preferred-fuel picker offers the same two machine types, no more.
export const STEAM_GAS_MACHINES = new Set(["gtceu:steam_turbine", "gtceu:gas_turbine"]);

// "gtceu:steam_turbine" -> "Steam Turbine" - humanizeMachine's own generic "_" -> title-case split
// already does the heavy lifting, this just drops a trailing "Fuel"/"Fuels" some recipe-type
// families carry (an implementation detail of how GTCEu names the recipe type, not the generator).
export function humanizeGeneratorMachine(machineId: string): string {
  return humanizeMachine(machineId).replace(/\s+Fuels?$/i, "");
}

export interface TierAmps {
  tier: string;
  amps: number;
  /** How many single-block Steam/Combustion/Gas engines built at THIS tier it'd take to cover
   * `amps` worth of draw at this same tier - one such engine outputs exactly 1A at its own tier
   * (32 EU/t LV, 128 MV, 512 HV, ...), same voltage ladder consuming machines use, no rotor/turbine
   * efficiency modeled (GTCEu's rotor-based turbines vary by rotor quality, not a fixed constant -
   * see computePowerSummary's own doc comment). Whole engines only - a fractional amp still needs
   * one more. */
  engineCount: number;
}

export interface EngineFuelPlan {
  /** The generator recipe type this fuel/ratio came from, e.g. "gtceu:steam_turbine_fuel". */
  machine: string;
  fuelId: string;
  fuelKind: IoKind;
  /** Fuel needed per tick to supply the chain's whole `totalEUt` by burning this fuel in this
   * generator type - mB/t for a fluid fuel, count/t for an item fuel (rare). Tier-invariant (see
   * GeneratorFuel's own doc comment), so this isn't split per tier the way ampsByTier is - however
   * many generators of whatever tier it actually takes, the fuel burn rate for a given total EU/t
   * output is the same. */
  amountPerTick: number;
  /** Whether `fuelId` came from the user's own Settings pick (preferredFuelByMachine) rather than
   * being auto-picked for best efficiency - lets the UI label which one it's showing. */
  preferred: boolean;
}

export interface PowerSummary {
  totalEUt: number;
  /** One entry per voltage tier actually represented among the chain's machines, sorted low to
   * high - amps at different tiers aren't the same unit, so a single flat amp total wouldn't mean
   * anything (this is why RecipeCard's own "X.XX A @ TIER" line is always paired with a tier too). */
  ampsByTier: TierAmps[];
  /** One entry per steam/gas-burning generator TYPE actually present in the recipe database's
   * `generators` (Steam Turbine, Gas Turbine - see STEAM_GAS_MACHINES; solar/plasma/nuclear/etc.
   * generators the dump also picks up aren't "steam or gas" and are deliberately left out) - uses
   * the user's Settings-picked fuel for that machine type if they set one and it's actually a known
   * fuel for it (see settingsStore's preferredFuelByMachine), otherwise whichever known fuel burns
   * most efficiently (lowest fuel-per-EU). Real per-fuel data from the mod's own dump (see
   * GeneratorFuel), not a guessed ratio. Empty whenever the loaded recipe database predates
   * `generators` (needs a pipeline resync) or the chain draws no power yet. */
  fuelPlans: EngineFuelPlan[];
}

/** Sums each machine node's own EU/t draw (its attached recipe's voltage, overclocked up to the
 * machine's own built tier - see gtTiers' overclockedVoltage) times how many parallel instances it
 * represents (MachineNodeData.parallelCount), then buckets the amps that implies per tier. Ignores
 * machines with no attached recipe, or whose recipe carries no EU cost at all (untiered crafting,
 * TFG barrels, ...) - nothing to compute there. A machine with no tier of its own set yet (added via
 * the plain Add Node dialog rather than the recipe picker) is assumed to run at its recipe's own
 * tier, unoverclocked - the same fallback overclockedVoltage itself already uses.
 *
 * Each tier's `engineCount` assumes a single-block, non-turbine Steam/Combustion/Gas engine (1A @
 * its own tier, fixed) - GTCEu's rotor-based turbine generators output more than that depending on
 * rotor quality, which isn't a constant this can compute without real per-rotor numbers.
 *
 * Engine tier baseline: capped at `availableEngineTier` (settingsStore's own "preferred tier for
 * new machines", read as "the tier of power infrastructure I've actually got built") whenever a
 * machine's own tier is HIGHER than that - e.g. an EV machine with `availableEngineTier` "HV" gets
 * bucketed under HV, not EV, since EV engines aren't built yet even though the EV machine itself
 * is (a machine can be overclocked past your current power tier - GTCEu multiblocks just need
 * enough amps, not a single hatch matching their own tier). Never raises the baseline above a
 * machine's own tier (no reason to assume beefier engines than the machine actually needs) or
 * touches it when the machine's tier is already at/below `availableEngineTier`.
 *
 * `engineTierOffset` (see settingsStore) then steps that baseline DOWN by that many further rungs -
 * e.g. offset 1 on an HV baseline buckets under MV instead, at 4x the amps (512 EU/t is 1A @ HV, or
 * 4A @ MV - same total EU/t, just expressed through 4 cheaper engines transformed up instead of 1
 * more expensive one). 0 (default) buckets at the (possibly already-capped) baseline unchanged. */
export function computePowerSummary(
  nodes: FlowNode[],
  db: RecipeDatabase | null,
  preferredFuelByMachine?: Record<string, string>,
  engineTierOffset = 0,
  availableEngineTier?: string | null,
): PowerSummary {
  if (!db) return { totalEUt: 0, ampsByTier: [], fuelPlans: [] };
  const recipesById = new Map(db.recipes.map((r) => [r.id, r]));

  let totalEUt = 0;
  const ampsByTier = new Map<string, number>();

  for (const n of nodes) {
    if (n.data.kind !== "machine") continue;
    const data = n.data as MachineNodeData;
    const recipe = data.recipeId ? recipesById.get(data.recipeId) : undefined;
    if (!recipe || recipe.voltage === undefined) continue;

    const tier = data.tier ?? recipe.tier;
    if (!tier) continue;

    const count = data.parallelCount && data.parallelCount > 1 ? data.parallelCount : 1;
    const euTotal = overclockedVoltage(recipe.voltage, recipe.tier, data.tier) * count;
    totalEUt += euTotal;

    const baseTier =
      availableEngineTier && tierIndex(availableEngineTier) < tierIndex(tier) ? availableEngineTier : tier;
    const engineTier = tierAtOffset(baseTier, engineTierOffset);
    const voltageAtTier = engineTier ? tierVoltage(engineTier) : undefined;
    if (voltageAtTier && engineTier) ampsByTier.set(engineTier, (ampsByTier.get(engineTier) ?? 0) + euTotal / voltageAtTier);
  }

  const sortedAmps = [...ampsByTier.entries()]
    .sort((a, b) => tierIndex(a[0]) - tierIndex(b[0]))
    .map(([tier, amps]) => ({ tier, amps, engineCount: Math.ceil(amps - 1e-9) }));

  const fuelPlans = totalEUt > 0 ? pickFuelPlans(totalEUt, db.generators, preferredFuelByMachine) : [];

  return { totalEUt, ampsByTier: sortedAmps, fuelPlans };
}

/** For each steam/gas generator machine TYPE, picks the user's Settings-preferred fuel if they set
 * one and it's actually a known fuel for that machine, otherwise the single most fuel-efficient
 * known fuel (lowest fuel-per-EU ratio) - then scales the chosen ratio up to `totalEUt`. */
function pickFuelPlans(
  totalEUt: number,
  generators: GeneratorFuel[] | undefined,
  preferredFuelByMachine: Record<string, string> | undefined,
): EngineFuelPlan[] {
  if (!generators || generators.length === 0) return [];

  const byMachine = new Map<string, GeneratorFuel[]>();
  for (const g of generators) {
    if (!STEAM_GAS_MACHINES.has(g.machine)) continue;
    if (!g.euPerTick || !g.fuelAmountPerTick || g.fuelIds.length === 0) continue;
    (byMachine.get(g.machine) ?? byMachine.set(g.machine, []).get(g.machine)!).push(g);
  }

  const plans: EngineFuelPlan[] = [];
  for (const [machine, fuels] of byMachine) {
    const preferredId = preferredFuelByMachine?.[machine];
    const preferredFuel = preferredId ? fuels.find((g) => g.fuelIds.includes(preferredId)) : undefined;
    const chosen = preferredFuel ?? fuels.reduce((best, g) => (fuelRatio(g) < fuelRatio(best) ? g : best));
    plans.push({
      machine,
      fuelId: preferredFuel ? preferredId! : chosen.fuelIds[0],
      fuelKind: chosen.fuelKind,
      amountPerTick: totalEUt * fuelRatio(chosen),
      preferred: !!preferredFuel,
    });
  }
  return plans;
}

function fuelRatio(g: GeneratorFuel): number {
  return g.fuelAmountPerTick / g.euPerTick;
}
