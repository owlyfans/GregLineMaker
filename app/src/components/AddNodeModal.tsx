import { useMemo, useState } from "react";
import type { RecipeDatabase } from "../types/recipe";
import { humanizeMachine } from "../solver/solve";
import { resolveMachineIconId } from "../lib/machineIcon";
import { COIL_MACHINE_TYPES, COIL_TYPES } from "../lib/coils";
import { useIconStore } from "../state/iconStore";
import { useSettingsStore } from "../state/settingsStore";
import { ItemPicker, type PickerOption } from "./ItemPicker";
import { QuickAmountButtons } from "./QuickAmountButtons";
import { Modal } from "./Modal";

const TIERS = ["ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV"];

type AddNodeKind = "item" | "fluid" | "machine" | "note";

interface AddNodeModalProps {
  db: RecipeDatabase;
  onClose: () => void;
  onAddItem: (kind: "item" | "fluid", itemId: string, label: string, amount?: string) => void;
  onAddMachine: (label: string, tier: string | undefined, machineId: string | undefined, coilTier: string | undefined) => void;
  onAddNote: (text: string) => void;
}

// The 8 most common distinct fluid-input amounts (18mB and up - anything smaller is a trivial
// edge case, not a realistic quick-pick) across every real recipe in the database - fluid amounts
// run mB-scale (100s-1000s), nothing like the 1-256 item-count buttons the Amount field's
// QuickAmountButtons otherwise defaults to, so the Fluid tab gets its own list instead, computed
// straight from actual usage rather than guessed round numbers.
const MIN_FLUID_QUICK_AMOUNT = 18;

