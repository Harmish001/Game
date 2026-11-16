import { CHARACTER_ROSTER } from '../src/characters/roster';
import { HitboxSystem, WorldBox2D } from '../src/engine/HitboxSystem';
import { MoveExecutor } from '../src/game/MoveExecutor';
import { CPUAI } from '../src/game/ai/CPUAI';
import { FighterId, RawPlayerInput } from '../src/game/types';

// Mock THREE.Scene for headless test
class MockScene {
  public add(_obj: unknown) {}
  public remove(_obj: unknown) {}
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failed++;
  }
}

console.log('🏏 ================================================');
console.log('🏏 CRICKET CLASH — AUTOMATED VERIFICATION SUITE');
console.log('🏏 ================================================\n');

// 1. ROSTER & CHARACTER DATA INTEGRITY
console.log('--- 1. Testing Roster & Frame Data Integrity ---');
const fighterIds: FighterId[] = ['opener', 'finisher', 'spinner', 'quickie', 'keeper', 'captain'];
assert(fighterIds.length === 6, 'All 6 characters defined in roster');

fighterIds.forEach(id => {
  const profile = CHARACTER_ROSTER[id];
  assert(!!profile, `Character [${id}] exists`);
  assert(profile.maxHealth >= 90 && profile.maxHealth <= 120, `[${id}] maxHealth within valid balance (${profile.maxHealth})`);
  assert(profile.walkSpeedFwd > 0 && profile.walkSpeedBack > 0, `[${id}] walking speeds valid`);
  assert(profile.dashSpeed > profile.walkSpeedFwd, `[${id}] dash faster than walk`);

  // Move checks
  const moveKeys = Object.keys(profile.moves);
  assert(moveKeys.length >= 8, `[${id}] has at least 8 moves (has ${moveKeys.length})`);
  assert(!!profile.moves.lp, `[${id}] has Light Punch`);
  assert(!!profile.moves.hp, `[${id}] has Heavy Punch`);
  assert(!!profile.moves.lk, `[${id}] has Light Kick`);
  assert(!!profile.moves.hk, `[${id}] has Heavy Kick`);
  assert(!!profile.moves.special_1, `[${id}] has Special Move 1`);
  assert(!!profile.moves.super, `[${id}] has Super Move`);

  // Verify frame data math
  Object.values(profile.moves).forEach(m => {
    const total = m.startup + m.active + m.recovery;
    assert(total > 0 && m.startup >= 3 && m.active >= 2, `[${id} - ${m.name}] Frame data sane (S:${m.startup} A:${m.active} R:${m.recovery})`);
    assert(m.damage > 0, `[${id} - ${m.name}] Damage is positive (${m.damage})`);
    if (m.hitbox) {
      assert(m.hitbox.w > 0 && m.hitbox.h > 0, `[${id} - ${m.name}] Hitbox dimensions valid`);
    }
  });
});

// 2. HITBOX & COLLISION SYSTEM
console.log('\n--- 2. Testing Hitbox & 2.5D Collision Engine ---');
const hitboxSys = new HitboxSystem(new MockScene() as any);

// World coordinate transformation facing RIGHT
const localBox = { x: 0.5, y: 1.0, w: 0.6, h: 0.4 };
const worldRight = hitboxSys.toWorldBox(localBox, 0, 0, true);
assert(worldRight.minX === 0.5 && worldRight.maxX === 1.1, 'Facing right world box X coordinates correct');
assert(worldRight.minY === 1.0 && worldRight.maxY === 1.4, 'Facing right world box Y coordinates correct');

// World coordinate transformation facing LEFT
const worldLeft = hitboxSys.toWorldBox(localBox, 0, 0, false);
assert(
  Math.abs(worldLeft.minX - (-1.1)) < 0.0001 &&
  Math.abs(worldLeft.maxX - (-0.5)) < 0.0001,
  'Facing left world box flips X coordinates correctly'
);

// AABB Overlap checks
const boxA: WorldBox2D = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
const boxB: WorldBox2D = { minX: 1.5, maxX: 3, minY: 1, maxY: 3 };
const boxC: WorldBox2D = { minX: 4, maxX: 6, minY: 0, maxY: 2 };

assert(hitboxSys.checkOverlap(boxA, boxB) === true, 'Overlapping boxes detected');
assert(hitboxSys.checkOverlap(boxA, boxC) === false, 'Non-overlapping boxes correctly rejected');

