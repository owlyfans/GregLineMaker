import { create } from "zustand";

const STORAGE_KEY = "greglinemaker.favoriteRecipes.v1";

function loadInitial(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage full/unavailable - favorites just won't survive a refresh
  }
}

interface FavoritesState {
  favoriteRecipeIds: Set<string>;
  toggleFavorite: (recipeId: string) => void;
}

/** Which recipes you've starred in the recipe picker - global, not scoped to one target item, and
 * persisted to localStorage so it survives a refresh. */
export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteRecipeIds: loadInitial(),
  toggleFavorite: (recipeId) => {
    const next = new Set(get().favoriteRecipeIds);
    if (next.has(recipeId)) next.delete(recipeId);
    else next.add(recipeId);
    persist(next);
    set({ favoriteRecipeIds: next });
  },
}));
