import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { SendFormConfirmation } from '../features/evaluations/components/SendFormConfirmation';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { CategoriesManagerPage } from '../pages/CategoriesManagerPage';
import { DEFAULT_CATEGORIES } from '../data/questionCategories';
import { CreateSurveyPage } from '../pages/CreateSurveyPage';
import { dismissModalFromBackdrop, getTopmostModalHandler } from '../hooks/modalDismissal';

Object.assign(globalThis, { React });

// Exercise event callbacks without a DOM; shared modal lifecycle tests cover browser dismissal.
function renderHooks<P>(Component: (props: P) => ReactElement, props: P) {
  const cells: unknown[] = [];
  let cursor = 0;
  const effects: (() => unknown)[] = [];
  const internals = (React as unknown as { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } } }).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const dispatcher = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], (next: unknown) => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }];
    },
    useRef(initial: unknown) { const index = cursor++; if (!(index in cells)) cells[index] = { current: initial }; return cells[index]; },
    useCallback(callback: unknown) { return callback; },
    useId() { return `test-${cursor++}`; },
    useEffect(effect: () => unknown) { effects.push(effect); },
  };
  return {
    render() {
      cursor = 0;
      effects.length = 0;
      const previous = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try { return Component(props); }
      finally { internals.ReactCurrentDispatcher.current = previous; }
    },
    effects,
  };
}

function find(node: ReactNode, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> {
  const matches: ReactElement<any>[] = [];
  function visit(value: ReactNode) {
    React.Children.forEach(value, (child) => {
      if (!React.isValidElement<any>(child)) return;
      if (predicate(child)) matches.push(child);
      visit(child.props.children);
    });
  }
  visit(node);
  assert.ok(matches.length, 'Expected element was rendered');
  return matches[0];
}

function button(node: ReactNode, text: string) {
  return find(node, (element) => element.type === 'button' && element.props.children === text);
}

test('unsaved dialog only invokes the explicitly chosen action; saving is optional', async () => {
  const calls: string[] = [];
  const view = renderHooks(UnsavedChangesDialog, { onContinue: () => calls.push('continue'), onDiscard: () => calls.push('discard') });
  const tree = view.render();
  button(tree, 'Continue Editing').props.onClick();
  assert.deepEqual(calls, ['continue']);
  button(tree, 'Discard Changes').props.onClick();
  assert.deepEqual(calls, ['continue', 'discard']);
  assert.throws(() => button(tree, 'Save Changes'));
});

test('invalid and failed saves keep the dialog actionable and show an error', async () => {
  for (const save of [async () => false, async () => { throw new Error('Storage unavailable'); }]) {
    const view = renderHooks(UnsavedChangesDialog, { onContinue() {}, onDiscard() {}, onSave: save });
    const tree = view.render();
    button(tree, 'Save Changes').props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    const alert = find(view.render(), (element) => element.props.role === 'alert');
    assert.match(alert.props.children, /highlighted fields|Storage unavailable/);
    assert.equal(button(view.render(), 'Save Changes').props.disabled, false);
  }
});

test('pending saves disable every choice and reject repeated save clicks', async () => {
  let complete!: () => void;
  let count = 0;
  const view = renderHooks(UnsavedChangesDialog, { onContinue() {}, onDiscard() {}, onSave: () => { count++; return new Promise<void>((resolve) => { complete = resolve; }); } });
  const tree = view.render();
  button(tree, 'Save Changes').props.onClick();
  button(tree, 'Save Changes').props.onClick();
  assert.equal(count, 1);
  assert.equal(button(view.render(), 'Continue Editing').props.disabled, true);
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button(view.render(), 'Save Changes').props.disabled, false);
});

