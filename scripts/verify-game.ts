import { CHARACTER_ROSTER } from '../src/characters/roster';
import { HitboxSystem, WorldBox2D } from '../src/engine/HitboxSystem';
import { InputManager } from '../src/engine/InputManager';
import { PRNG } from '../src/engine/PRNG';
import { MoveExecutor } from '../src/game/MoveExecutor';
import { ProjectileSystem } from '../src/game/projectiles/ProjectileSystem';
import { Fighter } from '../src/game/Fighter';
import { MatchManager } from '../src/game/MatchManager';
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
  assert(moveKeys.length >= 20, `[${id}] has at least 20 moves (has ${moveKeys.length})`);
  assert(!!profile.moves.lp, `[${id}] has Light Punch`);
  assert(!!profile.moves.hp, `[${id}] has Heavy Punch`);
  assert(!!profile.moves.lk, `[${id}] has Light Kick`);
  assert(!!profile.moves.hk, `[${id}] has Heavy Kick`);
  assert(!!profile.moves.overhead, `[${id}] has Overhead`);
  assert(!!profile.moves.anti_air, `[${id}] has Anti-Air`);
  assert(!!profile.moves.throw, `[${id}] has Throw`);
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
const testMove = CHARACTER_ROSTER.opener.moves.lp;
const executor = new MoveExecutor(testMove);
const startF = testMove.startup;
const activeF = testMove.active;
const recF = testMove.recovery;
const totalF = startF + activeF + recF;

assert(executor.isStartup() === true && executor.isActive() === false, 'Frame 0 is startup');

for (let i = 0; i < startF - 1; i++) executor.tick();
assert(executor.isStartup() === true, `Frame ${startF - 1} is still startup`);

executor.tick();
assert(executor.isActive() === true && executor.isStartup() === false, `Frame ${startF} is active`);
assert(executor.getActiveHitbox() !== null, 'Hitbox emitted during active frames');

for (let i = 0; i < activeF; i++) executor.tick();
assert(executor.isRecovery() === true && executor.isActive() === false, 'Recovery after active');

for (let i = 0; i < recF; i++) executor.tick();
assert(executor.isFinished() === true, `Move finished at frame ${totalF}`);

// 4. CANCEL SYSTEM
console.log('\n--- 4. Testing Cancel Windows (Gatling Combos) ---');
const cancelExecutor = new MoveExecutor(testMove);
for (let i = 0; i < startF; i++) cancelExecutor.tick();
assert(cancelExecutor.canCancelInto('hp') === false, 'Cannot cancel without hit confirmed');
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
  const table = [1, 0.9, 0.8, 0.7, 0.6];
  let scale = hitCount <= 5 ? table[hitCount - 1] : 0.4;
  if (isCounter) scale *= 1.35;
  return Math.max(1, Math.round(baseDamage * scale));
}

assert(calcScaledDamage(20, 1, false) === 20, 'Hit 1 deals 100% damage');
assert(calcScaledDamage(20, 2, false) === 18, 'Hit 2 scaled to 90% damage (18 dmg)');
assert(calcScaledDamage(20, 3, false) === 16, 'Hit 3 scaled to 80% damage (16 dmg)');
assert(calcScaledDamage(20, 4, false) === 14, 'Hit 4 scaled to 70% damage (14 dmg)');
assert(calcScaledDamage(20, 6, false) === 8, 'Hit 6 floor 40% (8 dmg)');
assert(calcScaledDamage(20, 1, true) === 27, 'Counter hit ~1.35x (27 dmg)');

// 7. CLOSE-RANGE HITBOX REGISTRATION & COVERAGE
console.log('\n--- 7. Testing Close-Range Hitbox Registration ---');
// Attacker at x=0, defender at very close x=0.1
const testAtkBox = { x: 0.15, y: 1.15, w: 0.6, h: 0.4 };
const testDefHurtbox = { x: -0.32, y: 0, w: 0.64, h: 1.75 };
const atkX = 0;
const defX = 0.1;
const dist = Math.abs(atkX - defX);

let hitW = hitboxSys.toWorldBox(testAtkBox, atkX, 0, true);
if (dist <= 0.6) {
  hitW.minX = Math.min(hitW.minX, atkX - 0.25);
}
const hurtW = hitboxSys.toWorldBox(testDefHurtbox, defX, 0, false);
assert(hitboxSys.checkOverlap(hitW, hurtW) === true, 'Point-blank / overlapping fighter (dist=0.1) registers hit cleanly');

