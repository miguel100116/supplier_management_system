import assert from 'node:assert/strict';
import test from 'node:test';
import { adminNav, employeeNav } from '../config/navigation';
import { PATHS } from './paths';

test('parameterized routes encode dynamic path segments', () => {
  assert.equal(PATHS.admin.partners.details('partner / one'), `${PATHS.admin.partners.root}/partner%20%2F%20one`);
  assert.equal(PATHS.admin.evaluations.workspace.editForm('form / one'), `${PATHS.admin.evaluations.workspace.forms}/form%20%2F%20one/edit`);
  assert.equal(PATHS.employee.fillEvaluation('form / one'), `${PATHS.employee.evaluations}/form%20%2F%20one/fill`);
});

test('navigation uses the canonical role-specific labels and paths', () => {
  assert.deepEqual(adminNav.map(({ label }) => label), ['Dashboard', 'Partners', 'Evaluations', 'Analytics', 'Reports', 'Users']);
  assert.deepEqual(employeeNav.map(({ label }) => label), ['Home', 'Assigned Evaluations', 'My Submissions', 'Profile']);
  assert.equal(adminNav.find(({ id }) => id === 'partners')?.children?.[0]?.end, true);
  assert.equal(adminNav.some(({ id }) => id === 'notifications' || id === 'settings'), false);
  assert.equal(employeeNav.some(({ id }) => id === 'employee-notifications'), false);
});
