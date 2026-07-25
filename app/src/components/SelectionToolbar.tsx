import { AlignmentButtons } from "./AlignmentButtons";
import { Tooltip } from "./Tooltip";

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
        <Tooltip key={c.background} label={i === 0 ? "Default" : c.background}>
          <button
            type="button"
            className="floating-toolbar-swatch"
            style={{ backgroundColor: c.swatch }}
            onClick={() => onRecolor(c)}
          />
        </Tooltip>
      ))}
      {count > 1 && (
        <>
          <div className="floating-toolbar-divider" />
          <AlignmentButtons
            onAlignLeft={onAlignLeft}
            onAlignHCenter={onAlignHCenter}
            onAlignRight={onAlignRight}
            onAlignTop={onAlignTop}
            onAlignVCenter={onAlignVCenter}
            onAlignBottom={onAlignBottom}
            onSpaceOutHorizontal={onSpaceOutHorizontal}
            onSpaceOutVertical={onSpaceOutVertical}
          />
        </>
      )}
    </div>
  );
}