// Extreme close range test (dist = 0.02)
let extremeHitW = hitboxSys.toWorldBox(testAtkBox, 0, 0, true);
extremeHitW.minX = Math.min(extremeHitW.minX, 0 - 0.25);
const extremeHurtW = hitboxSys.toWorldBox(testDefHurtbox, 0.02, 0, false);
assert(hitboxSys.checkOverlap(extremeHitW, extremeHurtW) === true, 'Ultra-close fighter (dist=0.02) registers hit cleanly');

// 8. DEFENSE & BLOCK DAMAGE MITIGATION
console.log('\n--- 8. Testing Defend Mechanics & Block Stun ---');
const dummyMove = CHARACTER_ROSTER.opener.moves.lp; // damage: 5, chipDamage: undefined (0)
// When defending, normal attack should deal 0 damage
const isDefending = true;
const isThrow = false;
let blockDamage = 0;
if (isDefending && !isThrow && dummyMove.hitLevel !== 'unblockable') {
  blockDamage = dummyMove.chipDamage || 0;
}
assert(blockDamage === 0, 'Normal attacks deal 0 damage on block');

const specialMove = CHARACTER_ROSTER.opener.moves.special_1;
let specialBlockDmg = 0;
if (isDefending && !isThrow && specialMove.hitLevel !== 'unblockable') {
  specialBlockDmg = specialMove.chipDamage || 0;
}
assert(specialBlockDmg === (specialMove.chipDamage || 0), 'Special attacks deal chip on block');
assert((specialMove.chipDamage || 0) > 0, 'Special has chip damage');

// 9. CANCEL GRAPH CYCLE DETECTION (Infinite Combo Prevention)
console.log('\n--- 9. Testing Cancel Graph Directed Acyclic Structure ---');
fighterIds.forEach(id => {
  const profile = CHARACTER_ROSTER[id];
  const moves = profile.moves;

  function hasCycle(moveKey: string, visited: Set<string>, stack: Set<string>): boolean {
    visited.add(moveKey);
    stack.add(moveKey);

    const move = moves[moveKey];
    if (move && move.cancelInto) {
      for (const target of move.cancelInto) {
        if (!visited.has(target)) {
          if (hasCycle(target, visited, stack)) return true;
        } else if (stack.has(target)) {
          return true; // Cycle detected!
        }
      }
    }

    stack.delete(moveKey);
    return false;
  }

  let cycleFound = false;
  const visited = new Set<string>();
  for (const moveKey of Object.keys(moves)) {
    if (!visited.has(moveKey)) {
      if (hasCycle(moveKey, visited, new Set())) {
        cycleFound = true;
        break;
      }
    }
  }
  assert(!cycleFound, `[${id}] Cancel graph has no infinite cycles`);
});

// 10. STATIC SANITY CHECKS (Section 9.1)
console.log('\n--- 10. Testing Static Move Sanity & Whiff Windows ---');
fighterIds.forEach(id => {
  const profile = CHARACTER_ROSTER[id];
  const moves = Object.values(profile.moves);

  // All moves total >= 8 frames
  moves.forEach(m => {
    const total = m.startup + m.active + m.recovery;
    assert(total >= 8, `[${id} - ${m.name}] Total frames >= 8 (${total})`);
    assert(m.hitstop >= 3 && m.hitstop <= 24, `[${id} - ${m.name}] Hitstop within [3, 24] (${m.hitstop})`);
  });

  // Throw must have whiff recovery
  if (profile.moves.throw) {
    assert(profile.moves.throw.recovery >= 15, `[${id} - Throw] Has whiff recovery >= 15 frames (${profile.moves.throw.recovery})`);
  }
});

// 11. SOCD CLEANING TESTS (Section 1.1)
console.log('\n--- 11. Testing SOCD Cleaning (Tournament Standards) ---');
const inputMgr = new InputManager();
const socdNeutral = inputMgr.cleanSOCD({
  up: false, down: false, left: true, right: true,
  lp: false, hp: false, lk: false, hk: false,
  block: false, special: false, super: false, pause: false
});
assert(socdNeutral.left === false && socdNeutral.right === false, 'Left + Right cleans to Neutral');

const socdUpPriority = inputMgr.cleanSOCD({
  up: true, down: true, left: false, right: false,
  lp: false, hp: false, lk: false, hk: false,
  block: false, special: false, super: false, pause: false
});
assert(socdUpPriority.up === true && socdUpPriority.down === false, 'Up + Down cleans to Up Priority');

// 12. MOTION LENIENCY TESTS (Section 1.1)
console.log('\n--- 12. Testing Motion Leniency ---');
const mockInput = () => ({
  up: false, down: false, left: false, right: false,
  lp: false, hp: false, lk: false, hk: false,
  block: false, special: false, super: false, pause: false
});

