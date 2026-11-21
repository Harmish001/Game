/**
 * Headless smoke: rising-edge + changeState same-state no-op + move window.
 * Run: node scripts/mech-smoke.mjs
 */
import assert from 'node:assert/strict';

// --- Mirror pressed / same-state rules without importing THREE ---
function makePressed(prev) {
  return (input, btn) => !!input[btn] && !prev[btn];
}

{
  const prev = { lp: false, hp: false, lk: false, hk: false };
  const pressed = makePressed(prev);
  assert.equal(pressed({ lp: true }, 'lp'), true);
  prev.lp = true;
  assert.equal(pressed({ lp: true }, 'lp'), false, 'hold must not re-fire');
  prev.lp = false;
  assert.equal(pressed({ lp: true }, 'lp'), true, 're-press fires');
}

{
  // same-state no-op
  let state = 'IDLE';
  let frames = 5;
  const change = (next) => {
    if (state === next && next !== 'ATTACK') return;
    state = next;
    frames = 0;
  };
  change('IDLE');
  assert.equal(frames, 5, 'IDLE→IDLE must not reset frames');
  change('CROUCH_START');
  assert.equal(state, 'CROUCH_START');
  assert.equal(frames, 0);
  frames = 3;
  change('CROUCH_START');
  assert.equal(frames, 3, 'CROUCH_START→CROUCH_START keep frames');
}

{
  // visual damage window shape
  const move = { startup: 10, active: 4, recovery: 12, hitbox: {} };
  const windupEnd = Math.max(1, Math.floor(move.startup * 0.45));
  const activeEnd = move.startup + move.active + Math.max(1, Math.floor(move.recovery * 0.15));
  assert.equal(windupEnd, 4);
  assert.ok(activeEnd > move.startup + move.active);
  assert.ok(5 >= windupEnd && 5 < activeEnd);
  assert.ok(!(3 >= windupEnd && 3 < activeEnd));
}

console.log('mech-smoke OK');
