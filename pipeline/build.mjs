// Turns the greglinedump mod's raw JSON dump into GregLineMaker's data/recipes.json.
// Usage: npm run build   (from pipeline/), or `node build.mjs [instanceDir]`
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const INSTANCE_DIR =
  process.argv[2] ||
  process.env.TFG_INSTANCE_DIR ||
  "C:/Users/owlyfans/AppData/Roaming/PrismLauncher/instances/TerraFirmaGreg-Modern/minecraft";

const DUMP_DIR = path.join(INSTANCE_DIR, "greglinedump");
const MODS_DIR = path.join(INSTANCE_DIR, "mods");
const KUBEJS_ASSETS_DIR = path.join(INSTANCE_DIR, "kubejs", "assets");
const OUT_DIR = path.resolve(process.cwd(), "..", "data");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ---- lang resolution -------------------------------------------------------------------
// Base layer: assets/<modid>/lang/en_us.json packed inside every mod jar.
// Overlay: kubejs/assets/<modid>/lang/en_us.json (KubeJS-authored overrides win).
function buildLangMap() {
  const lang = new Map();
  let jarsScanned = 0;
  for (const jarName of fs.readdirSync(MODS_DIR)) {
    if (!jarName.endsWith(".jar")) continue;
    try {
      const zip = new AdmZip(path.join(MODS_DIR, jarName));
      for (const entry of zip.getEntries()) {
        const m = entry.entryName.match(/^assets\/([^/]+)\/lang\/en_us\.json$/);
        if (!m) continue;
        try {
          const data = JSON.parse(entry.getData().toString("utf8"));
          for (const [k, v] of Object.entries(data)) lang.set(k, v);
        } catch {
          // malformed/unreadable lang file in some mod jar - skip it, not fatal
        }
      }
      jarsScanned++;
    } catch (e) {
      console.warn(`[pipeline] could not read ${jarName}: ${e.message}`);
    }
  }
  console.log(`[pipeline] scanned ${jarsScanned} mod jars for lang entries`);

  if (fs.existsSync(KUBEJS_ASSETS_DIR)) {
    let overlaid = 0;
    for (const modId of fs.readdirSync(KUBEJS_ASSETS_DIR)) {
      const langFile = path.join(KUBEJS_ASSETS_DIR, modId, "lang", "en_us.json");
      if (!fs.existsSync(langFile)) continue;
      try {
        const data = readJson(langFile);
        for (const [k, v] of Object.entries(data)) lang.set(k, v);
        overlaid++;
      } catch {
        // ignore malformed overlay file
      }
    }
    console.log(`[pipeline] overlaid ${overlaid} kubejs/assets lang files`);
  }

  console.log(`[pipeline] lang map has ${lang.size} keys`);
  return lang;
}