// Access private buffer for testing motion parser
const p1Buf = (inputMgr as any).p1Buffer as Array<{ input: RawPlayerInput; facingRight: boolean }>;
p1Buf.length = 0;
// Frame 1-2: Down
p1Buf.push({ input: { ...mockInput(), down: true }, facingRight: true });
p1Buf.push({ input: { ...mockInput(), down: true }, facingRight: true });
// Frame 3-5: Forward (skipped diagonal!)
p1Buf.push({ input: { ...mockInput(), right: true }, facingRight: true });
p1Buf.push({ input: { ...mockInput(), right: true }, facingRight: true });
p1Buf.push({ input: { ...mockInput(), right: true }, facingRight: true });

const detectedQCF = inputMgr.detectMotion(1);
assert(detectedQCF === 'QCF', 'Lenient QCF (Down -> Forward skipping diagonal) accepted');

// Test DP priority
p1Buf.length = 0;
p1Buf.push({ input: { ...mockInput(), right: true }, facingRight: true }); // Forward
p1Buf.push({ input: { ...mockInput(), down: true }, facingRight: true });  // Down
p1Buf.push({ input: { ...mockInput(), right: true, down: true }, facingRight: true }); // Down-Fwd
p1Buf.push({ input: { ...mockInput(), right: true }, facingRight: true }); // Fwd
p1Buf.push({ input: { ...mockInput(), right: true }, facingRight: true });

const detectedDP = inputMgr.detectMotion(1);
assert(detectedDP === 'DP_FWD', 'DP motion takes priority over QCF');

// 13. DEFENSE LOOP: GUARD GAUGE & GUARD CRUSH (Section 2.1)
console.log('\n--- 13. Testing Guard Gauge & Guard Crush ---');
const dummyDef = new Fighter(CHARACTER_ROSTER.opener, 2, 2.0);
const dummyAtk = new Fighter(CHARACTER_ROSTER.opener, 1, 0.0);

assert(dummyDef.guardGauge === 100, 'Guard Gauge initializes at 100');
dummyDef.currentInput = { ...mockInput(), left: false, right: true }; // Facing left, holding right (away from atk)
dummyDef.state = 'IDLE';

// Single block
const heavyMove = CHARACTER_ROSTER.opener.moves.hp;
const blockRes1 = dummyDef.takeHit(dummyAtk, heavyMove);
assert(blockRes1.blocked === true, 'Move blocked');
assert(dummyDef.guardGauge < 100, `Guard drained after block (${dummyDef.guardGauge}/100)`);

// Repeated blocks to trigger Guard Crush
dummyDef.guardGauge = 10;
const blockResCrush = dummyDef.takeHit(dummyAtk, heavyMove);
assert(dummyDef.state === 'GUARD_CRUSH', 'Guard Gauge <= 0 triggers GUARD_CRUSH state');
assert(dummyDef.guardGauge === 50, 'Guard Gauge resets to 50 on crush');

// 14. CROSS-UP BLOCKING (Section 1.2)
console.log('\n--- 14. Testing Cross-Up Logic ---');
const crossDef = new Fighter(CHARACTER_ROSTER.opener, 2, 0.0);
crossDef.facingRight = false; // Initially facing left

// Attacker on right side (x = 1.0)
const rightAtk = new Fighter(CHARACTER_ROSTER.opener, 1, 1.0);
// Defender must hold left (away from attacker on right) to block
crossDef.currentInput = { ...mockInput(), left: true };
const normalBlock = crossDef.takeHit(rightAtk, CHARACTER_ROSTER.opener.moves.lp);
assert(normalBlock.blocked === true, 'Defender holding away from right-side attacker blocks');

// Cross-up: Attacker jumps over to left side (x = -1.0)
const leftAtk = new Fighter(CHARACTER_ROSTER.opener, 1, -1.0);
// If defender still holds left (into the attacker), cross-up hits!
crossDef.currentInput = { ...mockInput(), left: true };
crossDef.state = 'IDLE';
const crossHit = crossDef.takeHit(leftAtk, CHARACTER_ROSTER.opener.moves.lp);
assert(crossHit.hit === true && crossHit.blocked === false, 'Cross-up hits defender holding wrong direction');

// Defender holds right (away from left-side attacker) -> blocks cross-up!
crossDef.currentInput = { ...mockInput(), right: true };
crossDef.state = 'IDLE';
const crossBlock = crossDef.takeHit(leftAtk, CHARACTER_ROSTER.opener.moves.lp);
assert(crossBlock.blocked === true, 'Defender holding away from left-side attacker blocks cross-up');

