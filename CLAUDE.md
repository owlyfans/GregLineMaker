# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working this repo.

## What this is

GregLineMaker: recipe-chain planner for GregTech CEu (GTCEu) / TerraFirmaGreg (TFG), Minecraft
Forge 1.20.1 modpack. Players build multi-step ore-processing/production lines (e.g. "how turn
raw bauxite into titanium ingot"), tool lay out as node graph with correct
quantities, byproducts, recycling loops. `chain-example.json` / `example-fixed.json` at repo
root: draw.io exports of hand-made reference chains, predate app - useful for
target visual/data shape (nodes labelled `"Item Name\nAmount"`, edges linking them).

This directory holds **three independent git repositories**, not one - single
`git log`/`git status` at root won't tell whole story:

- `mod/` - own repo (local only so far, no remote yet) - see `mod/README.md`.
- `resources/` - own repo, pushed to
  `https://github.com/owlyfans/GregLineMakerResources.git`,
  published via GitHub Pages. Holds large generated payload (`recipes.json`, `icons.json`,
  `icons/`) app fetches at runtime over HTTPS - see `resources/README.md`.
- Everything else (this file, `app/`, `pipeline/`, `data/`): main repo, pushed to
  `https://github.com/owlyfans/GregLineMaker.git`, published via GitHub Pages through
  `.github/workflows/deploy.yml`. `.gitignore` excludes `mod/` and `resources/` entirely (separate
  repos nested in same working directory, not submodules), plus generated
  data files described below.

Three pieces form one-way data pipeline:

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

Dev-only Forge mod (`dev.owlyfans.greglinedump`, modid `greglinedump`) installed into running
TerraFirmaGreg-Modern instance. Never meant to ship - exists solely to dump fully-resolved
(post-KubeJS) recipe and icon data web app can't get any other way.

- **Build**: `cd mod && ./gradlew build` (Windows: `gradlew.bat build`). Standard ForgeGradle 1.20.1/Forge
  47.4.13 project (`mod/gradle.properties`).
- Compiling against GTCEu/TFG/LDLib types requires real TerraFirmaGreg-Modern instance's `mods/`
  folder on compile classpath - path configured via `tfg_instance_mods_dir` in `mod/gradle.properties`.
- In-game commands (need permission level 2 / op): `/greglinedump` writes `items.json`, `fluids.json`,
  `gt_recipes.json`, `other_recipes.json`, `machines.json` to `<instance>/greglinedump/` (also runs
  automatically on server start, see `GregLineDump.onServerStarted`). `/greglinedumpicons [limit]`
  client-side renders each item's actual in-game icon to `greglinedump/icons/<ns>/<path>.png`
  (`IconDumper.java`) - needed since GTCEu material items (dusts/ingots/etc.) tinted at runtime
  from shared shape textures rather than static PNG per item, fluids have no icon at all
  in any data file.
- `RecipeDumper.java` / `OtherRecipeDumper.java`: dump-format source of truth if JSON shape
  ever needs change - check before changing `pipeline/build.mjs`'s assumptions about dump shape.

## pipeline/ - dump -> app data

Plain Node scripts (ESM, `adm-zip` only dependency), run manually, not on any CI/build hook.

- `npm run build` (from `pipeline/`) runs `build.mjs [instanceDir]` - defaults to
  `TFG_INSTANCE_DIR` env var or hardcoded TerraFirmaGreg-Modern PrismLauncher path. Reads
  `<instance>/greglinedump/*.json`, resolves display names (mod-jar lang files, overlaid by
  `kubejs/assets/*/lang/en_us.json`), filters out recipes actually "scrap fabricated
  item back into dust" (arc furnace, `/recycling/` types, machine-scrap, suspect macerator recipes -
  else solver treats scrapping as valid production path), writes
  **`data/recipes.json`** (repo-root `data/`, not `app/public/data/`).
- `node extract_icons.mjs [instanceDir]` resolves icon per item/fluid: prefers client-rendered
  PNGs from `/greglinedumpicons` (ground truth) over static guess from mod jars' item/block
  models/textures; fluids borrow bucket item's icon by guessed naming convention. Writes
  PNGs to `app/public/icons/items/<ns>/<path>.png`, id->URL manifest straight to
  **`app/public/data/icons.json`**.
