# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GregLineMaker is a recipe-chain planner for GregTech CEu (GTCEu) / TerraFirmaGreg (TFG), a Minecraft
Forge 1.20.1 modpack. Players build multi-step ore-processing/production lines (e.g. "how do I turn
raw bauxite into a titanium ingot") and this tool helps lay them out as a node graph with correct
quantities, byproducts, and recycling loops. `chain-example.json` / `example-fixed.json` at the repo
root are draw.io exports of hand-made reference chains that predate the app - useful for understanding
the target visual/data shape (nodes labelled `"Item Name\nAmount"`, edges linking them).

This directory holds **three independent git repositories**, not one - don't assume a single
`git log`/`git status` at the root tells the whole story:

- `mod/` - its own repo (local only so far, no remote configured yet) - see `mod/README.md`.
- `resources/` - its own repo, pushed to `https://github.com/owlyfans/GregLineMakerResources.git`,
  published via GitHub Pages. Holds the large generated payload (`recipes.json`, `icons.json`,
  `icons/`) the app fetches at runtime over HTTPS - see `resources/README.md`.
- Everything else (this file, `app/`, `pipeline/`, `data/`) is the main repo, pushed to
  `https://github.com/owlyfans/GregLineMaker.git`, published via GitHub Pages through
  `.github/workflows/deploy.yml`. Its `.gitignore` excludes `mod/` and `resources/` entirely (they're
  separate repos nested in the same working directory, not submodules) along with the generated
  data files described below.

The three pieces form a one-way data pipeline:

```
mod/ (Forge mod, runs inside Minecraft)
  -> dumps raw JSON to <instance>/greglinedump/
pipeline/ (Node scripts, run manually against that dump)
  -> writes data/recipes.json and app/public/data/icons.json + app/public/icons/items/*.png
(manually synced into resources/, committed, pushed - see resources/README.md)
resources/ (published via GitHub Pages)
  -> app/ fetches recipes.json/icons.json/icon PNGs from RESOURCES_BASE_URL (app/src/config.ts)
     at runtime, over HTTPS - none of that payload is bundled into app/'s own deploy
```

## mod/ - the data-extraction mod

A dev-only Forge mod (`dev.owlyfans.greglinedump`, modid `greglinedump`) installed into a running
TerraFirmaGreg-Modern instance. It is never meant to ship - it exists solely to dump fully-resolved
(post-KubeJS) recipe and icon data that the web app can't get any other way.

- **Build**: `cd mod && ./gradlew build` (Windows: `gradlew.bat build`). Standard ForgeGradle 1.20.1/Forge
  47.4.13 project (`mod/gradle.properties`).
- Compiling against GTCEu/TFG/LDLib types requires the real TerraFirmaGreg-Modern instance's `mods/`
  folder on the compile classpath - path configured via `tfg_instance_mods_dir` in `mod/gradle.properties`.
- In-game commands (need permission level 2 / op): `/greglinedump` writes `items.json`, `fluids.json`,
  `gt_recipes.json`, `other_recipes.json`, `machines.json` to `<instance>/greglinedump/` (also runs
  automatically on server start, see `GregLineDump.onServerStarted`). `/greglinedumpicons [limit]`
  client-side renders each item's actual in-game icon to `greglinedump/icons/<ns>/<path>.png`
  (`IconDumper.java`) - needed because GTCEu material items (dusts/ingots/etc.) are tinted at runtime
  from shared shape textures rather than having a static PNG per item, and fluids have no icon at all
  in any data file.
- `RecipeDumper.java` / `OtherRecipeDumper.java` are the dump-format source of truth if the JSON shape
  ever needs to change - check these before changing `pipeline/build.mjs`'s assumptions about dump shape.

## pipeline/ - dump -> app data

Plain Node scripts (ESM, `adm-zip` is the only dependency), run manually, not on any CI/build hook.

- `npm run build` (from `pipeline/`) runs `build.mjs [instanceDir]` - defaults to
  `TFG_INSTANCE_DIR` env var or the hardcoded TerraFirmaGreg-Modern PrismLauncher path. Reads
  `<instance>/greglinedump/*.json`, resolves display names (mod-jar lang files, overlaid by
  `kubejs/assets/*/lang/en_us.json`), filters out recipes that are actually "scrap a fabricated
  item back into dust" (arc furnace, `/recycling/` types, machine-scrap, suspect macerator recipes -
  these would otherwise make the solver treat scrapping as a valid production path) and writes
  **`data/recipes.json`** (repo-root `data/`, not `app/public/data/`).
