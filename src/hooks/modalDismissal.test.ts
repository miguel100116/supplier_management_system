import assert from 'node:assert/strict';
import test from 'node:test';
import { findModalBackdropRoot, isBackdropDismissalAllowed } from './modalDismissal';

interface TestElement {
  parentElement: TestElement | null;
  tagName: string;
  classList: { contains(className: string): boolean };
  getAttribute(name: string): string | null;
  querySelector(selector: string): unknown;
}

function element(classes: string[], parentElement: TestElement | null = null, attributes: Record<string, string> = {}, tagName = 'DIV'): TestElement {
  return {
    parentElement,
    tagName,
    classList: { contains: (className: string) => classes.includes(className) },
    getAttribute: (name: string) => attributes[name] ?? null,
    querySelector: (selector: string) => selector.includes('alertdialog') && attributes.confirmation === 'critical' ? {} : null,
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

test('an explicit full-screen backdrop button is recognized without treating panel buttons as backdrop clicks', () => {
  const backdrop = element(['fixed', 'inset-0']);
  const backdropButton = element(['absolute', 'inset-0'], backdrop, {}, 'BUTTON');
  const panel = element(['relative'], backdrop);
  const actionButton = element(['button'], panel);

  assert.equal(findModalBackdropRoot(asEventTarget(backdropButton)), backdrop);
  assert.equal(findModalBackdropRoot(asEventTarget(actionButton)), null);
});

test('critical confirmation dialogs can opt out of backdrop dismissal', () => {
  assert.equal(isBackdropDismissalAllowed(element(['fixed', 'inset-0'])), true);
  assert.equal(isBackdropDismissalAllowed(element(['fixed', 'inset-0'], null, { 'data-modal-dismiss': 'none' })), false);
  assert.equal(isBackdropDismissalAllowed(element(['fixed', 'inset-0'], null, { role: 'alertdialog' })), false);
  assert.equal(isBackdropDismissalAllowed(element(['fixed', 'inset-0'], null, { confirmation: 'critical' })), false);
});
