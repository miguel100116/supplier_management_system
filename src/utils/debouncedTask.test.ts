import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebouncedTask } from './debouncedTask';

test('bulk events debounce once, continuous events respect the deadline, and disposal cancels both timers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let runs = 0;
  const task = createDebouncedTask(() => runs++, 500, 1500);
  task.schedule();
  for (let i = 0; i < 100; i++) task.schedule();
  t.mock.timers.tick(499);
  assert.equal(runs, 0);
  t.mock.timers.tick(1);
  assert.equal(runs, 1);
  task.schedule();
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(400);
    task.schedule();
  }
  t.mock.timers.tick(300);
  assert.equal(runs, 2);
  task.schedule();
  task.cancel();
  t.mock.timers.tick(5000);
  assert.equal(runs, 2, 'no polling or pending work after disposal');
});
