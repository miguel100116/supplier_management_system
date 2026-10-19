import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvaluationWorkspace, EVALUATION_WORKSPACE_TABS, isEvaluationWorkspacePage } from './EvaluationWorkspace';

test('workspace routes include category labels and exclude archive and employee form entry', () => {
  for (const tab of EVALUATION_WORKSPACE_TABS) assert.equal(isEvaluationWorkspacePage(tab.key), true);
  for (const page of ['archive', 'import-evaluations', 'fill-form', 'dashboard']) {
    assert.equal(isEvaluationWorkspacePage(page), false);
  }
});

test('each workspace view exposes four navigation choices, one current view, and its content', () => {
  for (const tab of EVALUATION_WORKSPACE_TABS) {
    const html = renderToStaticMarkup(createElement(EvaluationWorkspace, {
      activePage: tab.key,
      onNavigate: () => {},
      children: createElement('p', null, `Content for ${tab.label}`),
    }));
    assert.equal((html.match(/<button/g) ?? []).length, 4);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, new RegExp(`aria-current="page"[^>]*>${tab.label}</button>`));
    assert.ok(html.includes(tab.key === 'categories-manager' ? 'Change the displayed scoring category names for each survey type.' : 'Create and manage evaluation forms, assigned companies, deadlines, and access.'));
    assert.ok(html.includes(`Content for ${tab.label}`));
  }
});

test('every view shares the same responsive tab layout and each button navigates to its own view', () => {
  const layouts = new Set<string>();
  const activeStyles = new Set<string>();
  const inactiveStyles = new Set<string>();
  for (const current of EVALUATION_WORKSPACE_TABS) {
    const navigated: string[] = [];
    const tree = EvaluationWorkspace({ activePage: current.key, onNavigate: page => navigated.push(page), children: null });
    const section = Children.toArray(tree.props.children).find(child => isValidElement(child) && child.type === 'section');
    assert.ok(isValidElement<{ className: string; children: any }>(section));
    const nav = section.props.children;
    layouts.add(`${section.props.className}|${nav.props.className}`);
    assert.match(nav.props.className, /max-w-full flex-wrap/);
    nav.props.children.forEach((button: any, index: number) => {
      assert.equal(button.props.children, EVALUATION_WORKSPACE_TABS[index].label);
      const active = EVALUATION_WORKSPACE_TABS[index].key === current.key;
      (active ? activeStyles : inactiveStyles).add(button.props.className);
      assert.equal(button.props['aria-current'], active ? 'page' : undefined);
      button.props.onClick();
    });
    assert.deepEqual(navigated, EVALUATION_WORKSPACE_TABS.map(tab => tab.key));
  }
  assert.equal(layouts.size, 1);
  assert.equal(activeStyles.size, 1);
  assert.equal(inactiveStyles.size, 1);
  assert.notEqual([...activeStyles][0], [...inactiveStyles][0]);
});
