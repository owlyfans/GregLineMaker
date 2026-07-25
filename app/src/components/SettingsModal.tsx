import { TIER_ORDER } from "../lib/gtTiers";
import { useSettingsStore } from "../state/settingsStore";
import { Modal } from "./Modal";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const maxTier = useSettingsStore((s) => s.maxTier);
  const preferredTier = useSettingsStore((s) => s.preferredTier);
  const setMaxTier = useSettingsStore((s) => s.setMaxTier);
  const setPreferredTier = useSettingsStore((s) => s.setPreferredTier);

  return (
    <Modal title="Settings" onClose={onClose} width={440}>
      <div className="add-node-form">
        <label className="add-node-amount-label">
          Highest tier available
          <select
            className="add-node-amount-input"
            value={maxTier ?? ""}
            onChange={(e) => setMaxTier(e.target.value || null)}
          >
            <option value="">No limit</option>
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-hint">
          Recipes above this tier are hidden in the recipe picker, since you can't build them yet.
        </p>

        <label className="add-node-amount-label">
          Preferred tier for new machines
          <select
            className="add-node-amount-input"
            value={preferredTier ?? ""}
            onChange={(e) => setPreferredTier(e.target.value || null)}
          >
            <option value="">-</option>
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-hint">
          Pre-fills the tier field when manually adding a machine node from "Add node".
        </p>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
