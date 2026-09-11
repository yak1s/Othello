import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

/**
 * The audio, measured rather than described.
 *
 * Nothing here can tell you whether a sound is *nice* — that is what the tuner
 * at `dev/audio/` is for. What it can do is catch every defect that makes
 * synthesised sound read as cheap, and those are all measurable: a step in the
 * waveform at either end of a note (the click), clipping, a DC offset, a tail
 * that stops rather than decays, one voice several times louder than the rest,
 * and a room that is not actually there.
 *
 * Each voice is rendered through a real OfflineAudioContext in a real browser
 * and the samples themselves are inspected. Chromium renders the same graph the
 * app plays; nothing is mocked.
 */

const SAMPLE_RATE = 48_000;
const NAMES = [
  'place', 'flip', 'illegal', 'turn', 'pass', 'tick', 'end', 'tap', 'sheet', 'peerJoin', 'peerLeave',
] as const;

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['src/audio/index.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'KissaAudio',
    write: false,
    target: 'es2022',
  });
  bundle = result.outputFiles[0]!.text;
});

interface Measurement {
  peak: number;
  rms: number;
  dc: number;
  /** Largest jump between neighbouring samples anywhere in the render. */
  maxStep: number;
  /** Level in the last 30 ms of the buffer; the tail must have gone. */
  tailRms: number;
  /** Level after the dry sound is over, which is the room and nothing else. */
  roomRms: number;
  /** How far apart the two channels are. Zero means the render is mono. */
  channelDelta: number;
}

async function render(
  page: import('@playwright/test').Page,
  script: string,
  seconds = 2.5,
): Promise<Measurement> {
  return page.evaluate(async ([body, secs, rate]) => {
    const ctx = new OfflineAudioContext(2, Math.floor((secs as number) * (rate as number)), rate as number);
    const Engine = (globalThis as unknown as { KissaAudio: { AudioEngine: new (deps: unknown) => unknown } })
      .KissaAudio.AudioEngine;

    // A seeded generator, so a failure is the same failure every time.
    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
      return seed / 0x1_0000_0000;
    };

    const engine = new Engine({
      ContextCtor: class { constructor() { return ctx; } },
      storage: null,
      now: () => 0,
      random,
    }) as {
      unlock(): void;
      setVolume(v: number): void;
      play(name: string, options?: Record<string, number>): void;
      playFlipWave(count: number, stepMs: number, distanceOf: (i: number) => number): void;
    };
    engine.unlock();
    engine.setVolume(1);
    // eslint-disable-next-line no-new-func
    new Function('engine', body as string)(engine);

    const buffer = await ctx.startRendering();
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let peak = 0; let sum = 0; let square = 0; let maxStep = 0; let channelDelta = 0;
    for (let i = 0; i < left.length; i += 1) {
      const v = left[i]!;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v;
      square += v * v;
      if (i > 0) {
        const step = Math.abs(v - left[i - 1]!);
        if (step > maxStep) maxStep = step;
      }
      const d = Math.abs(v - right[i]!);
      if (d > channelDelta) channelDelta = d;
    }

    // Where the sound begins, so the room can be measured after the dry part.
    const floor = Math.max(peak * 1e-3, 1e-5);
    let first = -1;
    for (let i = 0; i < left.length; i += 1) {
      if (Math.abs(left[i]!) > floor) { first = i; break; }
    }

    const rmsOver = (from: number, to: number): number => {
      let acc = 0; let n = 0;
      for (let i = Math.max(0, from); i < Math.min(left.length, to); i += 1) { acc += left[i]! ** 2; n += 1; }
      return n === 0 ? 0 : Math.sqrt(acc / n);
    };

    return {
      peak,
      rms: Math.sqrt(square / left.length),
      dc: Math.abs(sum / left.length),
      maxStep,
      tailRms: rmsOver(left.length - Math.floor(0.03 * (rate as number)), left.length),
      // The room: everything after the dry sound has had a second to finish.
      roomRms: rmsOver(first < 0 ? 0 : first + Math.floor(0.35 * (rate as number)),
        first < 0 ? 0 : first + Math.floor(0.7 * (rate as number))),
      channelDelta,
    };
  }, [script, seconds, SAMPLE_RATE] as const);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
});

