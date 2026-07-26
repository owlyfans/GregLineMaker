// System-clipboard-backed copy/cut/paste for canvas node+edge selections. Goes through
// navigator.clipboard (not an in-memory variable) specifically so copy/paste works across tabs,
// windows, and even browsers - the whole point of the feature - at the cost of needing the
// clipboard-write/clipboard-read permissions (both granted implicitly by the user gesture that
// triggers Ctrl+C/X/V or a context-menu click).

import type { Edge } from "reactflow";
import type { FlowNode } from "../state/chainStore";

const CLIPBOARD_FORMAT = "greglinemaker-clipboard";

interface ClipboardPayload {
  format: typeof CLIPBOARD_FORMAT;
  version: 1;
  nodes: FlowNode[];
  edges: Edge[];
}

function isClipboardPayload(value: unknown): value is ClipboardPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.format === CLIPBOARD_FORMAT && Array.isArray(v.nodes) && Array.isArray(v.edges);
}

/** Writes the given nodes/edges to the system clipboard as tagged JSON. Silently no-ops on
 * failure (permission denied, insecure context, etc.) - copy is best-effort, nothing else in the
 * app depends on it succeeding. */
export async function writeClipboard(nodes: FlowNode[], edges: Edge[]): Promise<void> {
  const payload: ClipboardPayload = { format: CLIPBOARD_FORMAT, version: 1, nodes, edges };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
  } catch (err) {
    // Best-effort - copy just silently fails - but log the real reason (permission denied,
    // insecure context, document not focused, ...) instead of swallowing it outright, since a
    // bare "paste does nothing" report is otherwise impossible to diagnose from the browser side.
    console.warn("GregLineMaker: clipboard write failed", err);
  }
}

/** Reads back a previously-copied selection, or null if the clipboard holds nothing recognizable
 * (empty, plain text, another app's data, permission denied, ...). */
export async function readClipboard(): Promise<{ nodes: FlowNode[]; edges: Edge[] } | null> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch (err) {
    console.warn("GregLineMaker: clipboard read failed", err);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isClipboardPayload(parsed)) return null;
  return { nodes: parsed.nodes, edges: parsed.edges };
}
