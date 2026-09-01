import React from 'react';

interface PanelResizeHandleProps {
  side: 'left' | 'right';
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  label: string;
}

export const PanelResizeHandle: React.FC<PanelResizeHandleProps> = ({ side, onPointerDown, label }) => (
  <button
    type="button"
    className={`studio-panel-resize studio-panel-resize--${side}`}
    aria-label={label}
    role="separator"
    aria-orientation="vertical"
    tabIndex={0}
    title="Drag to resize this panel"
    onPointerDown={onPointerDown}
  >
    <span aria-hidden="true" />
  </button>
);
