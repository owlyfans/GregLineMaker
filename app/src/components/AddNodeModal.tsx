import { useMemo, useState } from "react";
import type { RecipeDatabase } from "../types/recipe";
import { humanizeMachine } from "../solver/solve";
import { resolveMachineIconId } from "../lib/machineIcon";
import { COIL_MACHINE_TYPES, COIL_TYPES } from "../lib/coils";
import { useIconStore } from "../state/iconStore";
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

export function AddNodeModal({ db, onClose, onAddItem, onAddMachine, onAddNote }: AddNodeModalProps) {
  const [kind, setKind] = useState<AddNodeKind>("item");
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [machineId, setMachineId] = useState<string | null>(null);
  const [machineTier, setMachineTier] = useState("");
  const [coilTier, setCoilTier] = useState("");
  const [noteText, setNoteText] = useState("");
  const icons = useIconStore((s) => s.icons);
  const usesCoil = !!machineId && COIL_MACHINE_TYPES.has(machineId);

  const options: PickerOption[] = useMemo(() => {
    if (kind !== "item" && kind !== "fluid") return [];
    const map = kind === "fluid" ? db.fluids : db.items;
    return Object.entries(map).map(([id, label]) => ({ id, label }));
  }, [db, kind]);

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
          <QuickAmountButtons onPick={(n) => setAmount(String(n))} />
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
