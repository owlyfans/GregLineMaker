import { useMemo, useState } from "react";
import type { Recipe, RecipeDatabase } from "../types/recipe";
import { humanizeMachine } from "../solver/solve";
import { fuzzyFilter } from "../lib/fuzzy";
import { resolveMachineIconId } from "../lib/machineIcon";
import { tierRank } from "../lib/gtTiers";
import { useIconStore } from "../state/iconStore";
import { useSettingsStore } from "../state/settingsStore";
import { Modal } from "./Modal";
import { IconSlot } from "./IconSlot";
import { Tooltip } from "./Tooltip";
import { RecipeCard } from "./RecipeCard";

const FAVORITES_TAB = "__favorites__";
const SUGGESTED_TAB = "__suggested__";

interface RecipePickerModalProps {
  db: RecipeDatabase;
  /** "from": recipes that produce targetId (adds its inputs). "into": recipes that consume
   * targetId (adds its other inputs + all outputs) - the reverse direction. */
  direction: "from" | "into";
  targetKind: "item" | "fluid";
  targetId: string;
  targetLabel: string;
  /** Restricts the recipe list to just this machine type (e.g. "gtceu:macerator") - used when
   * attaching a recipe to an already-placed machine node (see ChainView's machineAttachFor), so the
   * picker can't offer a recipe belonging to a different machine than the one actually on canvas.
   * Omitted/undefined for the normal unrestricted "Create from/into" flow. */
  restrictToMachine?: string;
  favoriteRecipeIds?: Set<string>;
  onToggleFavorite?: (recipeId: string) => void;
  /** Recipes worth calling out because they'd consume a byproduct already flagged as a possible
   * refund elsewhere in the chain - only meaningful (and only shown) for direction "from". */
  suggestedRecipeIds?: Set<string>;
  onClose: () => void;
  onPick: (recipe: Recipe) => void;
}

function resolveName(db: RecipeDatabase, kind: "item" | "fluid", id: string): string {
  const map = kind === "item" ? db.items : db.fluids;
  return map[id] ?? id;
}

