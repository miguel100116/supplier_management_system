import assert from 'node:assert/strict';
import test from 'node:test';
import { getPageKeyFromPathname, getPageNavigationMode, getPagePathname, shouldConfirmSurveySwitch } from './pageRouting';

test('same-page navigation replaces the current route while module changes add a history entry', () => {
  assert.equal(getPageNavigationMode('analytics', 'analytics'), 'replace');
  assert.equal(getPageNavigationMode('dashboard', 'analytics'), 'push');
});

test('switching surveys during an in-progress form requires confirmation', () => {
  assert.equal(shouldConfirmSurveySwitch('fill-form', 'fill-form', 'survey-a', 'survey-b'), true);
  assert.equal(shouldConfirmSurveySwitch('fill-form', 'fill-form', 'survey-a', 'survey-a'), false);
  assert.equal(shouldConfirmSurveySwitch('dashboard', 'fill-form', 'survey-a', 'survey-b'), false);
});

test('maps module pages to root-relative paths', () => {
  assert.equal(getPagePathname('login'), '/login');
  assert.equal(getPageKeyFromPathname('/login'), 'login');
  assert.equal(getPagePathname('analytics'), '/analytics');
  assert.equal(getPageKeyFromPathname('/analytics'), 'analytics');
  assert.equal(getPageKeyFromPathname('/'), 'dashboard');
  assert.equal(getPageKeyFromPathname('/dashboard'), 'dashboard');
});

test('preserves canonical module paths and legacy aliases independently of sidebar labels', () => {
  const routes = [
    ['partner-companies', '/partners'],
    ['document-register', '/document-tracker'],
    ['partners-feedback-hub', '/feedback-hub'],
    ['survey-forms', '/evaluation-workspace'],
    ['archive', '/archive-center'],
    ['import-evaluations', '/import-evaluation-responses'],
    ['categories-manager', '/evaluation-settings'],
    ['reports', '/reports'],
    ['present', '/present-mode'],
    ['account-management', '/employees-users'],
  ] as const;

  for (const [page, pathname] of routes) {
    assert.equal(getPagePathname(page), pathname);
    assert.equal(getPageKeyFromPathname(pathname), page);
    assert.equal(getPageKeyFromPathname(`/${page}`), page);
  }
});

test('supports deployments under a normalized base path', () => {
  assert.equal(getPagePathname('login', '/app/'), '/app/login');
  assert.equal(getPageKeyFromPathname('/app/login', '/app/'), 'login');
  assert.equal(getPagePathname('analytics', '/app/'), '/app/analytics');
  assert.equal(getPageKeyFromPathname('/app/analytics', '/app/'), 'analytics');
  assert.equal(getPageKeyFromPathname('/app', '/app'), 'dashboard');
  assert.equal(getPageKeyFromPathname('/app/', '/app'), 'dashboard');
});

test('unknown, nested, and out-of-base paths fall back to dashboard', () => {
  assert.equal(getPageKeyFromPathname('/not-a-module'), 'dashboard');
  assert.equal(getPageKeyFromPathname('/analytics/details'), 'dashboard');
  assert.equal(getPageKeyFromPathname('/elsewhere/analytics', '/app'), 'dashboard');
  assert.equal(getPageKeyFromPathname('/app/unknown', '/app'), 'dashboard');
});

test('legacy Reports routes resolve to the unified module', () => {
  assert.equal(getPageKeyFromPathname('/export-history'), 'reports');
  assert.equal(getPageKeyFromPathname('/generate-report'), 'reports');
  assert.equal(getPageKeyFromPathname('/app/export-history', '/app'), 'reports');
});
