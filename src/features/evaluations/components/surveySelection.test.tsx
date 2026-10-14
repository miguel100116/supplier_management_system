import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomForm } from '../../../types/survey';
import { SurveyFillerPage } from '../../../pages/SurveyFillerPage';
import { getVisibleSurveyForms } from '../domain/surveySelection';

const forms: CustomForm[] = ['Test', 'test 2', 'test 3', 'Test Sept. 23', 'Supplier Quality Evaluation', 'Subcontractor Performance Survey'].map((title, index) => ({ id: String(index), title, surveyType: 'Supplier', description: '', createdAt: '2026-10-02', questions: [] }));

function renderForm(isAdmin: boolean, surveys = forms, profile?: { department: string; designation: string }) {
  const globals = globalThis as typeof globalThis & { React?: typeof React };
  const previous = globals.React;
  globals.React = React;
  try {
    return renderToStaticMarkup(<SurveyFillerPage surveys={getVisibleSurveyForms(surveys, isAdmin)} partnerCompanies={[]} initialSurveyId="1" employeeExperience={!isAdmin} userEmail="employee@example.com" defaultDepartment={profile?.department} defaultRespondentType={profile?.designation} responses={[]} onSubmitted={() => undefined} onCancel={() => undefined} />);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globals, 'React');
    else globals.React = previous;
  }
}

test('employee New Evaluation removes test options and recovers a previously selected test form', () => {
  const markup = renderForm(false);
  for (const id of ['0', '1', '2', '3']) assert.doesNotMatch(markup, new RegExp(`<option value="${id}"`));
  assert.match(markup, /<h1>Supplier Quality Evaluation<\/h1>/);
  assert.doesNotMatch(markup, /<select[^>]*filler-survey/);
  assert.match(renderForm(true), /<option value="1" selected="">test 2/);
});

test('employees see an account-specific empty state when only test forms exist', () => {
  const markup = renderForm(false, forms.slice(0, 4));
  assert.match(markup, /No Surveys Available/);
  assert.match(markup, /No survey forms are available for your account right now/);
  assert.doesNotMatch(markup, /id="filler-survey"/);
});

test('New Evaluation shows the account department and designation in the respondent summary', () => {
  const markup = renderForm(false, forms, { department: 'Procurement Group', designation: 'Managerial' });
  assert.match(markup, /<span>DEPARTMENT<\/span><strong>Procurement Group<\/strong>/);
  assert.match(markup, /<span>DESIGNATION<\/span><strong>Managerial<\/strong>/);
  assert.doesNotMatch(markup, /id="filler-dept"|id="filler-role"/);
});

test('New Evaluation reflects each account profile independently, including updated Admin assignments', () => {
  const firstAccount = renderForm(false, forms, { department: 'Logistics', designation: 'Rank & File' });
  const secondAccount = renderForm(false, forms, { department: 'TASS', designation: 'Supervisory' });
  assert.match(firstAccount, /<span>DEPARTMENT<\/span><strong>Logistics<\/strong>/);
  assert.match(firstAccount, /<span>DESIGNATION<\/span><strong>Rank &amp; File<\/strong>/);
  assert.match(secondAccount, /<span>DEPARTMENT<\/span><strong>TASS<\/strong>/);
  assert.match(secondAccount, /<span>DESIGNATION<\/span><strong>Supervisory<\/strong>/);
});

test('New Evaluation does not invent organizational information for a missing account profile', () => {
  const markup = renderForm(false);
  assert.match(markup, /<span>DEPARTMENT<\/span><strong>Not assigned<\/strong>/);
  assert.match(markup, /<span>DESIGNATION<\/span><strong>Not assigned<\/strong>/);
  assert.match(markup, /id="btn-filler-next"[^>]*disabled=""/);
});

test('Admin respondent-info footer retains its right-aligned proceed action', () => {
  {
    const markup = renderForm(true);
    const stepOne = markup.slice(markup.indexOf('id="survey-filler-step-1"'), markup.indexOf('</form>'));
    const footer = stepOne.match(/<div class="flex justify-end border-t[^>]*>([\s\S]*)<\/div>$/)?.[1];
    assert.ok(footer, 'respondent-info footer is right aligned');
    assert.equal((footer.match(/<button\b/g) ?? []).length, 1);
    assert.match(footer, /type="submit"/);
    assert.match(footer, /id="btn-filler-next"/);
    assert.match(footer, /Proceed to Form Questions/);
    assert.match(footer, /w-full[^"]*min-\[420px\]:w-auto/);
    assert.doesNotMatch(stepOne, /Back to Form Management/);
    assert.doesNotMatch(footer, /<div\b/);
  }
});

test('employee New Evaluation uses the Figma wizard while Admin keeps the existing form presentation', () => {
  const employeeMarkup = renderForm(false);
  assert.match(employeeMarkup, /id="survey-filler-container"><section class="evaluation-progress-panel"[^>]*><div class="workflow-steps"/);
  for (const label of ['Evaluation details', 'Your feedback', 'Review &amp; submit', 'class="respondent-summary"', 'Proceed to Form Questions']) {
    assert.ok(employeeMarkup.includes(label), `${label} remains visible`);
  }

  const adminMarkup = renderForm(true);
  assert.match(adminMarkup, /id="survey-filler-container"><div class="flex items-center justify-between gap-2 px-1 sm:px-2">/);
  for (const label of ['Respondent Info', 'Questions Form', 'Success', 'Stakeholder Feedback Form', 'Proceed to Form Questions']) {
    assert.ok(adminMarkup.includes(label), `${label} remains visible for Admin`);
  }
  assert.doesNotMatch(adminMarkup, /class="workflow-steps"/);
});
