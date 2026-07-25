// GTCEu's own voltage-tier ladder - keep in sync with GTValues.VN in the mod (see solve.ts's own
// copy, kept separate since it treats "untiered"/"unknown" differently for its own purposes).
export const TIER_ORDER = [
  "ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX",
];

export function tierIndex(tier?: string): number {
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
