import { useEffect, useRef } from 'react';
import { acquireModalScrollLock } from './useModalScrollLock';
import { findModalBackdropRoot, isBackdropDismissalAllowed } from './modalDismissal';

interface ActiveEscapeHandler {
  id: symbol;
  callback: () => void;
  order: number;
  priority: number;
  isModal: boolean;
  dismissOnBackdrop: boolean;
}

const activeHandlers = new Map<symbol, ActiveEscapeHandler>();
let nextOrder = 0;
let listenerAttached = false;

function topmostHandler(modalsOnly = false) {
  return [...activeHandlers.values()]
    .filter((handler) => !modalsOnly || handler.isModal)
    .sort((a, b) => b.priority - a.priority || b.order - a.order)[0];
}

function handleModalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const topmost = topmostHandler();
  if (!topmost) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  topmost.callback();
}

function handleModalBackdropClick(event: MouseEvent) {
  const backdrop = findModalBackdropRoot(event.target);
  if (!backdrop) return;
  const topmost = topmostHandler(true);
  if (!topmost) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!topmost.dismissOnBackdrop || !isBackdropDismissalAllowed(backdrop)) return;
  topmost.callback();
}

function registerHandler(handler: ActiveEscapeHandler, lockScroll: boolean) {
  const releaseScroll = lockScroll ? acquireModalScrollLock() : undefined;
  const previouslyFocused = lockScroll ? document.activeElement as HTMLElement | null : null;
  activeHandlers.set(handler.id, handler);
  if (!listenerAttached) {
    window.addEventListener('keydown', handleModalEscape, true);
    window.addEventListener('click', handleModalBackdropClick, true);
    listenerAttached = true;
  }

  return () => {
    activeHandlers.delete(handler.id);
    releaseScroll?.();
    if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    if (activeHandlers.size === 0 && listenerAttached) {
      window.removeEventListener('keydown', handleModalEscape, true);
      window.removeEventListener('click', handleModalBackdropClick, true);
      listenerAttached = false;
    }
  };
}

/** Register an open modal's Escape action, backdrop dismissal, focus restoration, and scroll lock. Pass dismissOnBackdrop=false for critical or destructive confirmations. */
export function useModalEscape(
  isOpen: boolean,
  onEscape: () => void,
  priority = 0,
  lockScroll = true,
  dismissOnBackdrop = true,
) {
  const id = useRef(Symbol('modal-escape-handler'));
  const callback = useRef(onEscape);
  callback.current = onEscape;

  useEffect(() => {
    if (!isOpen) return;
    return registerHandler({
      id: id.current,
      callback: () => callback.current(),
      order: ++nextOrder,
      priority,
      isModal: lockScroll,
      dismissOnBackdrop,
    }, lockScroll);
  }, [isOpen, priority, lockScroll, dismissOnBackdrop]);
}
