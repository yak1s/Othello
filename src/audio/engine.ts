/* ============================================================================
   The audio engine (brief §10).

   One AudioContext, created on the first user gesture and never before — iOS
   requires it and will otherwise produce silence for the rest of the session.
   A muted user never constructs one at all. Everything degrades to a no-op if
   Web Audio is missing, because sound is never the reason a game cannot start.

   The graph, once:

       voice ─┬─ pan ─────────────────► bus ─► limiter ─► master ─► out
              └─ send ─► predelay ─► convolver ─► wet ──┘

   Three things make the difference between this and a beeping web page, and all
   three are here rather than in any one recipe:

   * **Every envelope starts and ends at exactly zero**, with a fade of at least
     `MIN_FADE` at each end. A gain that jumps to its peak, or a source stopped
     while its gain is still non-zero, is a step in the waveform, and a step is
     a click. `tests/e2e/audio.spec.ts` renders every voice and measures this.
   * **A room.** The impulse response is synthesised at unlock — noise under an
     exponential decay, lowpassed, with the two channels decorrelated — so every
     voice is heard in the same small panelled space instead of in a vacuum.
     It costs no bytes and it is what stops the sounds feeling stuck to the
     glass.
   * **Nothing is ever identical twice.** The noise buffer is read from a random
     offset on every burst and the placements are pitch-jittered, so a board
     full of moves does not sound like one sample retriggered.
   ========================================================================= */

import {
  MAX_VOICES, MIN_FADE, ROOM, VOICES, dbToGain, flipWavePlan, semitoneRatio, type VoiceName,
} from './voices';

type ContextCtor = new () => AudioContext;

/** A shaped gain, and the moment it is guaranteed to have reached zero. */
interface Envelope { node: GainNode; end: number }

export interface AudioDeps {
  /** Injected so the engine is testable in Node, where there is no Web Audio. */
  ContextCtor?: ContextCtor | undefined;
  storage?: Storage | null;
  now?: () => number;
  /** Injected so a render test is reproducible. */
  random?: () => number;
}

export interface PlayOptions {
  /** Transposition, in semitones. */
  semitone?: number;
  /** Schedule this far ahead of now. */
  delayMs?: number;
  /** Drop the event if this voice sounded more recently than this. */
  throttleMs?: number;
  /** Where it happened, −1 (left) to 1 (right). Board columns use this. */
  pan?: number;
}

