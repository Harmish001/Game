export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private masterVol: number = 0.8;
  private sfxVol: number = 0.8;
  private musicVol: number = 0.5;

  private isMusicPlaying: boolean = false;
  private musicTimer: number | null = null;
  private musicStep: number = 0;

  constructor() {
    this.loadVolumes();
  }

  private initContext(): void {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVol;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.masterGain);
  }

  public ensureAudioStarted(): void {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- SFX SYNTHESIZERS ---

  public playLightHit(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Pitch envelope
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);

    // Click noise burst
    const noise = this.createNoiseBuffer(0.04);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    noiseSource.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
    noiseSource.start(t);
  }

  public playHeavyHit(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Deep sub-thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.22);

    // Distortion / grit
    const distortionOsc = this.ctx.createOscillator();
    const distGain = this.ctx.createGain();
    distortionOsc.type = 'sawtooth';
    distortionOsc.frequency.setValueAtTime(120, t);
    distortionOsc.frequency.exponentialRampToValueAtTime(40, t + 0.12);

    // Snap crack
    const noise = this.createNoiseBuffer(0.08);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    distGain.gain.setValueAtTime(0.5, t);
    distGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    distortionOsc.connect(distGain);
    distGain.connect(this.sfxGain);

    noiseSource.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.26);
    distortionOsc.start(t);
    distortionOsc.stop(t + 0.14);
    noiseSource.start(t);
  }

  public playBatHit(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Distinct willow bat "CRACK" sound (cricket bat sweet-spot strike)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);

    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(220, t);
    bass.frequency.exponentialRampToValueAtTime(45, t + 0.3);

    const noise = this.createNoiseBuffer(0.09);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    bassGain.gain.setValueAtTime(0.9, t);
    bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    bass.connect(bassGain);
    bassGain.connect(this.sfxGain);
    noiseSource.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);
    bass.start(t);
    bass.stop(t + 0.32);
    noiseSource.start(t);
  }

  public playBlock(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  public playWhoosh(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const noise = this.createNoiseBuffer(0.16);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1200, t + 0.07);
    filter.frequency.exponentialRampToValueAtTime(250, t + 0.16);
    filter.Q.value = 3.0;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noiseSource.start(t);
  }

  public playSuperFlash(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Dramatic rising energy pitch + gong boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.35);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

    // Deep boom
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(260, t + 0.25);
    boom.frequency.exponentialRampToValueAtTime(40, t + 0.8);
    boomGain.gain.setValueAtTime(1.0, t + 0.25);
    boomGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    boom.connect(boomGain);
    boomGain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.65);
    boom.start(t + 0.25);
    boom.stop(t + 0.85);
  }

  public playKO(): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Heavy dramatic KO impact
    const gong = this.ctx.createOscillator();
    const gongGain = this.ctx.createGain();
    gong.type = 'sine';
    gong.frequency.setValueAtTime(110, t);
    gong.frequency.exponentialRampToValueAtTime(25, t + 1.6);
    gongGain.gain.setValueAtTime(1.0, t);
    gongGain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

    const metal = this.ctx.createOscillator();
    const metalGain = this.ctx.createGain();
    metal.type = 'square';
    metal.frequency.setValueAtTime(440, t);
    metal.frequency.exponentialRampToValueAtTime(110, t + 0.6);
    metalGain.gain.setValueAtTime(0.4, t);
    metalGain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

    gong.connect(gongGain);
    gongGain.connect(this.sfxGain);
    metal.connect(metalGain);
    metalGain.connect(this.sfxGain);

    gong.start(t);
    gong.stop(t + 1.9);
    metal.start(t);
    metal.stop(t + 0.65);

    // Crowd burst on KO
    this.playCrowdCheer(1.5);
  }

  public playCrowdCheer(duration: number = 1.0): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const noise = this.createNoiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, t);
    filter.Q.value = 1.2;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0.45, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noiseSource.start(t);
  }

  public playAnnouncer(cue: 'round1' | 'round2' | 'finalround' | 'fight' | 'ko' | 'p1wins' | 'p2wins' | 'draw' | 'counter'): void {
    this.ensureAudioStarted();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Rich robotic/cyber announcer synthesized chord flourish
    const chords: Record<string, number[]> = {
      round1: [261.63, 329.63, 392.0], // C4 major
      round2: [293.66, 369.99, 440.0], // D4 major
      finalround: [220.0, 277.18, 329.63, 440.0], // Dramatic A minor
      fight: [392.0, 523.25, 659.25], // High explosive punch
      ko: [110.0, 164.81, 220.0], // Dark bass KO
      p1wins: [329.63, 392.0, 523.25, 659.25], // Victory fanfare
      p2wins: [329.63, 392.0, 523.25, 659.25],
      draw: [220.0, 293.66, 329.63],
      counter: [587.33, 739.99] // High chime
    };

    const notes = chords[cue] || [440];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);
      gain.gain.setValueAtTime(0.2, t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.45);
    });
  }

  // --- BACKGROUND MUSIC GENERATOR ---
  // Energetic stadium techno/dhol beat pattern

  public startBattleMusic(): void {
    this.ensureAudioStarted();
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    this.musicStep = 0;
    this.scheduleNextBeat();
  }

  public stopBattleMusic(): void {
    this.isMusicPlaying = false;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleNextBeat(): void {
    if (!this.isMusicPlaying || !this.ctx || !this.musicGain) return;

    const tempo = 128; // BPM
    const stepTime = (60 / tempo) / 4; // 16th notes
    const t = this.ctx.currentTime;

    const step = this.musicStep % 16;

    // Kick drum on beats 0, 4, 8, 12
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      this.synthKick(t);
    }

    // Snare / rimshot on 4, 12
    if (step === 4 || step === 12) {
      this.synthSnare(t);
    }

    // Hi-hat on every off-beat
    if (step % 2 === 1) {
      this.synthHiHat(t);
    }

    // Rolling dhol / bass synths on 2, 6, 10, 14
    if (step === 2 || step === 6 || step === 10 || step === 14) {
      this.synthBassNote(t, step);
    }

    this.musicStep++;
    this.musicTimer = window.setTimeout(() => {
      this.scheduleNextBeat();
    }, stepTime * 1000);
  }

  private synthKick(t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private synthSnare(t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const noise = this.createNoiseBuffer(0.12);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    noiseSource.connect(gain);
    gain.connect(this.musicGain);
    noiseSource.start(t);
  }

  private synthHiHat(t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const noise = this.createNoiseBuffer(0.03);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noiseSource.start(t);
  }

  private synthBassNote(t: number, step: number): void {
    if (!this.ctx || !this.musicGain) return;
    const notes = [65.41, 73.42, 65.41, 82.41]; // C2, D2, C2, E2
    const freq = notes[(step / 2) % notes.length];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Helper to create white noise
  private createNoiseBuffer(duration: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // --- VOLUME CONTROLS ---

  public setMasterVolume(v: number): void {
    this.masterVol = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.masterVol;
    this.saveVolumes();
  }

  public setSfxVolume(v: number): void {
    this.sfxVol = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
    this.saveVolumes();
  }

  public setMusicVolume(v: number): void {
    this.musicVol = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this.musicVol;
    this.saveVolumes();
  }

  public getMasterVolume(): number { return this.masterVol; }
  public getSfxVolume(): number { return this.sfxVol; }
  public getMusicVolume(): number { return this.musicVol; }

  private loadVolumes(): void {
    try {
      const mv = localStorage.getItem('cricket_clash_vol_master');
      if (mv !== null) this.masterVol = parseFloat(mv);
      const sv = localStorage.getItem('cricket_clash_vol_sfx');
      if (sv !== null) this.sfxVol = parseFloat(sv);
      const muv = localStorage.getItem('cricket_clash_vol_music');
      if (muv !== null) this.musicVol = parseFloat(muv);
    } catch {}
  }

  private saveVolumes(): void {
    try {
      localStorage.setItem('cricket_clash_vol_master', this.masterVol.toString());
      localStorage.setItem('cricket_clash_vol_sfx', this.sfxVol.toString());
      localStorage.setItem('cricket_clash_vol_music', this.musicVol.toString());
    } catch {}
  }
}

