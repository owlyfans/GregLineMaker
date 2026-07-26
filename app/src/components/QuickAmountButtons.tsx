const DEFAULT_QUICK_AMOUNTS = [1, 4, 8, 16, 32, 64, 128, 256];

interface QuickAmountButtonsProps {
  onPick: (value: number) => void;
  /** Defaults to a plain item-count ladder (1-256) - AddNodeModal's Fluid tab passes its own list
   * instead (mB-scale amounts computed from real recipe data, not item counts). */
  amounts?: number[];
}

export function QuickAmountButtons({ onPick, amounts = DEFAULT_QUICK_AMOUNTS }: QuickAmountButtonsProps) {
  return (
    <div className="quick-amount-row">
      {amounts.map((n) => (
        <button
          key={n}
          type="button"
          className="quick-amount-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
