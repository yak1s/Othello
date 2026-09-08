/* The audio tuner (brief §10). A slider for every parameter and a play button
   per voice, so the recipes get tuned by ear instead of guessed. Never built
   into production: vite.config.ts only adds this entry under `--mode tuner`. */

import { AudioEngine } from '../../src/audio/engine';
import { VOICES, type VoiceName } from '../../src/audio/voices';
import { el, on } from '../../src/ui/dom';

const engine = new AudioEngine();
const root = document.getElementById('tuner')!;

/** Sensible slider bounds per parameter, by name rather than by voice. */
function boundsFor(key: string, value: number): { min: number; max: number; step: number } {
  // Levels are negative decibels, so a 0-based range would pin them to the left.
  if (key === 'gainDb') return { min: -40, max: 0, step: 0.5 };
  if (key.endsWith('Hz')) return { min: 40, max: 6000, step: 10 };
  if (key.endsWith('Ms')) return { min: 1, max: 600, step: 1 };
  if (key === 'bandQ') return { min: 0.2, max: 20, step: 0.1 };
  if (key.startsWith('semitone')) return { min: 0, max: 24, step: 1 };
  return { min: 0, max: Math.max(1, value * 3), step: 0.01 };
}

root.append(
  el('h1', { class: 't-head', text: 'Audio tuner' }),
  el('p', { class: 'tuner__lede t-body', text: 'Every recipe in the app, live. Tune by ear, then copy the values back into src/audio/voices.ts.' }),
);

for (const [name, voice] of Object.entries(VOICES) as [VoiceName, typeof VOICES[VoiceName]][]) {
  const play = el('button', { type: 'button', class: 'btn btn--primary' },
    [el('span', { class: 'btn__label', text: 'Play' })]);
  on(play, 'click', () => {
    engine.unlock();
    if (name === 'flip') engine.playFlipWave(12, 45, (i) => i);
    else engine.play(name);
  });

  const params = el('div', { class: 'voice__params' });
  const rows: [string, HTMLInputElement, HTMLElement][] = [];

  const addRow = (key: string, value: number, apply: (v: number) => void): void => {
    const { min, max, step } = boundsFor(key, value);
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
      'aria-label': `${voice.label} ${key}`,
    });
    const readout = el('span', { class: 'voice__value', text: String(value) });
    on(input, 'input', () => {
      const next = Number(input.value);
      apply(next);
      readout.textContent = String(next);
    });
    params.append(el('span', { class: 'voice__param', text: key }), input, readout);
    rows.push([key, input, readout]);
  };

  addRow('gainDb', voice.gainDb, (v) => { voice.gainDb = v; });
  for (const [key, value] of Object.entries(voice.params)) {
    addRow(key, value, (v) => { voice.params[key] = v; });
  }

  root.append(el('section', { class: 'voice' }, [
    el('div', { class: 'voice__head' }, [
      el('span', { class: 'voice__name', text: voice.label }),
      play,
    ]),
    params,
  ]));
}

const dump = el('textarea', { class: 'dump', readonly: true, 'aria-label': 'Tuned values' });
const copy = el('button', { type: 'button', class: 'btn btn--secondary' },
  [el('span', { class: 'btn__label', text: 'Show the tuned values' })]);
on(copy, 'click', () => {
  const body = (Object.entries(VOICES) as [VoiceName, typeof VOICES[VoiceName]][])
    .map(([name, voice]) => {
      const params = Object.entries(voice.params).map(([k, v]) => `      ${k}: ${v},`).join('\n');
      return `  ${name}: {\n    label: '${voice.label}',\n    gainDb: ${voice.gainDb},\n    params: {\n${params}\n    },\n  },`;
    }).join('\n');
  dump.value = `export const VOICES: Record<VoiceName, Voice> = {\n${body}\n};\n`;
  dump.select();
});
root.append(el('section', { class: 'voice' }, [copy, dump]));