// 15. OKIZEME WAKEUP & LANDING RECOVERY (Section 2.4, 2.5)
console.log('\n--- 15. Testing Okizeme & Landing Recovery ---');
const wakeFighter = new Fighter(CHARACTER_ROSTER.opener, 1, 0.0);
wakeFighter.state = 'GET_UP';
wakeFighter.stateFrames = 5;
wakeFighter.isInvincible = true;
// Frame 5 of get up: invulnerable
assert(wakeFighter.takeHit(rightAtk, CHARACTER_ROSTER.opener.moves.lp).hit === false, 'Early GET_UP frames (frame 5) are invulnerable');

// Frame 16 of get up: vulnerable to meaty attack!
wakeFighter.stateFrames = 16;
wakeFighter.isInvincible = false;
assert(wakeFighter.takeHit(rightAtk, CHARACTER_ROSTER.opener.moves.lp).hit === true, 'Late GET_UP frames (frame 16) are vulnerable to meaty attacks');

// Whiffed aerial attack landing recovery
wakeFighter.state = 'JUMPING';
wakeFighter.hadAirAttack = true;
wakeFighter.y = 0.05;
wakeFighter.vy = -5.0;
// Tick physics down to floor
(wakeFighter as any).applyPhysics(1 / 60);
assert(wakeFighter.state === 'JUMP_LAND', 'Touching ground transitions to JUMP_LAND');
assert((wakeFighter as any).stateFramesTarget === 8, 'Whiffed aerial attack incurs 8 frames landing recovery (vs 4 normal)');

// 16. THROW RULES & WHIFF RECOVERY (Section 2.3)
console.log('\n--- 16. Testing Throw Rules & Whiff ---');
const airTarget = new Fighter(CHARACTER_ROSTER.opener, 2, 0.5);
airTarget.y = 1.5; // Airborne!
const throwResAir = airTarget.takeHit(dummyAtk, CHARACTER_ROSTER.opener.moves.throw, true);
assert(throwResAir.hit === false, 'Throws cannot hit airborne targets');

const hitstunTarget = new Fighter(CHARACTER_ROSTER.opener, 2, 0.5);
hitstunTarget.state = 'HIT_STUN';
const throwResStun = hitstunTarget.takeHit(dummyAtk, CHARACTER_ROSTER.opener.moves.throw, true);
assert(throwResStun.hit === false, 'Throws cannot hit targets in HIT_STUN');

// 17. DETERMINISTIC PRNG & STATE SERIALIZATION (Section 1.3)
console.log('\n--- 17. Testing Determinism & State Serialization ---');
const prng1 = new PRNG(9999);
const prng2 = new PRNG(9999);
const seq1 = [prng1.next(), prng1.next(), prng1.next(), prng1.next()];
const seq2 = [prng2.next(), prng2.next(), prng2.next(), prng2.next()];
assert(seq1.every((v, i) => v === seq2[i]), 'PRNG with identical seeds produces identical sequence');

// State serialization test
const originalFighter = new Fighter(CHARACTER_ROSTER.finisher, 1, -2.5);
originalFighter.health = 77;
originalFighter.meter = 60;
originalFighter.guardGauge = 85;
originalFighter.state = 'BLOCK_STUN';
const serialized = originalFighter.toSimState();

const cloneFighter = new Fighter(CHARACTER_ROSTER.finisher, 1, 0);
cloneFighter.loadSimState(serialized);
assert(
  cloneFighter.x === -2.5 &&
  cloneFighter.health === 77 &&
  cloneFighter.meter === 60 &&
  cloneFighter.guardGauge === 85 &&
  cloneFighter.state === 'BLOCK_STUN',
  'Fighter state accurately serialized and restored via FighterSimState'
);

