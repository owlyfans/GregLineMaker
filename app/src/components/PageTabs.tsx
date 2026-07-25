import { useEffect, useRef, useState } from "react";
import type { PageMeta } from "../state/pagesStore";

interface PageTabsProps {
  pages: PageMeta[];
  activePageId: string;
  onSwitch: (id: string) => void;
  onCreate: () => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/** Browser-tab-style strip, top-center, for switching between saved chains ("pages"). Each page is
 * its own independent nodes/edges graph in chainStore - see state/pagesStore.ts for the actual
 * switch/save mechanics; this component is purely presentational plumbing on top of it. */
export function PageTabs({ pages, activePageId, onSwitch, onCreate, onRename, onDelete }: PageTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  function startEditing(page: PageMeta) {
    setEditingId(page.id);
    setEditingValue(page.name);
  }

  function commitEditing() {
    if (editingId) onRename(editingId, editingValue);
    setEditingId(null);
  }

  function handleCreate() {
    const id = onCreate();
    // New pages start with the default "Page N" name - drop straight into rename so the user can
    // name it without a second click.
    setEditingId(id);
    setEditingValue("");
  }

  return (
    <div className="page-tabs">
      {pages.map((page) => (
        <div
          key={page.id}
          className={`page-tab${page.id === activePageId ? " active" : ""}`}
          onClick={() => onSwitch(page.id)}
          onDoubleClick={() => startEditing(page)}
        >
          {editingId === page.id ? (
            <input
              ref={inputRef}
              className="page-tab-input"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitEditing}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEditing();
                else if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
            />
          ) : (
            <span className="page-tab-label">{page.name}</span>
          )}
          {pages.length > 1 && editingId !== page.id && (
            <button
              type="button"
              className="page-tab-close"
              title={`Delete "${page.name}"`}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete page "${page.name}"? This can't be undone.`)) onDelete(page.id);
              }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button type="button" className="page-tab-add" title="New page" onClick={handleCreate}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </div>
  );
}
