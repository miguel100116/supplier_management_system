import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isNavigationPathActive, scrollModuleToTop } from './Shell';
import { adminNav, employeeNav } from '../config/navigation';
import { getPagePresentation } from '../navigation/navigationConfig';
import { PATHS } from '../routes/paths';

const APP_SOURCE = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const SURVEY_DATA_SOURCE = readFileSync(new URL('../hooks/useSurveyData.ts', import.meta.url), 'utf8');

test('module navigation resets the shared page scroll position', () => {
  let receivedOptions: ScrollToOptions | undefined;

  scrollModuleToTop({
    scrollTo(options) {
      receivedOptions = options;
    },
  });

  assert.deepEqual(receivedOptions, { top: 0, left: 0, behavior: 'auto' });
});

test('global header keeps the logo and renders no title text or separator', () => {
  const source = readFileSync(new URL('./Shell.tsx', import.meta.url), 'utf8');
  const headerSource = source.match(/<header\b[\s\S]*?<\/header>/)?.[0];

  assert.ok(headerSource?.includes('src="/microgenesis_logo.png"'));
  assert.ok(!headerSource?.includes('Supplier Management System'));
  assert.doesNotMatch(headerSource ?? '', /\{title\}/);
  assert.doesNotMatch(headerSource ?? '', />\s*\/\s*</);
});

test('background data refresh keeps the active page mounted with an in-page loading indicator', () => {
  assert.match(APP_SOURCE, /\{pageContent\}[\s\S]*?isRefreshing[\s\S]*?Refreshing shared data/);
  assert.doesNotMatch(APP_SOURCE, /isRefreshing\s*\?\s*\([\s\S]*?Refreshing shared data[\s\S]*?\)\s*:\s*pageContent/);
});

test('realtime refreshes load only the application record type that changed', () => {
  assert.match(SURVEY_DATA_SOURCE, /runHydration\(true, recordType\)/);
  assert.match(SURVEY_DATA_SOURCE, /case 'survey':[\s\S]*?loadApplicationRecords<CustomForm>\('survey'\)/);
  assert.doesNotMatch(SURVEY_DATA_SOURCE, /refreshChangedRecord[\s\S]*?setTimeout\(\(\) => runHydration\(true\),/);
});


test('primary navigation exposes the approved role-specific terminology', () => {
  assert.deepEqual(
    adminNav.map(({ label }) => label),
    ['Dashboard', 'Partners', 'Evaluations', 'Analytics', 'Reports', 'Users'],
  );
  assert.deepEqual(
    employeeNav.map(({ label }) => label),
    ['Home', 'Assigned Evaluations', 'My Submissions', 'Profile'],
  );
  assert.match(APP_SOURCE, /type: 'group'/);
});

test('sidebar path matching highlights groups by prefix and Directory exactly', () => {
  assert.equal(isNavigationPathActive(PATHS.admin.partners.documents, PATHS.admin.partners.root), true);
  assert.equal(isNavigationPathActive(PATHS.admin.partners.documents, PATHS.admin.partners.root, true), false);
  assert.equal(isNavigationPathActive(PATHS.admin.partners.root, PATHS.admin.partners.root, true), true);
  assert.equal(isNavigationPathActive(PATHS.admin.analytics, PATHS.admin.partners.root), false);
});

test('sidebar exposes accessible navigation state and a pinned footer', () => {
  const source = readFileSync(new URL('./Shell.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-expanded=\{isExpanded\}/);
  assert.match(source, /aria-current=\{active \? 'page'/);
  assert.match(source, /aria-label="Primary navigation"/);
  assert.match(source, /aria-label="Account navigation"/);
  assert.match(source, /pinnedPages\.map/);
});

test('page presentation keeps titles, breadcrumbs, and sidebar parents aligned', () => {
  assert.deepEqual(getPagePresentation('dashboard', {
    isAdmin: true,
    userDisplayName: 'Alex Admin',
  }), {
    title: 'Dashboard',
    sidebarKey: 'dashboard',
    breadcrumbs: [],
    description: 'Welcome back, Alex Admin.',
  });

  assert.deepEqual(getPagePresentation('document-register', { isAdmin: true }), {
    title: 'Documents',
    sidebarKey: 'partner-companies',
    breadcrumbs: [
      { label: 'Partners', page: 'partner-companies' },
      { label: 'Documents' },
    ],
  });

  assert.equal(getPagePresentation('categories-manager', { isAdmin: true }).title, 'Category Labels');
  assert.equal(getPagePresentation('create-form', { isAdmin: true }).sidebarKey, 'survey-forms');
  assert.equal(getPagePresentation('fill-form', { isAdmin: false }).title, 'Assigned Evaluations');
  assert.equal(getPagePresentation('fill-form', { isAdmin: false }).sidebarKey, 'fill-form');
});

test('Shell renders semantic breadcrumb navigation and supporting page text', () => {
  const source = readFileSync(new URL('./Shell.tsx', import.meta.url), 'utf8');
  assert.match(source, /<nav aria-label="Breadcrumb"/);
  assert.match(source, /aria-current=\{isCurrent \? 'page'/);
  assert.match(source, /\{pageDescription\}/);
});
