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

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a shareable link with the whole chain gzip-compressed into the hash fragment (`#c=...`).
 * Repetitive JSON (same field names on every node/edge) compresses very well, and the hash never
 * touches a server, so this comfortably fits even large chains. `long` flags links past a length
 * where some chat apps/SMS might mangle the paste, so the caller can warn without blocking it. */
export async function buildShareUrl(nodes: FlowNode[], edges: Edge[]): Promise<{ url: string; long: boolean }> {
  const json = JSON.stringify({ nodes, edges });
  const compressed = await gzip(new TextEncoder().encode(json));
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
    const json = new TextDecoder().decode(await gunzip(bytes));
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
