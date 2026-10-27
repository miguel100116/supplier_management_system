import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomForm } from '../types/survey';
import { SurveyFormsPage } from './SurveyFormsPage';
import { countActiveFormFilters } from '../features/evaluations/components/SurveyFormsToolbar';
import { SurveyAccessStatus } from '../features/evaluations/components/SurveyAccessStatus';
import { SendFormCompanySelection } from '../features/evaluations/components/SendFormCompanySelection';
import { readFileSync } from 'node:fs';

Object.assign(globalThis, { React });

test('Send Form Supplier control selects the displayed IDs without saving and handles empty/busy states', () => {
  const companies = Array.from({ length: 20 }, (_, index) => ({ id: `supplier-${index}`, name: `Supplier ${index}`, type: 'Supplier' as const, createdAt: '2026-01-01' }));
  let selected: string[] | undefined;
  const props = { surveyType: 'Supplier' as const, companies, selectedIds: null, busy: false, onSelect: (ids: string[]) => { selected = ids; } };
  const element = SendFormCompanySelection(props);
  assert.ok(element);
  element.props.children[1].props.onClick();
  assert.deepEqual(selected, companies.map((company) => company.id));
  assert.match(renderToStaticMarkup(<SendFormCompanySelection {...props} selectedIds={selected!} />), /20 suppliers selected\. Confirm to save/);
  assert.equal((renderToStaticMarkup(<SendFormCompanySelection {...props} selectedIds={selected!} />).match(/checked=""/g) ?? []).length, 20);
  assert.match(renderToStaticMarkup(<SendFormCompanySelection {...props} companies={[]} />), /disabled=""/);
  assert.match(renderToStaticMarkup(<SendFormCompanySelection {...props} busy />), /disabled=""/);
  for (const surveyType of ['Subcontractor'] as const) {
    assert.equal(renderToStaticMarkup(<SendFormCompanySelection {...props} surveyType={surveyType} />), '');
  }
});

test('Courier Send Form provides its own Top 20 checklist and individual selection', () => {
  const companies = Array.from({ length: 20 }, (_, index) => ({ id: `courier-${index}`, name: `Courier ${index}`, type: 'Courier' as const, createdAt: '2026-01-01' }));
  let selected: string[] = [];
  const props = { surveyType: 'Courier' as const, companies, selectedIds: null, busy: false, onSelect: (ids: string[]) => { selected = ids; } };
  const control = SendFormCompanySelection(props)!;
  control.props.children[3].props.children[3].props.children[0].props.onChange({ target: { checked: true } });
  assert.deepEqual(selected, ['courier-3']);
  const markup = renderToStaticMarkup(<SendFormCompanySelection {...props} selectedIds={selected} />);
  assert.match(markup, /Select top 20 couriers/);
  assert.match(markup, /Top 20 couriers to evaluate/);
  assert.doesNotMatch(markup, /supplier/);
  assert.equal((markup.match(/checked=""/g) ?? []).length, 1);
  control.props.children[1].props.onClick();
  assert.deepEqual(selected, companies.map((company) => company.id));
  assert.match(renderToStaticMarkup(<SendFormCompanySelection {...props} companies={[]} />), /disabled=""/);
});

test('Send Form lets the admin choose individual suppliers and refine the Top 20 preset', () => {
  const companies = Array.from({ length: 20 }, (_, index) => ({ id: `supplier-${index}`, name: `Supplier ${index}`, type: 'Supplier' as const, createdAt: '2026-01-01' }));
  let selected: string[] = [];
  const props = { surveyType: 'Supplier' as const, companies, selectedIds: null, busy: false, onSelect: (ids: string[]) => { selected = ids; } };
  const initial = SendFormCompanySelection(props)!;
  initial.props.children[3].props.children[4].props.children[0].props.onChange({ target: { checked: true } });
  assert.deepEqual(selected, ['supplier-4']);
  const oneSelected = SendFormCompanySelection({ ...props, selectedIds: selected })!;
  assert.equal(oneSelected.props.children[1].props['aria-pressed'], false);
  oneSelected.props.children[1].props.onClick();
  const allSelected = SendFormCompanySelection({ ...props, selectedIds: selected })!;
  assert.equal(allSelected.props.children[1].props['aria-pressed'], true);
  allSelected.props.children[3].props.children[4].props.children[0].props.onChange({ target: { checked: false } });
  assert.equal(selected.length, 19);
  assert.equal(selected.includes('supplier-4'), false);
  const markup = renderToStaticMarkup(<SendFormCompanySelection {...props} selectedIds={selected} />);
  assert.match(markup, /Top 20 suppliers to evaluate/);
  assert.match(markup, /Supplier 4/);
  assert.equal((markup.match(/checked=""/g) ?? []).length, 19);
});

