import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHoldFire } from '../src/hold-fire.js';

function harness(rate = 600) {
  let time = 0, id = 0;
  const tasks = new Map(), shots = [];
  const controller = createHoldFire({ rate, now: () => time, fire: () => shots.push(time),
    schedule: (fn, delay) => { const key = ++id; tasks.set(key, { fn, due: time + delay }); return key; },
    cancel: key => tasks.delete(key),
  });
  return { controller, shots, tasks,
    advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...tasks].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > end) break;
        time = next[1].due; tasks.delete(next[0]); next[1].fn();
      }
      time = end;
    },
    stall(ms) { time += ms; const pending = [...tasks.values()]; tasks.clear(); pending.forEach(task => task.fn()); },
  };
}
test('tap fires once, hold respects cadence, release cancels future shots', () => {
  const h = harness(); h.controller.start(); h.advance(30); h.controller.stop(); h.advance(500);
  assert.deepEqual(h.shots, [0]);
  h.controller.start(); h.advance(250); h.controller.stop();
  assert.deepEqual(h.shots, [0, 530, 630, 730]);
  h.advance(1000); assert.equal(h.shots.length, 4); assert.equal(h.tasks.size, 0);
});
test('rate changes while held reschedule one timer; repeated starts never duplicate', () => {
  const h = harness(); h.controller.start(); h.controller.start(); h.advance(40);
  h.controller.setRate(1200); h.advance(110);
  assert.deepEqual(h.shots, [0, 50, 100, 150]); assert.equal(h.tasks.size, 1);
  h.controller.setRate(120); h.advance(500);
  assert.equal(h.shots.at(-1), 650); h.controller.stop(); assert.equal(h.tasks.size, 0);
});
test('delayed timer fires once and does not replay a backlog', () => {
  const h = harness(); h.controller.start(); h.stall(3000);
  assert.deepEqual(h.shots, [0, 3000]); assert.equal(h.tasks.size, 1);
  h.advance(100); assert.deepEqual(h.shots, [0, 3000, 3100]); h.controller.stop();
});
