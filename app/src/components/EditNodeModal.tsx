import { useMemo, useState } from "react";
import type { ChainNodeData } from "../types/chain";
import type { RecipeDatabase } from "../types/recipe";
import { humanizeMachine } from "../solver/solve";
import { QuickAmountButtons } from "./QuickAmountButtons";
import { ItemPicker, type PickerOption } from "./ItemPicker";
import { Modal } from "./Modal";
import { IconSlot } from "./IconSlot";
import { resolveMachineIconId } from "../lib/machineIcon";
import { useIconStore } from "../state/iconStore";
import { TIER_ORDER } from "../lib/gtTiers";

// A machine tier above a recipe's own minimum overclocks it (see lib/gtTiers) - so the full ladder
// needs to be selectable here, not just the tiers recipes themselves are commonly found at.
const TIERS = ["", ...TIER_ORDER];

interface EditNodeModalProps {
  db: RecipeDatabase;
  data: ChainNodeData;
  /** The attached recipe's own minimum tier, if `data` is a machine node with a recipe - a machine
   * below this can't actually run the recipe, so those tiers are shown (for ladder context) but
   * disabled rather than omitted. */
  minTier?: string;
  onClose: () => void;
  onSave: (patch: Partial<ChainNodeData>) => void;
}

export function EditNodeModal({ db, data, minTier, onClose, onSave }: EditNodeModalProps) {
  const [label, setLabel] = useState(data.kind === "note" ? "" : data.label);
  const [amount, setAmount] = useState(data.kind === "item" ? data.amount ?? "" : "");
  const [chance, setChance] = useState(data.kind === "item" && data.chancePercent !== undefined ? String(data.chancePercent) : "");
  const [tier, setTier] = useState(data.kind === "machine" ? data.tier ?? "" : "");
  const [machineId, setMachineId] = useState<string | null>(data.kind === "machine" ? data.machineId ?? null : null);
  const [text, setText] = useState(data.kind === "note" ? data.text : "");
  const icons = useIconStore((s) => s.icons);
  const machineIconId = data.kind === "machine" ? resolveMachineIconId(icons, machineId ?? undefined, tier || undefined) : undefined;
  const minTierIndex = minTier ? TIER_ORDER.indexOf(minTier) : -1;

  // Every distinct machine the recipe database actually knows about - picking from this (instead
  // of a free-text name) keeps a machine node's label/icon tied to a real GTCEu machine, the same
  // way one added via the recipe picker already is (see AddNodeModal's identical list).
  const machineOptions: PickerOption[] = useMemo(() => {
    const ids = new Set(db.recipes.map((r) => r.machine));
    return [...ids].map((id) => ({ id, label: humanizeMachine(id) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [db]);

  function submit() {
    if (data.kind === "item") {
      onSave({
        label,
        amount: amount.trim() || undefined,
        chancePercent: chance.trim() ? Number(chance) : undefined,
      });
    } else if (data.kind === "machine") {
      onSave({ label, tier: tier || undefined, machineId: machineId ?? undefined });
    } else {
      onSave({ text });
    }
    onClose();
  }

  return (
    <Modal
      title={
        <>
          {data.kind === "item" && <IconSlot id={data.itemId} label={data.label} size={32} />}
          {machineIconId && <IconSlot id={machineIconId} label={data.kind === "machine" ? data.label : undefined} size={32} />}
          Edit {data.kind}
        </>
      }
      onClose={onClose}
      width={420}
    >
      <div className="add-node-form">
        {data.kind === "note" ? (
          <label className="add-node-amount-label">
            Note text
            <textarea
              className="add-node-amount-input add-node-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              autoFocus
            />
          </label>
        ) : data.kind === "item" ? (
          <>
            <label className="add-node-amount-label">
              Label
              <input
                type="text"
                className="add-node-amount-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </label>
            <label className="add-node-amount-label">
              Amount
              <input
                type="text"
                className="add-node-amount-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 16"
              />
            </label>
            <QuickAmountButtons onPick={(n) => setAmount(String(n))} />
            <label className="add-node-amount-label">
              Chance % (optional)
              <input
                type="text"
                className="add-node-amount-input"
                value={chance}
                onChange={(e) => setChance(e.target.value)}
                placeholder="e.g. 70"
              />
            </label>
          </>
        ) : (
          <>
            <ItemPicker
              label="Machine"
              placeholder="Search machines..."
              options={machineOptions}
              value={machineId}
              onChange={(id) => {
                setMachineId(id);
                const opt = id ? machineOptions.find((o) => o.id === id) : undefined;
                if (opt) setLabel(opt.label);
              }}
              resolveIcon={(id) => resolveMachineIconId(icons, id, tier || undefined)}
              clearable
            />
            <label className="add-node-amount-label">
              Tier
              <select className="add-node-amount-input" value={tier} onChange={(e) => setTier(e.target.value)}>
                {TIERS.map((t) => {
                  // "" (unset) always stays selectable - it behaves as running at exactly the
                  // recipe's own tier (see overclockTierDiff), which is always valid.
                  const disabled = t !== "" && minTierIndex !== -1 && TIER_ORDER.indexOf(t) < minTierIndex;
                  return (
                    <option key={t} value={t} disabled={disabled}>
                      {t || "-"}
                    </option>
                  );
                })}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={submit}>
          Save
        </button>
      </div>
    </Modal>
  );
}
