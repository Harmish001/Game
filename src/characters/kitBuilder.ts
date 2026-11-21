import { MoveFrameData, ProjectileDef } from '../game/types';

/** Minimal move factory — fills safe defaults so kits stay short. */
export function M(
  partial: Partial<MoveFrameData> &
    Pick<
      MoveFrameData,
      'id' | 'name' | 'input' | 'startup' | 'active' | 'recovery' | 'damage' | 'hitLevel'
    >
): MoveFrameData {
  const heavy = partial.damage >= 14 || partial.hitLevel === 'throw';
  return {
    onHitFrameAdvantage: 4,
    onBlockFrameAdvantage: -4,
    hitstop: heavy ? 10 : 5,
    knockback: { x: heavy ? 2.4 : 1.1, y: 0 },
    meterGain: Math.max(4, Math.round(partial.damage * 0.9)),
    hitbox: { x: 0.15, y: 1.1, w: 0.65, h: 0.4 },
    maxRange: 1.1,
    vfxType: partial.hitLevel === 'low' || partial.input.includes('K') ? 'kick' : 'punch',
    sfxType: heavy ? 'heavy_hit' : 'light_hit',
    ...partial
  };
}

export interface KitFlavor {
  prefix: string;
  /** Scale damage slightly per archetype (1 = base) */
  power?: number;
  /** Scale startup ( <1 = faster) */
  speed?: number;
  jabName?: string;
  pokeName?: string;
  launcherName?: string;
  overheadName?: string;
  antiAirName?: string;
  lowName?: string;
  sweepName?: string;
}

function scaleFrames(n: number, speed: number): number {
  return Math.max(3, Math.round(n * speed));
}

function scaleDmg(n: number, power: number): number {
  return Math.max(1, Math.round(n * power));
}

/**
 * Tekken-style role kit (~22 normals/system moves).
 * Caller merges unique specials/super on top.
 */
