import type { ReactNode } from "react";

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 640 }: ModalProps) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-panel"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
