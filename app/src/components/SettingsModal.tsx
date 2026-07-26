import { MODPACK_VERSIONS } from "../config";
import { TIER_ORDER } from "../lib/gtTiers";
import { humanizeGeneratorMachine, STEAM_GAS_MACHINES } from "../lib/power";
import { useSettingsStore } from "../state/settingsStore";
import type { GeneratorFuel, RecipeDatabase } from "../types/recipe";
import { Modal } from "./Modal";

interface SettingsModalProps {
  db: RecipeDatabase | null;
  onClose: () => void;
}

/** One dropdown per steam/gas generator machine type actually present in the loaded recipe
 * database (db.generators is absent/empty on an older, not-yet-resynced recipes.json - then this
 * is simply empty and the section doesn't render at all). */
function fuelsByMachine(db: RecipeDatabase | null): Map<string, GeneratorFuel[]> {
  const byMachine = new Map<string, GeneratorFuel[]>();
  for (const g of db?.generators ?? []) {
    if (!STEAM_GAS_MACHINES.has(g.machine) || g.fuelIds.length === 0) continue;
    (byMachine.get(g.machine) ?? byMachine.set(g.machine, []).get(g.machine)!).push(g);
  }
  return byMachine;
}

export function SettingsModal({ db, onClose }: SettingsModalProps) {
  const maxTier = useSettingsStore((s) => s.maxTier);
  const preferredTier = useSettingsStore((s) => s.preferredTier);
  const modpackVersion = useSettingsStore((s) => s.modpackVersion);
  const preferredFuelByMachine = useSettingsStore((s) => s.preferredFuelByMachine);
  const engineTierOffset = useSettingsStore((s) => s.engineTierOffset);
  const setMaxTier = useSettingsStore((s) => s.setMaxTier);
  const setPreferredTier = useSettingsStore((s) => s.setPreferredTier);
  const setModpackVersion = useSettingsStore((s) => s.setModpackVersion);
  const setPreferredFuel = useSettingsStore((s) => s.setPreferredFuel);
  const setEngineTierOffset = useSettingsStore((s) => s.setEngineTierOffset);
  const generatorFuels = fuelsByMachine(db);

  return (
    <Modal title="Settings" onClose={onClose} width={440}>
      <div className="add-node-form">
        <label className="add-node-amount-label">
          Modpack version
          <select
            className="add-node-amount-input"
            value={modpackVersion}
            onChange={(e) => setModpackVersion(e.target.value as (typeof MODPACK_VERSIONS)[number])}
          >
            {MODPACK_VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-hint">
          Which pack revision's recipes to load. Switching reloads the recipe database.
        </p>

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
          Pre-fills the tier field when manually adding a machine node from "Add node" - also caps
          which tier of Steam/Gas Engine the Power section below assumes you actually have built: a
          machine tiered ABOVE this still computes fine (GTCEu multiblocks just need enough amps,
          not a hatch matching their own tier), but its engine count is shown at this tier instead
          of its own, since you don't have that higher tier of engine yet either.
        </p>

        <label className="add-node-amount-label">
          Power machines with engines
          <select
            className="add-node-amount-input"
            value={engineTierOffset}
            onChange={(e) => setEngineTierOffset(Number(e.target.value))}
          >
            <option value={0}>at that tier</option>
            <option value={1}>1 tier lower (4x as many)</option>
            <option value={2}>2 tiers lower (16x as many)</option>
            <option value={3}>3 tiers lower (64x as many)</option>
          </select>
        </label>
        <p className="settings-hint">
          Steps the engine tier further down from whatever "Preferred tier for new machines" above
          already capped it at. E.g. "1 tier lower" with an HV cap powers everything with 4x MV
          Steam/Gas Engines (via a 4:1 amperage transformer) instead of 1x HV engine - same total
          EU/t, trading one expensive higher-tier turbine for several cheaper lower-tier ones. Only
          changes the engine-count/amps shown in the chain summary's Power section - fuel
          consumption doesn't change (same total EU/t either way).
        </p>

        {[...generatorFuels.entries()].map(([machine, fuels]) => (
          <div key={machine}>
            <label className="add-node-amount-label">
              Preferred {humanizeGeneratorMachine(machine)} fuel
              <select
                className="add-node-amount-input"
                value={preferredFuelByMachine[machine] ?? ""}
                onChange={(e) => setPreferredFuel(machine, e.target.value || null)}
              >
                <option value="">Auto (most fuel-efficient)</option>
                {fuels.map((f) => {
                  const id = f.fuelIds[0];
                  const name = (f.fuelKind === "fluid" ? db?.fluids[id] : db?.items[id]) ?? id;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
            <p className="settings-hint">
              Which fuel to assume when the chain summary's Power section computes engine fuel consumption.
            </p>
          </div>
        ))}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
