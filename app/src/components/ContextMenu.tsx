export interface ContextMenuItem {
  label: string;
  /** Omit when this item is a submenu parent (see `children`) - it never fires a click itself. */
  onClick?: () => void;
  danger?: boolean;
  /** Nests these under this item as a hover flyout instead of rendering `label` as a clickable
   * action - used to group related toggles (see the "Mark as" group in ChainView) so the flat menu
   * doesn't grow one row per annotation. */
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <div className="context-menu-overlay" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <ul className="context-menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
        {items.map((item, i) => (
          <li
            key={i}
            className={`context-menu-item${item.danger ? " danger" : ""}${item.children ? " has-submenu" : ""}`}
            onClick={() => {
              if (item.children) return;
              item.onClick?.();
              onClose();
            }}
          >
            {item.label}
            {item.children && (
              <ul className="context-menu-submenu">
                {item.children.map((child, j) => (
                  <li
                    key={j}
                    className={`context-menu-item${child.danger ? " danger" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      child.onClick?.();
                      onClose();
                    }}
                  >
                    {child.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
