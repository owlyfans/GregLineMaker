import type { Edge } from "reactflow";
import type { FlowNode } from "./chainStore";

const HASH_KEY = "c=";
/** Above this, the link still works in any modern browser - it's carried in the hash fragment,
 * which is never sent to a server and isn't subject to any HTTP header/URL-length limit - but some
 * chat apps/SMS gateways silently truncate very long pasted text, so it's worth flagging. */
const LONG_LINK_WARNING_LENGTH = 30000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// "deflate-raw" (bare DEFLATE bitstream) instead of "gzip" - same compression, just without
// gzip's ~18-byte magic-number/CRC32/ISIZE wrapper, which buys nothing here (the hash isn't a
// standalone file needing self-identification/integrity-checking - readShareUrl already only
// reads it in the one place that produced it).
async function compress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressAs(bytes: Uint8Array<ArrayBuffer>, format: CompressionFormat): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The hash carries no format marker, so an old "gzip"-built link (from before this switched to
// "deflate-raw") needs a fallback rather than just failing outright - readShareUrl already treats
// any decode failure as "not a share link" (see its own doc comment), which would otherwise make
// every link built before this change quietly stop restoring.
async function decompress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await decompressAs(bytes, "deflate-raw");
  } catch {
    return decompressAs(bytes, "gzip");
  }
}

// React Flow's own applyNodeChanges/applyEdgeChanges (see chainStore's onNodesChange/onEdgesChange)
// permanently attach runtime bookkeeping - width/height/measured/positionAbsolute once a node's
// been rendered/measured, `selected`/`dragging` from ordinary canvas interaction - onto the very
// node/edge objects this store holds. None of it is needed to reconstruct the chain (React Flow
// re-measures everything itself on the next load), so it's pure dead weight in a share link -
// trimming it down to just what loadChain actually needs shrinks the payload for any chain that's
// had actual canvas interaction (which is all of them), on top of whatever compress() saves.
// Dragging derives position from mouse-delta / zoom, so it's essentially always a long
// non-repeating decimal (e.g. 247.83291028393) - unlike a repeated JSON key, that entropy doesn't
// compress away, and nobody can tell a node landed 0.3px off from where they actually dropped it.
// Rounding to the nearest pixel before compressing was the single biggest win found here - roughly
// half the compressed size in testing, well past what trimming React Flow's own runtime fields or
// switching compression format got on their own.
function toShareableNode(n: FlowNode): Pick<FlowNode, "id" | "type" | "position" | "data"> {
  return { id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data };
}

function toShareableEdge(e: Edge): Edge {
  const shareable: Edge = { id: e.id, source: e.source, target: e.target };
  if (e.sourceHandle != null) shareable.sourceHandle = e.sourceHandle;
  if (e.targetHandle != null) shareable.targetHandle = e.targetHandle;
  if (e.label !== undefined) shareable.label = e.label;
  if (e.animated) shareable.animated = e.animated;
  if (e.style) shareable.style = e.style;
  if (e.labelStyle) shareable.labelStyle = e.labelStyle;
  if (e.markerEnd) shareable.markerEnd = e.markerEnd;
  if (e.data) shareable.data = e.data;
  return shareable;
}

/** Builds a shareable link with the whole chain compressed into the hash fragment (`#c=...`).
 * Repetitive JSON (same field names on every node/edge) compresses very well, and the hash never
 * touches a server, so this comfortably fits even large chains. `long` flags links past a length
 * where some chat apps/SMS might mangle the paste, so the caller can warn without blocking it. */
export async function buildShareUrl(nodes: FlowNode[], edges: Edge[]): Promise<{ url: string; long: boolean }> {
  const json = JSON.stringify({ nodes: nodes.map(toShareableNode), edges: edges.map(toShareableEdge) });
  const compressed = await compress(new TextEncoder().encode(json));
  const encoded = bytesToBase64Url(compressed);
  const url = `${location.origin}${location.pathname}#${HASH_KEY}${encoded}`;
  return { url, long: url.length > LONG_LINK_WARNING_LENGTH };
}

/** Reads a share link's payload from the current location hash, if present. Returns null for any
 * malformed/foreign hash rather than throwing, since a normal page load has no hash at all. */
export async function readShareUrl(): Promise<{ nodes: FlowNode[]; edges: Edge[] } | null> {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!hash.startsWith(HASH_KEY)) return null;
  const encoded = hash.slice(HASH_KEY.length);
  if (!encoded) return null;
  try {
    const bytes = base64UrlToBytes(encoded);
    const json = new TextDecoder().decode(await decompress(bytes));
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return null;
  }
}

/** Clears a consumed share hash from the address bar without reloading, so a later refresh falls
 * back to the normal autosave restore instead of re-loading the (possibly now-stale) shared chain. */
export function clearShareHash() {
  history.replaceState(null, "", location.pathname + location.search);
}
