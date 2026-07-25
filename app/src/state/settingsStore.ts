import { create } from "zustand";

const STORAGE_KEY = "greglinemaker.settings";

interface StoredSettings {
  /** Highest tier the player currently has access to - recipes above it are hidden in
   * RecipePickerModal. `null` means no limit. */
  maxTier: string | null;
  /** Default tier pre-filled on AddNodeModal's freeform "Machine" tab. `null` means no default. */
  preferredTier: string | null;
}

const DEFAULT_SETTINGS: StoredSettings = { maxTier: null, preferredTier: null };

function load(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      maxTier: typeof parsed.maxTier === "string" ? parsed.maxTier : null,
      preferredTier: typeof parsed.preferredTier === "string" ? parsed.preferredTier : null,
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
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setMaxTier: (tier) => {
    set({ maxTier: tier });
    persist({ maxTier: tier, preferredTier: get().preferredTier });
  },
  setPreferredTier: (tier) => {
    set({ preferredTier: tier });
    persist({ maxTier: get().maxTier, preferredTier: tier });
  },
}));
