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

export interface RecipeDatabase {
  /** id -> display name */
  items: Record<string, string>;
  /** id -> display name */
  fluids: Record<string, string>;
  recipes: Recipe[];
}
