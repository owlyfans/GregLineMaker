import { create } from "zustand";
import { DEFAULT_MODPACK_VERSION, MODPACK_VERSIONS, type ModpackVersion } from "../config";

const STORAGE_KEY = "greglinemaker.settings";

interface StoredSettings {
  /** Highest tier the player currently has access to - recipes above it are hidden in
   * RecipePickerModal. `null` means no limit. */
  maxTier: string | null;
  /** Default tier pre-filled on AddNodeModal's freeform "Machine" tab. `null` means no default. */
  preferredTier: string | null;
  /** Which modpack revision's recipes.json to fetch - see config.ts's MODPACK_VERSIONS. */
  modpackVersion: ModpackVersion;
  /** Generator machine id (e.g. "gtceu:gas_turbine") -> fuel item/fluid id to assume when
   * computing engine fuel consumption in the chain summary's Power section (see lib/power.ts) -
   * overrides that machine type's auto-picked most-fuel-efficient choice. Absent/no entry for a
   * machine means "auto". A picked fuel id that isn't actually one of that machine's known fuels
   * (e.g. after a modpack-version switch) is just ignored by lib/power.ts, falling back to auto. */
  preferredFuelByMachine: Record<string, string>;
  /** How many voltage-tier rungs BELOW each machine's own tier to build its engines at instead -
   * e.g. 1 means an EV machine (2048 EU/t) gets powered by 4x HV engines (4 x 512 EU/t via a 4:1
   * amperage transformer) rather than 1x EV engine, trading one expensive high-tier turbine for
   * several cheaper low-tier ones (a common real GTCEu build strategy). 0 = build engines at the
   * machine's own tier (the original behavior). Only affects lib/power.ts's ampsByTier/engineCount
   * bucketing - fuel consumption (fuelPlans) is unaffected, since total EU/t needed doesn't change. */
  engineTierOffset: number;
}

const DEFAULT_SETTINGS: StoredSettings = {
  maxTier: null,
  preferredTier: null,
  modpackVersion: DEFAULT_MODPACK_VERSION,
  preferredFuelByMachine: {},
  engineTierOffset: 0,
};

function load(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      maxTier: typeof parsed.maxTier === "string" ? parsed.maxTier : null,
      preferredTier: typeof parsed.preferredTier === "string" ? parsed.preferredTier : null,
      modpackVersion: MODPACK_VERSIONS.includes(parsed.modpackVersion)
        ? parsed.modpackVersion
        : DEFAULT_MODPACK_VERSION,
      preferredFuelByMachine:
        parsed.preferredFuelByMachine && typeof parsed.preferredFuelByMachine === "object"
          ? parsed.preferredFuelByMachine
          : {},
      engineTierOffset:
        typeof parsed.engineTierOffset === "number" && parsed.engineTierOffset >= 0 ? parsed.engineTierOffset : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(state: StoredSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only, same as persistence.ts's autosave
  }
}

interface SettingsState extends StoredSettings {
  setMaxTier: (tier: string | null) => void;
  setPreferredTier: (tier: string | null) => void;
  setModpackVersion: (version: ModpackVersion) => void;
  /** `fuelId: null` clears back to "auto" (most fuel-efficient) for that machine. */
  setPreferredFuel: (machine: string, fuelId: string | null) => void;
  setEngineTierOffset: (offset: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setMaxTier: (tier) => {
    set({ maxTier: tier });
    persist(get());
  },
  setPreferredTier: (tier) => {
    set({ preferredTier: tier });
    persist(get());
  },
  setModpackVersion: (version) => {
    set({ modpackVersion: version });
    persist(get());
  },
  setPreferredFuel: (machine, fuelId) => {
    const next = { ...get().preferredFuelByMachine };
    if (fuelId) next[machine] = fuelId;
    else delete next[machine];
    set({ preferredFuelByMachine: next });
    persist(get());
  },
  setEngineTierOffset: (offset) => {
    set({ engineTierOffset: Math.max(0, offset) });
    persist(get());
  },
}));
