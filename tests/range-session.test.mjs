import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRangeSession } from '../src/range-session.js';

function harness(random = () => 0) {
  let time = 0;
  return { session: createRangeSession({ now: () => time, random }), advance: ms => { time += ms; } };
}

test('targets arrive individually while earlier targets remain alive', () => {
  const h = harness(); h.session.start({ limit: 5 });
  const first = h.session.snapshot.targets[0];
  assert.equal(h.session.snapshot.targets.length, 1);
  h.advance(349); assert.equal(h.session.snapshot.targets.length, 1);
  h.advance(1);
  const state = h.session.snapshot;
  assert.equal(state.targets.length, 2);
  assert.equal(state.targets[0].id, first.id);
  assert.deepEqual(state.targets.map(t => t.appearedAt), [0, 350]);
  assert.notEqual(state.targets[0].cell, state.targets[1].cell);
  h.session.shoot(first.id);
  assert.equal(h.session.snapshot.spawned, 2);
  h.advance(350); assert.equal(h.session.snapshot.spawned, 3);
});

test('every concurrency limit is respected without stacked targets or batch spawning', () => {
  for (let limit = 1; limit <= 5; limit++) {
    const h = harness(() => 0.99); h.session.start({ limit });
    let previousSpawned = 1;
    for (let i = 0; i < 400; i++) {
      h.advance(50); const state = h.session.snapshot;
      assert.ok(state.targets.length <= limit);
      assert.equal(new Set(state.targets.map(t => t.cell)).size, state.targets.length);
      assert.ok(state.targets.every(t => t.cell >= 0 && t.cell < 25));
      assert.ok(state.spawned - previousSpawned <= 1);
      previousSpawned = state.spawned;
    }
    assert.ok(h.session.snapshot.expired > 0);
    assert.ok(h.session.snapshot.spawned > limit);
  }
});

test('targets expire at their own 1-2 second deadline and expired clicks cannot hit', () => {
  for (const random of [() => 0, () => 0.999999]) {
    const h = harness(random); h.session.start({ limit: 5 });
    const first = h.session.snapshot.targets[0];
    assert.ok(first.lifetime >= 1000 && first.lifetime <= 2000);
    h.advance(first.lifetime - 1);
    assert.ok(h.session.snapshot.targets.some(t => t.id === first.id));
    h.advance(1); assert.equal(h.session.shoot(first.id), null);
    const state = h.session.snapshot;
    assert.equal(state.expired, 1); assert.equal(state.shots, 0);
    assert.ok(!state.targets.some(t => t.id === first.id));
    assert.ok(state.targets.length > 0);
  }
});

test('scoring uses individual appearance times and ignores repeated clicks', () => {
  const h = harness(); h.session.start();
  const first = h.session.snapshot.targets[0];
  h.advance(350); const second = h.session.snapshot.targets[1];
  h.advance(100);
  assert.equal(h.session.shoot(), false);
  assert.equal(h.session.shoot(first.id), true);
  assert.equal(h.session.shoot(first.id), null);
  h.advance(100); assert.equal(h.session.shoot(second.id), true);
  const state = h.session.snapshot;
  assert.equal(state.shots, 3); assert.equal(state.hits, 2);
  assert.equal(state.accuracy, 67); assert.equal(state.averageReaction, 325);
  assert.equal(state.spawned, 2); assert.equal(state.targets.length, 0);
});

test('delayed updates expire old targets and never spawn a catch-up batch', () => {
  const h = harness(); h.session.start({ limit: 5 });
  h.advance(350); h.session.snapshot;
  h.advance(350); h.session.snapshot;
  h.advance(5000); const state = h.session.snapshot;
  assert.equal(state.expired, 3); assert.equal(state.targets.length, 1);
  assert.equal(state.spawned, 4); assert.equal(state.targets[0].appearedAt, 5700);
  assert.equal(h.session.snapshot.spawned, 4);
});

test('all six durations stop at the session deadline and reject further shots', () => {
  for (let minutes = 0.5; minutes <= 3; minutes += 0.5) {
    const h = harness(); h.session.start({ minutes });
    h.advance(minutes * 60000 - 1);
    assert.equal(h.session.snapshot.status, 'running');
    const id = h.session.snapshot.targets[0].id;
    h.advance(1); assert.equal(h.session.shoot(id), null);
    const state = h.session.snapshot;
    assert.equal(state.status, 'finished'); assert.equal(state.remaining, 0);
    assert.equal(state.shots, 0); assert.deepEqual(state.targets, []);
  }
});

test('pause freezes lifetimes, spawn cadence, session time and reaction time', () => {
  const h = harness(); h.session.start(); h.advance(200);
  const first = h.session.snapshot.targets[0];
  h.session.pause(); h.session.pause(); h.advance(90000);
  assert.equal(h.session.snapshot.remaining, 59800);
  assert.deepEqual(h.session.snapshot.targets, [first]);
  assert.equal(h.session.shoot(first.id), null);
  h.session.resume(); h.session.resume(); h.advance(149);
  assert.equal(h.session.snapshot.targets.length, 1);
  h.advance(1); assert.equal(h.session.snapshot.targets.length, 2);
  assert.equal(h.session.shoot(first.id), true);
  assert.equal(h.session.snapshot.averageReaction, 350);
  h.session.pause(); h.advance(10000); h.session.resume();
  h.advance(1000); assert.equal(h.session.snapshot.expired, 1);
  h.advance(58650); assert.equal(h.session.snapshot.status, 'finished');
});

test('finish and restart reset scores and never reuse old target ids', () => {
  const h = harness(); h.session.start(); const oldId = h.session.snapshot.targets[0].id;
  h.session.shoot(oldId); h.advance(3000); h.session.pause(); h.session.finish();
  assert.equal(h.session.snapshot.status, 'finished'); assert.equal(h.session.snapshot.hits, 1);
  h.session.start({ minutes: 3, limit: 2 }); const state = h.session.snapshot;
  assert.equal(state.remaining, 180000); assert.equal(state.hits, 0);
  assert.equal(state.shots, 0); assert.equal(state.spawned, 1); assert.equal(state.expired, 0);
  assert.equal(h.session.shoot(oldId), null);
});

test('invalid durations and target limits are rejected', () => {
  const { session } = harness();
  for (const minutes of [0, 0.6, 3.5, NaN, Infinity]) assert.throws(() => session.start({ minutes }), RangeError);
  for (const limit of [0, 6, 1.5, NaN]) assert.throws(() => session.start({ limit }), RangeError);
});
