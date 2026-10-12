interface ModalElementLike {
  parentElement: ModalElementLike | null;
  classList: { contains(className: string): boolean };
}

interface BackdropPointerEvent {
  target: EventTarget | null;
  preventDefault: () => void;
  stopImmediatePropagation: () => void;
}

interface OrderedModalHandler {
  order: number;
  priority: number;
}

export function getTopmostModalHandler<T extends OrderedModalHandler>(handlers: Iterable<T>): T | undefined {
  return [...handlers].sort((a, b) => b.priority - a.priority || b.order - a.order)[0];
}

function isFullScreenBackdrop(element: ModalElementLike): boolean {
  return element.classList.contains('fixed') && element.classList.contains('inset-0');
}

function isBackdropLayer(target: ModalElementLike, root: ModalElementLike): boolean {
  return target.parentElement === root &&
    target.classList.contains('absolute') && target.classList.contains('inset-0');
}

/** Find only a direct pointer target on a full-screen overlay or its explicit backdrop layer. */
export function findModalBackdropRoot(target: EventTarget | null): ModalElementLike | null {
  if (!target || typeof target !== 'object' || !('classList' in target)) return null;
  const clicked = target as unknown as ModalElementLike;
  let element: ModalElementLike | null = clicked;

  while (element) {
    if (isFullScreenBackdrop(element)) {
      return clicked === element || isBackdropLayer(clicked, element) ? element : null;
    }
    element = element.parentElement;
  }

  return null;
}

/** Dismiss through the registered Escape callback only for a direct backdrop pointer target. */
export function dismissModalFromBackdrop(event: BackdropPointerEvent, onDismiss: () => void): boolean {
  if (!findModalBackdropRoot(event.target)) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  onDismiss();
  return true;
}
