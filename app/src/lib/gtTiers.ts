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

// Mid-stop of TIER_GRADIENT_STOPS below (the primary/vivid shade) for tiers with real logo source
// data (see ui-examples/GregLineMakerTierColors/*.svg) - flat approximations, picked from this
// app's own existing palette, for the tiers without a logo file yet.
const TIER_COLOR: Record<string, string> = {
  ULV: "#8b93a3",
  LV: "#FCA462",
  MV: "#53F9F9",
  HV: "#F9A600",
  EV: "#FC4CFC",
  IV: "#5353F9",
  LuV: "#F953F9",
  ZPM: "#FC7E7E",
  UV: "#00A6A6",
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

// Vertical (top/mid/bottom) gradient stops lifted straight from this app's actual tier logo
// artwork (see ui-examples/GregLineMakerTierColors/*.svg - source of truth, not guessed). Only
// covers the tiers a logo has been provided for; tierGradient() below falls back to a flat
// TIER_COLOR repeat for the rest.
const TIER_GRADIENT_STOPS: Record<string, [string, string, string]> = {
  LV: ["#FCCA6D", "#FCA462", "#4F3F33"],
  MV: ["#B3FBFC", "#53F9F9", "#41C5C5"],
  HV: ["#FCE661", "#F9A600", "#C38100"],
  EV: ["#7E037E", "#FC4CFC", "#7E037E"],
  IV: ["#5F85FC", "#5353F9", "#4848D7"],
  LuV: ["#FC9AFC", "#F953F9", "#C846C8"],
  ZPM: ["#F95353", "#FC7E7E", "#CC4949"],
  UV: ["#00FCFC", "#00A6A6", "#037E7E"],
};

/** CSS `background-image` gradient recreating this app's tier logo artwork, top-to-bottom to match
 * the source SVGs' own vertical gradient direction. Falls back to a flat repeat of `tierColor` for
 * tiers without logo source data yet. */
export function tierGradient(tier?: string): string {
  const stops = tier ? TIER_GRADIENT_STOPS[tier] : undefined;
  const [top, mid, bottom] = stops ?? [tierColor(tier), tierColor(tier), tierColor(tier)];
  return `linear-gradient(180deg, ${top} 0%, ${mid} 50%, ${bottom} 100%)`;
}

// Order matters here - index = rank on the voltage ladder, used by the overclock math below and
// shared with the settings tier-filter/preferred-tier UI (see state/settingsStore.ts) and the
// recipe picker.
export const TIER_ORDER = Object.keys(TIER_VOLTAGE);

export function tierIndex(tier?: string): number {
  if (!tier) return -1;
  return TIER_ORDER.indexOf(tier);
}

/** Steps a tier DOWN the voltage ladder by `stepsDown` rungs (clamped at ULV, the bottom) - used to
 * work out what tier of engine to build given a machine's own tier and how many rungs lower the
 * player wants to power it from (see settingsStore's engineTierOffset/lib/power.ts). Undefined
 * input/unknown tier string passes through unchanged - nothing to step from. */
export function tierAtOffset(tier: string | undefined, stepsDown: number): string | undefined {
  const idx = tierIndex(tier);
  if (idx === -1) return tier;
  return TIER_ORDER[Math.max(0, idx - stepsDown)];
}

/** Rank of a tier in TIER_ORDER (0 = ULV, higher = further up the ladder). Untiered recipes
 * (undefined) rank below everything - they're always available regardless of a tier cap. Same
 * ordering as tierIndex above, just Infinity (not -1) for a tier string that isn't in TIER_ORDER
 * at all - lets a sort put "unknown tier" recipes last instead of first. */
export function tierRank(tier?: string): number {
  if (!tier) return -1;
  const i = TIER_ORDER.indexOf(tier);
  return i === -1 ? Infinity : i;
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
