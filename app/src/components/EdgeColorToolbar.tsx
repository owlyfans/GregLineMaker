import { Tooltip } from "./Tooltip";

interface EdgeColorToolbarProps {
  count: number;
  colors: string[];
  onPick: (color: string) => void;
}

/** Floating bar in the same bottom-center spot as SelectionToolbar/PrimaryToolbar - shown instead
 * of either whenever 1+ connections are selected (see ChainView), so all three never compete for
 * the same space. First swatch is the same gray a normal edge already starts as ("reset"). */
export function EdgeColorToolbar({ count, colors, onPick }: EdgeColorToolbarProps) {
  return (
    <div className="floating-toolbar">
      <span className="floating-toolbar-count">
        {count} connection{count === 1 ? "" : "s"} selected
      </span>
      <div className="floating-toolbar-divider" />
      {colors.map((c, i) => (
        <Tooltip key={c} label={i === 0 ? "Default" : c}>
          <button
            type="button"
            className="floating-toolbar-swatch"
            style={{ backgroundColor: c }}
            onClick={() => onPick(c)}
          />
        </Tooltip>
      ))}
    </div>
  );
}