test('form exit waits for a valid successful save and uses the pending destination', async () => {
  let guard!: (allowed: () => void, cancelled?: () => void) => void;
  let saves = 0;
  let exited = 0;
  let cancelled = 0;
  let normalSaved = 0;
  let fail = false;
  const view = renderHooks(CreateSurveyPage, { onBack() {}, onSave: async () => { saves++; if (fail) throw new Error('Save failed'); }, onSaved: () => { normalSaved++; }, onRequestExitReady: (value: typeof guard | null) => { if (value) guard = value; } });
  let tree = view.render();
  find(tree, (element) => element.props.id === 'survey-title').props.onChange({ target: { value: 'Test survey' } });
  tree = view.render();
  view.effects.forEach((effect) => effect());
  guard(() => { exited++; }, () => { cancelled++; });
  let dialog = find(view.render(), (element) => element.type === UnsavedChangesDialog);
  assert.equal(await dialog.props.onSave(), false);
  assert.equal(saves, 0);
  assert.equal(exited, 0);
  dialog.props.onContinue();
  assert.equal(cancelled, 1);
  tree = view.render();
  find(tree, (element) => element.type === 'input' && element.props.placeholder === 'e.g. Does the courier deliver goods on the agreed date?').props.onChange({ target: { value: 'Service quality?' } });
  tree = view.render();
  view.effects.forEach((effect) => effect());
  guard(() => { exited++; });
  dialog = find(view.render(), (element) => element.type === UnsavedChangesDialog);
  fail = true;
  await assert.rejects(dialog.props.onSave(), /Save failed/);
  assert.equal(exited, 0);
  fail = false;
  await dialog.props.onSave();
  assert.equal(exited, 1);
  assert.equal(normalSaved, 0);
});

test('backdrop dismissal only continues editing and nested leave confirmation has priority', () => {
  let continued = 0;
  let discarded = 0;
  const backdrop = { parentElement: null, classList: { contains: (name: string) => ['fixed', 'inset-0'].includes(name) } };
  const top = getTopmostModalHandler([{ priority: 75, order: 1, close: () => { discarded++; } }, { priority: 250, order: 2, close: () => { continued++; } }]);
  dismissModalFromBackdrop({ target: backdrop as unknown as EventTarget, preventDefault() {}, stopImmediatePropagation() {} }, top!.close);
  assert.equal(continued, 1);
  assert.equal(discarded, 0);
});

