import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssignmentCompletionModal } from './AssignmentCompletionModal';

Object.assign(globalThis, { React });

test('assignment dialog exposes assigned employee identities, counts and company status without mutation controls', () => {
  const html = renderToStaticMarkup(createElement(AssignmentCompletionModal, {
    title: 'Courier evaluation', onClose: () => {}, progress: { completed: 1, required: 2, percentage: 50 },
    employees: [{ email: 'employee@mgenesis.com', department: 'TASS', designation: 'Director', completed: 1, total: 2,
      companies: [{ id: 'done', name: 'Completed partner', completed: true }, { id: 'pending', name: 'Pending partner', completed: false }] }],
  }));
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /1 of 2 assignments completed · 50%/);
  assert.match(html, /employee@mgenesis.com/);
  assert.match(html, /TASS · Director/);
  assert.match(html, />1 \/ 2</);
  assert.match(html, /Completed partner<\/span><span>Completed/);
  assert.match(html, /Pending partner<\/span><span>Pending/);
  assert.doesNotMatch(html, /Mark complete|Delete|Save changes/);
});

test('assignment dialog distinguishes no eligible employees from unavailable data', () => {
  const render = (known: boolean) => renderToStaticMarkup(createElement(AssignmentCompletionModal, {
    title: 'Evaluation', onClose: () => {}, employees: known ? [] : null,
    progress: known ? { completed: 0, required: 0, percentage: null } : null,
  }));
  assert.match(render(true), /No employees currently have permission/);
  assert.match(render(true), /No required assignments/);
  assert.match(render(false), /Employee access information is unavailable/);
  assert.doesNotMatch(render(false), /No required assignments/);
});
