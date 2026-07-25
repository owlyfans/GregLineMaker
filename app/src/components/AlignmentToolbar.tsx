import { AlignmentButtons } from "./AlignmentButtons";

interface AlignmentToolbarProps {
  onAlignLeft: () => void;
  onAlignHCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignVCenter: () => void;
  onAlignBottom: () => void;
  onSpaceOutHorizontal: () => void;
  onSpaceOutVertical: () => void;
}

/** Its own standalone pill for the align/distribute buttons - used when a multi-node selection's
 * connecting edge also got auto-selected (react-flow selects an edge automatically once both its
 * endpoints are marquee-selected), so EdgeColorToolbar and this render side by side (see ChainView)
 * instead of the edge color picker replacing align entirely. The common case (nodes selected, no
 * edge caught up in it) still shows these same buttons combined into SelectionToolbar's one pill,
 * not this separate one. */
export function AlignmentToolbar(props: AlignmentToolbarProps) {
  return (
    <div className="floating-toolbar">
      <AlignmentButtons {...props} />
    </div>
  );
}
