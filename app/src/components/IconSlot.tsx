import type { ReactNode } from "react";
import { useIconStore } from "../state/iconStore";
import { Tooltip } from "./Tooltip";
import { ItemTooltipContent } from "./ItemTooltipContent";

interface IconSlotProps {
  /** icons.json key to resolve. When it doesn't resolve to anything (no texture for this id, e.g.
   * most fluids/tinted materials - see iconStore.ts), falls back to a monogram tile derived from
   * `label` so the slot-first layout never collapses down to bare text. */
  id?: string;
  label?: string;
  size?: number;
  /** Rendered top-left, e.g. a recipe tier ("HV") or chance percent - kept small/outlined like
   * Minecraft's own stack-count font so it reads at a glance without competing with the icon. */
  topBadge?: ReactNode;
  /** CSS `background-image` gradient (see lib/gtTiers' tierGradient) applied as a text-fill to
   * `topBadge` instead of the default plain white - for tier badges specifically, not chance%/other
   * uses of topBadge, so this is opt-in per call site rather than automatic. */
  topBadgeGradient?: string;
  /** Rendered bottom-right, e.g. a quantity ("24x") - the Minecraft stack-count position. */
  cornerBadge?: ReactNode;
  className?: string;
  /** Shows a Minecraft-item-tooltip-styled popover (see ItemTooltipContent) instead of the plain
   * `label` text, appearing with no hover delay - for actual item/fluid icons (e.g. RecipeCard's
   * ingredient slots), not machine or generic UI icons, which keep the plain delayed tooltip. */
  itemTooltip?: { kind: "item" | "fluid"; resourceId: string };
}

/** The identity tile used everywhere an item/fluid/machine needs to be recognized at a glance:
 * a beveled slot (mirrors vanilla Minecraft's inventory slot sinking effect) with the real texture
 * filling most of it and small outlined badges in the corners - icon first, text is a caption. */
export function IconSlot({
  id,
  label,
  size = 40,
  topBadge,
  topBadgeGradient,
  cornerBadge,
  className = "",
  itemTooltip,
}: IconSlotProps) {
  const src = useIconStore((s) => (id ? s.icons[id] : undefined));
  const iconsLoading = useIconStore((s) => s.loading);
  // While icons.json itself is still loading, an unresolved id might just not have its answer yet
  // rather than genuinely having no icon (most fluids, some tinted materials) - shimmer the
  // fallback tile for that duration so it reads as "still loading" instead of looking identical to
  // the permanent no-icon case.
  const stillResolving = iconsLoading && !src;
  const tooltipLabel = itemTooltip ? <ItemTooltipContent name={label} resourceId={itemTooltip.resourceId} /> : label;
  return (
    <Tooltip label={tooltipLabel} bare={!!itemTooltip} delay={itemTooltip ? { open: 0, close: 0 } : undefined}>
      <div className={`icon-slot ${className}`} style={{ width: size, height: size }}>
        {src ? (
          <img src={src} alt="" className="icon-slot-img" style={{ width: size * 1.1, height: size * 1.1 }} />
        ) : (
          <span className={`icon-slot-fallback${stillResolving ? " icon-slot-loading" : ""}`} style={{ fontSize: size * 0.6 }}>
            {stillResolving ? "" : (label ?? "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        {topBadge !== undefined && topBadge !== null && (
          <span
            className="icon-slot-badge icon-slot-badge-top"
            style={
              topBadgeGradient
                ? {
                    backgroundImage: topBadgeGradient,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    WebkitTextFillColor: "transparent",
                  }
                : undefined
            }
          >
            {topBadge}
          </span>
        )}
        {cornerBadge !== undefined && cornerBadge !== null && (
          <span className="icon-slot-badge icon-slot-badge-corner">{cornerBadge}</span>
        )}
      </div>
    </Tooltip>
  );
}