test('Escape and backdrop use Continue Editing without save or discard; inside pointer is ignored', () => {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const listeners = new Map<string, (event: any) => void>();
  Object.assign(globalThis, {
    window: { scrollX: 0, scrollY: 0, innerWidth: 1000, getComputedStyle: () => ({ paddingRight: '0' }), scrollTo() {}, addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) },
    document: { activeElement: null, body: { style: {} }, documentElement: { style: {}, clientWidth: 1000 } },
  });
  let continued = 0;
  let discarded = 0;
  let saved = 0;
  const view = renderHooks(UnsavedChangesDialog, { onContinue: () => { continued++; }, onDiscard: () => { discarded++; }, onSave: () => { saved++; } });
  let cleanups: unknown[] = [];
  try {
    view.render();
    cleanups = view.effects.map((effect) => effect());
    listeners.get('keydown')!({ key: 'Escape', defaultPrevented: false, preventDefault() {}, stopImmediatePropagation() {} });
    const backdrop = { parentElement: null, classList: { contains: (name: string) => ['fixed', 'inset-0'].includes(name) } };
    const panel = { parentElement: backdrop, classList: { contains: () => false } };
    listeners.get('pointerdown')!({ target: panel, preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(continued, 1);
    listeners.get('pointerdown')!({ target: backdrop, preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(continued, 2);
    assert.equal(discarded, 0);
    assert.equal(saved, 0);
  } finally {
    cleanups.forEach((cleanup) => { if (typeof cleanup === 'function') cleanup(); });
    Object.assign(globalThis, { window: priorWindow, document: priorDocument });
  }
});

test('discard permits a reentrant route guard without opening a second confirmation', () => {
  let guard!: (allowed: () => void) => void;
  let exited = 0;
  const view = renderHooks(CreateSurveyPage, { onBack() {}, onSave() {}, onRequestExitReady: (value: typeof guard | null) => { if (value) guard = value; } });
  find(view.render(), (element) => element.props.id === 'survey-title').props.onChange({ target: { value: 'Unsaved title' } });
  view.render();
  view.effects.forEach((effect) => effect());
  guard(() => guard(() => { exited++; }));
  find(view.render(), (element) => element.type === UnsavedChangesDialog).props.onDiscard();
  assert.equal(exited, 1);
  assert.throws(() => find(view.render(), (element) => element.type === UnsavedChangesDialog));
});

test('category save-and-leave preserves validation and requires impact confirmation before saving', () => {
  let saves = 0;
  const view = renderHooks(CategoriesManagerPage, { categoryLabels: DEFAULT_CATEGORIES, onRenameCategory: () => { saves++; }, onRestoreDefaults() {} });
  find(view.render(), (element) => element.type === 'button' && element.props.className?.includes('panel text-left')).props.onClick();
  find(view.render(), (element) => element.type === 'input').props.onChange({ target: { value: '' } });
  find(view.render(), (element) => element.type === 'button' && element.props.title === 'Close').props.onClick();
  let dialog = find(view.render(), (element) => element.type === UnsavedChangesDialog);
  assert.equal(dialog.props.onSave(), false);
  assert.equal(saves, 0);
  dialog.props.onContinue();
  find(view.render(), (element) => element.type === 'input').props.onChange({ target: { value: 'Renamed category' } });
  find(view.render(), (element) => element.type === 'button' && element.props.title === 'Close').props.onClick();
  dialog = find(view.render(), (element) => element.type === UnsavedChangesDialog);
  dialog.props.onSave();
  assert.equal(saves, 0);
  find(view.render(), (element) => element.type === 'button' && String(element.props.children).includes('Yes, Apply Changes')).props.onClick();
  assert.equal(saves, 1);
  assert.throws(() => find(view.render(), (element) => element.props.id === 'category-editor-title'));
});

test('Send Form confirmation only sends on explicit approval and prevents repeated approval while pending', async () => {
  let saves = 0;
  let closed = 0;
  let complete!: () => void;
  const props = { title: 'Supplier evaluation', surveyType: 'Supplier', companyCount: 12, recipientCount: 8, busy: false, error: 'Save failed', onClose: () => { closed++; }, onConfirm: () => { saves++; return new Promise<void>((resolve) => { complete = resolve; }); } };
  const view = renderHooks(SendFormConfirmation, props);
  let tree = view.render();
  assert.equal(saves, 0);
  assert.equal(find(tree, (element) => element.props.role === 'alert').props.children, 'Save failed');
  button(tree, 'Go back').props.onClick();
  assert.equal(closed, 1);
  assert.equal(saves, 0);
  button(tree, 'Yes, proceed').props.onClick();
  button(tree, 'Yes, proceed').props.onClick();
  button(tree, 'Go back').props.onClick();
  assert.equal(saves, 1);
  assert.equal(closed, 1);
  props.busy = true;
  tree = view.render();
  assert.equal(button(tree, 'Sending…').props.disabled, true);
  assert.equal(button(tree, 'Go back').props.disabled, true);
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  props.busy = false;
  button(view.render(), 'Go back').props.onClick();
  assert.equal(closed, 2);
});

test('Send Form Escape and backdrop dismiss only approval, with priority over the underlying review', () => {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const listeners = new Map<string, (event: any) => void>();
  Object.assign(globalThis, {
    window: { scrollX: 0, scrollY: 0, innerWidth: 1000, getComputedStyle: () => ({ paddingRight: '0' }), scrollTo() {}, addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) },
    document: { activeElement: null, body: { style: {} }, documentElement: { style: {}, clientWidth: 1000 } },
  });
  let closed = 0;
  let saved = 0;
  let reviewClosed = 0;
  // Register the underlying review at its real priority using the shared hook.
  const underlying = renderHooks(() => { useModalEscape(true, () => { reviewClosed++; }, 80); return <div />; }, {});
  const props = { title: 'Courier evaluation', surveyType: 'Courier', companyCount: 20, recipientCount: 5, busy: false, onClose: () => { closed++; }, onConfirm: async () => { saved++; } };
  const view = renderHooks(SendFormConfirmation, props);
  let cleanups: unknown[] = [];
  try {
    underlying.render();
    cleanups.push(...underlying.effects.map((effect) => effect()));
    view.render();
    cleanups.push(...view.effects.map((effect) => effect()));
    const escape = () => listeners.get('keydown')!({ key: 'Escape', defaultPrevented: false, preventDefault() {}, stopImmediatePropagation() {} });
    escape();
    assert.equal(closed, 1);
    const backdrop = { parentElement: null, classList: { contains: (name: string) => ['fixed', 'inset-0'].includes(name) } };
    const panel = { parentElement: backdrop, classList: { contains: () => false } };
    const pointer = (target: unknown) => listeners.get('pointerdown')!({ target, preventDefault() {}, stopImmediatePropagation() {} });
    pointer(panel);
    assert.equal(closed, 1);
    pointer(backdrop);
    assert.equal(closed, 2);
    props.busy = true;
    view.render();
    escape();
    pointer(backdrop);
    assert.equal(closed, 2);
    assert.equal(saved, 0);
    assert.equal(reviewClosed, 0);
  } finally {
    cleanups.reverse().forEach((cleanup) => { if (typeof cleanup === 'function') cleanup(); });
    Object.assign(globalThis, { window: priorWindow, document: priorDocument });
  }
});