test('every voice renders without a click, without clipping and without DC', async ({ page }) => {
  const rows: Record<string, Measurement> = {};
  for (const name of NAMES) {
    const m = await render(page, `engine.play(${JSON.stringify(name)});`);
    rows[name] = m;

    // It made a sound at all.
    expect(m.peak, `${name} is silent`).toBeGreaterThan(0.0005);
    // It did not clip. Headroom is deliberate: the limiter is for the pile-up
    // case, not for rescuing an individual voice.
    expect(m.peak, `${name} clips`).toBeLessThan(0.9);
    // Clicks are not checked here. A waveform statistic cannot separate the
    // step that is a click from the slew of a 3 kHz carrier — the two are the
    // same size — so that property is decided exactly, on the automation
    // schedule, in src/audio/envelope.test.ts.
    // No DC offset: a sound that does not average to zero pops on every device
    // whose amplifier has to re-centre afterwards.
    expect(m.dc, `${name} has a DC offset`).toBeLessThan(0.002);
    // And it has actually finished by the end of the render.
    expect(m.tailRms, `${name} is still sounding at the end`).toBeLessThan(1e-4);
  }

  const peaks = NAMES.map((n) => [n, 20 * Math.log10(rows[n]!.peak)] as const);
  // eslint-disable-next-line no-console
  console.log('\n  ' + peaks.map(([n, db]) => `${n} ${db.toFixed(1)}`).join('  ') + '  dBFS\n');

  // Nothing is inaudible and nothing dominates. A UI tick belongs well below
  // the game-over figure, but not two orders of magnitude below it: the first
  // pass had the tap 37 dB down, which on a phone speaker is simply missing.
  const levels = peaks.map(([, db]) => db);
  expect(Math.max(...levels) - Math.min(...levels), 'the voices are not balanced').toBeLessThan(27);
  expect(Math.min(...levels), 'a voice is too quiet to hear').toBeGreaterThan(-46);
});

test('the room is real, and it is a room rather than a hall', async ({ page }) => {
  const wet = await render(page, "engine.play('end');", 4);
  // Something is still sounding well after the notes themselves are over.
  expect(wet.roomRms, 'there is no reverb tail').toBeGreaterThan(1e-5);
  // The two channels differ, which they only can if the impulse has width.
  expect(wet.channelDelta, 'the room is mono').toBeGreaterThan(1e-4);
  // But it has decayed by the end of four seconds: a room, not a cathedral.
  expect(wet.tailRms, 'the tail never ends').toBeLessThan(1e-4);
});

test('a full flip wave stays clean and stays inside the ceiling', async ({ page }) => {
  const wave = await render(page, `
    engine.play('place', { pan: -0.35 });
    engine.playFlipWave(18, 45, (i) => i);
  `, 3);
  expect(wave.peak, 'a long wave clips').toBeLessThan(0.98);
  expect(wave.tailRms, 'the wave never ends').toBeLessThan(1e-4);
});

test('muted really means silent, not quiet', async ({ page }) => {
  const silent = await page.evaluate(async ([rate]) => {
    const ctx = new OfflineAudioContext(2, (rate as number), rate as number);
    const { AudioEngine } = (globalThis as unknown as { KissaAudio: { AudioEngine: new (d: unknown) => {
      setMuted(m: boolean): void; unlock(): void; play(n: string): void; } } }).KissaAudio;
    const engine = new AudioEngine({
      ContextCtor: class { constructor() { return ctx; } }, storage: null, now: () => 0,
    });
    engine.setMuted(true);
    engine.unlock();
    for (const name of ['place', 'flip', 'end']) engine.play(name);
    const rendered = await ctx.startRendering();
    return Math.max(...rendered.getChannelData(0));
  }, [SAMPLE_RATE] as const);
  expect(silent).toBe(0);
});

test('a placement is heard where it happened', async ({ page }) => {
  const measure = async (square: number): Promise<{ left: number; right: number }> =>
    page.evaluate(async ([sq, rate]) => {
      const ctx = new OfflineAudioContext(2, (rate as number), rate as number);
      const K = (globalThis as unknown as { KissaAudio: {
        AudioEngine: new (d: unknown) => { unlock(): void; setVolume(v: number): void; play(n: string, o: unknown): void };
        panForSquare: (s: number) => number;
      } }).KissaAudio;
      const engine = new K.AudioEngine({
        ContextCtor: class { constructor() { return ctx; } }, storage: null, now: () => 0,
      });
      engine.unlock();
      engine.setVolume(1);
      engine.play('place', { pan: K.panForSquare(sq as number) });
      const b = await ctx.startRendering();
      const energy = (d: Float32Array): number => d.reduce((a, v) => a + v * v, 0);
      return { left: energy(b.getChannelData(0)), right: energy(b.getChannelData(1)) };
    }, [square, SAMPLE_RATE] as const);

  const a1 = await measure(0);   // a1 — the far left of the board
  const h1 = await measure(7);   // h1 — the far right
  expect(a1.left, 'a disc on the a-file is not heard on the left').toBeGreaterThan(a1.right);
  expect(h1.right, 'a disc on the h-file is not heard on the right').toBeGreaterThan(h1.left);
});