export function buildRoleKit(f: KitFlavor): Record<string, MoveFrameData> {
  const power = f.power ?? 1;
  const speed = f.speed ?? 1;
  const p = f.prefix;
  const d = (n: number) => scaleDmg(n, power);
  const s = (n: number) => scaleFrames(n, speed);

  const jab = M({
    id: `${p}_lp`,
    name: f.jabName ?? 'Jab',
    input: 'LP',
    startup: s(10),
    active: 2,
    recovery: 8,
    damage: d(5),
    hitLevel: 'high',
    onHitFrameAdvantage: 6,
    onBlockFrameAdvantage: 1, // plus / turn-keeper
    hitstop: 5,
    knockback: { x: 0.7, y: 0 },
    meterGain: 5,
    cancelInto: ['lp_follow', 'hp', 'lk', 'hk', 'special_1', 'special_2', 'super'],
    hitbox: { x: 0.12, y: 1.2, w: 0.5, h: 0.35 },
    maxRange: 0.95,
    pushbackOnBlock: 0.35,
    pushbackOnHit: 0.45
  });

  return {
    lp: jab,

    // True string follow-up (0–1f gap feel via cancel)
    lp_follow: M({
      id: `${p}_lp2`,
      name: 'Jab Follow',
      input: 'LP',
      startup: s(10),
      active: 2,
      recovery: 10,
      damage: d(4),
      hitLevel: 'high',
      onHitFrameAdvantage: 4,
      onBlockFrameAdvantage: -1,
      hitstop: 4,
      knockback: { x: 0.9, y: 0 },
      meterGain: 4,
      cancelInto: ['hp', 'lk', 'special_1', 'super'],
      hitbox: { x: 0.12, y: 1.2, w: 0.55, h: 0.35 },
      maxRange: 1.0,
      pushbackOnBlock: 0.4
    }),

    // Fast mid poke
    hp: M({
      id: `${p}_hp`,
      name: f.pokeName ?? 'Mid Poke',
      input: 'HP',
      startup: s(13),
      active: 3,
      recovery: 16,
      damage: d(11),
      hitLevel: 'mid',
      onHitFrameAdvantage: 5,
      onBlockFrameAdvantage: -4,
      hitstop: 7,
      knockback: { x: 1.8, y: 0.2 },
      meterGain: 9,
      cancelInto: ['special_1', 'special_2', 'super'],
      hitbox: { x: 0.15, y: 1.1, w: 0.75, h: 0.4 },
      maxRange: 1.25,
      pushbackOnBlock: 1.1,
      pushbackOnHit: 1.3
    }),

    // Fast low
    lk: M({
      id: `${p}_lk`,
      name: f.lowName ?? 'Low Kick',
      input: 'LK',
      startup: s(14),
      active: 3,
      recovery: 14,
      damage: d(7),
      hitLevel: 'low',
      onHitFrameAdvantage: 3,
      onBlockFrameAdvantage: -10,
      hitstop: 6,
      knockback: { x: 1.2, y: 0 },
      meterGain: 6,
      cancelInto: ['hk', 'special_3'],
      hitbox: { x: 0.15, y: 0.25, w: 0.7, h: 0.35 },
      maxRange: 1.15,
      pushbackOnBlock: 0.7,
      vfxType: 'kick'
    }),

    // Fast launcher
    hk: M({
      id: `${p}_hk`,
      name: f.launcherName ?? 'Launcher',
      input: 'HK',
      startup: s(15),
      active: 4,
      recovery: 22,
      damage: d(14),
      hitLevel: 'high',
      onHitFrameAdvantage: 2,
      onBlockFrameAdvantage: -14,
      hitstop: 10,
      knockback: { x: 2.2, y: 3.6 },
      meterGain: 12,
      cancelInto: ['special_1', 'super'],
      hitbox: { x: 0.15, y: 1.2, w: 0.85, h: 0.5 },
      maxRange: 1.3,
      isLauncher: true,
      pushbackOnBlock: 1.4,
      vfxType: 'kick',
      sfxType: 'heavy_hit'
    }),

    // Big poke / whiff punish (forward+LP)
    far_hp: M({
      id: `${p}_far_hp`,
      name: 'Big Poke',
      input: 'f+LP',
      startup: s(17),
      active: 4,
      recovery: 20,
      damage: d(16),
      hitLevel: 'mid',
      onHitFrameAdvantage: 3,
      onBlockFrameAdvantage: -10,
      hitstop: 9,
      knockback: { x: 2.8, y: 0.3 },
      meterGain: 12,
      cancelInto: ['special_1', 'super'],
      hitbox: { x: 0.2, y: 1.1, w: 0.95, h: 0.4 },
      maxRange: 1.55,
      pushbackOnBlock: 1.8,
      sfxType: 'heavy_hit'
    }),

    // Overhead (beats crouch block)
    overhead: M({
      id: `${p}_overhead`,
      name: f.overheadName ?? 'Overhead',
      input: 'f+HP',
      startup: s(20),
      active: 3,
      recovery: 22,
      damage: d(13),
      hitLevel: 'overhead',
      onHitFrameAdvantage: 4,
      onBlockFrameAdvantage: -12,
      hitstop: 9,
      knockback: { x: 2.0, y: 0.5 },
      meterGain: 11,
      cancelInto: ['special_1', 'super'],
      hitbox: { x: 0.15, y: 1.35, w: 0.7, h: 0.4 },
      maxRange: 1.2,
      isOverhead: true,
      pushbackOnBlock: 1.2,
      sfxType: 'heavy_hit'
    }),

    // Anti-air
    anti_air: M({
      id: `${p}_aa`,
      name: f.antiAirName ?? 'Anti-Air',
      input: 'b+HP',
      startup: s(10),
      active: 4,
      recovery: 18,
      damage: d(12),
      hitLevel: 'mid',
      onHitFrameAdvantage: 2,
      onBlockFrameAdvantage: -8,
      hitstop: 8,
      knockback: { x: 1.5, y: 3.2 },
      meterGain: 10,
      hitbox: { x: 0.1, y: 1.4, w: 0.55, h: 0.85 },
      maxRange: 1.05,
      isAntiAir: true,
      isLauncher: true,
      sfxType: 'heavy_hit'
    }),

    // Heavy launcher (big punish)
    heavy_launcher: M({
      id: `${p}_hlaunch`,
      name: 'Heavy Launcher',
      input: 'f+HK',
      startup: s(20),
      active: 4,
      recovery: 26,
      damage: d(18),
      hitLevel: 'mid',
      onHitFrameAdvantage: 2,
      onBlockFrameAdvantage: -18,
      hitstop: 12,
      knockback: { x: 2.6, y: 4.2 },
      meterGain: 14,
      cancelInto: ['super'],
      hitbox: { x: 0.15, y: 1.15, w: 0.9, h: 0.55 },
      maxRange: 1.35,
      isLauncher: true,
      pushbackOnBlock: 1.6,
      vfxType: 'kick',
      sfxType: 'heavy_hit'
    }),

    crouch_lp: M({
      id: `${p}_c_lp`,
      name: 'Crouch Jab',
      input: '↓+LP',
      startup: s(10),
      active: 2,
      recovery: 8,
      damage: d(4),
      hitLevel: 'mid',
      onHitFrameAdvantage: 5,
      onBlockFrameAdvantage: 2,
      hitstop: 4,
      knockback: { x: 0.6, y: 0 },
      meterGain: 4,
      cancelInto: ['crouch_hp', 'special_3', 'super'],
      hitbox: { x: 0.12, y: 0.55, w: 0.5, h: 0.35 },
      maxRange: 0.95,
      pushbackOnBlock: 0.3
    }),

    crouch_hp: M({
      id: `${p}_c_hp`,
      name: 'Crouch Poke',
      input: '↓+HP',
      startup: s(12),
      active: 3,
      recovery: 14,
      damage: d(9),
      hitLevel: 'mid',
      onHitFrameAdvantage: 4,
      onBlockFrameAdvantage: -3,
      hitstop: 6,
      knockback: { x: 1.4, y: 0 },
      meterGain: 8,
      cancelInto: ['special_1', 'super'],
      hitbox: { x: 0.15, y: 0.7, w: 0.7, h: 0.4 },
      maxRange: 1.15
    }),

    crouch_lk: M({
      id: `${p}_c_lk`,
      name: 'Crouch Low',
      input: '↓+LK',
      startup: s(14),
      active: 3,
      recovery: 15,
      damage: d(6),
      hitLevel: 'low',
      onHitFrameAdvantage: 2,
      onBlockFrameAdvantage: -11,
      hitstop: 5,
      knockback: { x: 1.1, y: 0 },
      meterGain: 6,
      cancelInto: ['crouch_hk', 'special_3'],
      hitbox: { x: 0.15, y: 0.2, w: 0.75, h: 0.3 },
      maxRange: 1.2,
      vfxType: 'kick'
    }),

    crouch_hk: M({
      id: `${p}_c_hk`,
      name: f.sweepName ?? 'Sweep',
      input: '↓+HK',
      startup: s(18),
      active: 4,
      recovery: 24,
      damage: d(13),
      hitLevel: 'low',
      onHitFrameAdvantage: 1,
      onBlockFrameAdvantage: -16,
      hitstop: 9,
      knockback: { x: 2.6, y: 0.3 },
      meterGain: 11,
      hitbox: { x: 0.15, y: 0.12, w: 0.95, h: 0.32 },
      maxRange: 1.4,
      isHardKnockdown: true,
      pushbackOnBlock: 1.5,
      vfxType: 'kick',
      sfxType: 'heavy_hit'
    }),

    jump_lp: M({
      id: `${p}_j_lp`,
      name: 'Air Jab',
      input: 'Air LP',
      startup: s(8),
      active: 4,
      recovery: 8,
      damage: d(6),
      hitLevel: 'high',
      onHitFrameAdvantage: 4,
      onBlockFrameAdvantage: 1,
      hitstop: 5,
      knockback: { x: 1.0, y: -0.3 },
      meterGain: 5,
      hitbox: { x: 0.1, y: 0.6, w: 0.55, h: 0.4 },
      maxRange: 1.05
    }),

    jump_hp: M({
      id: `${p}_j_hp`,
      name: 'Air Heavy',
      input: 'Air HP',
      startup: s(12),
      active: 5,
      recovery: 10,
      damage: d(12),
      hitLevel: 'high',
      onHitFrameAdvantage: 5,
      onBlockFrameAdvantage: 2,
      hitstop: 8,
      knockback: { x: 1.8, y: -0.5 },
      meterGain: 9,
      hitbox: { x: 0.12, y: 0.55, w: 0.75, h: 0.5 },
      maxRange: 1.2,
      sfxType: 'heavy_hit'
    }),

    jump_lk: M({
      id: `${p}_j_lk`,
      name: 'Air Low Kick',
      input: 'Air LK',
      startup: s(10),
      active: 4,
      recovery: 8,
      damage: d(7),
      hitLevel: 'high',
      onHitFrameAdvantage: 3,
      onBlockFrameAdvantage: 0,
      hitstop: 5,
      knockback: { x: 1.2, y: -0.4 },
      meterGain: 6,
      hitbox: { x: 0.1, y: 0.35, w: 0.7, h: 0.4 },
      maxRange: 1.15,
      vfxType: 'kick'
    }),

    jump_hk: M({
      id: `${p}_j_hk`,
      name: 'Air Roundhouse',
      input: 'Air HK',
      startup: s(14),
      active: 5,
      recovery: 12,
      damage: d(14),
      hitLevel: 'high',
      onHitFrameAdvantage: 4,
      onBlockFrameAdvantage: -2,
      hitstop: 9,
      knockback: { x: 2.2, y: -0.6 },
      meterGain: 11,
      hitbox: { x: 0.12, y: 0.5, w: 0.85, h: 0.5 },
      maxRange: 1.3,
      vfxType: 'kick',
      sfxType: 'heavy_hit'
    }),

    // Approach slide (DF+LK feel via special button routing also)
    approach: M({
      id: `${p}_approach`,
      name: 'Approach Slide',
      input: '→↓↘+LK',
      startup: s(12),
      active: 6,
      recovery: 18,
      damage: d(10),
      chipDamage: 2,
      hitLevel: 'low',
      onHitFrameAdvantage: 1,
      onBlockFrameAdvantage: -12,
      hitstop: 7,
      knockback: { x: 2.8, y: 0.2 },
      meterGain: 9,
      hitbox: { x: 0.2, y: 0.15, w: 1.0, h: 0.35 },
      maxRange: 1.6,
      isHardKnockdown: true,
      vfxType: 'kick',
      sfxType: 'heavy_hit'
    }),

    throw: M({
      id: `${p}_throw`,
      name: 'Throw',
      input: 'LP+LK',
      startup: s(12),
      active: 2,
      recovery: 22,
      damage: d(16),
      hitLevel: 'throw',
      onHitFrameAdvantage: 0,
      onBlockFrameAdvantage: -12,
      hitstop: 12,
      knockback: { x: 3.8, y: 1.2 },
      meterGain: 14,
      hitbox: { x: 0.08, y: 0.8, w: 0.48, h: 0.55 },
      maxRange: 0.72,
      isHardKnockdown: true,
      vfxType: 'shockwave',
      sfxType: 'heavy_hit',
      throwBreakWindow: 16
    })
  };
}

export function projectileMove(
  base: MoveFrameData,
  def: ProjectileDef,
  spawnFrame?: number
): MoveFrameData {
  return {
    ...base,
    projectileDef: def,
    projectileSpawnFrame: spawnFrame ?? base.startup
  };
}
