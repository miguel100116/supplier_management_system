import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmployeeWorkspacePage } from '../features/employee-experience/components/EmployeeWorkspacePage';
import { AdminDashboardControlBanner, DashboardDataScopeFilter, DashboardDataScopeToggle, DashboardPage } from './DashboardPage';

Object.assign(globalThis, { React });

test('Employee dashboard period toggle preserves its existing selection behavior', () => {
  const changes: Array<'current' | 'all-time'> = [];
  const control = DashboardDataScopeToggle({ scope: 'current', onChange: (scope) => changes.push(scope) });
  const buttons = control.props.children as ReactElement[];

  assert.equal(buttons[0].props['aria-pressed'], true);
  assert.equal(buttons[1].props['aria-pressed'], false);
  buttons.forEach((button) => (button.props as { onClick: () => void }).onClick());
  assert.deepEqual(changes, ['current', 'all-time']);
});

test('Admin dashboard period filter exposes both reporting scopes and updates the selected value', () => {
  const changes: Array<'current' | 'all-time'> = [];
  const control = DashboardDataScopeFilter({ scope: 'current', onChange: (scope) => changes.push(scope) });
  const children = control.props.children as ReactElement[];
  const select = children[1] as ReactElement<{ value: string; children: ReactElement[]; onChange: (event: { target: { value: string } }) => void }>;

  assert.equal(select.props.value, 'current');
  assert.deepEqual(select.props.children.map((option) => option.props.value), ['current', 'all-time']);
  select.props.onChange({ target: { value: 'all-time' } });
  assert.deepEqual(changes, ['all-time']);
});

test('Admin dashboard banner keeps its evaluation workspace destination', () => {
  const destinations: string[] = [];
  const banner = AdminDashboardControlBanner({ onNavigate: (page) => destinations.push(page) });
  const sharedBanner = banner.props.children as ReactElement<{ onAction?: () => void }>;

  sharedBanner.props.onAction?.();
  assert.deepEqual(destinations, ['survey-forms']);
});

test('Employee Home keeps its welcome copy and illustration after banner extraction', () => {
  const html = renderToStaticMarkup(createElement(EmployeeWorkspacePage, {
    view: 'Home',
    surveys: [],
    partnerCompanies: [],
    responses: [],
    userEmail: 'employee@example.com',
    isLoading: false,
    error: null,
    onNavigate: () => {},
    onStartEvaluation: () => {},
  }));

  assert.match(html, /Better partners\.<br\/>Better work, together\./);
  assert.match(html, /class="hero-art"/);
  assert.equal((html.match(/class="art-line"/g) ?? []).length, 3);
  assert.match(html, /Explore your evaluations/);
});

test('Admin dashboard keeps the protected banner and presents its work in an action-first ledger', () => {
  const html = renderToStaticMarkup(createElement(DashboardPage, {
    responses: [],
    allResponses: [{ responseId: 'response-1', surveyId: 'form-1', surveyType: 'Supplier', respondentType: 'Employee', submissionDate: '2026-10-20', company: 'Northstar Logistics', questionId: 'question-1', questionNumber: 1, question: 'How was the service?', questionCategory: 'Service', rating: 5, comment: '' }],
    partnerCompanies: [{
      id: 'partner-1',
      name: 'Northstar Logistics',
      type: 'Courier',
      createdAt: '2026-01-01',
      branches: [{ id: 'branch-1', bpCode: 'NORTHSTAR-1', documents: { 'Business Permit': { expiryDate: '2020-01-01' } } }],
    }],
    isLoading: false,
    error: null,
    surveyTypeFilter: [],
    surveys: [{ id: 'form-1', title: 'Quarterly Supplier Review', surveyType: 'Supplier', description: 'Quarterly review', createdAt: '2026-10-01', status: 'Running', questions: [] }],
    isAdmin: true,
    userEmail: 'admin@example.com',
    dataScope: 'current',
    onChangeDataScope: () => {},
    onOpenSurveyResponses: () => {},
    onNavigate: () => {},
  }));

  assert.match(html, /ADMINISTRATOR WORKSPACE/);
  assert.match(html, /Good to see you, Admin\./);
  assert.match(html, /Clear oversight\.<br\/>Better partnerships\./);
  assert.match(html, /Manage evaluations/);
  assert.match(html, /Operational overview/);
  assert.match(html, /Partners needing document review/);
  assert.match(html, /Partner documents/);
  assert.match(html, /Northstar Logistics/);
  assert.match(html, /Missing/);
  assert.match(html, /Evaluation forms in progress/);
  assert.match(html, /Recent submissions/);
  assert.match(html, /role="group" aria-label="Choose performance reporting period"/);
  assert.match(html, /aria-pressed="true" class="admin-dashboard-scope-button is-selected">Custom<\/button>/);
  assert.match(html, /aria-pressed="false" class="admin-dashboard-scope-button">All-Time<\/button>/);
  assert.match(html, /class="admin-dashboard-category-badge courier"/);
  assert.match(html, /class="admin-dashboard-category-badge supplier"/);
  assert.match(html, /class="admin-dashboard-record-link"[^>]*>Quarterly Supplier Review<\/button>/);
  assert.match(html, /class="admin-dashboard-record-link"[^>]*>Northstar Logistics<\/button>/);
  assert.equal((html.match(/class="admin-dashboard-record-link"/g) ?? []).length, 3);
  assert.match(html, /Evaluation results/);
  assert.match(html, /<table class="admin-dashboard-work-table admin-dashboard-document-table" aria-label="Partners requiring document follow-up">/);
  assert.match(html, /<table class="admin-dashboard-work-table admin-dashboard-form-table" aria-label="Evaluation forms in progress">/);
  assert.match(html, /<table class="admin-dashboard-performance-table" aria-label="Average partner evaluation score by type">/);
  assert.ok(html.indexOf('admin-dashboard-document-table') < html.indexOf('admin-dashboard-form-table'));
  assert.ok(html.indexOf('admin-dashboard-form-table') < html.indexOf('admin-dashboard-performance-table'));
  assert.ok(html.indexOf('admin-dashboard-performance-table') < html.indexOf('Recent submissions'));
  assert.ok(html.indexOf('admin-dashboard-footer') > html.indexOf('Recent submissions'));
  assert.match(html, /Microgenesis · Administrator workspace/);
  assert.match(html, /Partner evaluations/);
  assert.doesNotMatch(html, /admin-dashboard-workbench|admin-dashboard-operations|admin-dashboard-insights/);
  assert.doesNotMatch(html, /admin-dashboard-bottom-grid/);
  assert.doesNotMatch(html, /Additional dashboard widgets/);
  assert.doesNotMatch(html, /Administrative modules/);
});
