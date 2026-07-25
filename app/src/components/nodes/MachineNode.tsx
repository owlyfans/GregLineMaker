import type { MachineNodeData } from "../../types/chain";
import { useChainStore } from "../../state/chainStore";
import { useIconStore } from "../../state/iconStore";
import { resolveMachineIconId } from "../../lib/machineIcon";
import { tierColor } from "../../lib/gtTiers";
import { COIL_MACHINE_TYPES, COIL_TYPES, coilMachineTemperature } from "../../lib/coils";
import { IconSlot } from "../IconSlot";
import { NodeHandles } from "./NodeHandles";

// Same red used elsewhere for "this needs attention" (see .bottleneck-flagged) - an insufficient
// coil means the recipe simply can't run at all, not just run slower.
const INSUFFICIENT_COIL_COLOR = "#ff2d55";

export function MachineNode({ id, data, selected }: { id: string; data: MachineNodeData; selected?: boolean }) {
  const icons = useIconStore((s) => s.icons);
  const highlighted = useChainStore((s) => s.highlightedNodeIds.has(id));
  const bottleneck = useChainStore((s) => s.bottleneckNodeIds.has(id));
  const iconId = resolveMachineIconId(icons, data.machineId, data.tier);
  const usesCoil = !!data.machineId && COIL_MACHINE_TYPES.has(data.machineId);
  const coil = data.coilTier ? COIL_TYPES.find((c) => c.id === data.coilTier) : undefined;
  const machineTemp = usesCoil && coil ? coilMachineTemperature(coil.id, data.tier) : undefined;
  // Also warns when no coil is picked at all, not just an insufficient one - a coil multiblock
  // always has SOME coil in-game, so "unset" is really "unknown, can't confirm it'll run" rather
  // than nothing to report.
  const insufficientCoil =
    usesCoil && data.recipeHeatRequirement !== undefined && (machineTemp === undefined || machineTemp < data.recipeHeatRequirement);
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
          topBadgeColor={data.tier ? tierColor(data.tier) : undefined}
          cornerBadge={data.parallelCount && data.parallelCount > 1 ? `${data.parallelCount}x` : undefined}
        />
        <div className="machine-node-caption">
          <div className="machine-node-label">{data.label}</div>
          {data.sublabel && <div className="machine-node-sublabel">{data.sublabel}</div>}
          {usesCoil && (coil || insufficientCoil) && (
            <div
              className="machine-node-sublabel"
              style={insufficientCoil ? { color: INSUFFICIENT_COIL_COLOR, fontWeight: 600 } : undefined}
            >
              {coil && machineTemp !== undefined ? `${coil.label} · ${machineTemp.toLocaleString()}K` : "No coil selected"}
              {insufficientCoil && ` (needs ${data.recipeHeatRequirement!.toLocaleString()}K+)`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
