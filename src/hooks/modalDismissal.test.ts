import assert from 'node:assert/strict';
import test from 'node:test';
import { dismissModalFromBackdrop, findModalBackdropRoot, getTopmostModalHandler } from './modalDismissal';

interface TestElement {
  parentElement: TestElement | null;
  classList: { contains(className: string): boolean };
}

function element(classes: string[], parentElement: TestElement | null = null): TestElement {
  return {
    parentElement,
    classList: { contains: (className: string) => classes.includes(className) },
  };
}

function asEventTarget(elementToCast: TestElement): EventTarget {
  return elementToCast as unknown as EventTarget;
}

test('only direct backdrop targets are recognized, not clicks inside modal content', () => {
  const backdrop = element(['fixed', 'inset-0']);
  const panel = element(['relative', 'z-10'], backdrop);
  const input = element(['field'], panel);

  assert.equal(findModalBackdropRoot(asEventTarget(backdrop)), backdrop);
  assert.equal(findModalBackdropRoot(asEventTarget(input)), null);
});

test('an explicit full-screen backdrop layer is recognized without treating panel controls as backdrop clicks', () => {
  const backdrop = element(['fixed', 'inset-0']);
  const backdropLayer = element(['absolute', 'inset-0'], backdrop);
  const panel = element(['relative'], backdrop);
  const actionButton = element(['button'], panel);

  assert.equal(findModalBackdropRoot(asEventTarget(backdropLayer)), backdrop);
  assert.equal(findModalBackdropRoot(asEventTarget(actionButton)), null);
});

test('a direct backdrop pointer-down invokes the registered request-close callback', () => {
  const backdrop = element(['fixed', 'inset-0']);
  let prevented = false;
  let propagationStopped = false;
  let closeCalls = 0;

  const dismissed = dismissModalFromBackdrop({
    target: asEventTarget(backdrop),
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { propagationStopped = true; },
  }, () => { closeCalls++; });

  assert.equal(dismissed, true);
  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(closeCalls, 1);
});

test('a pointer-down inside modal content does not invoke the request-close callback', () => {
  const backdrop = element(['fixed', 'inset-0']);
  const panel = element(['relative'], backdrop);
  const input = element(['field'], panel);
  let closeCalls = 0;
  let prevented = false;

  const dismissed = dismissModalFromBackdrop({
    target: asEventTarget(input),
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => {},
  }, () => { closeCalls++; });

  assert.equal(dismissed, false);
  assert.equal(prevented, false);
  assert.equal(closeCalls, 0);
});

test('nested modal dismissal uses the same priority and registration order as Escape', () => {
  const parent = { id: 'parent', priority: 50, order: 1 };
  const confirmation = { id: 'confirmation', priority: 60, order: 2 };
  const recentPeer = { id: 'recent peer', priority: 60, order: 3 };

  assert.equal(getTopmostModalHandler([parent, confirmation]), confirmation);
  assert.equal(getTopmostModalHandler([parent, confirmation, recentPeer]), recentPeer);
});
