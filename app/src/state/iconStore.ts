import { create } from "zustand";
import { RESOURCES_BASE_URL } from "../config";

interface IconState {
  icons: Record<string, string>;
  /** Guard flag, set true immediately (before the fetch resolves) so concurrent callers don't
   * double-fetch - NOT a "did it actually load" signal, see `loading`/`error` for that. */
  loaded: boolean;
  /** True only while the fetch is actually in flight - drives IconSlot's loading shimmer on its
   * fallback tile, distinguishing "still loading, an icon might still show up" from "this item
   * genuinely has none" (most fluids, some tinted materials). */
  loading: boolean;
  error: string | null;
  load: () => void;
}

/** id -> icon URL, loaded once from GregLineMakerResources' icons.json (~4MB - see
 * pipeline/extract_icons.mjs for how it's built, and that repo's README for how it's published).
 * Values there are already full URLs pointing at that repo's own Pages site, so they're used
 * directly as <img src> with no extra base-URL logic here. Not every item has one - GTCEu's tinted
 * material items and all fluids aren't statically resolvable. */
export const useIconStore = create<IconState>((set, get) => ({
  icons: {},
  loaded: false,
  loading: false,
  error: null,
  load: () => {
    if (get().loaded) return;
    set({ loaded: true, loading: true, error: null }); // mark immediately so concurrent callers don't double-fetch
    fetch(`${RESOURCES_BASE_URL}/icons.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((icons: Record<string, string>) => set({ icons, loading: false }))
      .catch((err: Error) => set({ icons: {}, loading: false, error: err.message }));
  },
}));
