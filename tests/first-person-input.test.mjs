import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstPersonInput } from '../src/first-person-input.js';

function setup({ lockAvailable = false } = {}) {
  const canvas = new EventTarget(), doc = new EventTarget(), win = new EventTarget();
  const moves = [], states = [];
  let shots = 0, held = false, active = true;
  doc.pointerLockElement = null;
  doc.querySelector = () => null;
  canvas.hasPointerCapture = () => false;
  canvas.requestPointerLock = () => {
    if (!lockAvailable) return Promise.reject(new Error('Pointer Lock unavailable'));
    doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange'));
  };
  doc.exitPointerLock = () => {
    doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange'));
  };
  const input = createFirstPersonInput({ canvas, document: doc, window: win,
    isActive: () => active, move: (x, y) => moves.push([x, y]),
    firing: { startFiring() { shots++; held = true; }, stopFiring() { held = false; } },
    onChange: (looking, locked) => states.push({ looking, locked }),
  });
  const emit = (target, type, values = {}) => target.dispatchEvent(Object.assign(new Event(type), values));
  return { canvas, doc, win, moves, states, input, emit, get shots() { return shots; }, get held() { return held; }, deactivate() { active = false; } };
}

test('mouse moves with no buttons pressed turn the view even when Pointer Lock is unavailable', async () => {
  const s = setup(); s.input.resume(); await Promise.resolve();
  s.emit(s.canvas, 'pointermove', { clientX: 100, clientY: 100, pointerType: 'mouse', buttons: 0 });
  s.emit(s.canvas, 'pointermove', { clientX: 160, clientY: 120, pointerType: 'mouse', buttons: 0 });
  assert.deepEqual(s.moves, [[60, 20]]);
  assert.equal(s.shots, 0); assert.equal(s.held, false);
  s.emit(s.canvas, 'pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse' });
  assert.equal(s.shots, 1);
  s.emit(s.win, 'pointerup', { pointerId: 1 });
  s.emit(s.canvas, 'pointermove', { clientX: 170, clientY: 110, pointerType: 'mouse', buttons: 0 });
  assert.equal(s.held, false); assert.deepEqual(s.moves.at(-1), [10, -10]);
});

test('locked mouse movement is independent of shooting; Escape pauses both until explicit resume', () => {
  const s = setup({ lockAvailable: true }); s.input.resume();
  s.emit(s.doc, 'mousemove', { movementX: 25, movementY: -7, buttons: 0 });
  assert.deepEqual(s.moves, [[25, -7]]); assert.equal(s.shots, 0);
  s.emit(s.canvas, 'pointerdown', { button: 0, pointerId: 1 });
  s.emit(s.doc, 'keydown', { key: 'Escape' });
  assert.equal(s.input.looking, false); assert.equal(s.held, false); assert.equal(s.doc.pointerLockElement, null);
  s.emit(s.doc, 'mousemove', { movementX: 30, movementY: 30 });
  s.emit(s.canvas, 'pointerdown', { button: 0, pointerId: 1 });
  assert.equal(s.moves.length, 1); assert.equal(s.shots, 1);
  s.input.resume(); assert.equal(s.shots, 1, 'resuming observation must not fire');
  s.emit(s.doc, 'mousemove', { movementX: 8, movementY: 3, buttons: 0 });
  assert.deepEqual(s.moves.at(-1), [8, 3]);
});

test('browser Escape unlock and window blur stop control without a stuck trigger', () => {
  const s = setup({ lockAvailable: true }); s.input.resume();
  s.emit(s.canvas, 'pointerdown', { button: 0, pointerId: 1 });
  s.doc.exitPointerLock();
  assert.equal(s.input.looking, false); assert.equal(s.held, false);
  s.input.resume(); s.emit(s.win, 'blur');
  assert.equal(s.input.looking, false); assert.equal(s.doc.pointerLockElement, null);
  s.deactivate(); s.input.resume(); assert.equal(s.input.looking, false);
});
