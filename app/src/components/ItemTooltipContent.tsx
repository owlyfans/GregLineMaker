interface ItemTooltipContentProps {
  name?: string;
  /** Full namespaced id, e.g. "gtceu:crushed_bauxite_ore" - split to also show the owning
   * namespace as a stand-in for the mod-name line real Minecraft/GTCEu tooltips show (see
   * ui-examples/item-tooltip-example.png, fluid-tooltip-example.png). This app's data model only
   * carries id -> display name (see RecipeDatabase), not the richer per-item metadata those
   * screenshots show (chemical formula, hardness/weight, temperature/state, tags, mod display
   * name) - so this recreates the tooltip's visual chrome faithfully without fabricating info we
   * don't actually have. */
  resourceId: string;
}

/** Recreates Minecraft's classic item-tooltip chrome (dark body, purple gradient border, bold
 * white title) rather than this app's plain dark tooltip bubble - used specifically for actual
 * item/fluid icons via IconSlot's `itemTooltip` prop, not machine or generic UI icons. */
export function ItemTooltipContent({ name, resourceId }: ItemTooltipContentProps) {
  const namespace = resourceId.includes(":") ? resourceId.slice(0, resourceId.indexOf(":")) : undefined;
  return (
    <div className="mc-tooltip">
      {name && <div className="mc-tooltip-title">{name}</div>}
      <div className="mc-tooltip-id">{resourceId}</div>
      {namespace && <div className="mc-tooltip-mod">{namespace}</div>}
    </div>
  );
}
