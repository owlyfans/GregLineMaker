// Icon extraction. Two sources, merged:
// 1. Static: pulls real item textures straight out of the mod jars for items that follow the
//    standard Forge convention (a texture referenced by the item's own model, found either
//    directly or by following one level of model inheritance).
// 2. Rendered: GTCEu's material items (dust/ingot/etc.) are tinted at runtime from a handful of
//    shared shape textures rather than having one PNG each, and fluid textures aren't declared in
//    any data file (only in mod Java code), so neither can be resolved reliably from static files.
//    For those, `/greglinedumpicons` (see mod/.../IconDumper.java) renders every item's actual
//    in-game icon client-side into greglinedump/icons/<ns>/<path>.png. Wherever a rendered icon
//    exists for an item id, it wins over the static guess (it's the ground truth, not a heuristic).
//    Fluids don't get rendered directly (they aren't items), so a fluid's icon is borrowed from its
//    bucket item's rendered icon by guessing the bucket item id from the fluid id.
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const INSTANCE_DIR =
  process.argv[2] ||
  process.env.TFG_INSTANCE_DIR ||
  "C:/Users/owlyfans/AppData/Roaming/PrismLauncher/instances/TerraFirmaGreg-Modern/minecraft";

const MODS_DIR = path.join(INSTANCE_DIR, "mods");
const DUMP_DIR = path.join(INSTANCE_DIR, "greglinedump");
const RENDERED_ICONS_DIR = path.join(DUMP_DIR, "icons");
const ICONS_OUT_DIR = path.resolve(process.cwd(), "..", "app", "public", "icons", "items");
const MANIFEST_OUT = path.resolve(process.cwd(), "..", "app", "public", "data", "icons.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walkPngs(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPngs(full, base, out);
    else if (entry.name.endsWith(".png")) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Rendered files are laid out as <namespace>/<item-path>.png, matching the id 1:1 (item ids can
 * themselves contain slashes, e.g. "afc:bucket/birch_sap"), so the relative path IS the id with
 * ":" swapped in for the first "/" and ".png" dropped. */
function renderedIdFromRelPath(relPath) {
  const withoutExt = relPath.slice(0, -".png".length);
  const slashIndex = withoutExt.indexOf("/");
  if (slashIndex === -1) return null;
  return `${withoutExt.slice(0, slashIndex)}:${withoutExt.slice(slashIndex + 1)}`;
}

/** Fluids aren't items and never get rendered directly - borrow the bucket item's rendered icon
 * instead, trying a few naming conventions mods use for their bucket items. */
function guessBucketItemIds(fluidId) {
  const [ns, p] = fluidId.split(":");
  const segs = p.split("/");
  const lastSeg = segs[segs.length - 1];
  const strippedLast = lastSeg.startsWith("flowing_") ? lastSeg.slice("flowing_".length) : lastSeg;
  const base = [...segs.slice(0, -1), strippedLast].join("/");
  return [`${ns}:${base}_bucket`, `${ns}:bucket/${base}`, `${ns}:${base}`];
}

function main() {
  const items = readJson(path.join(DUMP_DIR, "items.json")).map((i) => i.id);
  const fluids = readJson(path.join(DUMP_DIR, "fluids.json")).map((f) => f.id);
  console.log(`[icons] resolving icons for ${items.length} items, ${fluids.length} fluids`);

  const renderedRelPaths = walkPngs(RENDERED_ICONS_DIR, RENDERED_ICONS_DIR, []);
  const renderedById = new Map(); // item id -> absolute source file path
  for (const relPath of renderedRelPaths) {
    const id = renderedIdFromRelPath(relPath);
    if (id) renderedById.set(id, path.join(RENDERED_ICONS_DIR, relPath));
  }
  console.log(`[icons] found ${renderedById.size} rendered icons from /greglinedumpicons`);

  // One pass over every jar: index every candidate texture and every item model so items can be
  // cross-referenced in memory afterwards instead of re-scanning jars per item.
  const textures = new Map(); // "modid:item/path" or "modid:block/path" (no extension) -> Buffer
  const itemModels = new Map(); // "modid:path" (from models/item/path.json) -> parsed model json
  const blockModels = new Map(); // "modid:path" (from models/block/path.json) -> parsed model json - most
  // block-item models just inherit their block's model ("parent": "modid:block/x") for texture info.

  let jarsScanned = 0;
  for (const jarName of fs.readdirSync(MODS_DIR)) {
    if (!jarName.endsWith(".jar")) continue;
    let zip;
    try {
      zip = new AdmZip(path.join(MODS_DIR, jarName));
    } catch {
      continue;
    }
    for (const entry of zip.getEntries()) {
      const texMatch = entry.entryName.match(/^assets\/([^/]+)\/textures\/(item|items|block|blocks)\/(.+)\.png$/);
      if (texMatch) {
        const [, ns, kind, rest] = texMatch;
        const normalizedKind = kind === "items" ? "item" : kind === "blocks" ? "block" : kind;
        const key = `${ns}:${normalizedKind}/${rest}`;
        if (!textures.has(key)) {
          try {
            textures.set(key, entry.getData());
          } catch {
            // corrupt/unreadable entry - skip it
          }
        }
        continue;
      }
      const itemModelMatch = entry.entryName.match(/^assets\/([^/]+)\/models\/item\/(.+)\.json$/);
      if (itemModelMatch) {
        const [, ns, rest] = itemModelMatch;
        const key = `${ns}:${rest}`;
        if (!itemModels.has(key)) {
          try {
            itemModels.set(key, JSON.parse(entry.getData().toString("utf8")));
          } catch {
            // malformed model json - skip it
          }
        }
        continue;
      }
      const blockModelMatch = entry.entryName.match(/^assets\/([^/]+)\/models\/block\/(.+)\.json$/);
      if (blockModelMatch) {
        const [, ns, rest] = blockModelMatch;
        // Keyed with the "block/" prefix, matching how a "parent": "modid:block/x" reference reads literally.
        const key = `${ns}:block/${rest}`;
        if (!blockModels.has(key)) {
          try {
            blockModels.set(key, JSON.parse(entry.getData().toString("utf8")));
          } catch {
            // malformed model json - skip it
          }
        }
      }
    }
    jarsScanned++;
  }
  console.log(`[icons] scanned ${jarsScanned} jars: ${textures.size} textures, ${itemModels.size} item models indexed`);

  function resolveViaModel(modelKey, depth) {
    if (depth > 4) return null;
    const model = itemModels.get(modelKey) ?? blockModels.get(modelKey);
    if (!model) return null;
    if (model.textures) {
      for (const value of [model.textures.layer0, model.textures.all, model.textures.particle, ...Object.values(model.textures)]) {
        if (typeof value === "string" && value.includes(":") && textures.has(value)) return value;
      }
    }
    if (typeof model.parent === "string" && (itemModels.has(model.parent) || blockModels.has(model.parent))) {
      return resolveViaModel(model.parent, depth + 1);
    }
    return null;
  }

  const manifest = {};
  let staticHits = 0;
  let renderedHits = 0;
  for (const id of items) {
    const colonIndex = id.indexOf(":");
    const ns = colonIndex === -1 ? "minecraft" : id.slice(0, colonIndex);
    const itemPath = colonIndex === -1 ? id : id.slice(colonIndex + 1);
    const outRelPath = `${ns}/${itemPath}.png`;
    const outPath = path.join(ICONS_OUT_DIR, outRelPath);

    const renderedSrc = renderedById.get(id);
    if (renderedSrc) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.copyFileSync(renderedSrc, outPath);
      manifest[id] = `/icons/items/${outRelPath.replace(/\\/g, "/")}`;
      renderedHits++;
      continue;
    }

    let texKey = null;
    if (textures.has(`${ns}:item/${itemPath}`)) texKey = `${ns}:item/${itemPath}`;
    else if (textures.has(`${ns}:block/${itemPath}`)) texKey = `${ns}:block/${itemPath}`;
    else texKey = resolveViaModel(`${ns}:${itemPath}`, 0);

    if (!texKey) continue;
    const buf = textures.get(texKey);
    if (!buf) continue;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    manifest[id] = `/icons/items/${outRelPath.replace(/\\/g, "/")}`;
    staticHits++;
  }
  const itemHits = staticHits + renderedHits;
  console.log(
    `[icons] resolved ${itemHits}/${items.length} item icons (${((itemHits / items.length) * 100).toFixed(1)}%) ` +
      `- ${renderedHits} rendered, ${staticHits} static`,
  );

  let fluidHits = 0;
  for (const id of fluids) {
    const bucketId = guessBucketItemIds(id).find((candidate) => manifest[candidate]);
    if (bucketId) {
      manifest[id] = manifest[bucketId];
      fluidHits++;
    }
  }
  console.log(`[icons] resolved ${fluidHits}/${fluids.length} fluid icons (${((fluidHits / fluids.length) * 100).toFixed(1)}%) via bucket items`);

  fs.mkdirSync(path.dirname(MANIFEST_OUT), { recursive: true });
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest));
  console.log(`[icons] manifest: ${Object.keys(manifest).length} total entries -> ${MANIFEST_OUT}`);
}

main();
