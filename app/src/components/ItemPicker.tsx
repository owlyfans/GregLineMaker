import { useMemo, useState } from "react";
import { fuzzyFilter } from "../lib/fuzzy";
import { IconSlot } from "./IconSlot";

export interface PickerOption {
  id: string;
  label: string;
}

interface ItemPickerProps {
  label: string;
  placeholder?: string;
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  clearable?: boolean;
}

/** Minimal searchable dropdown - no extra dependency, filters options as you type. */
export function ItemPicker({ label, placeholder, options, value, onChange, clearable }: ItemPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, 50);
    return fuzzyFilter(query, options, (o) => o.label).slice(0, 50);
  }, [options, query]);

  return (
    <div className="item-picker">
      <label className="item-picker-label">{label}</label>
      <div className="item-picker-input-row">
        <input
          type="text"
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {clearable && selected && (
          <button
            type="button"
            className="item-picker-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(null)}
          >
            &times;
          </button>
        )}
      </div>
      {open && (
        <ul className="item-picker-menu">
          {filtered.length === 0 && <li className="item-picker-empty">No matches</li>}
          {filtered.map((o) => (
            <li
              key={o.id}
              className="item-picker-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.id);
                setOpen(false);
              }}
            >
              <IconSlot id={o.id} label={o.label} size={30} />
              <span className="item-picker-option-label">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
