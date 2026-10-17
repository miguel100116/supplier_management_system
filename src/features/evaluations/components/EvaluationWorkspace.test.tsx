import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvaluationWorkspace, EVALUATION_WORKSPACE_TABS, isEvaluationWorkspacePage } from './EvaluationWorkspace';

test('workspace routes include evaluation operations and exclude archive and employee form entry', () => {
  for (const tab of EVALUATION_WORKSPACE_TABS) assert.equal(isEvaluationWorkspacePage(tab.key), true);
  assert.equal(
    EVALUATION_WORKSPACE_TABS.find((tab) => tab.key === 'categories-manager')?.label,
    'Category Labels',
  );
  for (const page of ['archive', 'import-evaluations', 'fill-form', 'dashboard']) {
    assert.equal(isEvaluationWorkspacePage(page), false);
  }
});

test('each workspace view exposes four URL-aware navigation choices, one current view, and its content', () => {
  const segments = ['forms', 'responses', 'coverage', 'category-labels'];
  EVALUATION_WORKSPACE_TABS.forEach((tab, index) => {
    const html = renderToStaticMarkup(createElement(EvaluationWorkspace, {
      currentPath: `/admin/evaluations/workspace/${segments[index]}`,
      onNavigate: () => {},
      children: createElement('p', null, `Content for ${tab.label}`),
    }));
    assert.equal((html.match(/<button/g) ?? []).length, 4);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, new RegExp(`aria-current="page"[^>]*>${tab.label}</button>`));
    assert.ok(html.includes(`Content for ${tab.label}`));
  });
});
