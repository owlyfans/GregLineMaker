import { useMemo, useState } from "react";
import type { RecipeDatabase } from "../types/recipe";
import type { RefundPath } from "../solver/refund";
import { humanizeMachine, type NodeKind } from "../solver/solve";
import { resolveMachineIconId } from "../lib/machineIcon";
import { tierColor } from "../lib/gtTiers";
import { useIconStore } from "../state/iconStore";
import { Modal } from "./Modal";
import { IconSlot } from "./IconSlot";
import { RecipeCard } from "./RecipeCard";

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

export function RefundSuggestionsModal({
  db,
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
            {pathsForTab.map((path, i) => (
              <li key={i} className="recipe-list-item refund-path-item" onClick={() => onPick(path)}>
                <div className="recipe-list-row">
                  <span className="badge tier-badge">
                    {path.steps.length} step{path.steps.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="refund-path-chain">
                  {path.steps.map((step, j) => {
                    const machineIconId = resolveMachineIconId(icons, step.recipe.machine, step.recipe.tier);
                    const machineLabel = humanizeMachine(step.recipe.machine);
                    return (
                      <div key={j} className="refund-path-hop">
                        {j > 0 && <div className="refund-path-divider" />}
                        <div className="refund-path-step">
                          <div className="refund-path-step-title">Step {j + 1}</div>
                          <div className="refund-path-machine">
                            <IconSlot
                              id={machineIconId}
                              label={machineLabel}
                              size={20}
                              topBadge={step.recipe.tier}
                              topBadgeColor={step.recipe.tier ? tierColor(step.recipe.tier) : undefined}
                            />
                            {machineLabel}
                          </div>
                          <RecipeCard
                            recipe={step.recipe}
                            db={db}
                            compact
                            highlight={{ kind: step.producedKind, id: step.producedId }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
