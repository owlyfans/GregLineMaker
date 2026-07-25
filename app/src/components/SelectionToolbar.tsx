interface NodeColorChoice {
  swatch: string;
  background: string;
  border: string;
}

interface SelectionToolbarProps {
  count: number;
  colors: NodeColorChoice[];
  onRecolor: (choice: NodeColorChoice) => void;
  onAlignLeft: () => void;
  onAlignHCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignVCenter: () => void;
  onAlignBottom: () => void;
  onSpaceOutHorizontal: () => void;
  onSpaceOutVertical: () => void;
}

/** Floating bar, always visible (no right-click needed) whenever 1+ nodes are selected - mirrors
 * Figma's selection toolbar: icon buttons for operations that don't belong in the single-node
 * right-click menu. Recolor swatches always show (even for one node); the align/distribute group
 * only makes sense across a group, so it's hidden until there are 2+. Button order after that
 * mirrors Figma's own toolbar: horizontal align, vertical align, then distribute. */
export function SelectionToolbar({
  count,
  colors,
  onRecolor,
  onAlignLeft,
  onAlignHCenter,
  onAlignRight,
  onAlignTop,
  onAlignVCenter,
  onAlignBottom,
  onSpaceOutHorizontal,
  onSpaceOutVertical,
}: SelectionToolbarProps) {
  return (
    <div className="floating-toolbar">
      <span className="floating-toolbar-count">{count} selected</span>
      <div className="floating-toolbar-divider" />
      {colors.map((c, i) => (
        <button
          key={c.background}
          type="button"
          className="floating-toolbar-swatch"
          style={{ backgroundColor: c.swatch }}
          title={i === 0 ? "Default" : c.background}
          onClick={() => onRecolor(c)}
        />
      ))}
      {count > 1 && (
        <>
          <div className="floating-toolbar-divider" />
          <button type="button" className="floating-toolbar-btn" title="Align left" onClick={onAlignLeft}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="1" x2="3" y2="15" stroke="currentColor" strokeWidth="1.5" />
              <rect x="5" y="2" width="9" height="3" fill="currentColor" />
              <rect x="5" y="6.5" width="5" height="3" fill="currentColor" />
              <rect x="5" y="11" width="7" height="3" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="floating-toolbar-btn" title="Align horizontal centers" onClick={onAlignHCenter}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3.5" y="2" width="9" height="3" fill="currentColor" />
              <rect x="5.5" y="6.5" width="5" height="3" fill="currentColor" />
              <rect x="4.5" y="11" width="7" height="3" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="floating-toolbar-btn" title="Align right" onClick={onAlignRight}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="13" y1="1" x2="13" y2="15" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="2" width="9" height="3" fill="currentColor" />
              <rect x="6" y="6.5" width="5" height="3" fill="currentColor" />
              <rect x="4" y="11" width="7" height="3" fill="currentColor" />
            </svg>
          </button>
          <div className="floating-toolbar-divider" />
          <button type="button" className="floating-toolbar-btn" title="Align top" onClick={onAlignTop}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="5" width="3" height="9" fill="currentColor" />
              <rect x="6.5" y="5" width="3" height="5" fill="currentColor" />
              <rect x="11" y="5" width="3" height="7" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="floating-toolbar-btn" title="Align vertical centers" onClick={onAlignVCenter}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="3.5" width="3" height="9" fill="currentColor" />
              <rect x="6.5" y="5.5" width="3" height="5" fill="currentColor" />
              <rect x="11" y="4.5" width="3" height="7" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="floating-toolbar-btn" title="Align bottom" onClick={onAlignBottom}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="1" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="2" width="3" height="9" fill="currentColor" />
              <rect x="6.5" y="6" width="3" height="5" fill="currentColor" />
              <rect x="11" y="4" width="3" height="7" fill="currentColor" />
            </svg>
          </button>
          <div className="floating-toolbar-divider" />
          <button type="button" className="floating-toolbar-btn" title="Space out horizontally" onClick={onSpaceOutHorizontal}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="3" height="10" fill="currentColor" />
              <rect x="6.5" y="3" width="3" height="10" fill="currentColor" />
              <rect x="12" y="3" width="3" height="10" fill="currentColor" />
            </svg>
          </button>
          <button type="button" className="floating-toolbar-btn" title="Space out vertically" onClick={onSpaceOutVertical}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="1" width="10" height="3" fill="currentColor" />
              <rect x="3" y="6.5" width="10" height="3" fill="currentColor" />
              <rect x="3" y="12" width="10" height="3" fill="currentColor" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