function commonFluidAmounts(db: RecipeDatabase): number[] {
  const counts = new Map<number, number>();
  for (const r of db.recipes) {
    for (const io of r.inputs) {
      if (io.kind !== "fluid" || io.amount < MIN_FLUID_QUICK_AMOUNT) continue;
      counts.set(io.amount, (counts.get(io.amount) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([amount]) => amount)
    .sort((a, b) => a - b);
}

export function AddNodeModal({ db, onClose, onAddItem, onAddMachine, onAddNote }: AddNodeModalProps) {
  const preferredTier = useSettingsStore((s) => s.preferredTier);
  const [kind, setKind] = useState<AddNodeKind>("item");
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [machineId, setMachineId] = useState<string | null>(null);
  // Pre-fills from Settings' "preferred tier for new machines" (see SettingsModal) when it's one
  // of the tiers this dropdown actually offers - still an editable default, not a locked value.
  const [machineTier, setMachineTier] = useState(preferredTier && TIERS.includes(preferredTier) ? preferredTier : "");
  const [coilTier, setCoilTier] = useState("");
  const [noteText, setNoteText] = useState("");
  const icons = useIconStore((s) => s.icons);
  const usesCoil = !!machineId && COIL_MACHINE_TYPES.has(machineId);

  // Every fluid id that's actually consumed as an ingredient by some real recipe - a fluid that
  // never shows up in any recipe's inputs is a dead end for chain-building (nothing to turn it
  // into), so the Fluid tab's dropdown below filters down to just these instead of every fluid the
  // game happens to register (the vast majority of which are unrelated to GTCEu processing at all).
  const craftableFluidIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of db.recipes) {
      for (const io of r.inputs) {
        if (io.kind !== "fluid") continue;
        for (const id of io.ids) ids.add(id);
      }
    }
    return ids;
  }, [db]);

  // Item ids that show up in some recipe's inputs or outputs. Some imported item ids are
  // duplicates of a "real" item under a different id with no recipes attached at all - sorting
  // those to the bottom (instead of filtering outright, since a genuinely recipe-less raw
  // material is still a valid chain endpoint) means the picker's default/tied-fuzzy-match order
  // surfaces the recipe-bearing id first.
  const itemsWithRecipeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of db.recipes) {
      for (const io of r.inputs) {
        if (io.kind !== "item") continue;
        for (const id of io.ids) ids.add(id);
      }
      for (const io of r.outputs) {
        if (io.kind !== "item") continue;
        for (const id of io.ids) ids.add(id);
      }
    }
    return ids;
  }, [db]);

  const fluidQuickAmounts = useMemo(() => commonFluidAmounts(db), [db]);

  const options: PickerOption[] = useMemo(() => {
    if (kind !== "item" && kind !== "fluid") return [];
    if (kind === "fluid") {
      return Object.entries(db.fluids)
        .filter(([id]) => craftableFluidIds.has(id))
        .map(([id, label]) => ({ id, label }));
    }
    return Object.entries(db.items)
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => Number(itemsWithRecipeIds.has(b.id)) - Number(itemsWithRecipeIds.has(a.id)));
  }, [db, kind, craftableFluidIds, itemsWithRecipeIds]);

  // Every distinct machine the recipe database actually knows about - picking from this (instead
  // of a free-text name) keeps a manually added machine node's label/icon tied to a real GTCEu
  // machine, the same way one added via the recipe picker already is.
  const machineOptions: PickerOption[] = useMemo(() => {
    const ids = new Set(db.recipes.map((r) => r.machine));
    return [...ids].map((id) => ({ id, label: humanizeMachine(id) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [db]);

  const canSubmit = kind === "machine" ? !!machineId : kind === "note" ? noteText.trim().length > 0 : !!selected;

  function submit() {
    if (kind === "machine") {
      if (!machineId) return;
      const label = machineOptions.find((o) => o.id === machineId)?.label ?? machineId;
      onAddMachine(label, machineTier || undefined, machineId, usesCoil ? coilTier || undefined : undefined);
    } else if (kind === "note") {
      if (!noteText.trim()) return;
      onAddNote(noteText.trim());
    } else if (selected) {
      const label = (kind === "fluid" ? db.fluids : db.items)[selected] ?? selected;
      onAddItem(kind, selected, label, amount.trim() || undefined);
    }
    onClose();
  }

  return (
    <Modal title="Add node" onClose={onClose} width={480}>
      <div className="modal-tabs">
        {(["item", "fluid", "machine", "note"] as AddNodeKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`modal-tab${k === kind ? " active" : ""}`}
            onClick={() => {
              setKind(k);
              setSelected(null);
            }}
          >
            {k === "item" ? "Item" : k === "fluid" ? "Fluid" : k === "machine" ? "Machine" : "Note"}
          </button>
        ))}
      </div>

      {kind === "item" || kind === "fluid" ? (
        <div className="add-node-form">
          <ItemPicker
            label={kind === "fluid" ? "Fluid" : "Item"}
            placeholder="Search..."
            options={options}
            value={selected}
            onChange={setSelected}
            clearable
          />
          <label className="add-node-amount-label">
            Amount (optional)
            <input
              type="text"
              className="add-node-amount-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 16"
            />
          </label>
          <QuickAmountButtons onPick={(n) => setAmount(String(n))} amounts={kind === "fluid" ? fluidQuickAmounts : undefined} />
        </div>
      ) : kind === "machine" ? (
        <div className="add-node-form">
          <ItemPicker
            label="Machine"
            placeholder="Search machines..."
            options={machineOptions}
            value={machineId}
            onChange={(id) => {
              setMachineId(id);
              // Coil multiblocks always physically have some coil built in - default to the
              // cheapest rather than leaving the new dropdown looking unset/broken.
              if (id && COIL_MACHINE_TYPES.has(id) && !coilTier) setCoilTier(COIL_TYPES[0].id);
            }}
            resolveIcon={(id) => resolveMachineIconId(icons, id, machineTier || undefined)}
            clearable
          />
          <label className="add-node-amount-label">
            Tier (optional)
            <select className="add-node-amount-input" value={machineTier} onChange={(e) => setMachineTier(e.target.value)}>
              <option value="">-</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {usesCoil && (
            <label className="add-node-amount-label">
              Coil
              <select className="add-node-amount-input" value={coilTier} onChange={(e) => setCoilTier(e.target.value)}>
                <option value="">-</option>
                {COIL_TYPES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : (
        <div className="add-node-form">
          <label className="add-node-amount-label">
            Note text
            <textarea
              className="add-node-amount-input add-node-textarea"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="e.g. Results in 6x Sulfuric Acid + 6x Calcium Chloride"
              autoFocus
            />
          </label>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
          Add
        </button>
      </div>
    </Modal>
  );
}
