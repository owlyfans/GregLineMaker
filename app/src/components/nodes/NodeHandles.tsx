import { Handle, Position } from "reactflow";

/** Every flow node's connection points: the original left(target)/right(source) pair, plus a
 * target+source pair on both top and bottom so chains that stack nodes vertically (byproducts,
 * refund loops) can connect straight up/down instead of always routing through the sides. Top and
 * bottom each carry a target and a source handle side by side (offset left/right of center) rather
 * than stacked exactly on top of each other, so both stay independently draggable. */
export function NodeHandles() {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <Handle type="target" id="top" position={Position.Top} style={{ left: "35%" }} />
      <Handle type="source" id="top" position={Position.Top} style={{ left: "65%" }} />
      <Handle type="target" id="bottom" position={Position.Bottom} style={{ left: "35%" }} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={{ left: "65%" }} />
    </>
  );
}
