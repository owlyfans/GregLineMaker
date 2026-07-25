interface PrimaryToolbarProps {
  dbReady: boolean;
  loading: boolean;
  error: string | null;
  canSave: boolean;
  shareStatus: string | null;
  onAddNode: () => void;
  onSave: () => void;
  onLoad: () => void;
  onShare: () => void;
  onClear: () => void;
}

/** Floating bar in the same bottom-center spot as SelectionToolbar - shown instead of it whenever
 * 0 or 1 nodes are selected (see App.tsx), so the two never compete for the same space. Add/Save/
 * Load/Share are icon buttons (frequent, spatially-obvious actions); Clear canvas stays a labelled
 * text button since it's destructive and infrequent - an icon alone would be too easy to misfire. */
export function PrimaryToolbar({
  dbReady,
  loading,
  error,
  canSave,
  shareStatus,
  onAddNode,
  onSave,
  onLoad,
  onShare,
  onClear,
}: PrimaryToolbarProps) {
  return (
    <div className="floating-toolbar">
      {loading && <span className="floating-toolbar-status">Loading recipe database...</span>}
      {error && <span className="floating-toolbar-status">Failed to load recipes.json: {error}</span>}
      {shareStatus && <span className="floating-toolbar-status">{shareStatus}</span>}
      <button type="button" className="floating-toolbar-btn primary" title="Add node" disabled={!dbReady} onClick={onAddNode}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <div className="floating-toolbar-divider" />
      <button type="button" className="floating-toolbar-btn" title="Save..." disabled={!canSave} onClick={onSave}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="1" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="4,6 8,10 12,6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="2,12 2,14 14,14 14,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" className="floating-toolbar-btn" title="Load..." onClick={onLoad}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="10" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="4,5 8,1 12,5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="2,12 2,14 14,14 14,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" className="floating-toolbar-btn" title="Copy share link" disabled={!canSave} onClick={onShare}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="12" cy="3.5" r="2" fill="currentColor" />
          <circle cx="4" cy="8" r="2" fill="currentColor" />
          <circle cx="12" cy="12.5" r="2" fill="currentColor" />
          <line x1="5.7" y1="7" x2="10.3" y2="4.5" stroke="currentColor" strokeWidth="1.3" />
          <line x1="5.7" y1="9" x2="10.3" y2="11.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <div className="floating-toolbar-divider" />
      <button type="button" className="floating-toolbar-text-btn" disabled={!canSave} onClick={onClear}>
        Clear canvas
      </button>
    </div>
  );
}
