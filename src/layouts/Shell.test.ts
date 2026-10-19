import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { scrollModuleToTop } from './Shell';

const APP_SOURCE = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const EVALUATION_WORKSPACE_SOURCE = readFileSync(new URL('../features/evaluations/components/EvaluationWorkspace.tsx', import.meta.url), 'utf8');
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


test('Admin evaluation navigation groups the existing routes into one workspace', () => {
  const group = APP_SOURCE.slice(APP_SOURCE.indexOf("id: 'group-evaluations'"), APP_SOURCE.indexOf('// Single page already covers'));
  assert.match(group, /key: 'survey-forms', label: 'Workspace'/);
  assert.doesNotMatch(group, /key: 'categories-manager'/);
  assert.doesNotMatch(group, /key: 'explorer'|key: 'pending-review'/);
  assert.match(APP_SOURCE, /activePage=\{isAdminEvaluationWorkspace \? 'survey-forms' : activePage\}/);
  assert.match(EVALUATION_WORKSPACE_SOURCE, /key: 'categories-manager', label: 'Category Labels'/);
});

test('module titles follow sidebar labels, including all workspace views, and update browser titles', () => {
  const titleSource = APP_SOURCE.slice(APP_SOURCE.indexOf('const activeTitle ='), APP_SOURCE.indexOf('const pageHeading ='));
  assert.match(titleSource, /navigationPage = isAdminEvaluationWorkspace \? 'survey-forms' : activePage/);
  assert.match(titleSource, /flatNavLeaves\.find\(\(page\) => page\.key === navigationPage\)\?\.label/);
  assert.match(titleSource, /if \(navigationTitle\) return navigationTitle/);
  assert.doesNotMatch(titleSource, /Administrative Partner Registry|Document Tracker|Account Management|Import Evaluation Responses/);
  const shellSource = readFileSync(new URL('./Shell.tsx', import.meta.url), 'utf8');
  assert.ok(shellSource.includes('document.title = `${title} | Supplier Management System`'));
  assert.ok(shellSource.includes('document.title = previousTitle'));
});
