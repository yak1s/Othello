/* ============================================================================
   Settings. Grouped and labelled, per brief §5.3 — never a wall of unlabelled
   toggle rows. Five groups: Sound, Board, Assist, Motion, Data.
   ========================================================================= */

import { el, on } from '../dom';
import type { SheetContent, Toast } from '../chrome';
import { danger, secondary } from './game';
import type { SettingsStore } from '../../data/settings';
import { ARCHIVE_CAP, type Felt, type Settings, type UndoAllowance } from '../../data/types';
import type { ScoreMode } from '../../engine/types';

export function settingsSheet(store: SettingsStore, toast: Toast): SheetContent {
  const body = el('div');

  body.append(
    group('Sound', [
      toggle(store, 'sound', 'Sound', 'Discs on felt, synthesised on the device.'),
      range(store, 'effectsVolume', 'Effects volume'),
      toggle(store, 'haptics', 'Haptics', 'A short tick on place and flip, where the device supports it.'),
      toggle(store, 'turnSoundInPassPlay', 'Turn sound in pass & play',
        'Off by default: on one device it is you handing over, not a signal.'),
    ]),

    group('Board', [
      choice<Felt>(store, 'felt', 'Felt', [
        ['baize', 'Baize'], ['slate', 'Ink slate'], ['sand', 'Sand'],
      ]),
      toggle(store, 'coordinates', 'Coordinates', 'a–h and 1–8 on the frame.'),
      toggle(store, 'legalDots', 'Legal-move dots'),
      toggle(store, 'lastMoveMarker', 'Last-move marker'),
      toggle(store, 'discCounters', 'Disc counters'),
      toggle(store, 'colorblindMarking', 'Colourblind marking',
        'A second ring inside the dark discs, so shape tells them apart as well as lightness.'),
      toggle(store, 'rotateBetweenTurns', 'Rotate the board between turns',
        'Pass & play only. Reversi hides nothing, so there is no hand-off screen.'),
      choice<ScoreMode>(store, 'scoreMode', 'Final margin', [
        ['discs', 'Discs'], ['tournament', 'Tournament'],
      ], 'Tournament awards the empty squares to the winner, so a result always sums to 64.'),
    ]),

    group('Assist', [
      choice<UndoAllowance>(store, 'undoAllowance', 'Undo', [
        ['unlimited', 'Unlimited'], ['three', '3 per game'], ['off', 'Off'],
      ]),
    ]),

    group('Motion', [
      choice<Settings['motion']>(store, 'motion', 'Motion', [
        ['full', 'Full'], ['reduced', 'Reduced'],
      ], 'Reduced removes the flip rotation and the sweep. Nothing it tells you is lost.'),
    ]),

    recordGroup(),

    group('Data', [
      // One line about the archive, not two. The removal pass took the second,
      // which reassured about privacy the first had already implied.
      staticField('Archive', `The last ${ARCHIVE_CAP} finished games are kept on this device. Nothing leaves it, and older games drop off.`),
    ]),
  );

  const exportGames = secondary('Export games as JSON', () => {
    void import('../../data/archive').then(async ({ exportBundle }) => {
      const bundle = await exportBundle(store.value);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: 'kissa-archive.json' });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.show(`Exported ${bundle.games.length} games.`);
    }).catch(() => toast.show('Could not read the archive.'));
  });

  const importGames = secondary('Import from a file', () => {
    const input = el('input', { type: 'file', accept: 'application/json' });
    on(input, 'change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text()
        .then((text) => import('../../data/archive').then(({ importBundle }) => importBundle(text)))
        .then((report) => {
          if (report.settings) store.replace(report.settings);
          toast.show(`Added ${report.added} games, skipped ${report.duplicates} already here.`);
        })
        .catch(() => toast.show('That file is not a Kissa archive.'));
    });
    input.click();
  });

  const clearStats = danger('Clear stats and archive', () => {
    void import('../../data/archive').then(({ clearArchive }) => clearArchive())
      .then(() => toast.show('Archive cleared.'))
      .catch(() => toast.show('Could not clear the archive.'));
  });

  return {
    title: 'Settings',
    body,
    dismissible: true,
    actions: [exportGames, importGames, clearStats],
  };
}

