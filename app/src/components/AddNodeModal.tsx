import { useMemo, useState } from "react";
import type { RecipeDatabase } from "../types/recipe";
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
  onAddMachine: (label: string, tier?: string) => void;
  onAddNote: (text: string) => void;
}

export function AddNodeModal({ db, onClose, onAddItem, onAddMachine, onAddNote }: AddNodeModalProps) {
  const preferredTier = useSettingsStore((s) => s.preferredTier);
  const [kind, setKind] = useState<AddNodeKind>("item");
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [machineLabel, setMachineLabel] = useState("");
  // Pre-fills from Settings' "preferred tier for new machines" (see SettingsModal) when it's one
  // of the tiers this dropdown actually offers - still an editable default, not a locked value.
  const [machineTier, setMachineTier] = useState(preferredTier && TIERS.includes(preferredTier) ? preferredTier : "");
  const [noteText, setNoteText] = useState("");

  const options: PickerOption[] = useMemo(() => {
    if (kind !== "item" && kind !== "fluid") return [];
    const map = kind === "fluid" ? db.fluids : db.items;
    return Object.entries(map).map(([id, label]) => ({ id, label }));
  }, [db, kind]);

  const canSubmit =
    kind === "machine" ? machineLabel.trim().length > 0 : kind === "note" ? noteText.trim().length > 0 : !!selected;

  function submit() {
    if (kind === "machine") {
      if (!machineLabel.trim()) return;
      onAddMachine(machineLabel.trim(), machineTier || undefined);
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
          <label className="add-node-amount-label">
            Machine name
            <input
              type="text"
              className="add-node-amount-input"
              value={machineLabel}
              onChange={(e) => setMachineLabel(e.target.value)}
              placeholder="e.g. Chemical Reactor"
              autoFocus
            />
          </label>
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
