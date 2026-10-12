import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomForm, SurveyResponse } from '../types/survey';
import { SurveyDetailsPage } from './SurveyDetailsPage';

Object.assign(globalThis, { React });

const survey: CustomForm = {
  id: 'pagination-form', title: 'Example form', description: '',
  surveyType: 'Courier', createdAt: '2026-10-01',
  questions: [{ questionId: 'Q01', questionNumber: 1, question: 'Delivery', questionCategory: 'Delivery' }],
};

function renderSubmissions(count: number) {
  const responses: SurveyResponse[] = Array.from({ length: count }, (_, index) => ({
    responseId: `response-${index}`, surveyType: 'Courier', respondentType: 'Employee',
    submissionDate: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
    company: `Example Company ${index + 1}`, questionId: 'Q01', questionNumber: 1,
    question: 'Delivery', questionCategory: 'Delivery', rating: 3, comment: '',
  }));
  return renderToStaticMarkup(createElement(SurveyDetailsPage, {
    survey, responses, onBack: () => {}, onDelete: () => {}, isAdmin: true,
  }));
}

for (const [label, render, paginationLabel] of [
  ['Recent Form Submissions', renderSubmissions, 'Recent form submissions pagination'],
] as const) {
  test(`${label} shows ten newest rows while keeping the full result count`, () => {
    const html = render(30);
    const rows = [...html.matchAll(/<tbody[^>]*>(.*?)<\/tbody>/gs)].pop()?.[1] ?? '';
    assert.equal((rows.match(/<tr\b/g) ?? []).length, 10);
    assert.match(html, /30 results/);
    assert.match(html, /Showing 1–10 of 30/);
    assert.match(html, /Page 1 of 3/);
    assert.match(html, new RegExp(`aria-label="${paginationLabel}"`));
    assert.match(html, /<button[^>]*disabled=""[^>]*>.*?Previous/s);
    assert.doesNotMatch(rows, /Example Company 20<|actor-20@example\.com/);
    assert.match(rows, /Example Company 30<|actor-30@example\.com/);
  });

  test(`${label} hides page buttons when all ten rows fit`, () => {
    const html = render(10);
    assert.match(html, /Showing 1–10 of 10/);
    assert.doesNotMatch(html, /Previous|>Next</);
  });

  test(`${label} includes a second page for the eleventh row`, () => {
    const html = render(11);
    assert.match(html, /Showing 1–10 of 11/);
    assert.match(html, /Page 1 of 2/);
  });

  test(`${label} keeps its empty state without pagination`, () => {
    const html = render(0);
    assert.match(html, /No responses have been submitted|No changes have been saved/);
    assert.doesNotMatch(html, new RegExp(paginationLabel));
    assert.doesNotMatch(html, /Showing|Page 1 of/);
  });
}
