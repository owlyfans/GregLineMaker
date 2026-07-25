const QUICK_AMOUNTS = [1, 4, 8, 16, 32, 64, 128, 256];

export function QuickAmountButtons({ onPick }: { onPick: (value: number) => void }) {
  return (
    <div className="quick-amount-row">
      {QUICK_AMOUNTS.map((n) => (
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
