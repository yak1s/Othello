/* ============================================================================
   The audio engine (brief §10).

   One AudioContext, created on the first user gesture and never before — iOS
   requires it and will otherwise produce silence for the rest of the session.
   A muted user never constructs one at all. Everything degrades to a no-op if
   Web Audio is missing, because sound is never the reason a game cannot start.
   ========================================================================= */

import { MAX_VOICES, VOICES, dbToGain, flipWavePlan, semitoneRatio, type VoiceName } from './voices';

type ContextCtor = new () => AudioContext;

export interface AudioDeps {
  /** Injected so the engine is testable in Node, where there is no Web Audio. */
  ContextCtor?: ContextCtor | undefined;
  storage?: Storage | null;
  now?: () => number;
}

const MUTE_KEY = 'kissa:muted:v1';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted: boolean;
  private volume = 0.7;
  /** Start times of the voices currently sounding, oldest first. */
  private active: number[] = [];
  private lastAt: Partial<Record<VoiceName, number>> = {};

  private readonly ContextCtor: ContextCtor | undefined;
  private readonly storage: Storage | null;
  private readonly now: () => number;

  constructor(deps: AudioDeps = {}) {
    this.ContextCtor = deps.ContextCtor !== undefined
      ? deps.ContextCtor
      : (globalThis as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor })
        .AudioContext
      ?? (globalThis as { webkitAudioContext?: ContextCtor }).webkitAudioContext;
    this.storage = deps.storage !== undefined ? deps.storage : safeStorage();
    this.now = deps.now ?? (() => Date.now());
    // Read before anything is constructed: a muted user gets no context at all.
    // Guarded, because Safari in a private window throws on the read itself.
    this.muted = readMuted(this.storage);
  }

  get isMuted(): boolean { return this.muted; }
  get hasContext(): boolean { return this.ctx !== null; }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try { this.storage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private window */ }
    if (muted) this.active = [];
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Call from the first user gesture. Safe to call repeatedly; safe to call when
   * muted or unsupported, in which case it does nothing at all.
   */
  unlock(): void {
    if (this.muted || this.ctx || !this.ContextCtor) return;
    try {
      const ctx = new this.ContextCtor();
      const master = ctx.createGain();
      master.gain.value = this.volume;
      // A soft compressor keeps a long flip wave from stacking into a click.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      master.connect(comp).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noise = makeNoise(ctx);
      void ctx.resume?.();
    } catch {
      this.ctx = null;
    }
  }

  /** Play one voice. `detune` is in semitones; `delayMs` schedules it ahead. */
  play(name: VoiceName, options: { semitone?: number; delayMs?: number; throttleMs?: number } = {}): void {
    if (this.muted || !this.ctx || !this.master) return;
    const throttle = options.throttleMs ?? 0;
    if (throttle > 0) {
      const last = this.lastAt[name] ?? -Infinity;
      if (this.now() - last < throttle) return;
      this.lastAt[name] = this.now();
    }
    if (!this.claimVoice()) return;

    const at = this.ctx.currentTime + (options.delayMs ?? 0) / 1000;
    const gain = dbToGain(VOICES[name].gainDb);
    const ratio = semitoneRatio(options.semitone ?? 0);
    try {
      this.render(name, at, gain, ratio);
    } catch {
      // A synthesis failure is not worth interrupting a move for.
    }
  }

  /**
   * The whole flip wave at once, so the throttling and the pitch ladder are
   * decided in one place. `stepMs` is the animation's own stagger.
   */
  playFlipWave(count: number, stepMs: number, distanceOf: (index: number) => number): void {
    if (this.muted || !this.ctx) return;
    for (const { index, semitone } of flipWavePlan(count)) {
      this.play('flip', { semitone, delayMs: distanceOf(index) * stepMs });
    }
  }

  private claimVoice(): boolean {
    const now = this.now();
    this.active = this.active.filter((expiry) => expiry > now);
    if (this.active.length >= MAX_VOICES) return false;
    this.active.push(now + 400);
    return true;
  }

  /* ── synthesis ───────────────────────────────────────────────────────── */

  private render(name: VoiceName, at: number, gain: number, ratio: number): void {
    const ctx = this.ctx!;
    const out = this.master!;
    const p = VOICES[name].params;

    switch (name) {
      case 'place': {
        const jitter = 1 + (Math.random() * 2 - 1) * p.pitchJitter!;
        this.burst(at, p.noiseMs! / 1000, gain * (1 - p.thudMix!), (node) => {
          const band = ctx.createBiquadFilter();
          band.type = 'bandpass';
          band.frequency.value = p.bandHz! * jitter;
          band.Q.value = p.bandQ!;
          node.connect(band);
          return band;
        });
        this.tone(at, p.thudHz! * jitter, p.thudMs! / 1000, gain * p.thudMix!, 'sine');
        break;
      }
      case 'flip': {
        this.burst(at, p.clickMs! / 1000, gain, (node) => {
          const band = ctx.createBiquadFilter();
          band.type = 'bandpass';
          band.frequency.value = p.clickHz! * ratio;
          band.Q.value = p.bandQ!;
          node.connect(band);
          return band;
        });
        break;
      }
      case 'illegal': {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = p.lowpassHz!;
        this.tone(at, p.thudHz!, p.thudMs! / 1000, gain, 'sine', filter);
        break;
      }
      case 'turn':
      case 'sheet': {
        this.burst(at, p.noiseMs! / 1000, gain, (node) => {
          const low = ctx.createBiquadFilter();
          low.type = 'lowpass';
          low.frequency.value = p.lowpassHz!;
          if (p.sweepTo !== undefined) {
            low.frequency.setValueAtTime(p.lowpassHz!, at);
            low.frequency.exponentialRampToValueAtTime(p.sweepTo, at + p.noiseMs! / 1000);
          }
          if (p.highpassHz !== undefined) {
            const high = ctx.createBiquadFilter();
            high.type = 'highpass';
            high.frequency.value = p.highpassHz;
            node.connect(high).connect(low);
            return low;
          }
          node.connect(low);
          return low;
        });
        break;
      }
      case 'pass':
      case 'peerJoin':
      case 'peerLeave': {
        this.tone(at, p.firstHz!, p.noteMs! / 1000, gain, 'triangle');
        this.tone(at + (p.noteMs! + p.gapMs!) / 1000, p.secondHz!, p.noteMs! / 1000, gain * p.decay!, 'triangle');
        break;
      }
      case 'tick': {
        this.tone(at, p.toneHz!, p.toneMs! / 1000, gain, 'sine');
        break;
      }
      case 'end': {
        const step = (p.noteMs! + p.gapMs!) / 1000;
        this.tone(at, p.rootHz!, p.noteMs! / 1000, gain, 'triangle');
        this.tone(at + step, p.secondHz!, p.noteMs! / 1000, gain * p.decay!, 'triangle');
        this.tone(at + step * 2, p.thirdHz!, (p.noteMs! * 1.6) / 1000, gain * p.decay! * 0.8, 'triangle');
        break;
      }
      case 'tap': {
        this.tone(at, p.toneHz!, p.toneMs! / 1000, gain, 'square');
        break;
      }
      default:
        void out;
    }
  }

  private tone(
    at: number,
    hz: number,
    seconds: number,
    gain: number,
    type: OscillatorType,
    through?: BiquadFilterNode,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    if (through) osc.connect(through).connect(env).connect(this.master!);
    else osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }

  private burst(
    at: number,
    seconds: number,
    gain: number,
    shape: (node: AudioBufferSourceNode) => AudioNode,
  ): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    shape(source).connect(env).connect(this.master!);
    source.start(at);
    source.stop(at + seconds + 0.02);
  }
}

/** One second of white noise, reused by every burst. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function safeStorage(): Storage | null {
  try { return globalThis.localStorage; } catch { return null; }
}

function readMuted(storage: Storage | null): boolean {
  try { return storage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
