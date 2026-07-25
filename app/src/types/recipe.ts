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
