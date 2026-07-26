import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChainStore } from "../state/chainStore";
import { useIconStore } from "../state/iconStore";
import { resolveMachineIconId } from "../lib/machineIcon";
import { tierColor } from "../lib/gtTiers";
import { summarizeChain, type SummaryItemEntry, type SummaryMachineEntry } from "../lib/chainSummary";
import { computeFinalOutputTimes, formatDuration, type FinalOutputTime } from "../lib/productionTime";
import { computePowerSummary, humanizeGeneratorMachine, type PowerSummary } from "../lib/power";
import { useSettingsStore } from "../state/settingsStore";
import type { RecipeDatabase } from "../types/recipe";
import { IconSlot } from "./IconSlot";
import { Tooltip } from "./Tooltip";

interface ChainSummaryPanelProps {
  open: boolean;
  onClose: () => void;
  db: RecipeDatabase | null;
}

// The drawer's own original fixed width (see App.css's .summary-panel) - now also doubles as the
// drag-resize floor, so a user dragging it narrower can't shrink it down to something unusably
// thin, only ever back to (or wider than) what it always defaulted to.
const MIN_SUMMARY_WIDTH = 300;
const SUMMARY_WIDTH_STORAGE_KEY = "greglinemaker.summaryPanelWidth";

function loadSummaryWidth(): number {
  try {
    const raw = localStorage.getItem(SUMMARY_WIDTH_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= MIN_SUMMARY_WIDTH ? n : MIN_SUMMARY_WIDTH;
  } catch {
    return MIN_SUMMARY_WIDTH;
  }
}

function persistSummaryWidth(width: number) {
  try {
    localStorage.setItem(SUMMARY_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // best-effort only - a resize just won't survive a refresh
  }
}

interface RowCallbacks {
  onHover: (nodeIds: string[]) => void;
  onSelect: (nodeIds: string[]) => void;
}

function describeMachines(machines: { label: string; tier?: string }[]): string {
  if (machines.length === 0) return "not feeding a machine yet";
  return machines.map((m) => (m.tier ? `${m.label} (${m.tier})` : m.label)).join(", ");
}

function ItemSection({ title, entries, onHover, onSelect }: { title: string; entries: SummaryItemEntry[] } & RowCallbacks) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="summary-section">
      <div className="summary-section-title">{title}</div>
      {entries.length === 0 ? (
        <div className="summary-section-empty">None yet</div>
      ) : (
        entries.map((e) => {
          const splittable = e.contributions.length > 1;
          const isOpen = splittable && expanded.has(e.key);
          const allNodeIds = e.contributions.map((c) => c.nodeId);
          return (
            <div key={e.key}>
              <Tooltip label={splittable ? "Click to see the original per-machine split" : "Click to select on canvas"}>
                <div
                  className="summary-row summary-row-clickable"
                  onMouseEnter={() => onHover(allNodeIds)}
                  onMouseLeave={() => onHover([])}
                  onClick={() => (splittable ? toggle(e.key) : onSelect(allNodeIds))}
                >
                  <IconSlot id={e.itemId} label={e.label} size={32} cornerBadge={e.count} />
                  <span className="summary-row-label">{e.label}</span>
                  {splittable && <span className={`summary-row-chevron${isOpen ? " open" : ""}`}>&rsaquo;</span>}
                </div>
              </Tooltip>
              {isOpen && (
                <div className="summary-contributions">
                  {e.contributions.map((c) => (
                    <Tooltip key={c.nodeId} label="Click to select just this one on canvas">
                      <div
                        className="summary-contribution-row summary-row-clickable"
                        onMouseEnter={(ev) => {
                          ev.stopPropagation();
                          onHover([c.nodeId]);
                        }}
                        onMouseLeave={() => onHover([])}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelect([c.nodeId]);
                        }}
                      >
                        <span className="summary-contribution-amount">{c.amount}</span>
                        <span className="summary-contribution-machines">&rarr; {describeMachines(c.machines)}</span>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function FinalOutputSection({ entries, onHover, onSelect }: { entries: FinalOutputTime[] } & RowCallbacks) {
  return (
    <div className="summary-section">
      <div className="summary-section-title">Time to Produce</div>
      {entries.length === 0 ? (
        <div className="summary-section-empty">Mark a node as final output to see this</div>
      ) : (
        entries.map((e) => (
          <Tooltip key={e.nodeId} label="Click to select on canvas">
            <div
              className="summary-row summary-row-clickable"
              onMouseEnter={() => onHover([e.nodeId])}
              onMouseLeave={() => onHover([])}
              onClick={() => onSelect([e.nodeId])}
            >
              <IconSlot id={e.itemId} label={e.label} size={32} cornerBadge={e.amount} />
              <span className="summary-row-label">{e.label}</span>
              <span className="summary-row-time">{formatDuration(e.ticks)}</span>
            </div>
          </Tooltip>
        ))
      )}
    </div>
  );
}

function fuelAmountLabel(amountPerTick: number, kind: "item" | "fluid"): string {
  const rounded = Math.round(amountPerTick * 10) / 10;
  return kind === "fluid" ? `${rounded.toLocaleString()} mB/t` : `${rounded.toLocaleString()}/t`;
}

// `productionTicks` worth of burning at the current mB(or count)/t rate - the total a tank/supply
// needs to hold to keep every engine fed for as long as the chain's own critical path takes (see
// FinalOutputSection's own "Time to Produce" - same ticks value, just multiplied through here).
function fuelTotalLabel(amountPerTick: number, kind: "item" | "fluid", productionTicks: number): string {
  const total = Math.round(amountPerTick * productionTicks);
  return kind === "fluid" ? `${total.toLocaleString()} mB` : total.toLocaleString();
}

function PowerSection({
  summary,
  db,
  engineTierOffset,
  productionTicks,
}: {
  summary: PowerSummary;
  db: RecipeDatabase | null;
  engineTierOffset: number;
  /** Longest "Time to Produce" across every final-output node (0 if none marked yet) - lets the
   * fuel section show a total burned, not just a rate, for however long the chain actually takes to
   * finish (see FinalOutputSection/lib/productionTime's computeFinalOutputTimes). */
  productionTicks: number;
}) {
  return (
    <div className="summary-section">
      <div className="summary-section-title">
        Power (all machines active){engineTierOffset > 0 && ` — engines ${engineTierOffset} tier(s) down`}
      </div>
      {summary.totalEUt === 0 ? (
        <div className="summary-section-empty">No powered machines yet</div>
      ) : (
        <div className="summary-power">
          <div className="summary-power-total">{Math.round(summary.totalEUt).toLocaleString()} EU/t</div>
          <div className="summary-power-amps">
            {summary.ampsByTier.map((a) => (
              <Tooltip key={a.tier} label={`${a.engineCount}× ${a.tier} Steam/Gas Engine (1A @ tier, no rotor)`}>
                <span className="summary-power-amp-chip" style={{ color: tierColor(a.tier) }}>
                  {a.amps.toFixed(2)} A @ {a.tier} &middot; {a.engineCount}&times; engine
                </span>
              </Tooltip>
            ))}
          </div>
          {summary.fuelPlans.length > 0 && (
            <div className="summary-power-fuel">
              <div className="summary-power-fuel-title">Fuel to sustain this</div>
              {summary.fuelPlans.map((f) => {
                const name = (f.fuelKind === "fluid" ? db?.fluids[f.fuelId] : db?.items[f.fuelId]) ?? f.fuelId;
                return (
                  <div key={f.machine}>
                    <Tooltip label={f.preferred ? "Your preferred fuel (Settings)" : "Most fuel-efficient known fuel"}>
                      <div className="summary-power-fuel-row">
                        <span className="summary-power-fuel-machine">{humanizeGeneratorMachine(f.machine)}</span>
                        <span className="summary-power-fuel-amount">
                          {fuelAmountLabel(f.amountPerTick, f.fuelKind)} {name}
                          {f.preferred && <span className="summary-power-fuel-tag">preferred</span>}
                        </span>
                      </div>
                    </Tooltip>
                    {productionTicks > 0 && (
                      <div className="summary-power-fuel-total">
                        {fuelTotalLabel(f.amountPerTick, f.fuelKind, productionTicks)} {name} total over{" "}
                        {formatDuration(productionTicks)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MachineSection({
  entries,
  icons,
  onHover,
  onSelect,
}: { entries: SummaryMachineEntry[]; icons: Record<string, string> } & RowCallbacks) {
  return (
    <div className="summary-section">
      <div className="summary-section-title">Machines</div>
      {entries.length === 0 ? (
        <div className="summary-section-empty">None yet</div>
      ) : (
        entries.map((e) => (
          <Tooltip key={e.key} label="Click to select all on canvas">
            <div
              className="summary-row summary-row-clickable"
              onMouseEnter={() => onHover(e.nodeIds)}
              onMouseLeave={() => onHover([])}
              onClick={() => onSelect(e.nodeIds)}
            >
              <IconSlot
                id={resolveMachineIconId(icons, e.machineId, e.tier)}
                label={e.label}
                size={32}
                topBadge={e.tier}
                topBadgeColor={e.tier ? tierColor(e.tier) : undefined}
                cornerBadge={e.count}
              />
              <span className="summary-row-label">{e.label}</span>
            </div>
          </Tooltip>
        ))
      )}
    </div>
  );
}

/** Left slide-in drawer summarizing the whole chain as a materials list - opened by the fixed
 * top-left button in App.tsx (which hides itself while the drawer is open, since the drawer's own
 * header close button becomes the way back). Always mounted (never conditionally unmounted) so the
 * CSS transform transition can animate both ways; only the click-catching overlay behind it is
 * conditional on `open`. Leads with "Time to Produce" - the critical-path time (see
 * lib/productionTime) for every node tagged `finalOutput` (right-click a node -> Mark as -> Mark as
 * final output). Inputs/catalysts/outputs are shown as one summed line per item, but a line built
 * from more than one original node (e.g. two separate 16x/32x input nodes feeding two different
 * machines) can be expanded to see the original per-node amounts and which machine each one
 * actually feeds - summing them into "48x" doesn't mean you gather it as one batch. Hovering any
 * row (summed or an individual expanded contribution) rings the matching node(s) on canvas via the
 * transient `highlightedNodeIds` store field; clicking one selects those nodes for real and closes
 * the drawer. */
export function ChainSummaryPanel({ open, onClose, db }: ChainSummaryPanelProps) {
  const nodes = useChainStore((s) => s.nodes);
  const edges = useChainStore((s) => s.edges);
  const icons = useIconStore((s) => s.icons);
  const setHighlightedNodes = useChainStore((s) => s.setHighlightedNodes);
  const selectNodes = useChainStore((s) => s.selectNodes);
  const requestFocus = useChainStore((s) => s.requestFocus);
  const summary = useMemo(() => summarizeChain(nodes, edges), [nodes, edges]);
  const finalOutputTimes = useMemo(() => computeFinalOutputTimes(nodes, edges, db ?? undefined), [nodes, edges, db]);
  // Longest "Time to Produce" across every final-output node - how long the fuel section below
  // assumes the whole chain runs for when it shows a total burned, not just a rate (0 with no final
  // outputs marked yet, since there's then no time basis to total against).
  const productionTicks = useMemo(() => finalOutputTimes.reduce((max, e) => Math.max(max, e.ticks), 0), [finalOutputTimes]);
  const preferredFuelByMachine = useSettingsStore((s) => s.preferredFuelByMachine);
  const engineTierOffset = useSettingsStore((s) => s.engineTierOffset);
  const preferredTier = useSettingsStore((s) => s.preferredTier);
  const powerSummary = useMemo(
    () => computePowerSummary(nodes, db, preferredFuelByMachine, engineTierOffset, preferredTier),
    [nodes, db, preferredFuelByMachine, engineTierOffset, preferredTier],
  );

  // Don't leave a stale highlight ring on canvas if the drawer closes some other way (Escape,
  // overlay click, re-clicking the toggle button) while a row happens to be hovered.
  useEffect(() => {
    if (!open) setHighlightedNodes([]);
  }, [open, setHighlightedNodes]);

  // Drag-to-resize (right edge handle, see the JSX below) - persisted so it survives a refresh,
  // floored at MIN_SUMMARY_WIDTH (the drawer's own original fixed width) so dragging left can't
  // shrink it down to something unusably thin, and capped the same as App.css's own max-width: 85vw
  // so the handle never tracks past where the drawer visually stops growing.
  const [width, setWidth] = useState(loadSummaryWidth);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const maxWidth = window.innerWidth * 0.85;
    const next = Math.min(maxWidth, Math.max(MIN_SUMMARY_WIDTH, drag.startWidth + (e.clientX - drag.startX)));
    setWidth(next);
  }, []);

  const onResizeEnd = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeEnd);
    setWidth((w) => {
      persistSummaryWidth(w);
      return w;
    });
  }, [onResizeMove]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeEnd);
    },
    [width, onResizeMove, onResizeEnd],
  );

  function handleSelect(nodeIds: string[]) {
    setHighlightedNodes([]);
    selectNodes(nodeIds);
    requestFocus(nodeIds);
    onClose();
  }

  return (
    <>
      {open && <div className="summary-panel-overlay" onClick={onClose} />}
      <aside className={`summary-panel${open ? " open" : ""}`} style={{ width }}>
        <div className="summary-panel-resize-handle" onPointerDown={onResizeStart} />
        <div className="summary-panel-header">
          <span>Chain summary</span>
          <Tooltip label="Close" placement="right">
            <button type="button" className="summary-panel-close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </div>
        <div className="summary-panel-body">
          <FinalOutputSection entries={finalOutputTimes} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <PowerSection
            summary={powerSummary}
            db={db}
            engineTierOffset={engineTierOffset}
            productionTicks={productionTicks}
          />
          <ItemSection title="Inputs" entries={summary.inputs} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <ItemSection title="Catalysts" entries={summary.catalysts} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <MachineSection entries={summary.machines} icons={icons} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <ItemSection title="Outputs" entries={summary.outputs} onHover={setHighlightedNodes} onSelect={handleSelect} />
        </div>
      </aside>
    </>
  );
}
