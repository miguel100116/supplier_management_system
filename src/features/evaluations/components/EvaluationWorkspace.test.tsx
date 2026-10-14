import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
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
