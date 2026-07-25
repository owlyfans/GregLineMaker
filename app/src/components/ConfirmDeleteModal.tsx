import { useState } from "react";
import { Modal } from "./Modal";

interface ConfirmDeleteModalProps {
  /** How many nodes were directly selected/targeted for deletion (not counting ancestors/descendants). */
  primaryCount: number;
  upstreamCount: number;
  downstreamCount: number;
  onClose: () => void;
  onConfirm: (options: { includeUpstream: boolean; includeDownstream: boolean }) => void;
}

export function ConfirmDeleteModal({
  primaryCount,
  upstreamCount,
  downstreamCount,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [includeUpstream, setIncludeUpstream] = useState(false);
  const [includeDownstream, setIncludeDownstream] = useState(false);

  const total = primaryCount + (includeUpstream ? upstreamCount : 0) + (includeDownstream ? downstreamCount : 0);

  return (
    <Modal title="Delete node(s)?" onClose={onClose} width={440}>
      <p className="modal-body-text">
        Deleting {primaryCount} node{primaryCount === 1 ? "" : "s"}.
      </p>
      <div className="add-node-form">
        {upstreamCount > 0 && (
          <label className="confirm-delete-option">
            <input type="checkbox" checked={includeUpstream} onChange={(e) => setIncludeUpstream(e.target.checked)} />
            Also delete {upstreamCount} node{upstreamCount === 1 ? "" : "s"} feeding into this (backward/upstream)
          </label>
        )}
        {downstreamCount > 0 && (
          <label className="confirm-delete-option">
            <input
              type="checkbox"
              checked={includeDownstream}
              onChange={(e) => setIncludeDownstream(e.target.checked)}
            />
            Also delete {downstreamCount} node{downstreamCount === 1 ? "" : "s"} this feeds into (forward/downstream)
          </label>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-danger"
          onClick={() => onConfirm({ includeUpstream, includeDownstream })}
        >
          Delete {total} node{total === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}