const MUTE_KEY = 'kissa:muted:v1';
/** Two seconds, so a burst can start anywhere in it and never run off the end. */
const NOISE_SECONDS = 2;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private room: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted: boolean;
  private volume = 0.7;
  /** Expiry times of the voices currently sounding. */
  private active: number[] = [];
  private lastAt: Partial<Record<VoiceName, number>> = {};

  private readonly ContextCtor: ContextCtor | undefined;
  private readonly storage: Storage | null;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(deps: AudioDeps = {}) {
    this.ContextCtor = deps.ContextCtor !== undefined
      ? deps.ContextCtor
      : (globalThis as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor })
        .AudioContext
      ?? (globalThis as { webkitAudioContext?: ContextCtor }).webkitAudioContext;
    this.storage = deps.storage !== undefined ? deps.storage : safeStorage();
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
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
      // Ramped, never assigned: a jump in the master gain is a click across
      // everything that happens to be sounding.
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

      // A limiter, not a compressor: a high threshold and a hard ratio catch the
      // one peak where a long flip wave lands on top of a placement, and leave
      // everything below it completely untouched. The old settings squeezed the
      // whole wave and made it pump.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.18;

      const bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(limiter);
      limiter.connect(master);
      master.connect(ctx.destination);

      // The room. One convolver for the whole app, fed by per-voice sends.
      const wet = ctx.createGain();
      wet.gain.value = dbToGain(ROOM.wetDb);
      const convolver = ctx.createConvolver();
      // Normalised, so `wetDb` means the same thing at every sample rate and
      // whatever the impulse's own amplitude happens to come out at. Left raw,
      // the convolution of a 0.9-second tail summed to more than unity and the
      // room alone pushed the game-over figure into the limiter.
      convolver.normalize = true;
      convolver.buffer = makeRoom(ctx, this.random);
      const predelay = ctx.createDelay(0.2);
      predelay.delayTime.value = ROOM.predelayMs / 1000;
      predelay.connect(convolver);
      convolver.connect(wet);
      wet.connect(bus);

      this.ctx = ctx;
      this.master = master;
      this.bus = bus;
      this.room = predelay;
      this.noise = makeNoise(ctx, this.random);
      void ctx.resume?.();
    } catch {
      this.ctx = null;
      this.master = null;
      this.bus = null;
      this.room = null;
    }
  }

  /** Play one voice. */
  play(name: VoiceName, options: PlayOptions = {}): void {
    if (this.muted || !this.ctx || !this.bus) return;
    const throttle = options.throttleMs ?? 0;
    if (throttle > 0) {
      const last = this.lastAt[name] ?? -Infinity;
      if (this.now() - last < throttle) return;
      this.lastAt[name] = this.now();
    }
    const delayMs = options.delayMs ?? 0;
    // The budget is spent against the moment the voice will actually sound, not
    // the moment it is scheduled. Scheduling a whole flip wave in one tick used
    // to exhaust the pool instantly and silence everything past the sixth disc.
    if (!this.claimVoice(this.now() + delayMs)) return;

    const at = this.ctx.currentTime + delayMs / 1000;
    try {
      this.render(name, at, semitoneRatio(options.semitone ?? 0), options.pan ?? 0);
    } catch {
      // A synthesis failure is not worth interrupting a move for.
    }
  }

  /**
   * The whole flip wave at once, so the throttling and the pitch ladder are
   * decided in one place. `stepMs` is the animation's own stagger.
   */
  playFlipWave(
    count: number,
    stepMs: number,
    distanceOf: (index: number) => number,
    panOf?: (index: number) => number,
  ): void {
    if (this.muted || !this.ctx) return;
    for (const { index, semitone } of flipWavePlan(count)) {
      this.play('flip', {
        semitone,
        delayMs: distanceOf(index) * stepMs,
        ...(panOf ? { pan: panOf(index) } : {}),
      });
    }
  }

  private claimVoice(startAt: number): boolean {
    this.active = this.active.filter((expiry) => expiry > startAt);
    if (this.active.length >= MAX_VOICES) return false;
    this.active.push(startAt + 400);
    return true;
  }

  /* ── the graph a single voice is built on ────────────────────────────── */

  /**
   * Where one voice's output goes: through its own panner into the dry bus, and
   * through its own send into the shared room. Built per voice rather than
   * shared, because the pan is per event.
   */
  private outputFor(name: VoiceName, pan: number): AudioNode {
    const ctx = this.ctx!;
    const head = ctx.createGain();
    head.gain.value = 1;

    let dry: AudioNode = head;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      head.connect(panner);
      dry = panner;
    }
    dry.connect(this.bus!);

    const sendGain = dbToGain(VOICES[name].sendDb);
    if (sendGain > 0 && this.room) {
      const send = ctx.createGain();
      send.gain.value = sendGain;
      head.connect(send);
      send.connect(this.room);
    }
    return head;
  }

  /* ── synthesis ───────────────────────────────────────────────────────── */

  private render(name: VoiceName, at: number, ratio: number, pan: number): void {
    const voice = VOICES[name];
    const p = voice.params;
    const gain = dbToGain(voice.gainDb);
    const out = this.outputFor(name, pan);

    switch (name) {
      case 'place': {
        const jitter = 1 + (this.random() * 2 - 1) * p.pitchJitter!;
        this.tick(out, at, p.tickHz! * jitter, p.tickQ!, p.tickMs! / 1000, gain * p.tickMix!);
        this.body(out, at, p.bodyHz! * jitter, p.bodyToHz! * jitter, p.bodyMs! / 1000, gain * p.bodyMix!);
        this.body(out, at, p.subHz! * jitter, p.subHz! * jitter * 0.86, p.subMs! / 1000, gain * p.subMix!);
        break;
      }
      case 'flip': {
        this.tick(out, at, p.tickHz! * ratio, p.tickQ!, p.tickMs! / 1000, gain * p.tickMix!);
        this.struck(out, at, p.bodyHz! * ratio, p.bodyMs! / 1000, gain, p.partialRatio!, p.partialMix!);
        break;
      }
      case 'illegal': {
        // No transient at all: nothing was struck, the move simply did not take.
        this.body(out, at, p.thudHz!, p.thudToHz!, p.thudMs! / 1000, gain, p.lowpassHz!);
        break;
      }
      case 'turn':
      case 'sheet': {
        this.brush(out, at, p.noiseMs! / 1000, gain, p.fromHz!, p.toHz!, p.q!);
        break;
      }
      case 'tap': {
        this.tick(out, at, p.tickHz!, p.tickQ!, p.tickMs! / 1000, gain);
        break;
      }
      case 'tick': {
        this.struck(out, at, p.toneHz!, p.toneMs! / 1000, gain, p.partialRatio!, p.partialMix!);
        break;
      }
      case 'pass':
      case 'peerJoin':
      case 'peerLeave': {
        const note = p.noteMs! / 1000;
        this.struck(out, at, p.firstHz!, note, gain, p.partialRatio!, p.partialMix!);
        this.struck(out, at + (p.noteMs! + p.gapMs!) / 1000, p.secondHz!, note,
          gain * p.decay!, p.partialRatio!, p.partialMix!);
        break;
      }
      case 'end': {
        const note = p.noteMs! / 1000;
        const step = (p.noteMs! + p.gapMs!) / 1000;
        this.struck(out, at, p.rootHz!, note, gain, p.partialRatio!, p.partialMix!);
        this.struck(out, at + step, p.secondHz!, note, gain * p.decay!, p.partialRatio!, p.partialMix!);
        // The last note is held longer and lets the room finish it.
        this.struck(out, at + step * 2, p.thirdHz!, note * 1.8,
          gain * p.decay! * 0.85, p.partialRatio!, p.partialMix!);
        break;
      }
    }
  }

  /** The transient: a very short band of noise. What tells you it was struck. */
  private tick(out: AudioNode, at: number, hz: number, q: number, seconds: number, gain: number): void {
    const ctx = this.ctx!;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = clampHz(ctx, hz);
    band.Q.value = q;
    band.connect(out);
    this.burst(band, at, seconds, gain);
  }

  /** The body: a sine that falls in pitch as it dies, optionally lowpassed. */
  private body(
    out: AudioNode, at: number, fromHz: number, toHz: number,
    seconds: number, gain: number, lowpassHz?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(clampHz(ctx, fromHz), at);
    osc.frequency.exponentialRampToValueAtTime(clampHz(ctx, toHz), at + seconds);

    let node: AudioNode = osc;
    if (lowpassHz !== undefined) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = clampHz(ctx, lowpassHz);
      osc.connect(low);
      node = low;
    }
    const env = this.envelope(at, seconds, gain);
    node.connect(env.node);
    env.node.connect(out);
    osc.start(at);
    osc.stop(env.end);
  }

  /**
   * A struck bar: a fundamental with two inharmonic partials above it, each
   * quieter and shorter-lived than the one below. This is what makes the pitched
   * voices read as wood rather than as an oscillator.
   */
  private struck(
    out: AudioNode, at: number, hz: number, seconds: number,
    gain: number, partialRatio: number, partialMix: number,
  ): void {
    const ctx = this.ctx!;
    const layers: [number, number, number][] = [
      [1, gain, seconds],
      [partialRatio, gain * partialMix, seconds * 0.42],
      [partialRatio * 1.96, gain * partialMix * 0.4, seconds * 0.2],
    ];
    for (const [ratio, level, length] of layers) {
      const freq = hz * ratio;
      if (freq >= ctx.sampleRate / 2 || level <= 0) continue;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = this.envelope(at, length, level);
      osc.connect(env.node);
      env.node.connect(out);
      osc.start(at);
      osc.stop(env.end);
    }
  }

  /** A brush: noise through a bandpass that opens and closes across the sound. */
  private brush(
    out: AudioNode, at: number, seconds: number, gain: number,
    fromHz: number, toHz: number, q: number,
  ): void {
    const ctx = this.ctx!;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(clampHz(ctx, fromHz), at);
    band.frequency.exponentialRampToValueAtTime(clampHz(ctx, toHz), at + seconds);
    band.connect(out);
    this.burst(band, at, seconds, gain, 0.35);
  }

  /**
   * Noise into whatever shapes it. The read head starts at a random offset, so
   * two bursts of the same voice are never the same noise — which is most of
   * why one buffer can serve the whole app without sounding looped.
   */
  private burst(into: AudioNode, at: number, seconds: number, gain: number, peakAt = 0.12): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const env = this.envelope(at, seconds, gain, peakAt);
    source.connect(env.node);
    env.node.connect(into);
    const offset = this.random() * Math.max(0, NOISE_SECONDS - seconds - 0.05);
    source.start(at, offset);
    source.stop(env.end);
  }

  /**
   * The one envelope every voice uses, and the reason none of them click.
   *
   * It starts at exactly zero, fades in over at least `MIN_FADE`, decays
   * exponentially towards silence, and is then brought to exactly zero by a
   * final short linear ramp — `setTargetAtTime` approaches zero without ever
   * arriving, so stopping the source without that last ramp leaves a step in
   * the waveform. `peakAt` is where in the sound the peak falls, as a fraction:
   * 0.12 is percussive, 0.35 is a brush.
   */
  private envelope(at: number, seconds: number, gain: number, peakAt = 0.12): Envelope {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    const attack = Math.max(MIN_FADE, seconds * peakAt);
    // The fade out is never shortened to fit a brief sound. Squeezing it into a
    // quarter of a five-millisecond tick made the fastest edge in the app
    // faster than the floor the floor exists to set, which is the one thing
    // MIN_FADE is for.
    const span = Math.max(seconds, attack + MIN_FADE);
    const end = at + span;
    const peaked = at + attack;
    const cut = end - MIN_FADE;
    // A time constant that puts the tail around −45 dB by the time it is cut.
    const tau = Math.max(0.004, (span - attack) / 5);

    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, peaked);
    env.gain.setTargetAtTime(0, peaked, tau);
    // Where the exponential tail has actually got to by the cut, worked out
    // rather than read back: `gain.value` is the value *now*, not the value the
    // schedule will hold then, and handing it the wrong number is the very step
    // this whole envelope exists to avoid. `cancelAndHoldAtTime` would do the
    // same job in one call and is still missing from browsers we support.
    env.gain.setValueAtTime(gain * Math.exp(-(cut - peaked) / tau), cut);
    env.gain.linearRampToValueAtTime(0, end);
    return { node: env, end };
  }
}

