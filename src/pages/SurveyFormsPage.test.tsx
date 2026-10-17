import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomForm } from '../types/survey';
import { SurveyFormsPage } from './SurveyFormsPage';
import { countActiveFormFilters } from '../features/evaluations/components/SurveyFormsToolbar';

Object.assign(globalThis, { React });

const survey: CustomForm = {
  id: 'survey-1',
  title: 'Example Form',
  surveyType: 'Supplier',
  description: 'Example description',
  createdAt: '2026-10-01',
  status: 'Running',
  questions: [],
};

function renderFormsPage(isAdmin: boolean) {
  const priorStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null } as Storage;
  try {
    return renderToStaticMarkup(createElement(SurveyFormsPage, {
      surveys: [survey],
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
  assert.doesNotMatch(html, /Active Evaluation Forms|Interactive forms for evaluating|Search Templates|Archived Forms/);
  assert.match(html, /Create Form/);
  assert.match(html, /Select Forms/);
  assert.match(html, /Search evaluation forms/);
  assert.match(html, /Search evaluation title or description/);
  assert.match(html, /Deadline range/);
  assert.match(html, /Reset/);
  assert.match(html, /<span class="font-bold text-slate-800 dark:text-slate-100">Example Form<\/span>/);
  assert.match(html, /Manage/);
  assert.match(html, /Modify/);
});

test('employee Forms keeps its existing context heading and evaluation actions', () => {
  const html = renderFormsPage(false);
  assert.match(html, /Active Evaluation Forms/);
  assert.match(html, /View/);
  assert.match(html, /Answer Evaluation/);
});

test('SMS-56 puts the admin controls in one toolbar and counts changed sort and date range filters', () => {
  const html = renderFormsPage(true);
  assert.match(html, /role="toolbar" aria-label="Evaluation forms controls"/);
  assert.match(html, /role="group" aria-label="Evaluation category"/);
  assert.match(html, /<details class="relative shrink-0">/);
  assert.match(html, /Reset filters/);
  assert.match(html, /1 form/);
  assert.doesNotMatch(html, /rounded-xl border border-slate-200 bg-slate-50\/70 p-3/);
  assert.equal(countActiveFormFilters('title-asc', '', ''), 0);
  assert.equal(countActiveFormFilters('deadline-desc', '', ''), 1);
  assert.equal(countActiveFormFilters('title-asc', '2026-10-01', '2026-10-31'), 1);
  assert.equal(countActiveFormFilters('deadline-desc', '2026-10-01', '2026-10-31'), 2);
});
