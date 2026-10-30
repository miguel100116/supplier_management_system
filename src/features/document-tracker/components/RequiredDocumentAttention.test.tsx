import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import test from 'node:test';
import { RequiredDocumentAttention } from './RequiredDocumentAttention';

Object.assign(globalThis, { React });

test('attention summary stays read-only without a filter callback', () => {
  const html = renderToStaticMarkup(<RequiredDocumentAttention counts={{ missing: 4, expired: 1, forUpdate: 1 }} />);
  assert.match(html, /Required document attention summary/);
  assert.doesNotMatch(html, /<button|aria-pressed/);
});

test('only the selected attention filter remains available after its count becomes zero', () => {
  const html = renderToStaticMarkup(<RequiredDocumentAttention counts={{ missing: 0, expired: 0, forUpdate: 0 }} value="Missing" onChange={() => {}} />);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, />0<\/strong> missing/);
});

test('an empty attention summary adds no controls or empty container', () => {
  assert.equal(renderToStaticMarkup(<RequiredDocumentAttention counts={{ missing: 0, expired: 0, forUpdate: 0 }} onChange={() => {}} />), '');
});
