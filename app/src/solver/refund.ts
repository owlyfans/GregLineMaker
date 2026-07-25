import type { Recipe, RecipeDatabase } from "../types/recipe";
import { nodeKey, type NodeKind } from "./solve";

export interface RefundStep {
  recipe: Recipe;
  producedKind: NodeKind;
  producedId: string;
}

export interface RefundPath {
  /** In order from the starting byproduct to the final match. */
  steps: RefundStep[];
  matchKind: NodeKind;
  matchId: string;
}

/** Item -> recipes that consume it as an input ("what can I turn this into"), the mirror of solve.ts's output index. */
export function buildInputIndex(db: RecipeDatabase): Map<string, Recipe[]> {
  const index = new Map<string, Recipe[]>();
  for (const r of db.recipes) {
    for (const io of r.inputs) {
      for (const id of io.ids) {
        const key = nodeKey(io.kind, id);
        let list = index.get(key);
        if (!list) {
          list = [];
          index.set(key, list);
        }
        list.push(r);
      }
    }
  }
  return index;
}

/**
 * Bounded forward search: starting from a byproduct, follow recipes that consume it (then their
 * outputs, then recipes that consume those, ...) looking for anything that matches an item
 * already present elsewhere in the chain - a candidate "refund" loop-back. Depth/branch-limited
 * since a handful of items (circuits, common dusts) are inputs to thousands of recipes.
 */
export function findRefundPaths(
  inputIndex: Map<string, Recipe[]>,
  startKind: NodeKind,
  startId: string,
  existingKeys: Set<string>,
  maxDepth = 3,
  maxPaths = 15,
  maxBranchPerLevel = 6,
): RefundPath[] {
  const results: RefundPath[] = [];
  const startKey = nodeKey(startKind, startId);

  function dfs(kind: NodeKind, id: string, depth: number, steps: RefundStep[], visitedKeys: Set<string>) {
    if (results.length >= maxPaths) return;
    const key = nodeKey(kind, id);
    const candidates = (inputIndex.get(key) ?? []).slice(0, maxBranchPerLevel);
    for (const recipe of candidates) {
      for (const io of recipe.outputs) {
        for (const outId of io.ids) {
          const outKey = nodeKey(io.kind, outId);
          if (visitedKeys.has(outKey)) continue; // don't loop back on ourselves within one path
          const newSteps = [...steps, { recipe, producedKind: io.kind, producedId: outId }];
          if (outKey !== startKey && existingKeys.has(outKey)) {
            results.push({ steps: newSteps, matchKind: io.kind, matchId: outId });
            if (results.length >= maxPaths) return;
            continue; // found a match through this output - don't also expand past it
          }
          if (depth + 1 < maxDepth) {
            dfs(io.kind, outId, depth + 1, newSteps, new Set(visitedKeys).add(outKey));
          }
        }
      }
    }
  }

  dfs(startKind, startId, 0, [], new Set([startKey]));
  return results;
}

export interface ActiveRefundLoops {
  /** Every node id that sits somewhere on an actual cycle right now - includes both the recycled
   * surplus/matched input and the ordinary production-chain nodes the loop happens to pass
   * through on its way back around. */
  inLoop: Set<string>;
  /** The subset of `inLoop` that's actually part of the refund itself: an endpoint of an edge
   * explicitly created as a refund loop-back (label "refund" - see applyRefundPath/solveChain),
   * where that edge is part of a currently-live cycle. Deliberately keyed off edge metadata rather
   * than "whichever node the cycle-scan happens to close on" - which node that is depends on where
   * the scan started, not on anything meaningful, for a cycle a plain manual connection closed.
   * Everything else in `inLoop` is just a normal step the loop's path runs through, not a refund. */
  refundSources: Set<string>;
}

/**
 * Node ids that are part of an actual cycle in the *current* chain - a byproduct really is
 * looping back to feed an earlier step, as opposed to `possibleRefund` which only means a loop
 * *could* be wired up. Plain directed-cycle detection (DFS with a recursion-stack/back-edge
 * check) over whatever nodes/edges exist right now, so it stays correct as the chain is edited.
 */
export function detectActiveRefundLoops(
  nodeIds: string[],
  edges: { source: string; target: string; label?: unknown }[],
): ActiveRefundLoops {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    let list = adjacency.get(e.source);
    if (!list) {
      list = [];
      adjacency.set(e.source, list);
    }
    list.push(e.target);
  }

  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const inLoop = new Set<string>();

  function visit(nodeId: string, stack: string[]) {
    state.set(nodeId, VISITING);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      const nextState = state.get(next) ?? UNVISITED;
      if (nextState === UNVISITED) {
        visit(next, stack);
      } else if (nextState === VISITING) {
        // Back-edge to an ancestor still on the stack: everything from there to here is a cycle.
        const idx = stack.indexOf(next);
        if (idx !== -1) {
          for (let i = idx; i < stack.length; i++) inLoop.add(stack[i]);
        }
      }
    }
    stack.pop();
    state.set(nodeId, DONE);
  }

  for (const id of nodeIds) {
    if ((state.get(id) ?? UNVISITED) === UNVISITED) visit(id, []);
  }

  const refundSources = new Set<string>();
  for (const e of edges) {
    if (e.label === "refund" && inLoop.has(e.source) && inLoop.has(e.target)) {
      refundSources.add(e.source);
      refundSources.add(e.target);
    }
  }

  return { inLoop, refundSources };
}
