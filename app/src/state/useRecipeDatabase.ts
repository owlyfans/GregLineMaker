import { useEffect, useState } from "react";
import type { RecipeDatabase } from "../types/recipe";
import { RESOURCES_BASE_URL } from "../config";

interface State {
  db: RecipeDatabase | null;
  loading: boolean;
  error: string | null;
}

/** Fetches recipes.json once from GregLineMakerResources (it's tens of MB - deliberately not
 * bundled via static import, and not part of this app's own repo/deploy - see that repo's README). */
export function useRecipeDatabase(): State {
  const [state, setState] = useState<State>({ db: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${RESOURCES_BASE_URL}/recipes.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((db: RecipeDatabase) => {
        if (!cancelled) setState({ db, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ db: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