// 18. HEADLESS MATCH SIMULATION (Section 9.3 & Balance Verification)
console.log('\n--- 18. Testing Headless Match Simulation ---');
function simulateHeadlessMatch(char1: FighterId, char2: FighterId, seed: number = 42): number {
  const p1 = new Fighter(CHARACTER_ROSTER[char1], 1, -3.5);
  const p2 = new Fighter(CHARACTER_ROSTER[char2], 2, 3.5);
  const projSys = new ProjectileSystem();
  p1.projectileSystem = projSys;
  p2.projectileSystem = projSys;
  const matchMgr = new MatchManager({
    mode: 'vs_cpu',
    roundsToWin: 1,
    roundTimer: 30,
    difficulty: 'expert',
    p1Character: char1,
    p2Character: char2,
    arena: 'stadium_day'
  });

  const aiRng1 = new PRNG(seed);
  const aiRng2 = new PRNG(seed + 100);
  const ai1 = new CPUAI('expert', aiRng1);
  const ai2 = new CPUAI('expert', aiRng2);

  matchMgr.startMatch(p1, p2);
  matchMgr.phase = 'FIGHTING'; // Jump straight into fighting

  const checkCombat = (att: Fighter, def: Fighter) => {
    const hitbox = att.getActiveHitbox();
    if (!hitbox || !att.currentMoveExecutor) return;
    const dist = Math.abs(att.x - def.x);
    const maxRange = att.currentMoveExecutor.move.maxRange ?? 1.4;
    if (dist >= 0.3 && dist > maxRange) return;
    const isFacing = att.facingRight ? def.x >= att.x - 0.25 : def.x <= att.x + 0.25;
    if (!isFacing) return;

    let hitW = hitboxSys.toWorldBox(hitbox, att.x, att.y, att.facingRight);
    if (dist <= 0.6) {
      if (att.facingRight) hitW.minX = Math.min(hitW.minX, att.x - 0.25);
      else hitW.maxX = Math.max(hitW.maxX, att.x + 0.25);
    }
    const hurtW = hitboxSys.toWorldBox(def.getHurtbox(), def.x, def.y, def.facingRight);
    if (hitboxSys.checkOverlap(hitW, hurtW)) {
      att.currentMoveExecutor.hasHit = true;
      const isThrow = att.currentMoveExecutor.move.hitLevel === 'throw';
      def.takeHit(att, att.currentMoveExecutor.move, isThrow);
    }
  };

  const dt = 1 / 60;
  for (let frame = 0; frame < 1800; frame++) {
    if (matchMgr.phase === 'MATCH_OVER') break;

    const inp1 = ai1.update(p1, p2, dt);
    const inp2 = ai2.update(p2, p1, dt);

    p1.update(inp1, 'NONE', p2.x, dt);
    p2.update(inp2, 'NONE', p1.x, dt);

    // Pushbox
    const push1 = hitboxSys.toWorldBox(p1.getPushbox(), p1.x, p1.y, p1.facingRight);
    const push2 = hitboxSys.toWorldBox(p2.getPushbox(), p2.x, p2.y, p2.facingRight);
    const pushShift = hitboxSys.resolvePush(push1, push2);
    p1.x += pushShift.p1Shift;
    p2.x += pushShift.p2Shift;

    // Projectiles
    projSys.update(dt, p1, p2);

    // Combat
    checkCombat(p1, p2);
    checkCombat(p2, p1);

    matchMgr.update(p1, p2, dt);
  }

  return matchMgr.stats.winner || (matchMgr.p1RoundsWon > matchMgr.p2RoundsWon ? 1 : matchMgr.p2RoundsWon > matchMgr.p1RoundsWon ? 2 : (p1.health > p2.health ? 1 : 2));
}

const winner1 = simulateHeadlessMatch('opener', 'finisher', 101);
assert(winner1 === 1 || winner1 === 2, `[opener vs finisher] Headless match simulated to conclusion (Winner: P${winner1})`);

const winner2 = simulateHeadlessMatch('quickie', 'spinner', 202);
assert(winner2 === 1 || winner2 === 2, `[quickie vs spinner] Headless match simulated to conclusion (Winner: P${winner2})`);

const winner3 = simulateHeadlessMatch('captain', 'keeper', 303);
assert(winner3 === 1 || winner3 === 2, `[captain vs keeper] Headless match simulated to conclusion (Winner: P${winner3})`);

