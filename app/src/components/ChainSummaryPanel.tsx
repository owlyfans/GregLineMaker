import { useEffect, useMemo, useState } from "react";
import { useChainStore } from "../state/chainStore";
import { useIconStore } from "../state/iconStore";
import { resolveMachineIconId } from "../lib/machineIcon";
import { summarizeChain, type SummaryItemEntry, type SummaryMachineEntry } from "../lib/chainSummary";
import { computeFinalOutputTimes, formatDuration, type FinalOutputTime } from "../lib/productionTime";
import type { RecipeDatabase } from "../types/recipe";
import { IconSlot } from "./IconSlot";

interface ChainSummaryPanelProps {
  open: boolean;
  onClose: () => void;
  db: RecipeDatabase | null;
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
              <div
                className="summary-row summary-row-clickable"
                onMouseEnter={() => onHover(allNodeIds)}
                onMouseLeave={() => onHover([])}
                onClick={() => (splittable ? toggle(e.key) : onSelect(allNodeIds))}
                title={splittable ? "Click to see the original per-machine split" : "Click to select on canvas"}
              >
                <IconSlot id={e.itemId} label={e.label} size={32} cornerBadge={e.count} />
                <span className="summary-row-label">{e.label}</span>
                {splittable && <span className={`summary-row-chevron${isOpen ? " open" : ""}`}>&rsaquo;</span>}
              </div>
              {isOpen && (
                <div className="summary-contributions">
                  {e.contributions.map((c) => (
                    <div
                      className="summary-contribution-row summary-row-clickable"
                      key={c.nodeId}
                      onMouseEnter={(ev) => {
                        ev.stopPropagation();
                        onHover([c.nodeId]);
                      }}
                      onMouseLeave={() => onHover([])}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelect([c.nodeId]);
                      }}
                      title="Click to select just this one on canvas"
                    >
                      <span className="summary-contribution-amount">{c.amount}</span>
                      <span className="summary-contribution-machines">&rarr; {describeMachines(c.machines)}</span>
                    </div>
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
          <div
            className="summary-row summary-row-clickable"
            key={e.nodeId}
            onMouseEnter={() => onHover([e.nodeId])}
            onMouseLeave={() => onHover([])}
            onClick={() => onSelect([e.nodeId])}
            title="Click to select on canvas"
          >
            <IconSlot id={e.itemId} label={e.label} size={32} cornerBadge={e.amount} />
            <span className="summary-row-label">{e.label}</span>
            <span className="summary-row-time">{formatDuration(e.ticks)}</span>
          </div>
        ))
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
          <div
            className="summary-row summary-row-clickable"
            key={e.key}
            onMouseEnter={() => onHover(e.nodeIds)}
            onMouseLeave={() => onHover([])}
            onClick={() => onSelect(e.nodeIds)}
            title="Click to select all on canvas"
          >
            <IconSlot
              id={resolveMachineIconId(icons, e.machineId, e.tier)}
              label={e.label}
              size={32}
              topBadge={e.tier}
              cornerBadge={e.count}
            />
            <span className="summary-row-label">{e.label}</span>
          </div>
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

  // Don't leave a stale highlight ring on canvas if the drawer closes some other way (Escape,
  // overlay click, re-clicking the toggle button) while a row happens to be hovered.
  useEffect(() => {
    if (!open) setHighlightedNodes([]);
  }, [open, setHighlightedNodes]);

  function handleSelect(nodeIds: string[]) {
    setHighlightedNodes([]);
    selectNodes(nodeIds);
    requestFocus(nodeIds);
    onClose();
  }

  return (
    <>
      {open && <div className="summary-panel-overlay" onClick={onClose} />}
      <aside className={`summary-panel${open ? " open" : ""}`}>
        <div className="summary-panel-header">
          <span>Chain summary</span>
          <button type="button" className="summary-panel-close" title="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="summary-panel-body">
          <FinalOutputSection entries={finalOutputTimes} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <ItemSection title="Inputs" entries={summary.inputs} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <ItemSection title="Catalysts" entries={summary.catalysts} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <MachineSection entries={summary.machines} icons={icons} onHover={setHighlightedNodes} onSelect={handleSelect} />
          <ItemSection title="Outputs" entries={summary.outputs} onHover={setHighlightedNodes} onSelect={handleSelect} />
        </div>
      </aside>
    </>
  );
}
