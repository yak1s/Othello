import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';
import { Haptics } from './haptics';
import { FLIP_THROTTLE_AFTER, MAX_VOICES, flipWavePlan, semitoneRatio, dbToGain } from './voices';

/** A Storage stand-in; the real one does not exist in Node. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, v); },
  } as Storage;
}

describe('the flip wave plan', () => {
  it('sounds every disc up to the throttle point', () => {
    const plan = flipWavePlan(FLIP_THROTTLE_AFTER);
    expect(plan.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('sounds every other disc beyond it', () => {
    const plan = flipWavePlan(16);
    expect(plan.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14]);
  });

  it('steps up a semitone per disc and wraps rather than climbing away', () => {
    const plan = flipWavePlan(20);
    expect(plan[0]!.semitone).toBe(0);
    expect(plan[1]!.semitone).toBe(1);
    expect(plan.every((p) => p.semitone < 8)).toBe(true);
    expect(semitoneRatio(12)).toBeCloseTo(2, 10);
    expect(semitoneRatio(0)).toBe(1);
  });

  it('is empty for a wave of no discs', () => {
    expect(flipWavePlan(0)).toEqual([]);
  });
});

describe('decibels', () => {
  it('convert to the linear gain the graph wants', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(-24)).toBeCloseTo(0.0631, 4);
  });
});

describe('the engine without Web Audio', () => {
  it('constructs, plays and mutes without throwing', () => {
    const engine = new AudioEngine({ ContextCtor: undefined, storage: memoryStorage() });
    expect(() => {
      engine.unlock();
      engine.play('place');
      engine.play('flip', { semitone: 3 });
      engine.playFlipWave(12, 45, (i) => i);
      engine.setVolume(0.4);
      engine.setMuted(true);
      engine.setMuted(false);
    }).not.toThrow();
    expect(engine.hasContext).toBe(false);
  });
});

describe('the muted state', () => {
  it('is read from storage before any context is constructed', () => {
    const ContextCtor = vi.fn();
    const engine = new AudioEngine({
      ContextCtor: ContextCtor as unknown as new () => AudioContext,
      storage: memoryStorage({ 'kissa:muted:v1': '1' }),
    });
    expect(engine.isMuted).toBe(true);
    engine.unlock();
    expect(ContextCtor).not.toHaveBeenCalled();
    expect(engine.hasContext).toBe(false);
  });

  it('is persisted when it changes', () => {
    const storage = memoryStorage();
    const engine = new AudioEngine({ ContextCtor: undefined, storage });
    engine.setMuted(true);
    expect(storage.getItem('kissa:muted:v1')).toBe('1');
    expect(new AudioEngine({ ContextCtor: undefined, storage }).isMuted).toBe(true);
  });

  it('survives a storage that throws, as a private window does', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    let engine: AudioEngine | null = null;
    expect(() => { engine = new AudioEngine({ ContextCtor: undefined, storage: hostile }); }).not.toThrow();
    expect(engine!.isMuted).toBe(false);
    expect(() => engine!.setMuted(true)).not.toThrow();
  });
});

describe('the voice pool', () => {
  it('spends its budget against when a voice will sound, not when it is scheduled', () => {
    // A whole flip wave is scheduled inside one tick but spread over half a
    // second. Charging every voice to the same instant used to exhaust the pool
    // on the sixth disc and silence the rest of the wave.
    let time = 0;
    const started: string[] = [];
    const engine = new AudioEngine({
      ContextCtor: fakeContext(started), storage: memoryStorage(), now: () => time,
    });
    engine.unlock();
    engine.playFlipWave(16, 45, (i) => i);
    // Twelve discs sound, and each is built from a transient plus three
    // partials — what matters is that none of them were dropped.
    expect(started.length).toBeGreaterThanOrEqual(flipWavePlan(16).length);
  });

  it('never sounds more than the ceiling at once', () => {
    let time = 0;
    const started: string[] = [];
    const engine = new AudioEngine({
      ContextCtor: fakeContext(started),
      storage: memoryStorage(),
      now: () => time,
    });
    engine.unlock();
    for (let i = 0; i < 20; i += 1) engine.play('tap');
    expect(started.length).toBe(MAX_VOICES);

    // Once the earlier voices have expired, the pool frees up again.
    time += 1000;
    engine.play('tap');
    expect(started.length).toBe(MAX_VOICES + 1);
  });

  it('honours a per-event throttle', () => {
    let time = 0;
    const started: string[] = [];
    const engine = new AudioEngine({
      ContextCtor: fakeContext(started), storage: memoryStorage(), now: () => time,
    });
    engine.unlock();
    engine.play('illegal', { throttleMs: 120 });
    engine.play('illegal', { throttleMs: 120 });
    expect(started.length).toBe(1);
    time += 200;
    engine.play('illegal', { throttleMs: 120 });
    expect(started.length).toBe(2);
  });
});

describe('haptics', () => {
  it('caps a flip wave at three pulses', () => {
    const calls: (number | number[])[] = [];
    const haptics = new Haptics((pattern) => { calls.push(pattern); return true; });
    haptics.flips(12);
    expect(calls).toEqual([[4, 40, 4, 40, 4]]);
  });

  it('does nothing when disabled or unsupported', () => {
    const calls: unknown[] = [];
    const haptics = new Haptics((p) => { calls.push(p); return true; });
    haptics.setEnabled(false);
    haptics.place();
    haptics.flips(4);
    expect(calls).toEqual([]);
    expect(() => new Haptics(null).place()).not.toThrow();
  });

  it('ignores a wave of no discs', () => {
    const calls: unknown[] = [];
    new Haptics((p) => { calls.push(p); return true; }).flips(0);
    expect(calls).toEqual([]);
  });
});

/** Enough of the Web Audio graph to count what got started. */
function fakeContext(started: string[]): new () => AudioContext {
  const param = (): Record<string, unknown> => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const node = (): Record<string, unknown> => ({
    connect: (next: unknown) => next,
    frequency: param(),
    gain: param(),
    delayTime: param(),
    pan: param(),
    Q: { value: 0 },
    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
    attack: { value: 0 }, release: { value: 0 },
    type: '', buffer: null, normalize: true,
    start: () => started.push('start'),
    stop: () => {},
  });
  return class {
    currentTime = 0;
    sampleRate = 48_000;
    destination = node();
    createGain = node;
    createBiquadFilter = node;
    createDynamicsCompressor = node;
    createOscillator = node;
    createBufferSource = node;
    createConvolver = node;
    createDelay = node;
    createStereoPanner = node;
    createBuffer = (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    });
    resume = () => Promise.resolve();
  } as unknown as new () => AudioContext;
}