test('Send Form persists the Supplier draft only on confirmation, including already-active forms', () => {
  const source = readFileSync(new URL('./SurveyFormsPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /distributionId: crypto\.randomUUID\(\), lastDistributedAt: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(source, /Existing survey reminders will direct them to it/);
  assert.match(source, /sendCompanySelectionRequired && !sendCompanyIds\?\.length/);
  assert.match(source, /getEvaluationLeaderboardTopTwenty\(partnerCompanies, responses, sendConfirmationSurvey.surveyType\)/);
  assert.match(source, /await onUpdateSurvey\(\{ \.\.\.applyDistributionCompanySelection\(sendConfirmationSurvey, sendCompanyIds, partnerCompanies\)/);
  assert.match(source, /useModalEscape\(Boolean\(sendConfirmationSurveyId\), requestCloseSendConfirmation, 80\)/);
  assert.match(source, /onClick=\{requestCloseSendConfirmation\} disabled=\{isSendingForm\}/);
  assert.match(source, /sendCompanyIds !== null\) \{ setIsDiscardSendOpen\(true\); return; \}/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /onClick=\{\(\) => \{ setDistributionFeedback\(null\); setIsSendApprovalOpen\(true\); \}\}/);
  assert.match(source, /onConfirm=\{handleConfirmSend\}/);
  assert.match(source, /if \(!isSendApprovalOpen \|\| !isAdmin/);
  assert.match(source, /onClick=\{\(\) => \{ setSendCompanyIds\(null\); setDistributionFeedback\(null\); setSendConfirmationSurveyId/);
});

const survey: CustomForm = {
  id: 'survey-1',
  title: 'Example Form',
  surveyType: 'Supplier',
  description: 'Example description',
  createdAt: '2026-10-01',
  status: 'Running',
  questions: [],
};

function renderFormsPage(isAdmin: boolean, form = survey) {
  const priorStorage = globalThis.localStorage;
  globalThis.localStorage = {
    length: 0, getItem: () => null, key: () => null,
    clear: () => {}, removeItem: () => {}, setItem: () => {},
  };
  try {
    return renderToStaticMarkup(createElement(SurveyFormsPage, {
      surveys: [form],
      responses: [],
      isAdmin,
      onSelectSurvey: () => {},
      onNavigateToCreate: () => {},
      onFillForm: () => {},
    }));
  } finally {
    globalThis.localStorage = priorStorage;
  }
}

test('SMS-55 keeps the admin Forms controls while removing duplicate navigation and title actions', () => {
  const html = renderFormsPage(true);
  assert.doesNotMatch(html, /Active Survey Forms|Interactive forms for evaluating|Search Templates|Archived Forms/);
  assert.match(html, /Create Form/);
  assert.doesNotMatch(html, /Select Forms/);
  assert.match(html, /Search survey forms/);
  assert.match(html, /Search survey title or description/);
  assert.match(html, /<button\b(?=[^>]*aria-label="Preview Example Form")[^>]*>Example Form<\/button>/);
  assert.match(html, /Manage Access/);
  assert.match(html, /Archive/);
  assert.match(html, /Send/);
  assert.match(html, /Recent Activity/);
  assert.doesNotMatch(html, />Modify</);
});

test('Manage Access and the main Forms list agree on deadlines and explicit manual endings', () => {
  const cases: Array<{ changes: Partial<CustomForm>; label: string; color: string }> = [
    { changes: { status: 'Completed', deadlineDate: '31/12/2099' }, label: 'Active', color: 'emerald' },
    { changes: { status: 'Running', deadlineDate: '01/01/2000' }, label: 'Ended', color: 'rose' },
    { changes: { status: 'Completed', deadlineDate: '31/12/2099', manuallyEndedAt: '2026-10-20T00:00:00Z' }, label: 'Ended', color: 'rose' },
    { changes: { status: 'Paused', deadlineDate: '31/12/2099' }, label: 'Paused', color: 'amber' },
    { changes: { status: 'Completed', deadlineDate: undefined }, label: 'Ended', color: 'rose' },
  ];
  for (const { changes, label, color } of cases) {
    const form = { ...survey, ...changes };
    const picker = renderToStaticMarkup(createElement(SurveyAccessStatus, { survey: form }));
    assert.match(picker, new RegExp(`>${label}</span>`));
    assert.match(picker, new RegExp(`text-${color}-600`));
    assert.match(renderFormsPage(true, form), new RegExp(`>${label.toUpperCase()}</span>`));
  }
});

test('employee Forms keeps its existing context heading and survey actions', () => {
  const html = renderFormsPage(false);
  assert.match(html, /Active Survey Forms/);
  assert.match(html, /View/);
  assert.match(html, /Answer Survey/);
});

test('SMS-56 keeps the admin controls in one responsive toolbar and exposes sort and date filters', () => {
  const html = renderFormsPage(true);
  assert.match(html, /role="toolbar" aria-label="Survey forms controls"/);
  assert.match(html, /role="group" aria-label="Survey category"/);
  assert.match(html, /aria-label="Sort forms"[^>]*aria-expanded="false" aria-haspopup="dialog"/);
  assert.match(html, /aria-label="Filter forms by deadline date"[^>]*aria-expanded="false" aria-haspopup="dialog"/);
  assert.match(html, /class="survey-forms-table/);
  assert.match(html, /class="survey-forms-row-actions/);
  assert.match(html, /1 form/);
  assert.doesNotMatch(html, /rounded-xl border border-slate-200 bg-slate-50\/70 p-3/);
  assert.equal(countActiveFormFilters('title-asc', '', ''), 0);
  assert.equal(countActiveFormFilters('deadline-desc', '', ''), 1);
  assert.equal(countActiveFormFilters('title-asc', '2026-10-01', '2026-10-31'), 1);
  assert.equal(countActiveFormFilters('deadline-desc', '2026-10-01', '2026-10-31'), 2);
});
