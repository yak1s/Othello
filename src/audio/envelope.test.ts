/* ============================================================================
   The click test.

   A click is not a matter of taste, it is a step in the waveform, and a step in
   the waveform comes from exactly two mistakes: a gain that jumps rather than
   ramps, and a source stopped while its gain is still non-zero. Both are
   decidable from the automation schedule alone, before a single sample is
   rendered — so this reads the schedule instead of listening to the output.

   The recorder below is a small AudioContext stand-in that writes down every
   automation call and every connection. `valueAt` then replays the Web Audio
   automation semantics in plain arithmetic, and the assertions are the two
   invariants stated in engine.ts:

     * every gain envelope starts at zero, moves no faster than MIN_FADE, and
       returns to exactly zero;
     * at the instant any source stops, the product of the gains between it and
       the destination is zero.

   The rendered-audio counterpart — clipping, DC, balance, the room, the stereo
   placement — is `tests/e2e/audio.spec.ts`, which needs a real browser.
   ========================================================================= */

import { describe, expect, it } from 'vitest';
import { AudioEngine } from './engine';
import { MIN_FADE, VOICES, type VoiceName } from './voices';

type Event =
  | { kind: 'set'; time: number; value: number }
  | { kind: 'linear'; time: number; value: number }
  | { kind: 'exp'; time: number; value: number }
  | { kind: 'target'; time: number; value: number; tau: number };

interface Recorded {
  gains: { id: number; events: Event[] }[];
  sources: { id: number; start: number; stop: number }[];
  /** node id → the gain params on the path from it to the destination. */
  edges: Map<number, number[]>;
  gainOf: Map<number, Event[]>;
}

/** Web Audio's automation semantics, in arithmetic. */
export function valueAt(events: Event[], t: number): number {
  let value = 0;
  let prev = -Infinity;
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]!;
    if (e.time > t) {
      if (e.kind === 'linear') {
        const span = e.time - prev;
        return span <= 0 ? e.value : value + (e.value - value) * ((t - prev) / span);
      }
      return value;
    }
    if (e.kind === 'target') {
      const next = events[i + 1];
      const until = next ? Math.min(next.time, t) : t;
      value = e.value + (value - e.value) * Math.exp(-(until - e.time) / e.tau);
      prev = until;
      if (!next || next.time > t) return value;
    } else {
      value = e.value;
      prev = e.time;
    }
  }
  return value;
}

