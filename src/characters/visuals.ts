import { FighterId } from '../game/types';

/**
 * ONE place to tune each 3D character:
 * - model file, height, offset (fix shadow drift), facing yaw
 * - intro + state/move → animation clip names
 *
 * Hitboxes / damage still live in roster.ts. This file = looks + anims only.
 */
export interface CharacterVisualConfig {
  modelUrl: string;
  /** World-unit height after fit (default 1.85) */
  height?: number;
  /** Slide mesh relative to shadow / hitbox root */
  offset?: { x?: number; y?: number; z?: number };
  /** Extra lift so soles sit on floor (not ankle bone) */
  groundClearance?: number;
  /** Extra model yaw in radians (Math.PI if faces wrong way) */
  yaw?: number;
  /** Lock Hips XZ to first keyframe of each clip (default true). Stops walk-off. */
  stripRootMotion?: boolean;
  /** Crossfade seconds between clips */
  fadeSeconds?: number;
  /**
   * Punch playback rate (1 = natural clip speed).
   * Lower = slower / heavier. Typical 0.75–1.0
   */
  attackAnimSpeed?: number;
  /** Kick playback rate — often wants higher than punches */
  kickAnimSpeed?: number;
  /** Hit/block react playback rate (1 = natural) */
  reactAnimSpeed?: number;
  /**
   * Tekken-style: hit only when strike limb is near body AND clip is in this window.
   * start/end = fraction of attack clip (0–1).
   */
  contactWindows?: {
    lp?: { start: number; end: number };
    hp?: { start: number; end: number };
    lk?: { start: number; end: number };
    hk?: { start: number; end: number };
    special?: { start: number; end: number };
    throw?: { start: number; end: number };
    default?: { start: number; end: number };
  };
  /** World radius around fist/foot for contact (Tekken-like) */
  strikeRadius?: number;
  introClip?: string;
  /** Signature pose — intro fallback + win preference */
  trademarkClip?: string;
  clips: {
    idle: string;
    walkFwd: string;
    walkBack: string;
    dashFwd?: string;
    dashBack?: string;
    crouch: string;
    jumpStart?: string;
    jumpAir?: string;
    jumpLand?: string;
    block: string;
    hit: string;
    knockdown: string;
    getUp?: string;
    throw: string;
    win: string;
    lose: string;
    /** Fallback when special_1/2/3/super unset */
    special: string;
    special1?: string;
    special2?: string;
    special3?: string;
    super?: string;
    lp: string;
    hp: string;
    lk: string;
    hk: string;
    crouchLp?: string;
    crouchHk?: string;
    airAttack?: string;
  };
}

/** Shared exported-model pack — one mesh, many clips; per-id remap below */
export const BASE_VISUAL: CharacterVisualConfig = {
  modelUrl: '/characters/exported-model.glb',
  height: 1.85,
  offset: { x: 0, y: 0, z: 0 },
  groundClearance: 0.08,
  yaw: 0,
  stripRootMotion: true,
  fadeSeconds: 0.18,
  attackAnimSpeed: 0.9,
  kickAnimSpeed: 1.15,
  reactAnimSpeed: 1.0,
  strikeRadius: 0.34,
  contactWindows: {
    lp: { start: 0.22, end: 0.55 },
    hp: { start: 0.26, end: 0.62 },
    lk: { start: 0.3, end: 0.68 },
    hk: { start: 0.32, end: 0.72 },
    special: { start: 0.28, end: 0.75 },
    throw: { start: 0.2, end: 0.55 },
    default: { start: 0.28, end: 0.65 }
  },
  introClip: 'Meditate',
  clips: {
    idle: 'Fighting_Idle',
    walkFwd: 'Walk',
    walkBack: 'Walk_Backwards',
    dashFwd: 'Run_Anime',
    dashBack: 'Dodge_back_RM',
    // No true crouch clip — shield-break idle reads as low ready stance
    crouch: 'Idle_Shield_Break',
    jumpStart: 'Jumping_Jacks',
    jumpAir: 'Levitate_Idle',
    jumpLand: 'Jumping_Jacks',
    block: 'Defend',
    hit: 'Hit_Knockback',
    knockdown: 'Death_B',
    getUp: 'Jumping_Jacks',
    throw: 'Punch_Cross',
    win: 'Dance_Reach_Hip',
    lose: 'Death_D',
    special: 'Shield_Dash_RM',
    lp: 'Punch_Jab',
    hp: 'Punch_Cross',
    lk: 'Kick_Breach',
    hk: 'Kick_Breach',
    crouchLp: 'Punch_Jab',
    crouchHk: 'Kick_Breach',
    airAttack: 'Punch_Cross'
  }
};