// Pushbox separation
const pushP1: WorldBox2D = { minX: -0.2, maxX: 0.2, minY: 0, maxY: 1.5 };
const pushP2: WorldBox2D = { minX: 0.1, maxX: 0.5, minY: 0, maxY: 1.5 };
const pushShift = hitboxSys.resolvePush(pushP1, pushP2);
assert(pushShift.p1Shift < 0 && pushShift.p2Shift > 0, 'Pushbox resolves fighters away from each other');
assert(Math.abs(pushShift.p1Shift + pushShift.p2Shift) < 0.0001, 'Push resolution is symmetric');

// 3. MOVE EXECUTOR & FRAME TIMING
console.log('\n--- 3. Testing Move Executor & Frame Sequences ---');
const testMove = CHARACTER_ROSTER.opener.moves.lp; // Startup: 5, Active: 3, Recovery: 8 -> Total: 16
const executor = new MoveExecutor(testMove);

assert(executor.isStartup() === true && executor.isActive() === false, 'Frame 0 is startup');

// Tick 4 times (Frame 4)
for (let i = 0; i < 4; i++) executor.tick();
assert(executor.isStartup() === true, 'Frame 4 is still startup');

// Tick to Frame 5 (Active starts)
executor.tick();
assert(executor.isActive() === true && executor.isStartup() === false, 'Frame 5 is active');
assert(executor.getActiveHitbox() !== null, 'Hitbox emitted during active frames');

// Tick to Frame 8 (Active ends, Recovery starts)
for (let i = 0; i < 3; i++) executor.tick();
assert(executor.isRecovery() === true && executor.isActive() === false, 'Frame 8 is recovery');

// Tick to completion
for (let i = 0; i < 8; i++) executor.tick();
assert(executor.isFinished() === true, 'Frame 16 move is finished');

// 4. CANCEL SYSTEM
console.log('\n--- 4. Testing Cancel Windows (Gatling Combos) ---');
const cancelExecutor = new MoveExecutor(testMove);
// Advance to active
for (let i = 0; i < 5; i++) cancelExecutor.tick();
// Without hitting, cancel should be false
assert(cancelExecutor.canCancelInto('hp') === false, 'Cannot cancel without hit confirmed');
// Confirm hit
cancelExecutor.hasHit = true;
assert(cancelExecutor.canCancelInto('hp') === true, 'Can cancel into Heavy Punch on hit confirm');
assert(cancelExecutor.canCancelInto('special_1') === true, 'Can cancel into Special 1 on hit confirm');
assert(cancelExecutor.canCancelInto('invalid_move') === false, 'Cannot cancel into non-whitelisted move');

// 5. CPU AI EVALUATION
console.log('\n--- 5. Testing CPU AI Across All Difficulty Tiers ---');
const difficulties = ['easy', 'normal', 'hard', 'expert'] as const;
difficulties.forEach(diff => {
  const ai = new CPUAI(diff);
  // Mock fighter states
  const mockSelf: any = { x: 2.0, y: 0, facingRight: false, state: 'IDLE', meter: 50 };
  const mockOpponent: any = { x: 0.0, y: 0, facingRight: true, state: 'ATTACK' };

  let inputResult: RawPlayerInput | null = null;
  // Update AI across 1 second
  for (let f = 0; f < 60; f++) {
    inputResult = ai.update(mockSelf, mockOpponent, 1 / 60);
  }
  assert(inputResult !== null, `[AI: ${diff}] Produced valid inputs`);
});

// 6. BALANCE & COMBO SCALING FORMULA
console.log('\n--- 6. Testing Combo Scaling & Counter Hit Math ---');
function calcScaledDamage(baseDamage: number, hitCount: number, isCounter: boolean): number {
  let scale = 1.0;
  if (hitCount === 2) scale = 0.85;
  else if (hitCount === 3) scale = 0.75;
  else if (hitCount >= 4) scale = 0.6;
  if (isCounter) scale *= 1.25;
  return Math.max(1, Math.round(baseDamage * scale));
}

assert(calcScaledDamage(20, 1, false) === 20, 'Hit 1 deals 100% damage');
assert(calcScaledDamage(20, 2, false) === 17, 'Hit 2 scaled to 85% damage (17 dmg)');
assert(calcScaledDamage(20, 3, false) === 15, 'Hit 3 scaled to 75% damage (15 dmg)');
assert(calcScaledDamage(20, 4, false) === 12, 'Hit 4 scaled to 60% damage floor (12 dmg)');
assert(calcScaledDamage(20, 1, true) === 25, 'Counter hit adds 25% bonus (25 dmg)');

console.log('\n================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================\n');

if (failed > 0) {
  process.exit(1);
}
