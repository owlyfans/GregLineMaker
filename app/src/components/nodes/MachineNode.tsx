import type { MachineNodeData } from "../../types/chain";
import { useChainStore } from "../../state/chainStore";
import { useIconStore } from "../../state/iconStore";
import { resolveMachineIconId } from "../../lib/machineIcon";
import { tierGradient } from "../../lib/gtTiers";
import { IconSlot } from "../IconSlot";
import { NodeHandles } from "./NodeHandles";

export function MachineNode({ id, data, selected }: { id: string; data: MachineNodeData; selected?: boolean }) {
  const icons = useIconStore((s) => s.icons);
  const highlighted = useChainStore((s) => s.highlightedNodeIds.has(id));
  const bottleneck = useChainStore((s) => s.bottleneckNodeIds.has(id));
  const iconId = resolveMachineIconId(icons, data.machineId, data.tier);
  return (
    <div
      className={`flow-node machine-node${selected ? " node-selected" : ""}${highlighted ? " summary-highlighted" : ""}${bottleneck ? " bottleneck-flagged" : ""}`}
      style={data.color ? { backgroundColor: data.color, borderColor: data.borderColor } : undefined}
    >
      <NodeHandles />
      <div className="machine-node-body">
        <IconSlot
          id={iconId}
          label={data.label}
          size={48}
          topBadge={data.tier}
          topBadgeGradient={data.tier ? tierGradient(data.tier) : undefined}
          cornerBadge={data.parallelCount && data.parallelCount > 1 ? `${data.parallelCount}x` : undefined}
        />
        <div className="machine-node-caption">
          <div className="machine-node-label">{data.label}</div>
          {data.sublabel && <div className="machine-node-sublabel">{data.sublabel}</div>}
        </div>
      </div>
    </div>
  );
}
