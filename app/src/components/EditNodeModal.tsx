import { useState } from "react";
import type { ChainNodeData } from "../types/chain";
import { QuickAmountButtons } from "./QuickAmountButtons";
import { Modal } from "./Modal";
import { IconSlot } from "./IconSlot";
import { resolveMachineIconId } from "../lib/machineIcon";
import { useIconStore } from "../state/iconStore";

const TIERS = ["", "ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM", "UV", "UHV"];

interface EditNodeModalProps {
  data: ChainNodeData;
  onClose: () => void;
  onSave: (patch: Partial<ChainNodeData>) => void;
}

export function EditNodeModal({ data, onClose, onSave }: EditNodeModalProps) {
  const [label, setLabel] = useState(data.kind === "note" ? "" : data.label);
  const [amount, setAmount] = useState(data.kind === "item" ? data.amount ?? "" : "");
  const [chance, setChance] = useState(data.kind === "item" && data.chancePercent !== undefined ? String(data.chancePercent) : "");
  const [tier, setTier] = useState(data.kind === "machine" ? data.tier ?? "" : "");
  const [text, setText] = useState(data.kind === "note" ? data.text : "");
  const icons = useIconStore((s) => s.icons);
  const machineIconId =
    data.kind === "machine" ? resolveMachineIconId(icons, data.machineId, tier || undefined) : undefined;

  function submit() {
    if (data.kind === "item") {
      onSave({
        label,
        amount: amount.trim() || undefined,
        chancePercent: chance.trim() ? Number(chance) : undefined,
      });
    } else if (data.kind === "machine") {
      onSave({ label, tier: tier || undefined });
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
        ) : (
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

            {data.kind === "item" ? (
              <>
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
              <label className="add-node-amount-label">
                Tier
                <select className="add-node-amount-input" value={tier} onChange={(e) => setTier(e.target.value)}>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t || "-"}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
