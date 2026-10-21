import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmployeeWorkspacePage } from '../features/employee-experience/components/EmployeeWorkspacePage';
import { AdminDashboardControlBanner, DashboardDataScopeToggle, DashboardPage } from './DashboardPage';

Object.assign(globalThis, { React });

test('Admin dashboard period controls expose the current selection and preserve both scope actions', () => {
  const changes: Array<'current' | 'all-time'> = [];
  const control = DashboardDataScopeToggle({ scope: 'current', onChange: (scope) => changes.push(scope) });
  const buttons = control.props.children as ReactElement[];

  assert.equal(buttons[0].props['aria-pressed'], true);
  assert.equal(buttons[1].props['aria-pressed'], false);
  buttons.forEach((button) => (button.props as { onClick: () => void }).onClick());
  assert.deepEqual(changes, ['current', 'all-time']);
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

test('Admin dashboard keeps the banner workspace and operational section layout', () => {
  const html = renderToStaticMarkup(createElement(DashboardPage, {
    responses: [],
    allResponses: [],
    partnerCompanies: [{ id: 'partner-1', name: 'Northstar Logistics', type: 'Courier', createdAt: '2026-01-01', branches: [] }],
    isLoading: false,
    error: null,
    surveyTypeFilter: [],
    surveys: [],
    isAdmin: true,
    userEmail: 'admin@example.com',
    onNavigate: () => {},
  }));

  assert.match(html, /ADMINISTRATOR WORKSPACE/);
  assert.match(html, /Good to see you, Admin\./);
  assert.match(html, /Clear oversight\.<br\/>Better partnerships\./);
  assert.match(html, /Manage evaluations/);
  assert.match(html, /Document follow-up/);
  assert.match(html, /Northstar Logistics/);
  assert.match(html, /\d+ missing/);
  assert.match(html, /Forms in progress/);
  assert.match(html, /Recent submissions/);
  assert.match(html, /No evaluations have been submitted in the current period/);
  assert.match(html, /Evaluation snapshot/);
  assert.match(html, /<table class="admin-dashboard-performance-table" aria-label="Average partner evaluation score by type">/);
  assert.ok(html.indexOf('admin-dashboard-followup') < html.indexOf('admin-dashboard-snapshot'));
  assert.ok(html.indexOf('admin-dashboard-cycles') < html.indexOf('admin-dashboard-snapshot'));
  assert.ok(html.indexOf('admin-dashboard-snapshot') < html.indexOf('admin-dashboard-activity'));
  assert.doesNotMatch(html, /admin-dashboard-bottom-grid/);
  assert.doesNotMatch(html, /Additional dashboard widgets/);
  assert.doesNotMatch(html, /Administrative modules/);
});