/**
 * The record, filled in once IndexedDB answers. It is built empty and populated
 * rather than awaited, because a settings sheet must open immediately.
 */
function recordGroup(): HTMLElement {
  const body = el('div');
  const section = group('Your record', [body]);
  body.append(el('p', { class: 'field__hint', text: 'Reading the archive…' }));

  void import('../../data/archive').then(async ({ loadStats }) => {
    const stats = await loadStats();
    body.replaceChildren();
    if (stats.gamesFinished === 0) {
      // The empty state, written specifically (brief §14).
      body.append(el('p', { class: 'field__hint', text: 'No finished games yet. Beat the computer and it’ll show up here.' }));
      return;
    }
    const played = Object.entries(stats.perLevel)
      .filter(([, r]) => r.wins + r.losses + r.draws > 0);
    for (const [level, record] of played) {
      body.append(staticField(
        `Level ${level}`,
        `${record.wins} won, ${record.losses} lost${record.draws ? `, ${record.draws} drawn` : ''}`,
      ));
    }
    const average = stats.gamesFinished === 0 ? 0 : stats.totalMargin / stats.gamesFinished;
    body.append(
      staticField('Games finished', String(stats.gamesFinished)),
      staticField('Average margin', `${average >= 0 ? '+' : ''}${average.toFixed(1)} discs`),
      staticField('Corners taken', stats.cornersAvailable === 0
        ? 'None yet'
        : `${Math.round((stats.cornersTaken / stats.cornersAvailable) * 100)}% of those on offer`),
      staticField('Longest winning run', `${stats.longestWinStreak} game${stats.longestWinStreak === 1 ? '' : 's'}`),
    );
  }).catch(() => {
    body.replaceChildren(el('p', { class: 'field__hint', text: 'The archive could not be read on this device.' }));
  });

  return section;
}

/* ── field builders ─────────────────────────────────────────────────────── */

function group(title: string, fields: HTMLElement[]): HTMLElement {
  return el('section', { class: 'group' }, [
    el('h3', { class: 'group__title', text: title }),
    ...fields,
  ]);
}

type BooleanKeys = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings];

function toggle(store: SettingsStore, key: BooleanKeys, label: string, hint?: string): HTMLElement {
  const id = `set-${key}`;
  const input = el('input', { type: 'checkbox', class: 'switch', id, checked: store.get(key) });
  on(input, 'change', () => store.set(key, input.checked));
  return el('label', { class: 'field', for: id }, [
    el('span', {}, [
      el('span', { class: 'field__label', text: label }),
      ...(hint ? [el('span', { class: 'field__hint', text: hint })] : []),
    ]),
    input,
  ]);
}

function range(store: SettingsStore, key: 'effectsVolume', label: string): HTMLElement {
  const id = `set-${key}`;
  const input = el('input', {
    type: 'range', id, min: '0', max: '1', step: '0.05', value: String(store.get(key)),
  });
  on(input, 'input', () => store.set(key, Number(input.value)));
  return el('label', { class: 'field', for: id }, [
    el('span', { class: 'field__label', text: label }),
    input,
  ]);
}

function choice<V extends string>(
  store: SettingsStore,
  key: { [K in keyof Settings]: Settings[K] extends V ? K : never }[keyof Settings],
  label: string,
  options: [V, string][],
  hint?: string,
): HTMLElement {
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': label });
  const buttons = options.map(([value, text]) => {
    const button = el('button', {
      type: 'button',
      class: 'seg__option',
      'aria-pressed': String(store.get(key) === (value as never)),
      text,
    });
    on(button, 'click', () => {
      store.set(key, value as never);
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
    });
    return button;
  });
  seg.append(...buttons);
  return el('div', { class: 'field' }, [
    el('span', {}, [
      el('span', { class: 'field__label', text: label }),
      ...(hint ? [el('span', { class: 'field__hint', text: hint })] : []),
    ]),
    seg,
  ]);
}

function staticField(label: string, hint: string): HTMLElement {
  return el('div', { class: 'field' }, [
    el('span', {}, [
      el('span', { class: 'field__label', text: label }),
      el('span', { class: 'field__hint', text: hint }),
    ]),
  ]);
}
