import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export function useResizableWidth(initial: number, min: number, max: number, invert = false) {
  const [width, setWidth] = useState(initial);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
    document.body.classList.add('studio-is-resizing');
  }, [width]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const delta = event.clientX - dragRef.current.startX;
      const next = dragRef.current.startWidth + (invert ? -delta : delta);
      setWidth(Math.min(max, Math.max(min, next)));
    };
    const stop = () => {
      dragRef.current = null;
      document.body.classList.remove('studio-is-resizing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      dragRef.current = null;
      document.body.classList.remove('studio-is-resizing');
    };
  }, [invert, max, min]);

  return { width, startResize };
}