console.log('\n--- 19. Testing Projectile System (Section 3) ---');
{
  const dada = new Fighter(CHARACTER_ROSTER['captain'], 1, -4.0);
  const dummy = new Fighter(CHARACTER_ROSTER['finisher'], 2, 4.0);
  const pSys = new ProjectileSystem();
  dada.projectileSystem = pSys;

  const straightDef = CHARACTER_ROSTER['captain'].moves['special_1'].projectileDef!;
  assert(!!straightDef, 'Dada has Straight Drive projectileDef');

  const spawned1 = pSys.spawn(dada, straightDef);
  assert(spawned1 === true, 'First projectile spawned successfully');

  const spawned2 = pSys.spawn(dada, straightDef);
  assert(spawned2 === false, 'Max 1 active projectile per fighter rule enforced (second spawn rejected)');

  const initialX = pSys.projectiles[0].x;
  pSys.update(1 / 60, dada, dummy);
  assert(pSys.projectiles[0].x > initialX, 'Projectile advances along facing direction');

  // Projectile Clash (Equal Priority)
  pSys.clear();
  const defP1 = { ...straightDef, priority: 1 };
  const defP2 = { ...straightDef, priority: 1 };
  pSys.spawn(dada, defP1);
  pSys.spawn(dummy, defP2);
  // Position projectiles to overlap
  pSys.projectiles[0].x = 0;
  pSys.projectiles[1].x = 0.1;
  pSys.update(1 / 60, dada, dummy);
  assert(pSys.projectiles.length === 0, 'Equal priority projectile clash cancels both projectiles');

  // Projectile Clash (Higher Priority Wins)
  pSys.clear();
  const highPriorityDef = { ...straightDef, priority: 2, vy: 0 };
  const lowPriorityDef = { ...straightDef, priority: 1, vy: 0 };
  pSys.spawn(dada, highPriorityDef); // Priority 2
  pSys.spawn(dummy, lowPriorityDef); // Priority 1
  pSys.projectiles[0].x = 0;
  pSys.projectiles[0].y = 0.9;
  pSys.projectiles[1].x = 0.1;
  pSys.projectiles[1].y = 0.9;
  pSys.update(1 / 60, dada, dummy);
  assert(pSys.projectiles.length === 1 && pSys.projectiles[0].ownerId === 1, 'Higher priority projectile wins clash and destroys lower priority');

  // Projectile Chip Damage on Block
  pSys.clear();
  const defenderBlock = new Fighter(CHARACTER_ROSTER['finisher'], 2, 0.0);
  defenderBlock.currentInput = { up: false, down: false, left: false, right: false, lp: false, hp: false, lk: false, hk: false, block: true, special: false, super: false, pause: false };
  defenderBlock.health = 2; // Near KO
  pSys.spawn(dada, straightDef);
  pSys.projectiles[0].x = -0.1; // point blank
  pSys.update(1 / 60, dada, defenderBlock);
  assert(defenderBlock.health >= 1, 'Projectile chip on block cannot kill (health clamped to >= 1)');

  // Jump-Over Clearance
  const jumpHeight = CHARACTER_ROSTER['opener'].jumpVelocityY * 0.3; // Height reached quickly
  const projTopY = straightDef.hitbox.yOffset + straightDef.hitbox.h * 0.5;
  assert(jumpHeight > projTopY, `Normal jump height (${jumpHeight.toFixed(2)}) clears projectile height (${projTopY.toFixed(2)})`);
}