function recorder(): { ContextCtor: new () => AudioContext; taken: () => Recorded } {
  let nextId = 1;
  const gainOf = new Map<number, Event[]>();
  const sources: Recorded['sources'] = [];
  const wires: [number, number][] = [];
  const DESTINATION = 0;

  const param = (events?: Event[]): AudioParam => {
    const log = events ?? [];
    return {
      value: 0,
      setValueAtTime(v: number, t: number) { log.push({ kind: 'set', time: t, value: v }); return this; },
      linearRampToValueAtTime(v: number, t: number) { log.push({ kind: 'linear', time: t, value: v }); return this; },
      exponentialRampToValueAtTime(v: number, t: number) { log.push({ kind: 'exp', time: t, value: v }); return this; },
      setTargetAtTime(v: number, t: number, tau: number) { log.push({ kind: 'target', time: t, value: v, tau }); return this; },
    } as unknown as AudioParam;
  };

  const make = (kind: 'gain' | 'source' | 'other'): Record<string, unknown> => {
    const id = nextId++;
    const events: Event[] = [];
    if (kind === 'gain') gainOf.set(id, events);
    const self: Record<string, unknown> = {
      __id: id,
      connect(next: { __id?: number }) { wires.push([id, next.__id ?? DESTINATION]); return next; },
      gain: kind === 'gain'
        ? Object.assign(param(events), {
          // A plain assignment is a step too, so record it as one at time zero.
          set value(v: number) { events.push({ kind: 'set', time: 0, value: v }); },
          get value() { return 0; },
        })
        : param(),
      frequency: param(),
      delayTime: param(),
      pan: param(),
      Q: { value: 0 },
      threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
      attack: { value: 0 }, release: { value: 0 },
      type: '', buffer: null, normalize: true,
      start(t = 0) { if (kind === 'source') sources.push({ id, start: t, stop: Infinity }); },
      stop(t = 0) {
        const found = sources.find((s) => s.id === id);
        if (found) found.stop = t;
      },
    };
    return self;
  };

  class Ctx {
    currentTime = 0;
    sampleRate = 48_000;
    destination = { __id: DESTINATION, connect: () => undefined };
    createGain = () => make('gain');
    createBiquadFilter = () => make('other');
    createDynamicsCompressor = () => make('other');
    createConvolver = () => make('other');
    createDelay = () => make('other');
    createStereoPanner = () => make('other');
    createOscillator = () => make('source');
    createBufferSource = () => make('source');
    createBuffer = (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
    resume = () => Promise.resolve();
  }

  return {
    ContextCtor: Ctx as unknown as new () => AudioContext,
    taken: () => {
      // Every gain param between a node and the destination, found by walking.
      const out = new Map<number, number[]>();
      const from = new Map<number, number[]>();
      for (const [a, b] of wires) from.set(a, [...(from.get(a) ?? []), b]);
      const walk = (id: number, seen: Set<number>): number[] => {
        if (id === DESTINATION || seen.has(id)) return [];
        seen.add(id);
        const found: number[] = gainOf.has(id) ? [id] : [];
        for (const next of from.get(id) ?? []) found.push(...walk(next, seen));
        return found;
      };
      for (const source of sources) out.set(source.id, walk(source.id, new Set()));
      return {
        gains: [...gainOf].map(([id, events]) => ({ id, events })),
        sources,
        edges: out,
        gainOf,
      };
    },
  };
}

/** Everything one voice schedules, with the master gain wound fully open. */
function scheduleFor(play: (engine: AudioEngine) => void): Recorded {
  const { ContextCtor, taken } = recorder();
  const engine = new AudioEngine({ ContextCtor, storage: null, now: () => 0, random: () => 0.5 });
  engine.unlock();
  engine.setVolume(1);
  play(engine);
  return taken();
}

const NAMES = Object.keys(VOICES) as VoiceName[];

describe('every envelope', () => {
  for (const name of NAMES) {
    it(`opens and closes ${name} without a step`, () => {
      const rec = scheduleFor((engine) => engine.play(name));
      const shaped = rec.gains.filter((g) => g.events.length > 2);
      expect(shaped.length, `${name} scheduled no envelope at all`).toBeGreaterThan(0);

      for (const { events } of shaped) {
        const first = events[0]!.time;
        const last = events[events.length - 1]!.time;
        expect(valueAt(events, first), 'an envelope starts open').toBe(0);
        expect(valueAt(events, last), 'an envelope is left open').toBe(0);
        expect(valueAt(events, last + 1), 'an envelope reopens after it ends').toBe(0);

        // The envelope never moves faster than the shortest fade the design
        // allows. This is the click test: a jump would show up here as a step
        // far larger than one sampling interval's worth of the fastest ramp.
        const step = 0.00002;
        let peak = 0;
        for (let t = first; t <= last; t += step) peak = Math.max(peak, valueAt(events, t));
        const ceiling = (peak * step) / MIN_FADE * 1.05;
        let worst = 0;
        let previous = valueAt(events, first);
        for (let t = first + step; t <= last + step; t += step) {
          const value = valueAt(events, t);
          worst = Math.max(worst, Math.abs(value - previous));
          previous = value;
        }
        expect(worst, `${name} moves faster than a ${MIN_FADE * 1000}ms fade`).toBeLessThanOrEqual(ceiling);
      }
    });

    it(`silences every source of ${name} before stopping it`, () => {
      const rec = scheduleFor((engine) => engine.play(name));
      expect(rec.sources.length, `${name} started nothing`).toBeGreaterThan(0);
      for (const source of rec.sources) {
        expect(source.stop, 'a source was started and never stopped').toBeLessThan(Infinity);
        const path = rec.edges.get(source.id) ?? [];
        expect(path.length, 'a source reaches the output through no gain at all').toBeGreaterThan(0);
        const level = path.reduce(
          (product, id) => product * valueAt(rec.gainOf.get(id)!, source.stop), 1,
        );
        expect(level, `${name} stops a source while it is still sounding`).toBeCloseTo(0, 9);
      }
    });
  }
});

describe('the detector itself', () => {
  it('catches an envelope that jumps rather than ramps', () => {
    const events: Event[] = [
      { kind: 'set', time: 0, value: 0 },
      { kind: 'set', time: 0.01, value: 0.5 },
      { kind: 'linear', time: 0.05, value: 0 },
    ];
    const step = 0.00002;
    let worst = 0;
    let previous = valueAt(events, 0);
    for (let t = step; t <= 0.05; t += step) {
      const value = valueAt(events, t);
      worst = Math.max(worst, Math.abs(value - previous));
      previous = value;
    }
    // A hard step is the full level inside one sampling interval, thousands of
    // times more than a MIN_FADE ramp can move in the same time.
    expect(worst).toBeGreaterThan(0.49);
    expect(worst).toBeGreaterThan((0.5 * step) / MIN_FADE * 1.05);
  });

  it('replays a ramp, a hold and an exponential approach', () => {
    const events: Event[] = [
      { kind: 'set', time: 0, value: 0 },
      { kind: 'linear', time: 1, value: 1 },
      { kind: 'target', time: 1, value: 0, tau: 1 },
    ];
    expect(valueAt(events, 0)).toBe(0);
    expect(valueAt(events, 0.5)).toBeCloseTo(0.5, 12);
    expect(valueAt(events, 1)).toBeCloseTo(1, 12);
    expect(valueAt(events, 2)).toBeCloseTo(Math.exp(-1), 12);
    expect(valueAt(events, 3)).toBeCloseTo(Math.exp(-2), 12);
  });
});
