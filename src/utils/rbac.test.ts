import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultPermissions, getDepartmentDefaultPermissions, getEffectiveSurveyTypes, getProfilePermissions, hasPageAccess } from './rbac';

test('account survey-type restrictions remain the effective boundary', () => {
  assert.deepEqual(getEffectiveSurveyTypes(['Courier']), ['Courier']);
  assert.deepEqual(getEffectiveSurveyTypes(['Courier', 'Courier']), ['Courier']);
});

test('shared profile permissions preserve defaults, overrides, department ceilings and full Admin access', () => {
  assert.deepEqual(getProfilePermissions(null, {}), { pages: [], surveyTypes: [] });
  const profile = { role: 'Employee', designation: 'Supervisory', department: 'TASS' };
  const defaults = getDefaultPermissions(profile.designation, profile.department);
  const department = getDepartmentDefaultPermissions(profile.department);
  assert.deepEqual(getProfilePermissions(profile, {}), { pages: defaults.pages.filter((p) => department.pages.includes(p)), surveyTypes: defaults.surveyTypes });
  const permissions = { pages: ['analytics', 'reports'] as const, surveyTypes: ['Courier', 'Supplier'] as const };
  assert.deepEqual(getProfilePermissions({ ...profile, permissions: { pages: [...permissions.pages], surveyTypes: [...permissions.surveyTypes] } }, { TASS: { pages: ['analytics'], surveyTypes: ['Courier'] } }), { pages: ['analytics'], surveyTypes: ['Courier'] });
  assert.deepEqual(getProfilePermissions({ ...profile, role: 'Admin', permissions: { pages: [], surveyTypes: [] } }, { TASS: { pages: [], surveyTypes: [] } }), getDefaultPermissions('Admin', 'TASS'));
});

test('account-management page access does not turn an employee into an administrator', () => {
  assert.equal(hasPageAccess(['account-management'], 'analytics', false), false);
  assert.equal(hasPageAccess(['account-management'], 'analytics', true), true);
});

test('Archive Center is Admin-only even when an employee has a stale custom override', () => {
  assert.equal(hasPageAccess(['archive'], 'archive', false), false);
  assert.equal(hasPageAccess([], 'archive', true), true);
  assert.equal(getDefaultPermissions('Managerial', 'TASS').pages.includes('archive'), false);
  assert.equal(getDefaultPermissions('Director', 'Business Solutions Manager').pages.includes('archive'), false);
  assert.equal(getDepartmentDefaultPermissions('TASS').pages.includes('archive'), false);
});
