import type { Edge } from "reactflow";
import type { FlowNode } from "./chainStore";

const FORMAT_VERSION = 1;
const LEGACY_AUTOSAVE_KEY = "greglinemaker.autosave.v1";
const PAGE_KEY_PREFIX = "greglinemaker.page.";

interface ChainFile {
  format: "greglinemaker-chain";
  version: number;
  savedAt: string;
  nodes: FlowNode[];
  edges: Edge[];
}

function toChainFile(nodes: FlowNode[], edges: Edge[]): ChainFile {
  return { format: "greglinemaker-chain", version: FORMAT_VERSION, savedAt: new Date().toISOString(), nodes, edges };
}

function isChainFile(value: unknown): value is ChainFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.nodes) && Array.isArray(v.edges);
}

/** Turns a page name into a safe download filename: strips characters invalid on common
 * filesystems and appends ".json". */
export function chainFilename(pageName: string): string {
  const safe = pageName.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return `${safe || "gregline-chain"}.json`;
}

/** Triggers a browser download of the current chain as a JSON file. */
export function downloadChain(nodes: FlowNode[], edges: Edge[], filename?: string) {
  const file = toChainFile(nodes, edges);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename?.trim() || `gregline-chain-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Reads and validates a chain file picked via <input type="file">. Throws on malformed input. */
export async function readChainFile(file: File): Promise<{ nodes: FlowNode[]; edges: Edge[] }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`"${file.name}" isn't valid JSON.`);
  }
  if (!isChainFile(parsed)) {
    throw new Error(`"${file.name}" doesn't look like a GregLineMaker chain file (missing nodes/edges).`);
  }
  return { nodes: parsed.nodes, edges: parsed.edges };
}

/** Best-effort local save of one page's chain so a refresh/crash doesn't lose work - not a
 * substitute for explicit Save-to-file. Keyed per page id (see state/pagesStore.ts). */
export function savePage(pageId: string, nodes: FlowNode[], edges: Edge[]) {
  try {
    localStorage.setItem(PAGE_KEY_PREFIX + pageId + ".v1", JSON.stringify(toChainFile(nodes, edges)));
  } catch {
    // storage full/unavailable - autosave is a convenience, fail silently
  }
}

export function loadPage(pageId: string): { nodes: FlowNode[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(PAGE_KEY_PREFIX + pageId + ".v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isChainFile(parsed)) return null;
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return null;
  }
}

export function deletePageStorage(pageId: string) {
  try {
    localStorage.removeItem(PAGE_KEY_PREFIX + pageId + ".v1");
  } catch {
    // storage unavailable - nothing to clean up then
  }
}

/** One-time read of the pre-multi-page autosave blob, used only to migrate an existing user's
 * canvas into their first page (see pagesStore's init). */
export function loadLegacyAutosave(): { nodes: FlowNode[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isChainFile(parsed)) return null;
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return null;
  }
}
