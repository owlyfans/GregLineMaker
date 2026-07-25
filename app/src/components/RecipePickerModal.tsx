import { useMemo, useState } from "react";
import type { Recipe, RecipeDatabase } from "../types/recipe";
import { humanizeMachine, isConfigItem } from "../solver/solve";
import { fuzzyFilter } from "../lib/fuzzy";
import { resolveMachineIconId } from "../lib/machineIcon";
import { useIconStore } from "../state/iconStore";
import { Modal } from "./Modal";
import { IconSlot } from "./IconSlot";
import { Tooltip } from "./Tooltip";

const TIER_ORDER = ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV", "UEV", "UIV", "UXV", "OpV", "MAX"];
function tierRank(tier?: string): number {
  if (!tier) return -1;
  const i = TIER_ORDER.indexOf(tier);
  return i === -1 ? 999 : i;
}

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

function IoChip({ db, io }: { db: RecipeDatabase; io: Recipe["inputs"][number] }) {
  const name = resolveName(db, io.kind, io.ids[0]);
  const alt = io.ids.length > 1 ? ` (+${io.ids.length - 1} alt)` : "";
  return (
    <>
      <IconSlot id={io.ids[0]} label={name} size={40} cornerBadge={io.amount} />
      <span className="io-chip-label">
        {name}
        {alt}
      </span>
    </>
  );
}

export function RecipePickerModal({
  db,
  direction,
  targetKind,
  targetId,
  targetLabel,
  favoriteRecipeIds,
  onToggleFavorite,
  suggestedRecipeIds,
  onClose,
  onPick,
}: RecipePickerModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const icons = useIconStore((s) => s.icons);

  const matching = useMemo(
    () =>
      db.recipes.filter((r) =>
        (direction === "from" ? r.outputs : r.inputs).some((io) => io.kind === targetKind && io.ids.includes(targetId)),
      ),
    [db, direction, targetKind, targetId],
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
      {matching.length === 0 ? (
        <p className="modal-empty">
          {direction === "from"
            ? "No recipes in the database produce this item/fluid - it's a raw resource."
            : "No recipes in the database consume this item/fluid."}
        </p>
      ) : (
        <>
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
              )!;
              // Programmed circuits are a machine config value, not a real ingredient (see
              // isConfigItem) - never worth showing in a recipe preview, whichever list they'd
              // otherwise land in.
              const otherIos = (direction === "from" ? r.outputs : r.inputs).filter(
                (io) => io !== matchIo && !(io.kind === "item" && isConfigItem(io.ids[0])),
              );
              const displayIos = (direction === "from" ? r.inputs : r.outputs).filter(
                (io) => !(io.kind === "item" && isConfigItem(io.ids[0])),
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
                    <IconSlot
                      id={targetId}
                      label={targetLabel}
                      size={36}
                      cornerBadge={matchIo.amount}
                      topBadge={matchIo.chancePercent !== undefined ? `${matchIo.chancePercent}%` : r.tier}
                    />
                    <span className="recipe-produces">
                      {direction === "from" ? "produces" : "uses"} {targetLabel}
                    </span>
                  </div>
                  <div className="recipe-inputs">
                    {displayIos.map((io, i) => (
                      <span key={i} className="recipe-input-chip">
                        <IoChip db={db} io={io} />
                      </span>
                    ))}
                  </div>
                  {otherIos.length > 0 && (
                    <div className="recipe-byproducts">
                      <span className="recipe-byproducts-label">{direction === "from" ? "also" : "also needs"}</span>
                      {otherIos.map((o, i) => (
                        <span key={i} className="recipe-byproduct-chip">
                          <IconSlot id={o.ids[0]} label={resolveName(db, o.kind, o.ids[0])} size={30} cornerBadge={o.amount} />
                          <span className="io-chip-label">{resolveName(db, o.kind, o.ids[0])}</span>
                        </span>
                      ))}
                    </div>
                  )}
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