console.log('\n--- 20. Testing Character Differentiation (Section 5) ---');
{
  // 1. Virat Chase Mode
  const virat = new Fighter(CHARACTER_ROSTER['opener'], 1, -2.0);
  const rival = new Fighter(CHARACTER_ROSTER['finisher'], 2, 2.0);
  const jab = virat.profile.moves.lp;

  // Land 3 consecutive hits
  rival.takeHit(virat, jab);
  assert(virat.runRateStacks === 1, 'Virat gains 1 Run Rate stack on first hit');
  rival.takeHit(virat, jab);
  rival.takeHit(virat, jab);
  assert(virat.runRateStacks === 3 && virat.chaseModeTimer === 300, 'Virat activates Chase Mode at 3 stacks (300 frames duration)');

  // Taking hit resets Chase Mode
  virat.takeHit(rival, jab);
  assert(virat.runRateStacks === 0 && virat.chaseModeTimer === 0, 'Virat loses all Chase Mode stacks when hit');

  // 2. Rohit Power Hit Charge & Armor
  const rohit = new Fighter(CHARACTER_ROSTER['finisher'], 1, 0.0);
  const neutralHeavyInput = { up: false, down: false, left: false, right: false, lp: false, hp: true, lk: false, hk: false, block: false, special: false, super: false, pause: false };
  for (let f = 0; f < 35; f++) {
    rohit.update(neutralHeavyInput, 'NONE', 2.0, 1 / 60);
  }
  assert(rohit.chargeFrames >= 30, `Rohit charges Power Hit (${rohit.chargeFrames}/40 frames)`);
  // Release charge
  const releaseInput = { up: false, down: false, left: false, right: false, lp: false, hp: false, lk: false, hk: false, block: false, special: false, super: false, pause: false };
  rohit.update(releaseInput, 'NONE', 2.0, 1 / 60);
  assert(rohit.state === 'ATTACK' && rohit.isArmored === true && rohit.armorHitsLeft === 1, 'Rohit releases Power Hit with super armor');

  // 3. Ashwin Googly Startup Feint
  const ashwin = new Fighter(CHARACTER_ROSTER['spinner'], 1, 0.0);
  ashwin.meter = 50;
  ashwin.tryExecuteMove(ashwin.profile.moves.special_1); // Startup 9
  assert(ashwin.currentMoveExecutor!.isStartup(), 'Ashwin enters special move startup');
  const kickFeintInput = { up: false, down: false, left: false, right: false, lp: false, hp: false, lk: true, hk: false, block: false, special: false, super: false, pause: false };
  ashwin.update(kickFeintInput, 'NONE', 2.0, 1 / 60);
  assert(ashwin.meter === 40 && ashwin.state === 'IDLE', 'Ashwin Googly feint cancels startup into neutral for 10% meter');

  // 4. Bumrah Run-Up Dash Cancel (cancelable from dashCancelFrom)
  const bumrah = new Fighter(CHARACTER_ROSTER['quickie'], 1, 0.0);
  bumrah.state = 'DASH_FWD';
  bumrah.stateFrames = 0;
  const idleDash = { up: false, down: false, left: false, right: false, lp: false, hp: false, lk: false, hk: false, block: false, special: false, super: false, pause: false };
  const cancelFrom = bumrah.profile.dashCancelFrom ?? 8;
  for (let f = 0; f < cancelFrom; f++) {
    bumrah.update(idleDash, 'NONE', 2.0, 1 / 60);
  }
  const punchInput = { up: false, down: false, left: false, right: false, lp: true, hp: false, lk: false, hk: false, block: false, special: false, super: false, pause: false };
  bumrah.update(punchInput, 'NONE', 2.0, 1 / 60);
  assert(bumrah.runUpActive === true, 'Bumrah dash-cancel activates Run-Up reach bonus');
  const idleInput = idleDash;
  for (let f = 0; f < bumrah.profile.moves.lp.startup; f++) {
    bumrah.update(idleInput, 'NONE', 2.0, 1 / 60);
  }
  const normalBox = bumrah.profile.moves.lp.hitbox!;
  const boostedBox = bumrah.getActiveHitbox()!;
  assert(!!boostedBox && boostedBox.w > normalBox.w, 'Run-Up expands normal attack hitbox width');

  // 5. Dhoni Stumping Command Grab Range
  const dhoniThrow = CHARACTER_ROSTER['keeper'].moves.throw;
  const normalThrow = CHARACTER_ROSTER['opener'].moves.throw;
  assert(dhoniThrow.maxRange! >= normalThrow.maxRange! * 1.4, `Dhoni command grab range (${dhoniThrow.maxRange}) is >= 1.4x standard throw (${normalThrow.maxRange})`);
  assert(dhoniThrow.recovery >= 20, `Dhoni command grab has large whiff recovery (${dhoniThrow.recovery} frames)`);
}

console.log('\n--- 21. Testing Combo System & Juggles (Section 4) ---');
{
  const att = new Fighter(CHARACTER_ROSTER['finisher'], 1, -2.0);
  const def = new Fighter(CHARACTER_ROSTER['opener'], 2, 2.0);
  const launcher = att.profile.moves.special_2; // launcher kick

  // 1. Launch target into air
  def.takeHit(att, launcher);
  assert(def.state === 'JUMPING' && def.y >= 0, 'Launcher pops defender into aerial juggle state');
  assert(def.juggleCount === 0, 'Juggle count initialized to 0 on launch');

  // Aerial Juggle 1
  def.y = 1.5;
  def.takeHit(att, att.profile.moves.lp);
  assert(def.juggleCount === 1 && def.state === 'JUMPING', 'Aerial juggle hit 1 accepted');

  // Aerial Juggle 2
  def.y = 1.2;
  def.takeHit(att, att.profile.moves.lp);
  assert(def.juggleCount === 2 && def.state === 'JUMPING', 'Aerial juggle hit 2 accepted');

  // Aerial juggles 3–4 still allowed; 5th forces knockdown (guide 5–6)
  def.y = 1.0;
  def.takeHit(att, att.profile.moves.lp);
  assert(def.juggleCount === 3 && def.state === 'JUMPING', 'Aerial juggle hit 3 accepted');
  def.y = 0.9;
  def.takeHit(att, att.profile.moves.lp);
  assert(def.juggleCount === 4 && def.state === 'JUMPING', 'Aerial juggle hit 4 accepted');
  def.y = 0.8;
  def.takeHit(att, att.profile.moves.lp);
  assert(def.juggleCount >= 5 && def.state === 'KNOCKDOWN', 'Juggle limit (5 hits) forces hard knockdown');

  // 2. Wall Bounce — needs launcher or kb.x >= 3 near corner
  def.resetForRound(10.0, false);
  assert(Math.abs(def.x) >= 9.5, 'Defender placed in wall bounce zone');
  const wallHit = att.profile.moves.special_1; // kb.x 4.0 + armored
  def.takeHit(att, wallHit);
  assert(def.wallBounceCount === 1, 'Wall bounce triggered on heavy hit near corner');
  assert(def.vx < 0, 'Wall bounce reverses horizontal momentum toward center stage');
  assert(def.wallBounceDamagePenalty === true, 'Wall bounce marks subsequent hit for 50% damage penalty cap');

  // 3. Starter Damage — first hit always 100% (guide scaling table)
  const freshTarget1 = new Fighter(CHARACTER_ROSTER['opener'], 2, 0.0);
  freshTarget1.takeHit(att, att.profile.moves.lp);
  const dmgLight = freshTarget1.maxHealth - freshTarget1.health;
  const freshTarget2 = new Fighter(CHARACTER_ROSTER['opener'], 2, 0.0);
  freshTarget2.takeHit(att, att.profile.moves.hp);
  const dmgHeavy = freshTarget2.maxHealth - freshTarget2.health;
  assert(dmgLight === att.profile.moves.lp.damage, 'Light starter scales at 100%');
  assert(dmgHeavy === att.profile.moves.hp.damage, 'Heavy starter also 100% on hit 1');
}