export function RecipePickerModal({
  db,
  direction,
  targetKind,
  targetId,
  targetLabel,
  restrictToMachine,
  favoriteRecipeIds,
  onToggleFavorite,
  suggestedRecipeIds,
  onClose,
  onPick,
}: RecipePickerModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showAboveTier, setShowAboveTier] = useState(false);
  const icons = useIconStore((s) => s.icons);
  const maxTier = useSettingsStore((s) => s.maxTier);

  const allMatching = useMemo(
    () =>
      db.recipes.filter(
        (r) =>
          (!restrictToMachine || r.machine === restrictToMachine) &&
          (direction === "from" ? r.outputs : r.inputs).some((io) => io.kind === targetKind && io.ids.includes(targetId)),
      ),
    [db, direction, targetKind, targetId, restrictToMachine],
  );

  // Recipes needing a higher tier than the player's set "highest tier available" (see
  // SettingsModal) - hidden by default since they can't actually be built yet, but the count is
  // surfaced with a checkbox to peek at them anyway (e.g. planning ahead for a tier not reached yet).
  const hiddenAboveTier = useMemo(
    () => (maxTier ? allMatching.filter((r) => tierRank(r.tier) > tierRank(maxTier)) : []),
    [allMatching, maxTier],
  );

  const matching = useMemo(
    () => (maxTier && !showAboveTier ? allMatching.filter((r) => tierRank(r.tier) <= tierRank(maxTier)) : allMatching),
    [allMatching, maxTier, showAboveTier],
  );

  const byMachine = useMemo(() => {
    const groups = new Map<string, Recipe[]>();
    for (const r of matching) {
      let list = groups.get(r.machine);
      if (!list) {
        list = [];
        groups.set(r.machine, list);
      }
      list.push(r);
    }
    for (const list of groups.values()) list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
    return groups;
  }, [matching]);

  const machineTabIds = useMemo(
    () => Array.from(byMachine.keys()).sort((a, b) => byMachine.get(b)!.length - byMachine.get(a)!.length),
    [byMachine],
  );

  const favoritesInScope = useMemo(
    () => (direction === "from" && favoriteRecipeIds ? matching.filter((r) => favoriteRecipeIds.has(r.id)) : []),
    [direction, matching, favoriteRecipeIds],
  );
  const suggestedInScope = useMemo(
    () => (direction === "from" && suggestedRecipeIds ? matching.filter((r) => suggestedRecipeIds.has(r.id)) : []),
    [direction, matching, suggestedRecipeIds],
  );

  const specialTabs = useMemo(() => {
    if (favoritesInScope.length > 0) return [{ id: FAVORITES_TAB, label: "Favorites", list: favoritesInScope }];
    if (suggestedInScope.length > 0) return [{ id: SUGGESTED_TAB, label: "Suggested", list: suggestedInScope }];
    return [];
  }, [favoritesInScope, suggestedInScope]);

  const allTabIds = useMemo(() => [...specialTabs.map((t) => t.id), ...machineTabIds], [specialTabs, machineTabIds]);
  const tab = activeTab && allTabIds.includes(activeTab) ? activeTab : allTabIds[0];

  const listForTab = useMemo(() => {
    const special = specialTabs.find((t) => t.id === tab);
    return special ? special.list : byMachine.get(tab) ?? [];
  }, [specialTabs, tab, byMachine]);

  const filteredForTab = useMemo(
    () => fuzzyFilter(query, listForTab, (r) => `${r.id} ${r.inputs.map((io) => resolveName(db, io.kind, io.ids[0])).join(" ")}`),
    [listForTab, query, db],
  );

  return (
    <Modal
      title={
        <>
          <IconSlot id={targetId} label={targetLabel} size={40} />
          {direction === "from" ? `Recipes that make ${targetLabel}` : `Recipes that use ${targetLabel}`}
        </>
      }
      onClose={onClose}
      width={860}
    >
      {allMatching.length === 0 ? (
        <p className="modal-empty">
          {restrictToMachine
            ? `No ${humanizeMachine(restrictToMachine)} recipe uses this item/fluid.`
            : direction === "from"
              ? "No recipes in the database produce this item/fluid - it's a raw resource."
              : "No recipes in the database consume this item/fluid."}
        </p>
      ) : matching.length === 0 ? (
        <p className="modal-empty">
          Every recipe here needs a higher tier than your {maxTier} limit ({hiddenAboveTier.length} hidden).{" "}
          <button type="button" className="settings-hint-link" onClick={() => setShowAboveTier(true)}>
            Show them anyway
          </button>
        </p>
      ) : (
        <>
          {hiddenAboveTier.length > 0 && (
            <label className="confirm-delete-option tier-filter-note">
              <input type="checkbox" checked={showAboveTier} onChange={(e) => setShowAboveTier(e.target.checked)} />
              Show {hiddenAboveTier.length} recipe{hiddenAboveTier.length === 1 ? "" : "s"} above your {maxTier} tier
              limit
            </label>
          )}
          <input
            className="modal-search"
            type="text"
            placeholder="Filter by ingredient or recipe id..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="modal-tabs">
            {specialTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`modal-tab${t.id === tab ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label} <span className="modal-tab-count">{t.list.length}</span>
              </button>
            ))}
            {machineTabIds.map((m) => {
              const machineLabel = humanizeMachine(m);
              const iconId = resolveMachineIconId(icons, m, byMachine.get(m)![0].tier);
              return (
                <button
                  key={m}
                  type="button"
                  className={`modal-tab${m === tab ? " active" : ""}`}
                  onClick={() => setActiveTab(m)}
                >
                  <IconSlot id={iconId} label={machineLabel} size={26} />
                  <span>{machineLabel}</span>
                  <span className="modal-tab-count">{byMachine.get(m)!.length}</span>
                </button>
              );
            })}
          </div>
          <ul className="recipe-list">
            {filteredForTab.map((r) => {
              const matchIo = (direction === "from" ? r.outputs : r.inputs).find(
                (io) => io.kind === targetKind && io.ids.includes(targetId),
              );
              const isFavorite = favoriteRecipeIds?.has(r.id) ?? false;
              return (
                <li key={r.id} className="recipe-list-item" onClick={() => onPick(r)}>
                  <div className="recipe-list-row">
                    {onToggleFavorite && (
                      <Tooltip label={isFavorite ? "Unfavorite" : "Favorite"}>
                        <button
                          type="button"
                          className={`favorite-star${isFavorite ? " active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(r.id);
                          }}
                        >
                          {isFavorite ? "★" : "☆"}
                        </button>
                      </Tooltip>
                    )}
                    <span className="recipe-produces">
                      {direction === "from" ? "produces" : "uses"} {targetLabel}
                      {matchIo?.chancePercent !== undefined && matchIo.chancePercent < 100 ? ` (${matchIo.chancePercent}%)` : ""}
                    </span>
                  </div>
                  <RecipeCard recipe={r} db={db} highlight={{ kind: targetKind, id: targetId }} />
                </li>
              );
            })}
            {filteredForTab.length === 0 && <li className="modal-empty">No recipes match that filter.</li>}
          </ul>
        </>
      )}
    </Modal>
  );
}
