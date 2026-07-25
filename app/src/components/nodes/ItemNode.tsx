import type { ItemNodeData } from "../../types/chain";
import { useChainStore } from "../../state/chainStore";
import { IconSlot } from "../IconSlot";
import { NodeHandles } from "./NodeHandles";

export function ItemNode({ id, data, selected }: { id: string; data: ItemNodeData; selected?: boolean }) {
  const highlighted = useChainStore((s) => s.highlightedNodeIds.has(id));
  return (
    <div
      className={`flow-node item-node${data.refundable ? " refundable" : ""}${data.inRefundLoop ? " in-refund-loop" : ""}${data.tool ? " tool" : ""}${data.catalyst ? " catalyst" : ""}${data.role ? ` role-${data.role}` : ""}${data.finalOutput ? " final-output" : ""}${selected ? " node-selected" : ""}${highlighted ? " summary-highlighted" : ""}`}
      style={data.color ? { backgroundColor: data.color, borderColor: data.borderColor } : undefined}
    >
      <NodeHandles />
      <div className="item-node-body">
        <IconSlot
          id={data.itemId}
          label={data.label}
          size={48}
          cornerBadge={data.amount}
          topBadge={data.chancePercent !== undefined ? `${data.chancePercent}%` : undefined}
        />
        <div className="item-node-caption">{data.label}</div>
      </div>
      {(data.refundable ||
        data.inRefundLoop ||
        data.tool ||
        data.catalyst ||
        data.role ||
        data.finalOutput ||
        data.possibleRefund ||
        data.leftover) && (
        <div className="item-node-meta">
          {data.refundable && <span className="badge refund-badge">refund</span>}
          {data.inRefundLoop && (
            <span className="badge loop-badge" title="On an active refund loop's path, but not itself the recycled surplus">
              in loop
            </span>
          )}
          {data.tool && <span className="badge tool-badge">reusable tool</span>}
          {data.catalyst && (
            <span className="badge catalyst-badge" title="Required present in the recipe but not net-consumed by it">
              catalyst
            </span>
          )}
          {data.role && <span className={`badge role-badge role-badge-${data.role}`}>{data.role}</span>}
          {data.finalOutput && (
            <span className="badge final-output-badge" title="Counted in the Chain summary's time-to-produce">
              final output
            </span>
          )}
          {data.possibleRefund && (
            <span className="badge possible-refund-badge" title="Right-click node -> Show refund suggestions">
              possible refund
            </span>
          )}
          {data.leftover && (
            <span
              className="badge leftover-badge"
              title="Recipes run in whole batches - this much more came out than was actually needed"
            >
              {data.leftover} leftover
            </span>
          )}
        </div>
      )}
    </div>
  );
}
