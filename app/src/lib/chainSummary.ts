import type { Edge } from "reactflow";
import type { FlowNode } from "../state/chainStore";
import { formatAmount } from "../state/chainStore";
import type { ItemNodeData, MachineNodeData } from "../types/chain";

export interface SummaryContributionMachine {
  label: string;
  tier?: string;
}

export interface SummaryContribution {
  nodeId: string;
  amount: string;
  /** The machine(s) this specific node's amount feeds (via its outgoing edge) - empty if the node
   * isn't wired to a machine yet. */
  machines: SummaryContributionMachine[];
}

export interface SummaryItemEntry {
  key: string;
  itemId: string;
  materialKind: "item" | "fluid";
  label: string;
  /** Total amount across every node for this item (not node count) - two separate 16x/32x input
   * nodes of the same item are one shopping-list line of 48x, not two lines of "1". Falls back to
   * counting nodes only when a node has no amount at all. */
  count: string;
  /** The individual nodes summed into `count` - a combined "48x Bauxite" line can be two separate
   * 16x/32x nodes destined for two different machines, not one batch you gather once. Exposed so
   * the summary panel can offer an expand toggle showing the original per-node/per-machine split. */
  contributions: SummaryContribution[];
}

export interface SummaryMachineEntry {
  key: string;
  machineId?: string;
  tier?: string;
  label: string;
  /** Instance count - machines don't carry a quantity the way items do, so this is just how many
   * nodes of this exact machine+tier appear in the chain. */
  count: number;
  /** The individual machine node ids behind `count` - lets the summary panel highlight/select all
   * of them at once on hover/click. */
  nodeIds: string[];
}

export interface ChainSummary {
  inputs: SummaryItemEntry[];
  catalysts: SummaryItemEntry[];
  machines: SummaryMachineEntry[];
  outputs: SummaryItemEntry[];
}

function feedingMachines(nodeId: string, edges: Edge[], machineById: Map<string, MachineNodeData>): SummaryContributionMachine[] {
  const machines: SummaryContributionMachine[] = [];
  for (const e of edges) {
    if (e.source !== nodeId) continue;
    const machine = machineById.get(e.target);
    if (machine) machines.push({ label: machine.label, tier: machine.tier });
  }
  return machines;
}

function groupItems(
  nodes: FlowNode[],
  edges: Edge[],
  machineById: Map<string, MachineNodeData>,
  include: (data: ItemNodeData) => boolean,
): SummaryItemEntry[] {
  const totals = new Map<
    string,
    { itemId: string; materialKind: "item" | "fluid"; label: string; amount: number; contributions: SummaryContribution[] }
  >();
  for (const node of nodes) {
    if (node.data.kind !== "item") continue;
    const data = node.data as ItemNodeData;
    if (!include(data)) continue;
    const key = `${data.materialKind}:${data.itemId}`;
    const parsed = data.amount !== undefined ? Number(data.amount) : NaN;
    const amount = Number.isFinite(parsed) ? parsed : 1;
    const contribution: SummaryContribution = {
      nodeId: node.id,
      amount: formatAmount(amount),
      machines: feedingMachines(node.id, edges, machineById),
    };
    const existing = totals.get(key);
    if (existing) {
      existing.amount += amount;
      existing.contributions.push(contribution);
    } else {
      totals.set(key, { itemId: data.itemId, materialKind: data.materialKind, label: data.label, amount, contributions: [contribution] });
    }
  }
  return [...totals.entries()]
    .map(([key, v]) => ({
      key,
      itemId: v.itemId,
      materialKind: v.materialKind,
      label: v.label,
      count: formatAmount(v.amount),
      contributions: v.contributions,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Aggregates a chain's item/machine nodes into the four shopping-list-style groups shown in the
 * summary panel. Grouped by item id / machine id+tier regardless of whether the nodes are actually
 * wired together - this is a materials-list view, not a graph-connectivity one. */
export function summarizeChain(nodes: FlowNode[], edges: Edge[]): ChainSummary {
  const machineById = new Map<string, MachineNodeData>();
  for (const node of nodes) {
    if (node.data.kind === "machine") machineById.set(node.id, node.data as MachineNodeData);
  }

  const inputs = groupItems(nodes, edges, machineById, (d) => d.role === "input");
  const catalysts = groupItems(nodes, edges, machineById, (d) => !!d.catalyst);
  const outputs = groupItems(nodes, edges, machineById, (d) => d.role === "output");

  const machineTotals = new Map<string, SummaryMachineEntry>();
  for (const node of nodes) {
    if (node.data.kind !== "machine") continue;
    const data = node.data as MachineNodeData;
    const key = `${data.machineId ?? data.label}:${data.tier ?? ""}`;
    const existing = machineTotals.get(key);
    if (existing) {
      existing.count += 1;
      existing.nodeIds.push(node.id);
    } else {
      machineTotals.set(key, { key, machineId: data.machineId, tier: data.tier, label: data.label, count: 1, nodeIds: [node.id] });
    }
  }
  const machines = [...machineTotals.values()].sort((a, b) => a.label.localeCompare(b.label));

  return { inputs, catalysts, machines, outputs };
}
