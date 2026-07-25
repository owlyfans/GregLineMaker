import { useEffect, useState } from "react";
import type { RecipeDatabase } from "../types/recipe";
import { RESOURCES_BASE_URL } from "../config";

interface State {
  db: RecipeDatabase | null;
  loading: boolean;
  error: string | null;
  /** 0-100 while streaming recipes.json down, null once done or if the server didn't send a
   * Content-Length to compute a percentage against (falls back to a plain "Loading..." then). */
  progress: number | null;
}

/** Fetches recipes.json once from GregLineMakerResources (it's tens of MB - deliberately not
 * bundled via static import, and not part of this app's own repo/deploy - see that repo's README).
 * Reads the response as a stream (rather than a plain res.json()) purely so `progress` can be
 * reported while it downloads - a file this size can take a real, noticeable amount of time on a
 * slow connection, and a bare "Loading..." with no sense of how much is left isn't very reassuring. */
export function useRecipeDatabase(): State {
  const [state, setState] = useState<State>({ db: null, loading: true, error: null, progress: null });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const res = await fetch(`${RESOURCES_BASE_URL}/recipes.json`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const totalStr = res.headers.get("content-length");
      const total = totalStr ? Number(totalStr) : 0;
      if (!res.body || !total) {
        // No stream / no Content-Length to compute a percentage against - just wait for it whole.
        return (await res.json()) as RecipeDatabase;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        received += value.byteLength;
        if (!cancelled) setState((s) => ({ ...s, progress: Math.min(99, Math.round((received / total) * 100)) }));
      }
      return JSON.parse(text) as RecipeDatabase;
    }

    run()
      .then((db) => {
        if (!cancelled) setState({ db, loading: false, error: null, progress: 100 });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ db: null, loading: false, error: err.message, progress: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
