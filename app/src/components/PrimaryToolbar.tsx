import { Tooltip } from "./Tooltip";

interface PrimaryToolbarProps {
  dbReady: boolean;
  loading: boolean;
  error: string | null;
  /** 0-100 while recipes.json streams down (see useRecipeDatabase), null if not computable. */
  progress: number | null;
  iconsLoading: boolean;
  iconsError: string | null;
  canSave: boolean;
  shareStatus: string | null;
  onAddNode: () => void;
  onSave: () => void;
  onLoad: () => void;
  onShare: () => void;
  onOpenSettings: () => void;
  onClear: () => void;
}

/** Floating bar in the same bottom-center spot as SelectionToolbar - shown instead of it whenever
 * 0 or 1 nodes are selected (see App.tsx), so the two never compete for the same space. Add/Save/
 * Load/Share/Settings are icon buttons (frequent, spatially-obvious actions); Clear canvas stays a
 * labelled text button since it's destructive and infrequent - an icon alone would be too easy to
 * misfire. */
export function PrimaryToolbar({
  dbReady,
  loading,
  error,
  progress,
  iconsLoading,
  iconsError,
  canSave,
  shareStatus,
  onAddNode,
  onSave,
  onLoad,
  onShare,
  onOpenSettings,
  onClear,
}: PrimaryToolbarProps) {
  return (
    <div className="floating-toolbar">
      {loading && (
        <span className="floating-toolbar-status">
          Loading recipe database{progress !== null ? ` (${progress}%)` : "..."}
        </span>
      )}
      {error && <span className="floating-toolbar-status">Failed to load recipes.json: {error}</span>}
      {!loading && iconsLoading && <span className="floating-toolbar-status">Loading icons...</span>}
      {iconsError && <span className="floating-toolbar-status">Failed to load icons.json: {iconsError}</span>}
      {shareStatus && <span className="floating-toolbar-status">{shareStatus}</span>}
      <Tooltip label="Add node">
        <button type="button" className="floating-toolbar-btn primary" disabled={!dbReady} onClick={onAddNode}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2" />
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </Tooltip>
      <div className="floating-toolbar-divider" />
      <Tooltip label="Save...">
        <button type="button" className="floating-toolbar-btn" disabled={!canSave} onClick={onSave}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="1" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" />
            <polyline points="4,6 8,10 12,6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="2,12 2,14 14,14 14,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Load...">
        <button type="button" className="floating-toolbar-btn" onClick={onLoad}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="10" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5" />
            <polyline points="4,5 8,1 12,5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="2,12 2,14 14,14 14,12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Copy share link">
        <button type="button" className="floating-toolbar-btn" disabled={!canSave} onClick={onShare}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="12" cy="3.5" r="2" fill="currentColor" />
            <circle cx="4" cy="8" r="2" fill="currentColor" />
            <circle cx="12" cy="12.5" r="2" fill="currentColor" />
            <line x1="5.7" y1="7" x2="10.3" y2="4.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.7" y1="9" x2="10.3" y2="11.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Settings">
        <button type="button" className="floating-toolbar-btn" onClick={onOpenSettings}>
          {/* A gear, not the old icon's sun/compass look - the previous version's 8 rays started
              well clear of the ring instead of sitting flush against it, so it read as radiating
              spokes rather than teeth. These are short, thick, round-capped nubs planted right on
              the ring's own edge, the way an actual cog's teeth are fused to its body. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 5V3.4M8 11v1.6M5 8H3.4M11 8h1.6M10.12 5.88l1.13-1.13M5.88 5.88 4.75 4.75M5.88 10.12l-1.13 1.13M10.12 10.12l1.13 1.13"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </Tooltip>
      <div className="floating-toolbar-divider" />
      <button type="button" className="floating-toolbar-text-btn" disabled={!canSave} onClick={onClear}>
        Clear canvas
      </button>
    </div>
  );
}