function prettifyId(id) {
  const path = id.includes(":") ? id.split(":")[1] : id;
  return path
    .split("/")
    .pop()
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function displayNameFor(id, translationKey, lang) {
  // GTCEu shares one lang key per item template ("item.gtceu.dust": "%s Dust") across every
  // material variant and fills in the material name at render time via Component args - a
  // static lang lookup can't reproduce that, so fall back to the id-derived name instead.
  if (translationKey && lang.has(translationKey)) {
    const text = lang.get(translationKey);
    if (!text.includes("%s")) return text;
  }
  return prettifyId(id);
}

// ---- io normalization -------------------------------------------------------------------

function normalizeInputs(list) {
  const out = [];
  for (const entry of list || []) {
    if (entry.kind !== "item" && entry.kind !== "fluid") continue;
    const ids = entry.kind === "item" ? entry.items : entry.fluids;
    if (!ids || ids.length === 0) continue;
    out.push({ kind: entry.kind, ids, amount: entry.amount });
  }
  return out;
}

function normalizeOutputs(list) {
  const out = [];
  for (const entry of list || []) {
    if (entry.kind !== "item" && entry.kind !== "fluid") continue;
    const ids = entry.kind === "item" ? entry.items : entry.fluids;
    if (!ids || ids.length === 0) continue;
    const io = { kind: entry.kind, ids, amount: entry.amount };
    if (entry.maxChance > 0 && entry.chance < entry.maxChance) {
      io.chancePercent = Math.round((entry.chance / entry.maxChance) * 100);
    }
    out.push(io);
  }
  return out;
}

// gtceu:arc_furnace is ~99% one auto-generated recipe per craftable item in the game ("oxygen +
// the item -> a handful of its component metals back as scrap"), a machine-recycling mechanic,
// not a production path. Left in, the solver keeps "solving" e.g. Titanium Ingot by building an
// EV Mixer and scrapping it. Excluded for the same reason as minecraft:crafting above.
const EXCLUDED_GT_MACHINES = new Set(["gtceu:arc_furnace"]);

function normalizeGtRecipes(raw) {
  const recipes = [];
  let skipped = 0;
  for (const r of raw) {
    if (EXCLUDED_GT_MACHINES.has(r.type)) {
      skipped++;
      continue;
    }
    const inputs = normalizeInputs(r.inputs);
    const outputs = normalizeOutputs(r.outputs);
    if (inputs.length === 0 || outputs.length === 0) continue;
    recipes.push({
      id: r.id,
      machine: r.type,
      tier: r.tier,
      durationTicks: r.duration,
      voltage: r.voltage,
      inputs,
      outputs,
    });
  }
  console.log(`[pipeline] gt_recipes: excluded ${skipped} arc_furnace scrap recipes`);
  return recipes;
}

// Crafting-table recipes routinely require a tool (hammer/file/wrench) as an ingredient slot
// that vanilla crafting returns uncrafted via getRemainingItems() - our dump/solver don't model
// "consumed vs. tool" ingredients, so treating a tool as something that must itself be crafted
// from scratch each time produces absurd chains (e.g. "craft a hammer to craft an empty mold").
// Ore-processing chains don't live in the crafting table anyway, so just exclude this type.
const EXCLUDED_OTHER_RECIPE_TYPES = new Set(["minecraft:crafting"]);

function normalizeOtherRecipes(raw) {
  const recipes = [];
  let skipped = 0;
  for (const r of raw) {
    if (!r.structured || EXCLUDED_OTHER_RECIPE_TYPES.has(r.type)) {
      skipped++;
      continue;
    }
    const inputs = (r.ingredients || [])
      .map((ing) => ({ kind: "item", ids: ing.items, amount: 1 }))
      .filter((x) => x.ids && x.ids.length > 0);
    const outputs = [];
    if (r.result && r.result.id) {
      outputs.push({ kind: "item", ids: [r.result.id], amount: r.result.count ?? 1 });
    }
    if (inputs.length === 0 || outputs.length === 0) {
      skipped++;
      continue;
    }
    recipes.push({ id: r.id, machine: r.type, inputs, outputs });
  }
  console.log(`[pipeline] other_recipes: ${recipes.length} structured, ${skipped} skipped (needs custom parsing later)`);
  return recipes;
}

const MACERATOR_MACHINES = new Set(["gtceu:macerator", "greate:milling"]);
// Safe to match anywhere in the id (unlikely to appear as a substring of a device/tool name).
const RAW_INPUT_SUBSTRINGS = [
  "ore", "raw_", "crushed", "cluster", "chunk", "dust", "gem", "crystal", "shard", "sludge",
  "slurry", "slag", "concentrate", "sand", "clay", "ash", "nugget", "leaves", "wood",
  "plank", "coal", "charcoal", "ice", "snow", "glass", "cobblestone", "gravel",
  "netherrack", "bone", "shell", "wool", "seed", "plant", "flower", "mushroom", "fiber", "fibre",
  "pebble", "sapling", "rubber", "resin", "biomass", "bark", "fruit", "vegetable",
];
// Only safe as a suffix - as a substring these collide with tool/device names
// (e.g. "ev_block_breaker", "iron_log_splitter" would false-match "block"/"log").
const RAW_INPUT_SUFFIXES = ["_block", "_log", "_stone", "_rock"];

// Name-heuristic fallback for when machines.json isn't available: can never fully separate
// "titanium_block" (refined, 9 ingots) from "rutile_block" (raw ore storage block), or catch
// every device name ("ev_ore_washer" contains "ore" but is a machine) - kept only as a fallback.
function isSuspectMacerate(r) {
  if (!MACERATOR_MACHINES.has(r.machine)) return false;
  if (r.inputs.length !== 1 || r.inputs[0].kind !== "item") return false;
  const bare = (r.inputs[0].ids[0].split(":")[1] || "").toLowerCase();
  const looksRaw =
    RAW_INPUT_SUBSTRINGS.some((hint) => bare.includes(hint)) ||
    RAW_INPUT_SUFFIXES.some((suffix) => bare.endsWith(suffix));
  return !looksRaw;
}

// Authoritative version (dumped via GTRegistries.MACHINES - see mod/RecipeDumper.dumpMachines):
// a recipe whose sole input is literally a registered GTCEu machine item is always scrapping a
// built machine for its component metals, regardless of which GT machine performs the scrapping
// (macerator, extractor, etc.) - not a production step, exclude it outright.
function isMachineScrapRecipe(r, machineItemIds) {
  if (r.inputs.length !== 1 || r.inputs[0].kind !== "item") return false;
  return machineItemIds.has(r.inputs[0].ids[0]);
}

// ---- main ---------------------------------------------------------------------------------

function main() {
  console.log(`[pipeline] reading dump from ${DUMP_DIR}`);
  const lang = buildLangMap();

  const itemsRaw = readJson(path.join(DUMP_DIR, "items.json"));
  const fluidsRaw = readJson(path.join(DUMP_DIR, "fluids.json"));

  const items = {};
  for (const it of itemsRaw) items[it.id] = displayNameFor(it.id, it.translationKey, lang);

  const fluids = {};
  for (const fl of fluidsRaw) fluids[fl.id] = displayNameFor(fl.id, fl.translationKey, lang);

  console.log(`[pipeline] ${Object.keys(items).length} items, ${Object.keys(fluids).length} fluids`);

  const gtRecipesRaw = readJson(path.join(DUMP_DIR, "gt_recipes.json"));
  const gtRecipes = normalizeGtRecipes(gtRecipesRaw);
  console.log(`[pipeline] gt_recipes: ${gtRecipes.length}/${gtRecipesRaw.length} normalized`);

  const otherRecipesRaw = readJson(path.join(DUMP_DIR, "other_recipes.json"));
  const otherRecipes = normalizeOtherRecipes(otherRecipesRaw);

  // "/recycling/" recipes (TFG aircraft parts scrapped for their metal dusts, via macerator and
  // greate:milling) are the same "break down a fabricated item for scrap" pattern as arc_furnace -
  // small in number here but same failure mode for the solver, so drop them the same way.
  let allRecipes = [...gtRecipes, ...otherRecipes];
  const beforeRecyclingFilter = allRecipes.length;
  allRecipes = allRecipes.filter((r) => !r.id.includes("/recycling/"));
  console.log(`[pipeline] excluded ${beforeRecyclingFilter - allRecipes.length} /recycling/ scrap recipes`);

  const machinesFile = path.join(DUMP_DIR, "machines.json");
  if (fs.existsSync(machinesFile)) {
    // Authoritative: exclude any recipe (whichever GT machine performs it) whose sole input is a
    // registered GTCEu machine item - always a "scrap a built machine" recipe, never production.
    const machineItemIds = new Set(readJson(machinesFile));
    console.log(`[pipeline] loaded ${machineItemIds.size} known machine item ids`);
    const beforeMachineScrapFilter = allRecipes.length;
    allRecipes = allRecipes.filter((r) => !isMachineScrapRecipe(r, machineItemIds));
    console.log(`[pipeline] excluded ${beforeMachineScrapFilter - allRecipes.length} machine-scrap recipes`);
  } else {
    console.log("[pipeline] machines.json not found in dump (old dump?) - skipping authoritative machine-scrap filter");
  }

  // GTCEu's own macerator (and its greate:milling mirror) also has a large "macerate any
  // fabricated device/ingot for a pile of unrelated scrap dusts" family (e.g.
  // macerate_ev_scanner -> Titanium Dust, macerate_titanium_ingot -> Titanium Dust) - real ore
  // processing macerator recipes only ever take raw ore/dust/gem-ish inputs, never a machine part
  // or an already-refined ingot, so default-exclude anything that doesn't look raw. Runs after the
  // authoritative filter above and mainly catches non-machine "reverse conversion" cases like
  // macerate_titanium_ingot (an ingot isn't a machine item, so the check above won't catch it).
  const beforeMacerateFilter = allRecipes.length;
  allRecipes = allRecipes.filter((r) => !isSuspectMacerate(r));
  console.log(`[pipeline] excluded ${beforeMacerateFilter - allRecipes.length} suspect macerator scrap recipes`);

  const db = {
    items,
    fluids,
    recipes: allRecipes,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "recipes.json");
  fs.writeFileSync(outFile, JSON.stringify(db));
  console.log(`[pipeline] wrote ${outFile} (${db.recipes.length} recipes)`);
}

main();