/** @deprecated alias — old name still imported nowhere that matters */
export const ROHIT_VISUAL = BASE_VISUAL;

/**
 * Per-fighter model + clip map.
 * Kohli (opener) uses kohli-prod.glb (big pack). Others share exported-model.glb.
 */
export const CHARACTER_VISUALS: Partial<Record<FighterId, CharacterVisualConfig>> = {
  // Kohli / Virat — cover-drive trademark, aggressive rush specials
  opener: {
    ...BASE_VISUAL,
    modelUrl: '/characters/kohli-prod.glb',
    height: 1.85,
    groundClearance: 0.06,
    fadeSeconds: 0.16,
    attackAnimSpeed: 0.95,
    kickAnimSpeed: 1.25,
    reactAnimSpeed: 1.05,
    trademarkClip: 'Golf_Drive',
    introClip: 'Hit_Chest',
    contactWindows: {
      lp: { start: 0.2, end: 0.5 },
      hp: { start: 0.24, end: 0.58 },
      lk: { start: 0.28, end: 0.65 },
      hk: { start: 0.3, end: 0.7 },
      special: { start: 0.25, end: 0.78 },
      throw: { start: 0.18, end: 0.5 },
      default: { start: 0.26, end: 0.62 }
    },
    clips: {
      idle: 'Fighting_Idle',
      walkFwd: 'Jog',
      walkBack: 'Walk_Backwards',
      dashFwd: 'Sprint',
      dashBack: 'Dodge_back_RM',
      crouch: 'Crouch_Idle',
      jumpStart: 'Jump_Start',
      jumpAir: 'Jump_air',
      jumpLand: 'Jump_Land',
      block: 'Defend',
      hit: 'Hit_Knockback',
      knockdown: 'Death_B',
      getUp: 'LayToIdle',
      throw: 'OverhandThrow',
      win: 'Victory_Fist_Pump',
      lose: 'Kneeling_Tired',
      // Trademark special kit
      special: 'Flying_Forward_Super',
      special1: 'Flying_Forward_Super', // Flying Elbow Rush
      special2: 'Backflip', // Helicopter Kick
      special3: 'Slide', // Low Slide Kick
      super: 'Attack_Ground_Pound', // MATCH WINNING FURY
      lp: 'Fighting_Left_Jab',
      hp: 'Melee_Hook',
      lk: 'Kick_Breach',
      hk: 'Kick_Breach',
      crouchLp: 'Fighting_Right_Jab',
      crouchHk: 'Slide',
      airAttack: 'Flying_Forward'
    }
  },

  // Rohit — heavy: formal walk, slower punches, hard knockdown
  // Trademark: Meditate calm before smash
  finisher: {
    ...BASE_VISUAL,
    introClip: 'Meditate',
    trademarkClip: 'Meditate',
    attackAnimSpeed: 0.72,
    kickAnimSpeed: 1.05,
    fadeSeconds: 0.32,
    clips: {
      ...BASE_VISUAL.clips,
      idle: 'Idle_Shield_Break',
      walkFwd: 'Walk_Formal',
      walkBack: 'Walk_Backwards',
      dashFwd: 'Shield_Dash_RM',
      dashBack: 'Dodge_back',
      knockdown: 'Death_A',
      special: 'Punch_Cross',
      special1: 'Punch_Cross', // Leaping Knee Drop
      special2: 'Kick_Breach', // Leaping Knee Bomb
      special3: 'Shield_Dash_RM', // Spinning Leg Crusher
      super: 'Punch_Cross',
      win: 'Dance_Reach_Hip',
      lose: 'Death_B'
    }
  },

  // Ashwin — trickster: odd idle, flashy spin
  // Trademark: Dance_Reach_Hip (wizard flourish)
  spinner: {
    ...BASE_VISUAL,
    introClip: 'Dance_Reach_Hip',
    trademarkClip: 'Dance_Reach_Hip',
    attackAnimSpeed: 0.95,
    kickAnimSpeed: 1.4,
    clips: {
      ...BASE_VISUAL.clips,
      idle: 'Idle_TalkingPhone',
      walkFwd: 'Walk_Formal',
      walkBack: 'Dodge_back',
      dashFwd: 'Shield_Dash_RM',
      jumpAir: 'Levitate_Idle',
      special: 'Dance_Reach_Hip',
      special1: 'Punch_Jab', // Feint Strike
      special2: 'Levitate_Idle', // Carrom Ball Flight
      special3: 'Shield_Dash_RM', // Dart Strike
      super: 'Dance_Reach_Hip',
      throw: 'Shield_Dash_RM',
      win: 'Jumping_Jacks',
      lose: 'Death_C'
    }
  },

  // Bumrah — speedster: run as walk, snappy attacks
  // Trademark: Pushup (yorker-king grind)
  quickie: {
    ...BASE_VISUAL,
    introClip: 'Pushup',
    trademarkClip: 'Pushup',
    attackAnimSpeed: 1.05,
    kickAnimSpeed: 1.45,
    fadeSeconds: 0.18,
    clips: {
      ...BASE_VISUAL.clips,
      idle: 'Fighting_Idle',
      walkFwd: 'Run_Anime',
      walkBack: 'Walk_Backwards',
      dashFwd: 'Run_Anime',
      dashBack: 'Dodge_back_RM',
      special: 'Run_Anime',
      special1: 'Run_Anime', // Yorker Blitz
      special2: 'Kick_Breach', // Dash Flying Kick
      special3: 'Dodge_back_RM', // Yorker Low Slide
      super: 'Run_Anime',
      win: 'Jumping_Jacks',
      lose: 'Hit_Knockback_RM'
    }
  },

  // Dhoni — grappler: shield idle/dash, calm finisher
  // Trademark: Meditate (helicopter calm)
  keeper: {
    ...BASE_VISUAL,
    introClip: 'Meditate',
    trademarkClip: 'Meditate',
    attackAnimSpeed: 0.8,
    kickAnimSpeed: 1.15,
    clips: {
      ...BASE_VISUAL.clips,
      idle: 'Idle_Shield_Break',
      walkFwd: 'Walk',
      walkBack: 'Walk_Backwards',
      dashFwd: 'Shield_Dash_RM',
      dashBack: 'Dodge_back_RM',
      crouch: 'Idle_Shield_Break',
      special: 'Shield_Dash_RM',
      special1: 'Punch_Cross', // Catch Counter
      special2: 'Shield_Dash_RM', // Counter Suplex
      special3: 'Kick_Breach', // Duck Under Slam
      super: 'Meditate',
      throw: 'Punch_Cross',
      win: 'Meditate',
      lose: 'Death_D'
    }
  },

  // Ganguly — zoner captain: formal walk, presence
  // Trademark: Meditate (dada aura) — win = Dance_Reach_Hip
  captain: {
    ...BASE_VISUAL,
    introClip: 'Meditate',
    trademarkClip: 'Dance_Reach_Hip',
    attackAnimSpeed: 0.88,
    kickAnimSpeed: 1.2,
    clips: {
      ...BASE_VISUAL.clips,
      idle: 'Meditate',
      walkFwd: 'Walk_Formal',
      walkBack: 'Walk_Backwards',
      dashFwd: 'Walk',
      special: 'Punch_Cross',
      special1: 'Punch_Cross', // Field Command Strike
      special2: 'Kick_Breach', // Tactical Spin Kick
      special3: 'Shield_Dash_RM', // Off-Cutter Slide
      super: 'Punch_Cross',
      win: 'Dance_Reach_Hip',
      lose: 'Death_A'
    }
  }
};

export function getCharacterVisual(id: FighterId): CharacterVisualConfig {
  return CHARACTER_VISUALS[id] ?? BASE_VISUAL;
}
