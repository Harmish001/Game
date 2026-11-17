import { MatchPhase, MatchSettings } from './types';
import { Fighter } from './Fighter';
import { AudioManager } from '../engine/AudioManager';
import { SceneManager } from '../engine/SceneManager';
import { VFXSystem } from '../engine/VFXSystem';

export interface MatchStats {
  winner: 1 | 2 | 0; // 0 = draw
  roundsPlayed: number;
  p1DamageDealt: number;
  p2DamageDealt: number;
  p1MaxCombo: number;
  p2MaxCombo: number;
}

export class MatchManager {
  public phase: MatchPhase = 'INIT';
  public settings: MatchSettings;
  public currentRound: number = 1;
  public roundTimeRemaining: number = 60;
  public phaseTimer: number = 0;

  public p1RoundsWon: number = 0;
  public p2RoundsWon: number = 0;

  // Stats
  public stats: MatchStats = {
    winner: 0,
    roundsPlayed: 0,
    p1DamageDealt: 0,
    p2DamageDealt: 0,
    p1MaxCombo: 0,
    p2MaxCombo: 0
  };

  private audio?: AudioManager;
  private sceneManager?: SceneManager;
  private vfx?: VFXSystem;

  // Callbacks to UI
  public onPhaseChange?: (phase: MatchPhase, bannerText: string) => void;
  public onMatchComplete?: (stats: MatchStats) => void;

  constructor(
    settings: MatchSettings,
    audio?: AudioManager,
    sceneManager?: SceneManager,
    vfx?: VFXSystem
  ) {
    this.settings = settings;
    this.audio = audio;
    this.sceneManager = sceneManager;
    this.vfx = vfx;
  }

  public startMatch(p1: Fighter, p2: Fighter): void {
    this.currentRound = 1;
    this.p1RoundsWon = 0;
    this.p2RoundsWon = 0;
    this.stats = {
      winner: 0,
      roundsPlayed: 0,
      p1DamageDealt: 0,
      p2DamageDealt: 0,
      p1MaxCombo: 0,
      p2MaxCombo: 0
    };

    this.startRound(p1, p2);
  }

  public startRound(p1: Fighter, p2: Fighter): void {
    this.roundTimeRemaining = this.settings.roundTimer;
    this.phase = 'ROUND_INTRO';
    this.phaseTimer = 0;

    // Reset fighters to starting positions
    p1.resetForRound(-3.5, true);
    p2.resetForRound(3.5, false);

    // Announce Round
    const roundText = this.currentRound === 3 ? 'FINAL ROUND' : `ROUND ${this.currentRound}`;
    if (this.currentRound === 1) this.audio?.playAnnouncer('round1');
    else if (this.currentRound === 2) this.audio?.playAnnouncer('round2');
    else this.audio?.playAnnouncer('finalround');

    if (this.onPhaseChange) {
      this.onPhaseChange(this.phase, roundText);
    }
  }

  public update(p1: Fighter, p2: Fighter, dt: number): void {
    this.phaseTimer += dt;

    // Track max combo
    this.stats.p1MaxCombo = Math.max(this.stats.p1MaxCombo, p1.comboHitCount);
    this.stats.p2MaxCombo = Math.max(this.stats.p2MaxCombo, p2.comboHitCount);

    switch (this.phase) {
      case 'ROUND_INTRO': {
        // Long enough for Rohit Bow_RT (~3.75s) then FIGHT
        if (this.phaseTimer >= 3.6 && this.phaseTimer - dt < 3.6) {
          this.audio?.playAnnouncer('fight');
          if (this.onPhaseChange) {
            this.onPhaseChange(this.phase, 'FIGHT!');
          }
        }
        if (this.phaseTimer >= 4.2) {
          this.phase = 'FIGHTING';
          this.phaseTimer = 0;
          this.audio?.startBattleMusic();
          if (this.onPhaseChange) {
            this.onPhaseChange(this.phase, '');
          }
        }
        break;
      }

      case 'FIGHTING': {
        // Decrement timer (unless set to 0 = infinite)
        if (this.settings.roundTimer > 0) {
          this.roundTimeRemaining = Math.max(0, this.roundTimeRemaining - dt);
        }

        // 1. KO Check
        if (p1.health <= 0 || p2.health <= 0) {
          this.endRound(p1, p2, 'KO');
          return;
        }

        // 2. Time Up Check
        if (this.settings.roundTimer > 0 && this.roundTimeRemaining <= 0) {
          this.endRound(p1, p2, 'TIME_UP');
          return;
        }
        break;
      }

      case 'ROUND_OVER': {
        if (this.phaseTimer >= 3.0) {
          // Check if match won
          const required = this.settings.roundsToWin;
          if (this.p1RoundsWon >= required) {
            this.endMatch(1, p1, p2);
          } else if (this.p2RoundsWon >= required) {
            this.endMatch(2, p1, p2);
          } else {
            // Next Round
            this.currentRound++;
            this.startRound(p1, p2);
          }
        }
        break;
      }

      case 'MATCH_OVER': {
        // Waiting on results screen
        break;
      }
    }
  }

  private endRound(p1: Fighter, p2: Fighter, reason: 'KO' | 'TIME_UP'): void {
    this.phase = 'ROUND_OVER';
    this.phaseTimer = 0;
    this.stats.roundsPlayed++;

    if (reason === 'KO') {
      this.audio?.playKO();
      this.sceneManager?.triggerScreenShake(0.5, 0.4);
    }

    let winnerText = '';
    if (p1.health <= 0 && p2.health <= 0) {
      winnerText = 'DOUBLE K.O. — DRAW';
      this.audio?.playAnnouncer('draw');
    } else if (p2.health <= 0 || (reason === 'TIME_UP' && p1.health > p2.health)) {
      this.p1RoundsWon++;
      p1.changeState('WIN');
      p2.changeState('LOSE');
      winnerText = reason === 'KO' ? 'K.O.! PLAYER 1 WINS' : 'TIME UP! PLAYER 1 WINS';
      this.audio?.playAnnouncer('p1wins');
    } else if (p1.health <= 0 || (reason === 'TIME_UP' && p2.health > p1.health)) {
      this.p2RoundsWon++;
      p2.changeState('WIN');
      p1.changeState('LOSE');
      winnerText = reason === 'KO' ? 'K.O.! PLAYER 2 WINS' : 'TIME UP! PLAYER 2 WINS';
      this.audio?.playAnnouncer('p2wins');
    } else {
      winnerText = 'DRAW';
      this.audio?.playAnnouncer('draw');
    }

    if (this.onPhaseChange) {
      this.onPhaseChange(this.phase, winnerText);
    }
  }

  private endMatch(winner: 1 | 2, _p1: Fighter, _p2: Fighter): void {
    this.phase = 'MATCH_OVER';
    this.phaseTimer = 0;
    this.stats.winner = winner;
    this.audio?.stopBattleMusic();

    if (this.onMatchComplete) {
      this.onMatchComplete(this.stats);
    }
  }
}

