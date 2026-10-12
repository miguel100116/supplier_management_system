import { useEffect, useRef } from 'react';
import { acquireModalScrollLock } from './useModalScrollLock';
import { dismissModalFromBackdrop, getTopmostModalHandler } from './modalDismissal';

interface ActiveEscapeHandler {
  id: symbol;
  callback: () => void;
  order: number;
  priority: number;
}

const activeHandlers = new Map<symbol, ActiveEscapeHandler>();
let nextOrder = 0;
let listenerAttached = false;

function topmostHandler() {
  return getTopmostModalHandler(activeHandlers.values());
}

function handleModalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const topmost = topmostHandler();
  if (!topmost) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  topmost.callback();
}

function handleModalBackdropPointerDown(event: PointerEvent) {
  const topmost = topmostHandler();
  if (!topmost) return;
  dismissModalFromBackdrop(event, topmost.callback);
}

function registerHandler(handler: ActiveEscapeHandler, lockScroll: boolean) {
  const releaseScroll = lockScroll ? acquireModalScrollLock() : undefined;
  const previouslyFocused = lockScroll ? document.activeElement as HTMLElement | null : null;
  activeHandlers.set(handler.id, handler);
  if (!listenerAttached) {
    window.addEventListener('keydown', handleModalEscape, true);
    window.addEventListener('pointerdown', handleModalBackdropPointerDown, true);
    listenerAttached = true;
  }

  return () => {
    activeHandlers.delete(handler.id);
    releaseScroll?.();
    if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    if (activeHandlers.size === 0 && listenerAttached) {
      window.removeEventListener('keydown', handleModalEscape, true);
      window.removeEventListener('pointerdown', handleModalBackdropPointerDown, true);
      listenerAttached = false;
    }
  };
}

/** Register an open modal's request-close action for Escape and direct backdrop pointer-down, plus focus restoration and optional scroll lock. */
export function useModalEscape(
  isOpen: boolean,
  onRequestClose: () => void,
  priority = 0,
  lockScroll = true,
) {
  const id = useRef(Symbol('modal-escape-handler'));
  const callback = useRef(onRequestClose);
  callback.current = onRequestClose;

  useEffect(() => {
    if (!isOpen) return;
    return registerHandler({
      id: id.current,
      callback: () => callback.current(),
      order: ++nextOrder,
      priority,
    }, lockScroll);
  }, [isOpen, priority, lockScroll]);
}
