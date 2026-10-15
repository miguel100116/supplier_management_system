import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RatingScale } from './RatingScale';

function renderScale(props: Partial<React.ComponentProps<typeof RatingScale>> = {}) {
  return renderToStaticMarkup(
    <RatingScale
      questionId="Q1"
      questionOrder={0}
      min={0}
      max={4}
      allowNa
      value={undefined}
      onChange={() => undefined}
      label="Rating for question 1"
      {...props}
    />,
  );
}

test('rating scale keeps zero and N/A as distinct selectable values on a 0–4 scale', () => {
  const markup = renderScale({ value: 0 });
  assert.match(markup, /role="radiogroup" aria-label="Rating for question 1"/);
  assert.equal((markup.match(/role="radio"/g) ?? []).length, 6);
  assert.match(markup, /id="rating-btn-Q1-0"[^>]*aria-checked="true"/);
  assert.match(markup, /id="rating-btn-Q1-N\/A"[^>]*aria-label="Not applicable"/);
  assert.match(markup, />N\/A<span class="rating-option-description">Not applicable<\/span><\/button>/);
});

test('rating scale respects a configured 1–7 range and omits N/A when disallowed', () => {
  const markup = renderScale({ min: 1, max: 7, allowNa: false });
  assert.equal((markup.match(/role="radio"/g) ?? []).length, 7);
  assert.match(markup, /id="rating-btn-Q1-1"/);
  assert.match(markup, /id="rating-btn-Q1-7"/);
  assert.doesNotMatch(markup, /rating-btn-Q1-0|N\/A/);
});
