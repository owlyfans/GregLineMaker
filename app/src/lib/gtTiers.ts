// GTCEu's own voltage-tier ladder (each tier is 4x the previous, starting at ULV=8 EU/t) - used to
// turn a recipe's raw `voltage` (EU/t) into the "X.XX A @ TIER" usage line the game itself shows.
const TIER_VOLTAGE: Record<string, number> = {
  ULV: 8,
  LV: 32,
  MV: 128,
  HV: 512,
  EV: 2048,
  IV: 8192,
  LuV: 32768,
  ZPM: 131072,
  UV: 524288,
  UHV: 2097152,
  UEV: 8388608,
  UIV: 33554432,
  UXV: 134217728,
  OpV: 536870912,
  MAX: 2147483647,
};

export function tierVoltage(tier?: string): number | undefined {
  return tier ? TIER_VOLTAGE[tier] : undefined;
}

// Approximate, not pulled from the game's actual tier colors pixel-for-pixel - picked from this
// app's own existing palette (already used elsewhere for badges/accents) so a tier badge fits in
// visually rather than introducing a new one-off set of colors.
const TIER_COLOR: Record<string, string> = {
  ULV: "#8b93a3",
  LV: "#e2694f",
  MV: "#5b9dd9",
  HV: "#e2954f",
  EV: "#5fb87a",
  IV: "#6fd0d6",
  LuV: "#a696d6",
  ZPM: "#c79cf0",
  UV: "#e0c14a",
  UHV: "#e2786f",
  UEV: "#f0c26a",
  UIV: "#6fe2ae",
  UXV: "#ff2d55",
  OpV: "#ffffff",
  MAX: "#ffffff",
};

export function tierColor(tier?: string): string {
  return (tier && TIER_COLOR[tier]) || "#8b93a3";
}

// Order matters here - index = rank on the voltage ladder, used by the overclock math below.
export const TIER_ORDER = Object.keys(TIER_VOLTAGE);

function tierIndex(tier?: string): number {
  if (!tier) return -1;
  return TIER_ORDER.indexOf(tier);
}

/** How many voltage tiers a machine is overclocking a recipe by - how far its own actual tier sits
 * above the recipe's own minimum tier. 0 whenever there's no basis to overclock (untiered recipe,
 * unset machine tier, or a machine at/under the recipe's own tier - underclocking isn't modeled,
 * since a machine below a recipe's minimum tier can't run it at all). */
export function overclockTierDiff(recipeTier: string | undefined, machineTier: string | undefined): number {
  const recipeIdx = tierIndex(recipeTier);
  const machineIdx = tierIndex(machineTier);
  if (recipeIdx === -1 || machineIdx === -1) return 0;
  return Math.max(0, machineIdx - recipeIdx);
}

/** GTCEu overclocking: each tier a machine runs above a recipe's own minimum tier halves the
 * recipe's duration (paired with `overclockedVoltage`'s 4x EU/t per tier) - never below 1 tick. */
export function overclockedDurationTicks(durationTicks: number, recipeTier: string | undefined, machineTier: string | undefined): number {
  const diff = overclockTierDiff(recipeTier, machineTier);
  return diff === 0 ? durationTicks : Math.max(1, Math.round(durationTicks / 2 ** diff));
}

/** The other half of overclocking - EU/t draw quadruples per tier a machine runs above the
 * recipe's own minimum tier (so total EU per craft still doubles per tier, even as it finishes in
 * half the time). */
export function overclockedVoltage(voltage: number, recipeTier: string | undefined, machineTier: string | undefined): number {
  const diff = overclockTierDiff(recipeTier, machineTier);
  return diff === 0 ? voltage : voltage * 4 ** diff;
}

/** "5 secs" / "0.5 secs" / "1 sec" - matches the exact wording GTCEu's own recipe display uses,
 * deliberately not lib/productionTime.ts's compact "5s"/"1m 12s" (that one's for canvas labels
 * where space is tight; this is recreating the game's own recipe-viewer text verbatim). */
export function formatRecipeSeconds(ticks: number): string {
  const seconds = Math.round((ticks / 20) * 10) / 10;
  return `${seconds} sec${seconds === 1 ? "" : "s"}`;
}
