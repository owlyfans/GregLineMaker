import { useState } from "react";
import { EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "reactflow";
import { useChainStore } from "../../state/chainStore";

interface Point {
  x: number;
  y: number;
}

interface BendableEdgeData {
  bendPoints?: Point[];
  /** Live-computed in ChainView (see displayEdges) for edges coming out of a machine - never
   * stored, so it can't go stale when the target item's required amount changes. */
  timeLabel?: string;
}

function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const c = closestPointOnSegment(p, a, b);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

// Used to pin the hover tooltip to the line itself rather than the raw cursor position (the
// invisible interaction path is 20px wide, so the cursor can be noticeably off the visible curve
// while still counted as "hovering"). Same straight-segment approximation addPoint already uses
// for hit-testing (source -> bend points -> target) - good enough for a hover label, not meant to
// be an exact projection onto the rendered bezier curve when there are no bend points yet.
function closestPointOnPath(p: Point, points: Point[]): Point {
  let best = points[0];
  let bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const candidate = closestPointOnSegment(p, points[i], points[i + 1]);
    const d = Math.hypot(p.x - candidate.x, p.y - candidate.y);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

/**
 * Edge type registered as the "default" (see ChainView's edgeTypes) so every connection gets two
 * things react-flow's built-in edges don't: bending (double-click the line to drop a point, drag a
 * point to move it, double-click a point to remove it) and moving an endpoint to a different node
 * (plain react-flow onReconnect - works the same regardless of which component draws the line).
 * With no bend points it's just a normal bezier curve; adding one switches it to straight segments
 * through each point, since that's simplest to compute and drag reliably for arbitrary point counts.
 */
export function BendableEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  markerStart,
  label,
  labelStyle,
  data,
}: EdgeProps<BendableEdgeData>) {
  const { screenToFlowPosition } = useReactFlow();
  const setEdgeBendPoints = useChainStore((s) => s.setEdgeBendPoints);
  const checkpoint = useChainStore((s) => s.checkpoint);
  const bottleneckHighlighted = useChainStore((s) => s.bottleneckEdgeIds.has(id));
  const bendPoints = data?.bendPoints ?? [];
  // Forces the dragged point visible even if the pointer moves off the edge's own hover area
  // mid-drag - otherwise the CSS hover-only visibility would make it disappear while still moving.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  // Where a double-click would drop a new point right now, tracked while hovering the plain line
  // (not an existing point - its own bigger hit-circle sits on top and intercepts the mouse first)
  // so there's a ghost preview + tooltip advertising the bend-it-here interaction before you commit.
  const [hoverPos, setHoverPos] = useState<Point | null>(null);

  const points: Point[] = [{ x: sourceX, y: sourceY }, ...bendPoints, { x: targetX, y: targetY }];
  const linePos = hoverPos ? closestPointOnPath(hoverPos, points) : null;

  let path: string;
  if (bendPoints.length === 0) {
    [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  } else {
    path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }

  // Bottleneck highlighting is transient/display-only (see chainStore's bottleneckEdgeIds) - it
  // overrides the rendered stroke color without touching the edge's actual stored `style.stroke`,
  // so a user's own manual recolor (or the refund yellow) is unaffected once the highlight is
  // toggled off. A vivid, saturated red distinct from every muted red already in use elsewhere
  // (manual red swatch, refund/role-output tones) so it reads as an automatic warning, not a color
  // choice. Doesn't touch the arrowhead - `markerEnd` here is already a resolved "url(#...)" marker
  // reference (reactflow generates the actual <marker> defs from the store's edge data elsewhere),
  // not the raw {color, ...} definition, so it can't be recolored from in here.
  const displayStyle = bottleneckHighlighted ? { ...style, stroke: "#ff2d55", strokeWidth: 3 } : style;

  // Dragging one bend point: checkpoint once at the start (not per frame, same reasoning as node
  // dragging), then push position updates straight to the store as the pointer moves. Plain
  // functions (not useCallback) - bendPoints/points are rebuilt every render anyway (derived from
  // edge data), so memoizing these against them wouldn't actually stabilize anything.
  function startDragPoint(event: React.PointerEvent, index: number) {
    event.stopPropagation();
    checkpoint();
    setDraggingIndex(index);
    function onMove(ev: PointerEvent) {
      const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const next = [...bendPoints];
      next[index] = pos;
      setEdgeBendPoints(id, next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraggingIndex(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function removePoint(event: React.MouseEvent, index: number) {
    event.stopPropagation();
    checkpoint();
    setEdgeBendPoints(
      id,
      bendPoints.filter((_, i) => i !== index),
    );
  }

  // Double-clicking the line inserts a new point wherever it's closest to - found by checking
  // distance to each existing segment (source -> b0 -> b1 -> ... -> target) in turn.
  function addPoint(event: React.MouseEvent) {
    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const d = distanceToSegment(flowPos, points[i], points[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    checkpoint();
    const next = [...bendPoints];
    next.splice(bestIndex, 0, flowPos);
    setEdgeBendPoints(id, next);
  }

  return (
    <>
      <path
        id={id}
        style={displayStyle}
        d={path}
        fill="none"
        className={`react-flow__edge-path${bottleneckHighlighted ? " bottleneck-edge" : ""}`}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
        onDoubleClick={addPoint}
        onMouseMove={(e) => setHoverPos(screenToFlowPosition({ x: e.clientX, y: e.clientY }))}
        onMouseLeave={() => setHoverPos(null)}
      />
      {hoverPos && linePos && draggingIndex === null && (
        <>
          <circle cx={hoverPos.x} cy={hoverPos.y} r={7} className="edge-bend-preview" />
          <EdgeLabelRenderer>
            {/* pointer-events: none (see CSS) so this never steals the double-click that adds a
                bend point on the invisible interaction path underneath it. Shows the edge's own
                label (e.g. "refund") plus a machine-output edge's time-to-make (see ChainView's
                displayEdges), following the closest point ON THE LINE (not the raw cursor, which
                can be up to 10px off it - see closestPointOnPath) while hovering, instead of always
                sitting at a fixed point on the line; falls back to the bend hint when there's
                neither. Font size isn't set explicitly here - it inherits react-flow's own zoom
                scaling, same as every node/edge label, since this renders inside the same
                transformed viewport pane. */}
            <div
              className="edge-bend-tooltip"
              style={{
                transform: `translate(-50%, -170%) translate(${linePos.x}px, ${linePos.y}px)`,
                ...(label ? { color: labelStyle?.fill as string | undefined, fontWeight: labelStyle?.fontWeight } : undefined),
              }}
            >
              {[label, data?.timeLabel].filter((v): v is string => !!v).join(" · ") || "Double-click to bend"}
            </div>
          </EdgeLabelRenderer>
        </>
      )}
      {bendPoints.map((p, i) => (
        <g key={i}>
          {/* Hit circle first (bigger, invisible) so the visible dot can paint on top of it while
              still passing pointer events through (see .edge-bend-point's pointer-events: none) -
              the CSS hover-color rule also relies on this DOM order (sibling selector). */}
          <circle
            cx={p.x}
            cy={p.y}
            r={14}
            fill="transparent"
            className="edge-bend-point-hit nodrag nopan"
            onPointerDown={(e) => startDragPoint(e, i)}
            onDoubleClick={(e) => removePoint(e, i)}
          />
          <circle cx={p.x} cy={p.y} r={7} className="edge-bend-point" style={draggingIndex === i ? { opacity: 1 } : undefined} />
        </g>
      ))}
    </>
  );
}
