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
    /** Special + super share this until you add more */
    special: string;
    lp: string;
    hp: string;
    lk: string;
    hk: string;
    crouchLp?: string;
    crouchHk?: string;
    airAttack?: string;
  };
}

/** Shared Rohit pack — used for every fighter until unique GLBs exist */
export const ROHIT_VISUAL: CharacterVisualConfig = {
  modelUrl: '/characters/retargeted_animations.glb',
  height: 1.85,
  offset: { x: 0, y: 0, z: 0 },
  // Ankle/toe bones sit above sole mesh — lift so feet don't dig
  groundClearance: 0.08,
  yaw: 0,
  stripRootMotion: true,
  fadeSeconds: 0.28,
  // Punches a bit heavy; kicks faster (Kick_Breach clip is long)
  attackAnimSpeed: 0.85,
  kickAnimSpeed: 1.25,
  reactAnimSpeed: 0.95,
  // Hit when fist/foot reaches body — not on button press / early frames
  strikeRadius: 0.32,
  contactWindows: {
    lp: { start: 0.32, end: 0.68 },
    hp: { start: 0.28, end: 0.65 },
    lk: { start: 0.36, end: 0.72 },
    hk: { start: 0.36, end: 0.75 },
    special: { start: 0.3, end: 0.78 },
    throw: { start: 0.25, end: 0.6 },
    default: { start: 0.33, end: 0.7 }
  },
  introClip: 'Bow_RT',
  clips: {
    idle: 'Fighting_Idle_RT',
    walkFwd: 'Jog_RT',
    walkBack: 'Dodge_back_RM_RT',
    dashFwd: 'Jog_RT',
    dashBack: 'Dodge_back_RM_RT',
    crouch: 'Crouch_Walk_RT',
    jumpStart: 'Jump_2_RT',
    jumpAir: 'Jump_air_RT',
    jumpLand: 'Jump_Land_RT',
    block: 'Defend_RT',
    hit: 'Hit_Knockback_RT',
    knockdown: 'Death_B_RT',
    getUp: 'Jump_Land_RT',
    throw: 'OverhandThrow_RT',
    win: 'Cheering_Two_Hands_RT',
    lose: 'Death_D_RT',
    special: 'Sword_Regular_C_RM_RT',
    lp: 'Fighting_Left_Jab_RT',
    hp: 'Melee_Hook_RT',
    lk: 'Kick_Breach_RT',
    hk: 'Kick_Breach_RT',
    crouchLp: 'Fighting_Left_Jab_RT',
    crouchHk: 'Chop_Tree_RT',
    airAttack: 'Fighting_Right_Jab_RT'
  }
};

/**
 * Per-id overrides later. Empty = everyone uses ROHIT_VISUAL.
 * Example when you get Virat GLB:
 *   opener: { ...ROHIT_VISUAL, modelUrl: '/characters/virat.glb', introClip: '...' }
 */
export const CHARACTER_VISUALS: Partial<Record<FighterId, CharacterVisualConfig>> = {
  // finisher intentionally uses shared default via getCharacterVisual
};

export function getCharacterVisual(id: FighterId): CharacterVisualConfig {
  return CHARACTER_VISUALS[id] ?? ROHIT_VISUAL;
}