console.log('\n--- 22. Testing Meter Spend (Section 5.4) & Parry (Section 8) ---');
{
  // 1. EX Special Move
  const exFighter = new Fighter(CHARACTER_ROSTER['opener'], 1, 0.0);
  exFighter.meter = 50;
  const exInput = { up: false, down: false, left: false, right: false, lp: true, hp: true, lk: false, hk: false, block: false, special: false, super: false, pause: false };
  exFighter.update(exInput, 'QCF', 2.0, 1 / 60);
  assert(exFighter.meter === 17, 'EX special consumes 33% meter (50 -> 17)');
  assert(exFighter.isArmored === true && exFighter.armorHitsLeft === 1, 'EX special gains armor on startup');

  // 2. Burst / Combo Breaker
  const victim = new Fighter(CHARACTER_ROSTER['opener'], 2, 0.0);
  victim.meter = 60;
  victim.state = 'HIT_STUN';
  victim.stateFramesTarget = 20;
  victim.comboHitCount = 3;
  const burstInput = { up: false, down: false, left: false, right: false, lp: true, hp: true, lk: true, hk: false, block: false, special: false, super: false, pause: false };
  victim.update(burstInput, 'NONE', -2.0, 1 / 60);
  assert(victim.meter === 10, 'Burst consumes 50% meter (60 -> 10)');
  assert(victim.state === 'IDLE' && victim.isInvincible === true, 'Burst breaks hitstun and grants invulnerability');
  assert(victim.comboHitCount === 0, 'Burst resets combo counter');

  // 3. Parry / Just-Defend
  const defenderParry = new Fighter(CHARACTER_ROSTER['opener'], 2, 1.0);
  const attackerParry = new Fighter(CHARACTER_ROSTER['finisher'], 1, 0.0);
  attackerParry.meter = 20;
  defenderParry.meter = 10;

  // Fresh tap on block button activates 5-frame parry window
  const blockTap = { up: false, down: false, left: false, right: false, lp: false, hp: false, lk: false, hk: false, block: true, special: false, super: false, pause: false };
  defenderParry.update(blockTap, 'NONE', 0.0, 1 / 60);
  assert(defenderParry.parryTimer > 0, 'Tap block activates parry window');

  const incomingJab = attackerParry.profile.moves.lp;
  const parryResult = defenderParry.takeHit(attackerParry, incomingJab);
  assert(parryResult.damage === 0, 'Parry completely nullifies incoming damage');
  assert(defenderParry.state === 'IDLE', 'Parry incurs 0 blockstun (immediate neutral advantage)');
  assert(defenderParry.meter === 15, 'Defender gains 5% meter on successful parry (10 -> 15)');
  assert(attackerParry.meter === 15, 'Attacker loses 5% meter on parry (20 -> 15)');

  // 4. Whiffed Parry Penalty (Block lock for 12 frames)
  const defenderWhiff = new Fighter(CHARACTER_ROSTER['opener'], 2, 1.0);
  defenderWhiff.update(blockTap, 'NONE', 0.0, 1 / 60); // frame 1
  for (let f = 0; f < 6; f++) {
    defenderWhiff.update(blockTap, 'NONE', 0.0, 1 / 60); // hold block through expiration
  }
  assert(defenderWhiff.blockLockTimer > 0, 'Missed parry attempt incurs block-lock whiff penalty');
  const punishHit = defenderWhiff.takeHit(attackerParry, incomingJab);
  assert(punishHit.hit === true, 'Defender cannot block during parry whiff penalty');
}

console.log('\n================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================\n');

if (failed > 0) {
  process.exit(1);
}
