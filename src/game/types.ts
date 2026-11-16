export type FighterId = 'opener' | 'finisher' | 'spinner' | 'quickie' | 'keeper' | 'captain';

export type FighterArchetype = 'balanced' | 'heavy' | 'trickster' | 'speedster' | 'grappler' | 'zoner';

export type FighterState =
  | 'IDLE'
  | 'WALK_FWD'
  | 'WALK_BACK'
  | 'DASH_FWD'
  | 'DASH_BACK'
  | 'CROUCH_START'
  | 'CROUCHING'
  | 'JUMP_START'
  | 'JUMPING'
  | 'JUMP_LAND'
  | 'ATTACK'
  | 'HIT_STUN'
  | 'BLOCK_STUN'
  | 'KNOCKDOWN'
  | 'GET_UP'
  | 'THROW_START'
  | 'BEING_THROWN'
  | 'SUPER_CINEMATIC'
  | 'WIN'
  | 'LOSE';

export type HitLevel = 'high' | 'mid' | 'low' | 'throw' | 'unblockable';

export interface Box2D {
  x: number; // offset from fighter root (facing-adjusted)
  y: number; // offset from floor
  w: number;
  h: number;
}

export interface MoveFrameData {
  id: string;
  name: string;
  input: string; // e.g. "LP", "HP", "236P"
  startup: number; // frames before active
  active: number; // frames hitbox deals damage
  recovery: number; // frames before returning to idle/crouch
  damage: number;
  chipDamage?: number;
  hitLevel: HitLevel;
  onHitFrameAdvantage: number; // +frames or -frames
  onBlockFrameAdvantage: number;
  hitstop: number; // frames to freeze on hit
  knockback: { x: number; y: number };
  meterGain: number; // meter gained on hit
  meterCost?: number; // meter cost to execute
  cancelInto?: string[]; // IDs of moves that can cancel recovery on hit
  hitbox?: Box2D; // active hitbox bounds
  maxRange?: number; // max distance (|attacker.x - defender.x|) for hit to register
  isLauncher?: boolean; // sends target into air for juggle
  isHardKnockdown?: boolean; // forces floor knockdown
  isArmored?: boolean; // absorbs 1 hit during startup
  vfxType?: 'punch' | 'kick' | 'bat_slash' | 'sparks' | 'fire' | 'shockwave' | 'super';
  sfxType?: 'light_hit' | 'heavy_hit' | 'bat_hit' | 'special' | 'super' | 'whoosh';
}

export interface CharacterProfile {
  id: FighterId;
  name: string;
  nickname: string;
  archetype: FighterArchetype;
  stats: {
    power: number; // 1-10
    speed: number;
    defense: number;
    reach: number;
  };
  walkSpeedFwd: number;
  walkSpeedBack: number;
  dashSpeed: number;
  dashFrames: number;
  jumpVelocityY: number;
  gravity: number;
  maxHealth: number;
  colorScheme: {
    primary: number;
    secondary: number;
    accent: number;
    trim: number;
  };
  moves: Record<string, MoveFrameData>;
  description: string;
  quote: string;
}

export interface RawPlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  lp: boolean; // Light Punch
  hp: boolean; // Heavy Punch
  lk: boolean; // Light Kick
  hk: boolean; // Heavy Kick
  block: boolean;
  special: boolean;
  super: boolean;
  pause: boolean;
}

export interface BufferedInputState {
  input: RawPlayerInput;
  timestamp: number;
  frame: number;
}

export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

export type GameMode = 'vs_cpu' | 'local_2p' | 'training' | 'quick_fight';

export type MatchPhase =
  | 'INIT'
  | 'ROUND_INTRO'
  | 'FIGHTING'
  | 'ROUND_OVER'
  | 'MATCH_OVER'
  | 'SUDDEN_DEATH';

export interface MatchSettings {
  mode: GameMode;
  roundsToWin: number;
  roundTimer: number; // seconds (e.g. 60 or 99 or 0 for infinite)
  difficulty: AIDifficulty;
  p1Character: FighterId;
  p2Character: FighterId;
  arena: 'stadium_day' | 'gully_cricket' | 'rooftop';
}

