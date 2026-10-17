import assert from 'node:assert/strict';
import test from 'node:test';
import { getIndexRedirect, getRoleGuardRedirect, resolveAppRoute } from './appRouter';
import { PATHS } from './paths';

test('canonical nested routes resolve to existing page contracts and decode parameters', () => {
  assert.equal(resolveAppRoute(PATHS.admin.partners.documents)?.page, 'document-register');
  assert.equal(resolveAppRoute(PATHS.admin.evaluations.workspace.responses)?.page, 'explorer');
  assert.equal(resolveAppRoute(PATHS.admin.reports.builders.executiveSummary)?.page, 'reports');
  assert.deepEqual(resolveAppRoute(PATHS.admin.partners.details('partner / one'))?.params, { partnerId: 'partner / one' });
  assert.deepEqual(resolveAppRoute(PATHS.admin.evaluations.workspace.editForm('form / one'))?.params, {
    formId: 'form / one',
    mode: 'edit',
  });
  assert.deepEqual(resolveAppRoute(PATHS.employee.fillEvaluation('form / one'))?.params, {
    formId: 'form / one',
    mode: 'fill',
  });
});

test('nested index routes redirect to their canonical default children', () => {
  assert.equal(getIndexRedirect(PATHS.admin.root), PATHS.admin.dashboard);
  assert.equal(getIndexRedirect(PATHS.admin.evaluations.root), PATHS.admin.evaluations.workspace.root);
  assert.equal(getIndexRedirect(PATHS.admin.evaluations.workspace.root), PATHS.admin.evaluations.workspace.forms);
  assert.equal(getIndexRedirect(PATHS.admin.reports.root), PATHS.admin.reports.generate);
});

test('role guard keeps unauthenticated users at login and separates admin and employee routes', () => {
  assert.equal(getRoleGuardRedirect(PATHS.admin.dashboard, false, false), PATHS.login);
  assert.equal(getRoleGuardRedirect(PATHS.login, false, false), null);
  assert.equal(getRoleGuardRedirect(PATHS.admin.dashboard, true, false), PATHS.employee.home);
  assert.equal(getRoleGuardRedirect(PATHS.employee.home, true, true), PATHS.admin.dashboard);
  assert.equal(getRoleGuardRedirect(PATHS.admin.dashboard, true, true), null);
  assert.equal(getRoleGuardRedirect(PATHS.employee.home, true, false), null);
});