/** Two seconds of pink-ish noise, read from a random offset by every burst.
    Pink rather than white: white noise is all treble and it is what makes
    synthesised percussion sound like static rather than like an object. */
function makeNoise(ctx: BaseAudioContext, random: () => number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Paul Kellet's economy pink filter: three poles, close enough to −3 dB per
  // octave across the band that matters and cheap enough to run per sample.
  let b0 = 0; let b1 = 0; let b2 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.28;
  }
  return buffer;
}

/**
 * The room, synthesised. Noise under an exponential decay, darkened as it goes
 * and with the two channels generated independently so the tail has width.
 * A file would have been simpler and would have cost forty kilobytes.
 */
function makeRoom(ctx: BaseAudioContext, random: () => number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * ROOM.seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  // A one-pole lowpass whose cutoff falls with the tail: early reflections keep
  // their brightness, the late tail is all body, which is what a soft room does.
  const base = 1 - Math.exp((-2 * Math.PI * ROOM.toneHz) / ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let state = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const decay = Math.exp(-ROOM.decay * t);
      state += (random() * 2 - 1) * base * (0.35 + 0.65 * decay) - state * base * (0.35 + 0.65 * decay);
      // Fade the very start in and the very end out, so the impulse itself
      // cannot introduce the discontinuity the envelopes work to avoid.
      const edge = Math.min(1, i / 64, (length - i) / 512);
      data[i] = state * decay * edge;
    }
  }
  return buffer;
}

/** Nothing is ever scheduled above Nyquist, where it would fold back as noise. */
const clampHz = (ctx: BaseAudioContext, hz: number): number =>
  Math.max(20, Math.min(hz, ctx.sampleRate * 0.45));

function safeStorage(): Storage | null {
  try { return globalThis.localStorage; } catch { return null; }
}

function readMuted(storage: Storage | null): boolean {
  try { return storage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
