import { useMemo, useState } from "react";
import type { Recipe, RecipeDatabase } from "../types/recipe";
import type { RefundPath } from "../solver/refund";
import { humanizeMachine, type NodeKind } from "../solver/solve";
import { resolveMachineIconId } from "../lib/machineIcon";
import { useIconStore } from "../state/iconStore";
import { Modal } from "./Modal";
import { IconSlot } from "./IconSlot";

interface RefundSuggestionsModalProps {
  db: RecipeDatabase;
  fromKind: NodeKind;
  fromId: string;
  fromLabel: string;
  matchLabelFor: (path: RefundPath) => string;
  paths: RefundPath[];
  onClose: () => void;
  onPick: (path: RefundPath) => void;
}

function resolveName(db: RecipeDatabase, kind: NodeKind, id: string): string {
  const map = kind === "item" ? db.items : db.fluids;
  return map[id] ?? id;
}

/** What this hop needs besides the item being chained through from the previous step - the
 * actual "cost" of taking this step, since the chain view alone hides that. */
function extraCostFor(recipe: Recipe, chained: { kind: NodeKind; id: string }) {
  return recipe.inputs.filter((io) => !(io.kind === chained.kind && io.ids.includes(chained.id)));
}

export function RefundSuggestionsModal({
  db,
  fromKind,
  fromId,
  fromLabel,
  matchLabelFor,
  paths,
  onClose,
  onPick,
}: RefundSuggestionsModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const icons = useIconStore((s) => s.icons);

  // Grouped by which existing chain item the path closes the loop into - that's the decision
  // that actually matters ("refund into what"), with each group's paths cheapest-first.
  const byMatch = useMemo(() => {
    const groups = new Map<string, { label: string; paths: RefundPath[] }>();
    for (const p of paths) {
      const key = `${p.matchKind}:${p.matchId}`;
      let group = groups.get(key);
      if (!group) {
        group = { label: matchLabelFor(p), paths: [] };
        groups.set(key, group);
      }
      group.paths.push(p);
    }
    for (const group of groups.values()) group.paths.sort((a, b) => a.steps.length - b.steps.length);
    return groups;
  }, [paths, matchLabelFor]);

  const matchTabs = useMemo(
    () => Array.from(byMatch.keys()).sort((a, b) => byMatch.get(b)!.paths.length - byMatch.get(a)!.paths.length),
    [byMatch],
  );

  const tab = activeTab && byMatch.has(activeTab) ? activeTab : matchTabs[0];
  const pathsForTab = tab ? byMatch.get(tab)?.paths ?? [] : [];

  return (
    <Modal
      title={
        <>
          <IconSlot id={fromId} label={fromLabel} size={32} />
          Turn {fromLabel} into something you already need
        </>
      }
      onClose={onClose}
      width={720}
    >
      {paths.length === 0 ? (
        <p className="modal-empty">No suggestions found.</p>
      ) : (
        <>
          <div className="modal-tabs">
            {matchTabs.map((key) => (
              <button
                key={key}
                type="button"
                className={`modal-tab${key === tab ? " active" : ""}`}
                onClick={() => setActiveTab(key)}
              >
                {byMatch.get(key)!.label} <span className="modal-tab-count">{byMatch.get(key)!.paths.length}</span>
              </button>
            ))}
          </div>
          <ul className="recipe-list">
            {pathsForTab.map((path, i) => {
              let chained = { kind: fromKind, id: fromId };
              return (
                <li key={i} className="recipe-list-item refund-path-item" onClick={() => onPick(path)}>
                  <div className="recipe-list-row">
                    <span className="badge tier-badge">
                      {path.steps.length} step{path.steps.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="refund-path-chain">
                    <span className="refund-path-node">
                      <IconSlot id={fromId} label={fromLabel} size={34} />
                      <span className="io-chip-label">{fromLabel}</span>
                    </span>
                    {path.steps.map((step, j) => {
                      const cost = extraCostFor(step.recipe, chained);
                      chained = { kind: step.producedKind, id: step.producedId };
                      const machineIconId = resolveMachineIconId(icons, step.recipe.machine, step.recipe.tier);
                      const machineLabel = humanizeMachine(step.recipe.machine);
                      return (
                        <span key={j} className="refund-path-hop">
                          <span className="refund-path-arrow">&rarr;</span>
                          <span className="refund-path-step">
                            <span className="refund-path-machine">
                              <IconSlot id={machineIconId} label={machineLabel} size={22} topBadge={step.recipe.tier} />
                              {machineLabel}
                            </span>
                            {cost.length > 0 && (
                              <span className="refund-path-cost">
                                {cost.map((io, k) => (
                                  <span key={k} className="refund-path-cost-chip">
                                    <IconSlot
                                      id={io.ids[0]}
                                      label={resolveName(db, io.kind, io.ids[0])}
                                      size={22}
                                      cornerBadge={io.amount}
                                    />
                                    {resolveName(db, io.kind, io.ids[0])}
                                    {k < cost.length - 1 ? ", " : ""}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                          <span className="refund-path-arrow">&rarr;</span>
                          <span className="refund-path-node">
                            <IconSlot id={step.producedId} label={resolveName(db, step.producedKind, step.producedId)} size={34} />
                            <span className="io-chip-label">{resolveName(db, step.producedKind, step.producedId)}</span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
