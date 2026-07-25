import { useState } from "react";
import type { NoteNodeData } from "../../types/chain";
import { useChainStore } from "../../state/chainStore";
import { NodeHandles } from "./NodeHandles";

export function NoteNode({ id, data, selected }: { id: string; data: NoteNodeData; selected?: boolean }) {
  const updateNodeData = useChainStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.text);

  function startEditing() {
    setValue(data.text);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (value !== data.text) updateNodeData(id, { text: value });
  }

  return (
    <div
      className={`flow-node note-node${selected ? " node-selected" : ""}`}
      style={data.color ? { backgroundColor: data.color, borderColor: data.borderColor } : undefined}
    >
      <NodeHandles />
      {editing ? (
        <textarea
          className="note-node-textarea nodrag"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          rows={4}
          autoFocus
        />
      ) : (
        <div className="note-node-text" onDoubleClick={startEditing} title="Double-click to edit">
          {data.text || "(empty note - double-click to edit)"}
        </div>
      )}
    </div>
  );
}
