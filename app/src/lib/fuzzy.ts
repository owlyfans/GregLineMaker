/**
 * Small dependency-free fuzzy matcher (subsequence match + scoring), the same family as
 * fzf/Sublime's command palette: query characters must appear in `target` in order, but not
 * necessarily contiguously. Rewards consecutive runs, word-boundary starts, and early matches so
 * "tiing" beats "tin gearing" for a query like "ti in".
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let firstMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      consecutive = 0;
      continue;
    }
    if (firstMatchIndex === -1) firstMatchIndex = ti;
    consecutive += 1;
    score += 1 + consecutive * 2;
    const prevChar = ti > 0 ? t[ti - 1] : "";
    if (ti === 0 || prevChar === " " || prevChar === "_" || prevChar === "-" || prevChar === "/" || prevChar === ":") {
      score += 5;
    }
    qi++;
  }

  if (qi < q.length) return null; // some query character never matched - not a subsequence

  score += Math.max(0, 10 - firstMatchIndex);
  score -= t.length * 0.05; // slight preference for shorter/more precise targets
  return score;
}

/** Filters `items` to fuzzy matches against `query` (via `getText`) and sorts best-first. Returns
 * `items` unchanged (no re-sort) when `query` is blank. */
export function fuzzyFilter<T>(query: string, items: readonly T[], getText: (item: T) => string): T[] {
  if (!query.trim()) return items.slice();
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = fuzzyScore(query, getText(item));
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
