interface ModalElementLike {
  parentElement: ModalElementLike | null;
  classList: { contains(className: string): boolean };
  tagName?: string;
  getAttribute?: (name: string) => string | null;
  querySelector?: (selectors: string) => unknown;
}

function isFullScreenBackdrop(element: ModalElementLike): boolean {
  return element.classList.contains('fixed') && element.classList.contains('inset-0');
}

function isBackdropButton(target: ModalElementLike, root: ModalElementLike): boolean {
  return target.parentElement === root && target.tagName === 'BUTTON' &&
    target.classList.contains('absolute') && target.classList.contains('inset-0');
}

/** Find only a direct click on a full-screen overlay or its explicit backdrop button. */
export function findModalBackdropRoot(target: EventTarget | null): ModalElementLike | null {
  if (!target || typeof target !== 'object' || !('classList' in target)) return null;
  const clicked = target as unknown as ModalElementLike;
  let element: ModalElementLike | null = clicked;

  while (element) {
    if (isFullScreenBackdrop(element)) {
      return clicked === element || isBackdropButton(clicked, element) ? element : null;
    }
    element = element.parentElement;
  }

  return null;
}

export function isBackdropDismissalAllowed(root: ModalElementLike): boolean {
  if (root.getAttribute?.('data-modal-dismiss') === 'none') return false;
  if (root.getAttribute?.('role') === 'alertdialog') return false;
  return !root.querySelector?.('[role="alertdialog"], [data-modal-dismiss="none"]');
}
