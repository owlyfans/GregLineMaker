// Normalized recipe schema produced by pipeline/ from the greglinedump mod's raw JSON dump.
// This is the shape the web app imports from data/recipes.json - see mod/ and pipeline/ for
// how it's produced. Kept in sync manually until the pipeline is built (task #5).

export type IoKind = "item" | "fluid";

export interface RecipeIo {
  kind: IoKind;
  /** Concrete item/fluid ids this slot accepts (already tag-resolved). */
  ids: string[];
  amount: number;
  /** 0-100. Undefined/100 means "always produced". */
  chancePercent?: number;
}

export interface Recipe {
  id: string;
  /** e.g. "gtceu:chemical_reactor", "gtceu:electric_blast_furnace", "tfg:barrel" */
  machine: string;
  /** ULV/LV/MV/HV/EV/IV/LuV/ZPM/UV/UHV/... or undefined for untiered recipes. */
  tier?: string;
  durationTicks?: number;
  voltage?: number;
  /** Minimum Kelvin a coil multiblock (Electric Blast Furnace/Alloy Blast Smelter/Rotary Hearth
   * Furnace - see lib/coils' COIL_MACHINE_TYPES) must reach to run this recipe at all - GTCEu's
   * "Hot Ingot" recipes (e.g. Hot Titanium Ingot) are the main case. Undefined for recipes with no
   * heat requirement (the vast majority, including most other Blast Furnace recipes) - NOT the
   * same as 0K, just "no requirement to check". Requires the pipeline's dump to have captured the
   * recipe's `ebf_temp` data tag (see mod/ RecipeDumper.java) - absent from data produced before
   * that was added, in which case this simply won't be present on any recipe yet. */
  heatRequirement?: number;
  inputs: RecipeIo[];
  outputs: RecipeIo[];
}

/** A fuel-burning recipe that produces EU as its OUTPUT (Steam Turbine/Combustion
 * Generator/Gas Turbine/...) rather than consuming it - see mod/'s RecipeDumper.dumpGenerators and
 * pipeline/build.mjs's normalizeGenerators. */
export interface GeneratorFuel {
  id: string;
  /** e.g. "gtceu:steam_turbine_fuel", "gtceu:combustion_generator_fuel", "gtceu:gas_turbine_fuel" */
  machine: string;
  tier?: string;
  fuelKind: IoKind;
  fuelIds: string[];
  /** Fuel consumed per tick to sustain `euPerTick` - mB/t for a fluid fuel, count/t for an item
   * fuel (rare). */
  fuelAmountPerTick: number;
  /** EU/t this recipe's own base-tier generator instance outputs while burning fuel at
   * `fuelAmountPerTick` - a higher-tier generator of the same machine type just burns the same
   * fuel proportionally faster for proportionally more output (same mB-per-EU efficiency), same
   * reasoning as overclocking a consuming machine - so this ratio holds at any tier. */
  euPerTick: number;
}

export interface RecipeDatabase {
  /** id -> display name */
  items: Record<string, string>;
  /** id -> display name */
  fluids: Record<string, string>;
  recipes: Recipe[];
  /** Absent/empty on a recipe dump predating this field (an already-published resources/ version
   * that hasn't been resynced) - engine fuel-consumption planning just isn't available then. */
  generators?: GeneratorFuel[];
}
