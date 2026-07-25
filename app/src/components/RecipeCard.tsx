import type { Recipe, RecipeDatabase, RecipeIo } from "../types/recipe";
import { formatRecipeSeconds, tierGradient, tierVoltage } from "../lib/gtTiers";
import { isConfigItem } from "../solver/solve";
import { IconSlot } from "./IconSlot";

function resolveName(db: RecipeDatabase, kind: "item" | "fluid", id: string): string {
  const map = kind === "item" ? db.items : db.fluids;
  return map[id] ?? id;
}

function ioAmountLabel(io: RecipeIo): string {
  return io.kind === "fluid" ? `${io.amount}mB` : `${io.amount}`;
}

interface IoGridProps {
  db: RecipeDatabase;
  ios: RecipeIo[];
  size: number;
  /** Rings the slot matching this id/kind - the item the picker/suggestion modal was actually
   * opened for, so it's obvious at a glance which slot in the full recipe that corresponds to. */
  highlight?: { kind: "item" | "fluid"; id: string };
}

/** A 3-wide grid of slots (matching the recipe-viewer layout GTCEu itself uses in-game for its
 * item/fluid inputs and outputs) - exactly as many slots as the recipe actually has, no padding to
 * a fixed size the way the game's own fixed-shape GUI does, since that padding carries no
 * information here. */
function IoGrid({ db, ios, size, highlight }: IoGridProps) {
  if (ios.length === 0) return null;
  return (
    <div className="recipe-card-grid" style={{ gridTemplateColumns: `repeat(3, ${size}px)` }}>
      {ios.map((io, i) => {
        const isHighlighted = highlight && io.kind === highlight.kind && io.ids.includes(highlight.id);
        return (
          <IconSlot
            key={i}
            id={io.ids[0]}
            label={resolveName(db, io.kind, io.ids[0])}
            size={size}
            className={isHighlighted ? "recipe-card-slot-highlight" : ""}
            cornerBadge={ioAmountLabel(io)}
            topBadge={io.chancePercent !== undefined && io.chancePercent < 100 ? `${io.chancePercent}%` : undefined}
            itemTooltip={{ kind: io.kind, resourceId: io.ids[0] }}
          />
        );
      })}
    </div>
  );
}

interface RecipeCardProps {
  recipe: Recipe;
  db: RecipeDatabase;
  /** Rings whichever input/output slot matches this id/kind. */
  highlight?: { kind: "item" | "fluid"; id: string };
  /** Smaller slots/tighter padding, no stats footer - for contexts a full card would overwhelm
   * (e.g. one hop in RefundSuggestionsModal's multi-step chain). */
  compact?: boolean;
}

/** Recreates GTCEu's own in-game/JEI recipe-viewer layout (see ui-examples/ for the reference
 * screenshots this is modeled on) rather than this app's earlier ad-hoc "chip list" - a grid of
 * input slots, an arrow, a grid of output slots, and (when the recipe carries EU data) a footer
 * with Duration/Total EU/Usage and a tier badge, computed from the recipe's own voltage/duration
 * the same way the game itself derives them (see lib/gtTiers.ts). Kept in this app's existing dark
 * theme/IconSlot styling throughout rather than literally recreating the game's light-gray GUI
 * chrome, so it stays visually consistent with every other modal/panel already built. */
// Programmed circuits are a machine config value, not a real ingredient (see isConfigItem) -
// never worth showing in a recipe card, whichever slot they'd otherwise land in.
function realIos(ios: RecipeIo[]): RecipeIo[] {
  return ios.filter((io) => !(io.kind === "item" && isConfigItem(io.ids[0])));
}

export function RecipeCard({ recipe, db, highlight, compact = false }: RecipeCardProps) {
  const voltage = tierVoltage(recipe.tier);
  const amps = recipe.voltage !== undefined && voltage ? recipe.voltage / voltage : undefined;
  const totalEu = recipe.voltage !== undefined && recipe.durationTicks !== undefined ? recipe.voltage * recipe.durationTicks : undefined;
  const hasStats =
    !compact && (recipe.durationTicks !== undefined || totalEu !== undefined || amps !== undefined || recipe.heatRequirement !== undefined);
  const slotSize = compact ? 44 : 64;

  return (
    <div className={`recipe-card${compact ? " compact" : ""}`}>
      <div className="recipe-card-io">
        <IoGrid db={db} ios={realIos(recipe.inputs)} size={slotSize} highlight={highlight} />
        <div className="recipe-card-arrow">
          <svg width={compact ? 24 : 32} height={compact ? 19 : 25} viewBox="0 0 18 14" fill="none">
            <path
              d="M1 7 H12 M8 2 L14 7 L8 12"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <IoGrid db={db} ios={realIos(recipe.outputs)} size={slotSize} highlight={highlight} />
      </div>
      {hasStats && (
        <div className="recipe-card-stats">
          <div className="recipe-card-stats-lines">
            {recipe.durationTicks !== undefined && <div>Duration: {formatRecipeSeconds(recipe.durationTicks)}</div>}
            {totalEu !== undefined && <div>Total: {Math.round(totalEu).toLocaleString()} EU</div>}
            {amps !== undefined && (
              <div>
                Usage: {amps.toFixed(2)} A{recipe.tier ? ` @ ${recipe.tier}` : ""}
              </div>
            )}
            {/* A coil multiblock (Electric Blast Furnace/Alloy Blast Smelter) heat requirement -
             * see lib/coils - matches the wording GTCEu's own recipe viewer uses for it. */}
            {recipe.heatRequirement !== undefined && <div>Temp: {recipe.heatRequirement.toLocaleString()} K</div>}
          </div>
          {recipe.tier && (
            <span
              className="recipe-card-tier"
              style={{
                backgroundImage: tierGradient(recipe.tier),
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              {recipe.tier}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
