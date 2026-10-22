import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import config from '../postcss.config.js';

test('v4 stylesheet compilation retains the configured palette, effects, sibling spacing and accessible outlines', async () => {
  const styles = new URL('../src/styles.css', import.meta.url);
  const source = readFileSync(styles, 'utf8') + '\n@source inline("space-y-4 space-x-3 divide-y divide-x divide-slate-100 dark:divide-slate-800 sm:space-y-6 outline-none focus:outline-none shadow-sm rounded-sm blur-sm bg-blue-600 text-slate-900");';
  const result = await postcss(config.plugins).process(source, { from: fileURLToPath(styles), map: false });
  const root = postcss.parse(result.css);
  const rules = [];
  root.walkRules((rule) => rules.push(rule));
  function declarations(selector) {
    const matches = rules.filter((rule) => rule.selector.replace(/\s/g, '') === selector.replace(/\s/g, ''));
    assert.ok(matches.length, `Missing ${selector}`);
    const values = {};
    for (const rule of matches) rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
    return values;
  }
  const vertical = declarations('.space-y-4 > :not([hidden]) ~ :not([hidden])');
  assert.match(vertical['margin-top'], /1 - var\(--tw-space-y-reverse\)/);
  assert.match(vertical['margin-bottom'], /var\(--tw-space-y-reverse\)/);
  const horizontal = declarations('.space-x-3 > :not([hidden]) ~ :not([hidden])');
  assert.ok(horizontal['margin-left']);
  assert.ok(horizontal['margin-right']);
  const divider = declarations('.divide-y > :not([hidden]) ~ :not([hidden])');
  assert.match(divider['border-top-width'], /1 - var\(--tw-divide-y-reverse\)/);
  assert.match(declarations('.divide-x > :not([hidden]) ~ :not([hidden])')['border-left-width'], /1 - var\(--tw-divide-x-reverse\)/);
  assert.ok(rules.some((rule) => rule.selector.includes('dark\\:divide-slate-800') && rule.selector.includes(':not([hidden])')));
  assert.ok(rules.some((rule) => rule.selector.includes('sm\\:space-y-6') && rule.selector.includes(':not([hidden])')));
  assert.equal(declarations('.outline-none')['outline-style'], 'solid');
  assert.equal(declarations('.field')['outline-style'], 'solid');
  assert.equal(declarations('.bg-blue-600')['background-color'], '#2187cd');
  assert.equal(declarations('.text-slate-900').color, '#0f172a');
  assert.equal(declarations('.rounded-sm')['border-radius'], '.125rem');
  assert.match(declarations('.shadow-sm')['--tw-shadow'], /0 1px 2px/);
  assert.equal(declarations('.blur-sm')['--tw-blur'], 'blur(4px)');
});
