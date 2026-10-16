import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { scrollModuleToTop } from './Shell';

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


test('Admin sidebar exposes direct task-focused module destinations', () => {
  const navigation = APP_SOURCE.slice(APP_SOURCE.indexOf('const adminNavItems'), APP_SOURCE.indexOf('const allSurveyTypes'));
  assert.match(navigation, /key: 'partner-companies', label: 'Partners'/);
  assert.match(navigation, /key: 'survey-forms', label: 'Evaluations'/);
  assert.match(navigation, /key: 'reports', label: 'Reports'/);
  assert.match(navigation, /key: 'account-management', label: 'Users & Access'/);
  assert.doesNotMatch(navigation, /type: 'group'/);
  assert.match(APP_SOURCE, /activePage=\{isAdminEvaluationWorkspace[\s\S]*?'survey-forms'/);
});
