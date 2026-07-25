// TerraFirmaGreg (this pack - see pipeline/extract_icons.mjs's default instance dir) reimplements
// several GTCEu machine types (aqueous accumulator, food oven, greenhouse, pisciculture fishery,
// ...) as its own "tfg:" blocks while still registering their recipes under the "gtceu:" recipe-type
// namespace, so the block that actually has an icon lives under a different namespace than the
// recipe's own "machine" id. Tried as a fallback below.
const FALLBACK_NAMESPACES = ["tfg"];

function lookupInNamespace(
  icons: Record<string, string>,
  ns: string,
  path: string,
  tier: string | undefined,
): string | undefined {
  if (tier) {
    const tieredId = `${ns}:${tier.toLowerCase()}_${path}`;
    if (icons[tieredId]) return tieredId;
  }
  const bareId = `${ns}:${path}`;
  return icons[bareId] ? bareId : undefined;
}

/**
 * Resolves a machine id (e.g. "gtceu:macerator") + optional recipe tier to whichever icons.json
 * key actually has an icon, if any. Tiered GTCEu machines are captured under a per-tier block item
 * id (e.g. "gtceu:lv_macerator") rather than the bare recipe-type id, so the tiered form is tried
 * first, falling back to the bare id (covers untiered multiblocks like the electric blast furnace),
 * then to FALLBACK_NAMESPACES for machines whose block lives under a different mod entirely.
 * Returns the icons.json key itself (not the URL) so callers can hand it straight to <Icon id=.../>.
 */
export function resolveMachineIconId(
  icons: Record<string, string>,
  machineId: string | undefined,
  tier: string | undefined,
): string | undefined {
  if (!machineId) return undefined;
  const colon = machineId.indexOf(":");
  if (colon === -1) return icons[machineId] ? machineId : undefined;
  const ns = machineId.slice(0, colon);
  const path = machineId.slice(colon + 1);

  const own = lookupInNamespace(icons, ns, path, tier);
  if (own) return own;

  for (const fallbackNs of FALLBACK_NAMESPACES) {
    if (fallbackNs === ns) continue;
    const found = lookupInNamespace(icons, fallbackNs, path, tier);
    if (found) return found;
  }
  return undefined;
}
