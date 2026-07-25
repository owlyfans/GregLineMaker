import { Tooltip } from "./Tooltip";

interface AlignmentButtonsProps {
  onAlignLeft: () => void;
  onAlignHCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignVCenter: () => void;
  onAlignBottom: () => void;
  onSpaceOutHorizontal: () => void;
  onSpaceOutVertical: () => void;
}

/** The align/distribute icon buttons shared by SelectionToolbar (combined with node recolor
 * swatches in one pill, the common case) and AlignmentToolbar (its own standalone pill, for when a
 * multi-select's connecting edge also got auto-selected - see ChainView, which then needs edge
 * recolor and align to show side by side instead of one replacing the other). No wrapping div of
 * its own so either caller controls the surrounding pill/dividers. */
export function AlignmentButtons({
  onAlignLeft,
  onAlignHCenter,
  onAlignRight,
  onAlignTop,
  onAlignVCenter,
  onAlignBottom,
  onSpaceOutHorizontal,
  onSpaceOutVertical,
}: AlignmentButtonsProps) {
  return (
    <>
      <Tooltip label="Align left">
        <button type="button" className="floating-toolbar-btn" onClick={onAlignLeft}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="3" y1="1" x2="3" y2="15" stroke="currentColor" strokeWidth="1.5" />
            <rect x="5" y="2" width="9" height="3" fill="currentColor" />
            <rect x="5" y="6.5" width="5" height="3" fill="currentColor" />
            <rect x="5" y="11" width="7" height="3" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Align horizontal centers">
        <button type="button" className="floating-toolbar-btn" onClick={onAlignHCenter}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3.5" y="2" width="9" height="3" fill="currentColor" />
            <rect x="5.5" y="6.5" width="5" height="3" fill="currentColor" />
            <rect x="4.5" y="11" width="7" height="3" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Align right">
        <button type="button" className="floating-toolbar-btn" onClick={onAlignRight}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="13" y1="1" x2="13" y2="15" stroke="currentColor" strokeWidth="1.5" />
            <rect x="2" y="2" width="9" height="3" fill="currentColor" />
            <rect x="6" y="6.5" width="5" height="3" fill="currentColor" />
            <rect x="4" y="11" width="7" height="3" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <div className="floating-toolbar-divider" />
      <Tooltip label="Align top">
        <button type="button" className="floating-toolbar-btn" onClick={onAlignTop}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" />
            <rect x="2" y="5" width="3" height="9" fill="currentColor" />
            <rect x="6.5" y="5" width="3" height="5" fill="currentColor" />
            <rect x="11" y="5" width="3" height="7" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Align vertical centers">
        <button type="button" className="floating-toolbar-btn" onClick={onAlignVCenter}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
            <rect x="2" y="3.5" width="3" height="9" fill="currentColor" />
            <rect x="6.5" y="5.5" width="3" height="5" fill="currentColor" />
            <rect x="11" y="4.5" width="3" height="7" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Align bottom">
        <button type="button" className="floating-toolbar-btn" onClick={onAlignBottom}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="1" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.5" />
            <rect x="2" y="2" width="3" height="9" fill="currentColor" />
            <rect x="6.5" y="6" width="3" height="5" fill="currentColor" />
            <rect x="11" y="4" width="3" height="7" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <div className="floating-toolbar-divider" />
      <Tooltip label="Space out horizontally">
        <button type="button" className="floating-toolbar-btn" onClick={onSpaceOutHorizontal}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="3" height="10" fill="currentColor" />
            <rect x="6.5" y="3" width="3" height="10" fill="currentColor" />
            <rect x="12" y="3" width="3" height="10" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Space out vertically">
        <button type="button" className="floating-toolbar-btn" onClick={onSpaceOutVertical}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="1" width="10" height="3" fill="currentColor" />
            <rect x="3" y="6.5" width="10" height="3" fill="currentColor" />
            <rect x="3" y="12" width="10" height="3" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
    </>
  );
}
