import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";

interface TooltipProps {
  /** Omit (or pass undefined/empty) to render `children` completely unwrapped - lets call sites
   * keep a conditional label (e.g. `label={isFavorite ? "Unfavorite" : "Favorite"}`) without ever
   * needing an empty tooltip bubble. */
  label?: string;
  /** Default "top" - flip()/shift() below reposition it automatically (to "bottom", and/or nudged
   * left/right) whenever the reference element is close enough to a viewport edge that "top" would
   * clip or run off-screen, so callers don't need to hand-pick a side per element. */
  placement?: Placement;
  children: ReactElement;
}

/** App-wide replacement for native `title="..."` tooltips (which browsers render as a slow,
 * unstyleable OS popup that also has no collision awareness - it'll happily overflow the left/right
 * edge of the screen for anything near either side). Wraps a single child element, attaches
 * hover/focus handlers to it via floating-ui, and portals a styled bubble positioned with
 * flip()/shift() middleware so it repositions itself to stay fully on-screen near any edge instead
 * of getting cut off. */
export function Tooltip({ label, placement = "top", children }: TooltipProps) {
  // useFloating doesn't manage open/closed state on its own - without an explicit open/onOpenChange
  // pair, useHover's calls to open it have nowhere to go, and context.open stays false forever
  // (exactly the "tooltips never show up" bug this fixes).
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });

  const hover = useHover(context, { delay: { open: 400, close: 0 }, move: false });
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, role]);

  if (!label || !isValidElement(children)) return children;

  const child = children as ReactElement<Record<string, unknown>>;
  return (
    <>
      {cloneElement(
        child,
        getReferenceProps({
          ref: refs.setReference,
          ...child.props,
        }),
      )}
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} className="app-tooltip" {...getFloatingProps()}>
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
