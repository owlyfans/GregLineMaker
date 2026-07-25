// GTCEu's own voltage-tier ladder (each tier is 4x the previous, starting at ULV=8 EU/t) - used to
// turn a recipe's raw `voltage` (EU/t) into the "X.XX A @ TIER" usage line the game itself shows.
// Also the canonical tier ordering shared by the settings tier-filter/preferred-tier UI (see
// state/settingsStore.ts) and the recipe picker.
export const TIER_ORDER = [
  "ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX",
];

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

/** Rank of a tier in TIER_ORDER (0 = ULV, higher = further up the ladder). Untiered recipes
 * (undefined) rank below everything - they're always available regardless of a tier cap. */
export function tierRank(tier?: string): number {
  if (!tier) return -1;
  const i = TIER_ORDER.indexOf(tier);
  return i === -1 ? Infinity : i;
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

/** "5 secs" / "0.5 secs" / "1 sec" - matches the exact wording GTCEu's own recipe display uses,
 * deliberately not lib/productionTime.ts's compact "5s"/"1m 12s" (that one's for canvas labels
 * where space is tight; this is recreating the game's own recipe-viewer text verbatim). */
export function formatRecipeSeconds(ticks: number): string {
  const seconds = Math.round((ticks / 20) * 10) / 10;
  return `${seconds} sec${seconds === 1 ? "" : "s"}`;
}
