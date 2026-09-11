// Renders the whole sound design to a WAV so it can be listened to rather than
// only measured. Uses the same engine the app ships, through a real browser's
// OfflineAudioContext. Run: node scripts/audio-demo.mjs [out.wav]
import { writeFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'kissa-sounds.wav';
const RATE = 48_000;
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find((p) => existsSync(p));

const bundled = await build({
  entryPoints: ['src/audio/index.ts'],
  bundle: true, format: 'iife', globalName: 'KissaAudio', write: false, target: 'es2022',
});

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
await page.addScriptTag({ content: bundled.outputFiles[0].text });

const channels = await page.evaluate(async ([rate]) => {
  const seconds = 26;
  const ctx = new OfflineAudioContext(2, rate * seconds, rate);
  const { AudioEngine, panForSquare } = globalThis.KissaAudio;
  const engine = new AudioEngine({
    ContextCtor: class { constructor() { return ctx; } }, storage: null, now: () => 0,
  });
  engine.unlock();
  engine.setVolume(0.9);

  // `now()` is frozen, so the voice budget never expires; the schedule below is
  // written in seconds and fed in through delayMs, which is what the app does.
  let at = 0.4;
  const cue = (fn, gap) => { fn(at * 1000); at += gap; };
  const one = (name, gap, opts = {}) =>
    cue((ms) => engine.play(name, { ...opts, delayMs: ms }), gap);

  one('place', 0.8, { pan: panForSquare(19) });
  one('place', 0.8, { pan: panForSquare(44) });
  one('illegal', 1.0);
  cue((ms) => {
    for (let i = 0; i < 6; i += 1) engine.play('flip', { semitone: i, delayMs: ms + i * 55 });
  }, 1.4);
  cue((ms) => {
    engine.play('place', { delayMs: ms, pan: panForSquare(26) });
    for (let i = 0; i < 11; i += 1) {
      engine.play('flip', { semitone: i % 8, delayMs: ms + 60 + i * 45, pan: panForSquare(26 + i) });
    }
  }, 2.2);
  one('turn', 0.9);
  one('sheet', 1.0);
  one('tap', 0.5);
  one('tap', 0.9);
  one('tick', 0.6);
  one('tick', 1.2);
  one('pass', 1.6);
  one('peerJoin', 1.4);
  one('peerLeave', 1.8);
  one('end', 4);

  const rendered = await ctx.startRendering();
  return [[...rendered.getChannelData(0)], [...rendered.getChannelData(1)]];
}, [RATE]);

await browser.close();

// 16-bit stereo PCM.
const frames = channels[0].length;
const data = Buffer.alloc(frames * 4);
let peak = 0;
for (let i = 0; i < frames; i += 1) {
  peak = Math.max(peak, Math.abs(channels[0][i]), Math.abs(channels[1][i]));
}
for (let i = 0; i < frames; i += 1) {
  for (let c = 0; c < 2; c += 1) {
    const v = Math.max(-1, Math.min(1, channels[c][i]));
    data.writeInt16LE(Math.round(v * 32767), i * 4 + c * 2);
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(OUT, Buffer.concat([header, data]));
console.log(`${OUT}: ${(frames / RATE).toFixed(1)}s, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