- `node extract_icons.mjs [instanceDir]` resolves an icon per item/fluid: prefers the client-rendered
  PNGs from `/greglinedumpicons` (ground truth) over a static guess from the mod jars' item/block
  models and textures; fluids borrow their bucket item's icon by guessed naming convention. Writes
  PNGs to `app/public/icons/items/<ns>/<path>.png` and the id->URL manifest straight to
  **`app/public/data/icons.json`**.
- **Gotcha**: none of `data/recipes.json` / `app/public/icons/` / `app/public/data/icons.json` is
  what the running app actually reads - the app fetches from the separate `resources/` repo's
  published Pages site (see `app/src/config.ts`'s `RESOURCES_BASE_URL`), not from anything under
  `app/public/`. After running the pipeline, sync this output into `resources/` yourself (copy
  `data/recipes.json` -> `resources/recipes.json`, `app/public/icons/` -> `resources/icons/`,
  regenerate `resources/icons.json` from `app/public/data/icons.json` with absolute URLs - see
  `resources/README.md` for the exact steps), then commit and push `resources/` to publish the
  update. No script does this automatically.

## app/ - the frontend

React 19 + TypeScript + Vite, `reactflow` for the canvas, `zustand` for state, `@dagrejs/dagre`
available for auto-layout. All commands below run from `app/`.

- `npm run dev` - start the dev server. The user typically runs it themselves on a non-default port
  (`npx vite --port 5183`) and leaves it running across a session for live HMR verification - don't
  kill/restart it without checking whether a browser tab is already open against it (see the
  fetch-once gotcha below).
- `npm run build` - `tsc -b && vite build` (typecheck is part of the build, not a separate step).
- `npm run lint` - oxlint (`.oxlintrc.json`; react/typescript/oxc plugins).
- Typecheck only: `npx tsc --noEmit -p tsconfig.app.json`. Two known pre-existing failures here are
  unrelated to icon/UI work and not yet fixed: `ChainView.tsx`'s `EditNodeModal` `onSave` handler
  accesses `.amount` on the union `Partial<ChainNodeData>` (TS2339), and `chainStore.ts`'s
  `applyRefundPath` destructures an unused `edges` (TS6133).
- No test runner is configured.

### Data model (`src/types/`)

Two distinct schemas - don't conflate them:

- **`recipe.ts`** - the normalized *database* the pipeline produces (`RecipeDatabase`: `items`,
  `fluids` id->name maps, and `recipes: Recipe[]`). Fetched once at startup via
  `useRecipeDatabase()` (`fetch(\`${RESOURCES_BASE_URL}/recipes.json\`)` against the separate
  `resources/` repo's published Pages site - deliberately not a static import or a same-origin path,
  it's tens of MB and lives outside this app's own repo/deploy, see `src/config.ts`). A `Recipe`'s
  `inputs`/`outputs` are `RecipeIo` entries: a `kind` (item/fluid), the list of *tag-resolved*
  concrete ids that slot accepts (`ids`), an `amount`, and an optional `chancePercent` for
  byproducts that aren't guaranteed.
- **`chain.ts`** - the *presentation* schema for a user-built chain rendered by `<ChainView>` and
  stored in `chainStore`: `ItemNodeData` / `MachineNodeData` / `NoteNodeData`, plus `role: "input" |
  "output"` marking a chain's user-declared boundaries (excluded from refund-loop matching, since
  looping back into your raw material or final product isn't useful).

### State (`src/state/`)

- `chainStore.ts` (zustand) owns the live canvas: nodes/edges plus the higher-level operations
  (`expandWithRecipe`, `expandForward`, `applyRefundPath`, `rescaleFromOutput`) that the UI drives via
  context menus and modals - **the app does not auto-solve a chain end-to-end**; the user builds it
  incrementally, node by node, by picking recipes for one item at a time. (`solver/solve.ts`'s
  `solveChain` - a full AND/OR-graph auto-solver - exists and is fully implemented but is currently
  **unused/unwired** into the UI; check before assuming it runs anywhere.)
  - `expandWithRecipe`: given an item node and a recipe that produces it, adds the machine + its
    other inputs + its other outputs (byproducts), scaling everything off whatever amount the target
    node already has (or adopting the recipe's own amount if this is the first time).
  - `expandForward`: the mirror - given an item node and a recipe that *consumes* it, adds the
    machine + its other inputs + *all* of its outputs.
  - `rescaleFromOutput`: editing any one item's amount cascades through the *entire* connected graph
    (both directions, cycle-safe), recomputing every other node's amount via each machine's actual
    recipe ratio where known.
  - Two disconnected item nodes for the same id/kind are treated as unrelated for refund-matching
    purposes (see `connectedExistingKeys`) - expansions always create a fresh node rather than
    reusing an existing one with the same item id, so an unwired duplicate isn't a real loop-back
    target yet.
- `useRecipeDatabase.ts` - fetch-once hook for `resources/`'s published `recipes.json`.
- `iconStore.ts` - fetch-once (behind a `loaded` flag, no retry) load of `resources/`'s published
  `icons.json` - its values are already full URLs into that same published site, used directly as
  `<img src>` with no base-URL prefixing here. **Gotcha**: the flag is set *before* the fetch
  resolves, so if the fetch fails or is interrupted (e.g. dev server restarted while a tab is already
  open), the store is permanently empty for that page's life with no retry - looks exactly like a
  missing-icon data bug but is a stale-client-state bug. A hard refresh fixes it; check this before
  re-auditing the pipeline/data when icons go broadly missing.
- `favoritesStore.ts` - starred recipe ids in the recipe picker, persisted to localStorage, global
  (not scoped per target item).
- `persistence.ts` - save/load a chain as a downloadable JSON file, plus a debounced (800ms)
  best-effort localStorage autosave that's restored on startup only if the canvas is currently empty.

### Solver (`src/solver/`)

- `solve.ts` - tier ordering (`TIER_ORDER`, keep in sync with GTCEu's `GTValues.VN`), the
  `isToolItem`/`isConfigItem` heuristics (casting molds/shapes are reusable leaves, not something to
  re-produce each run; programmed circuits are a machine config value, not a material - both are
  skipped when expanding a recipe's inputs), and the currently-unwired `solveChain` auto-solver
  (lowest-tier-first recipe choice per item, with cycle-avoidance that prefers a candidate resolvable
  without looping back through a *live* ancestor - see the long comment above `resolve()` for why
  "just pick lowest tier" isn't safe: some low-tier recipes only exist to melt a fabricated item back
  down, e.g. Extractor reclaiming fluid from plates).
- `refund.ts` - two independent notions of "refund", don't conflate them: `findRefundPaths` is a
  bounded forward search (depth/branch-limited) from a byproduct through "what consumes this ->
  what does that produce" looking for a match against something *already in the chain* - a
  *suggestion* the UI surfaces via right-click ("possible refund"/`possibleRefund` flag).
  `detectActiveRefundLoops` is plain cycle detection over the graph *as currently wired* - whether a
  loop-back edge actually exists right now (`refundable` flag, recomputed live, never persisted).

### Components (`src/components/`)

`ChainView.tsx` is the canvas: react-flow wiring, context menus (node/edge/pane), and orchestrates
all the modals (`AddNodeModal`, `RecipePickerModal`, `EditNodeModal`, `RefundSuggestionsModal`,
`ConfirmDeleteModal`). Deletion always goes through `requestDelete`, which walks upstream/downstream
first and asks for confirmation before cascading (react-flow's own delete-key handling is disabled -
`deleteKeyCode={null}` - so this is the only deletion path). `lib/machineIcon.ts` resolves a machine's
icon: GTCEu machines are keyed in `icons.json` under a per-tier block id (e.g. `gtceu:lv_macerator`,
not the bare recipe-type id `gtceu:macerator`) - tries tiered, then bare (covers untiered multiblocks),
then a `tfg:` namespace fallback (TFG reimplements some GTCEu machine types as its own blocks under a
different namespace while keeping the `gtceu:` recipe-type id).
