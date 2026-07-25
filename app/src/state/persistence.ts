import type { Edge } from "reactflow";
import type { FlowNode } from "./chainStore";

const FORMAT_VERSION = 1;
const AUTOSAVE_KEY = "greglinemaker.autosave.v1";

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

/** Best-effort local autosave so a refresh/crash doesn't lose work - not a substitute for explicit saves. */
export function saveToLocalStorage(nodes: FlowNode[], edges: Edge[]) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toChainFile(nodes, edges)));
  } catch {
    // storage full/unavailable - autosave is a convenience, fail silently
  }
}

export function loadFromLocalStorage(): { nodes: FlowNode[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isChainFile(parsed)) return null;
    return { nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return null;
  }
}
