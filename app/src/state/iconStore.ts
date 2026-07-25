import { create } from "zustand";
import { RESOURCES_BASE_URL } from "../config";

interface IconState {
  icons: Record<string, string>;
  loaded: boolean;
  load: () => void;
}

/** id -> icon URL, loaded once from GregLineMakerResources' icons.json (see pipeline/extract_icons.mjs
 * for how it's built, and that repo's README for how it's published). Values there are already full
 * URLs pointing at that repo's own Pages site, so they're used directly as <img src> with no extra
 * base-URL logic here. Not every item has one - GTCEu's tinted material items and all fluids aren't
 * statically resolvable. */
export const useIconStore = create<IconState>((set, get) => ({
  icons: {},
  loaded: false,
  load: () => {
    if (get().loaded) return;
    set({ loaded: true }); // mark immediately so concurrent callers don't double-fetch
    fetch(`${RESOURCES_BASE_URL}/icons.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((icons: Record<string, string>) => set({ icons }))
      .catch(() => set({ icons: {} }));
  },
}));
