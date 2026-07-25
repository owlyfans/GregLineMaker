import type { ItemNodeData } from "../../types/chain";
import { useChainStore } from "../../state/chainStore";
import { IconSlot } from "../IconSlot";
import { NodeHandles } from "./NodeHandles";
import { Tooltip } from "../Tooltip";

export function ItemNode({ id, data, selected }: { id: string; data: ItemNodeData; selected?: boolean }) {
  const highlighted = useChainStore((s) => s.highlightedNodeIds.has(id));
  const bottleneck = useChainStore((s) => s.bottleneckNodeIds.has(id));
  return (
    <div
      className={`flow-node item-node${data.refundable ? " refundable" : ""}${data.inRefundLoop ? " in-refund-loop" : ""}${data.tool ? " tool" : ""}${data.catalyst ? " catalyst" : ""}${data.role ? ` role-${data.role}` : ""}${data.finalOutput ? " final-output" : ""}${selected ? " node-selected" : ""}${highlighted ? " summary-highlighted" : ""}${bottleneck ? " bottleneck-flagged" : ""}`}
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
            <Tooltip label="On an active refund loop's path, but not itself the recycled surplus">
              <span className="badge loop-badge">in loop</span>
            </Tooltip>
          )}
          {data.tool && <span className="badge tool-badge">reusable tool</span>}
          {data.catalyst && (
            <Tooltip label="Required present in the recipe but not net-consumed by it">
              <span className="badge catalyst-badge">catalyst</span>
            </Tooltip>
          )}
          {data.role && <span className={`badge role-badge role-badge-${data.role}`}>{data.role}</span>}
          {data.finalOutput && (
            <Tooltip label="Counted in the Chain summary's time-to-produce">
              <span className="badge final-output-badge">final output</span>
            </Tooltip>
          )}
          {data.possibleRefund && (
            <Tooltip label="Right-click node -> Show refund suggestions">
              <span className="badge possible-refund-badge">possible refund</span>
            </Tooltip>
          )}
          {data.leftover && (
            <Tooltip label="Recipes run in whole batches - this much more came out than was actually needed">
              <span className="badge leftover-badge">{data.leftover} leftover</span>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