- **Gotcha**: none of `data/recipes.json` / `app/public/icons/` / `app/public/data/icons.json` is
  what running app actually reads - app fetches from separate `resources/` repo's
  published Pages site (see `app/src/config.ts`'s `RESOURCES_BASE_URL`), not from anything under
  `app/public/`. After running pipeline, sync output into `resources/` yourself (copy
  `data/recipes.json` -> `resources/recipes.json`, `app/public/icons/` -> `resources/icons/`,
  regenerate `resources/icons.json` from `app/public/data/icons.json` with absolute URLs - see
  `resources/README.md` for exact steps), then commit and push `resources/` to publish
  update. No script does this automatically.

## app/ - the frontend

React 19 + TypeScript + Vite, `reactflow` for canvas, `zustand` for state, `@dagrejs/dagre`
available for auto-layout. All commands below run from `app/`.

- `npm run dev` - start dev server. User typically runs it themselves on non-default port
  (`npx vite --port 5183`), leaves running across session for live HMR verification - don't
  kill/restart without checking if browser tab already open against it (see
  fetch-once gotcha below).
- `npm run build` - `tsc -b && vite build` (typecheck part of build, not separate step).
- `npm run lint` - oxlint (`.oxlintrc.json`; react/typescript/oxc plugins).
- Typecheck only: `npx tsc --noEmit -p tsconfig.app.json`. Two known pre-existing failures here,
  unrelated to icon/UI work, not yet fixed: `ChainView.tsx`'s `EditNodeModal` `onSave` handler
  accesses `.amount` on union `Partial<ChainNodeData>` (TS2339), `chainStore.ts`'s
  `applyRefundPath` destructures unused `edges` (TS6133).
- No test runner configured.

### Data model (`src/types/`)

Two distinct schemas - don't conflate them:

- **`recipe.ts`** - normalized *database* pipeline produces (`RecipeDatabase`: `items`,
  `fluids` id->name maps, `recipes: Recipe[]`). Fetched once at startup via
  `useRecipeDatabase()` (`fetch(\`${RESOURCES_BASE_URL}/recipes.json\`)` against separate
  `resources/` repo's published Pages site - deliberately not static import or same-origin path,
  tens of MB, lives outside this app's own repo/deploy, see `src/config.ts`). `Recipe`'s
  `inputs`/`outputs` are `RecipeIo` entries: `kind` (item/fluid), list of *tag-resolved*
  concrete ids that slot accepts (`ids`), `amount`, optional `chancePercent` for
  byproducts not guaranteed.
- **`chain.ts`** - *presentation* schema for user-built chain rendered by `<ChainView>`,
  stored in `chainStore`: `ItemNodeData` / `MachineNodeData` / `NoteNodeData`, plus `role: "input" |
  "output"` marking chain's user-declared boundaries (excluded from refund-loop matching, since
  looping back into raw material or final product not useful).

### State (`src/state/`)

- `chainStore.ts` (zustand) owns live canvas: nodes/edges plus higher-level operations
  (`expandWithRecipe`, `expandForward`, `applyRefundPath`, `rescaleFromOutput`) UI drives via
  context menus/modals - **app does not auto-solve chain end-to-end**; user builds it
  incrementally, node by node, picking recipes for one item at a time. (`solver/solve.ts`'s
  `solveChain` - full AND/OR-graph auto-solver - exists, fully implemented but currently
  **unused/unwired** into UI; check before assuming it runs anywhere.)
  - `expandWithRecipe`: given item node and recipe that produces it, adds machine + other
    inputs + other outputs (byproducts), scaling everything off whatever amount target
    node already has (or adopting recipe's own amount if first time).
  - `expandForward`: mirror - given item node and recipe that *consumes* it, adds
    machine + other inputs + *all* its outputs.
  - `rescaleFromOutput`: editing any one item's amount cascades through *entire* connected graph
    (both directions, cycle-safe), recomputing every other node's amount via each machine's actual
    recipe ratio where known.
  - Two disconnected item nodes for same id/kind treated as unrelated for refund-matching
    purposes (see `connectedExistingKeys`) - expansions always create fresh node rather than
    reusing existing one with same item id, so unwired duplicate isn't real loop-back
    target yet.
- `useRecipeDatabase.ts` - fetch-once hook for `resources/`'s published `recipes.json`.
- `iconStore.ts` - fetch-once (behind `loaded` flag, no retry) load of `resources/`'s published
  `icons.json` - values already full URLs into same published site, used directly as
  `<img src>` with no base-URL prefixing here. **Gotcha**: flag set *before* fetch
  resolves, so if fetch fails or interrupted (e.g. dev server restarted while tab already
  open), store permanently empty for that page's life, no retry - looks exactly like
  missing-icon data bug but stale-client-state bug. Hard refresh fixes it; check this before
  re-auditing pipeline/data when icons go broadly missing.
- `favoritesStore.ts` - starred recipe ids in recipe picker, persisted to localStorage, global
  (not scoped per target item).
- `persistence.ts` - save/load chain as downloadable JSON file, plus debounced (800ms)
  best-effort localStorage autosave restored on startup only if canvas currently empty.

### Solver (`src/solver/`)

- `solve.ts` - tier ordering (`TIER_ORDER`, keep sync with GTCEu's `GTValues.VN`),
  `isToolItem`/`isConfigItem` heuristics (casting molds/shapes reusable leaves, not something to
  re-produce each run; programmed circuits machine config value, not material - both
  skipped expanding recipe's inputs), currently-unwired `solveChain` auto-solver
  (lowest-tier-first recipe choice per item, cycle-avoidance preferring candidate resolvable
  without looping back through *live* ancestor - see long comment above `resolve()` for why
  "just pick lowest tier" isn't safe: some low-tier recipes only exist to melt fabricated item back
  down, e.g. Extractor reclaiming fluid from plates).
- `refund.ts` - two independent notions of "refund", don't conflate: `findRefundPaths`
  bounded forward search (depth/branch-limited) from byproduct through "what consumes this ->
  what does that produce" looking for match against something *already in chain* -
  *suggestion* UI surfaces via right-click ("possible refund"/`possibleRefund` flag).
  `detectActiveRefundLoops` plain cycle detection over graph *as currently wired* - whether
  loop-back edge actually exists right now (`refundable` flag, recomputed live, never persisted).

### Components (`src/components/`)

`ChainView.tsx` is canvas: react-flow wiring, context menus (node/edge/pane), orchestrates
all modals (`AddNodeModal`, `RecipePickerModal`, `EditNodeModal`, `RefundSuggestionsModal`,
`ConfirmDeleteModal`). Deletion always goes through `requestDelete`, walks upstream/downstream
first, asks confirmation before cascading (react-flow's own delete-key handling disabled -
`deleteKeyCode={null}` - so this only deletion path). `lib/machineIcon.ts` resolves machine's
icon: GTCEu machines keyed in `icons.json` under per-tier block id (e.g. `gtceu:lv_macerator`,
not bare recipe-type id `gtceu:macerator`) - tries tiered, then bare (covers untiered multiblocks),
then `tfg:` namespace fallback (TFG reimplements some GTCEu machine types as own blocks under
different namespace while keeping `gtceu:` recipe-type id).