/* ============================================================================
   The sound recipes (brief §10).

   Plastic discs on felt in a quiet room. Everything is synthesised at play time
   — there are no audio files, which is what makes the whole sound design cost
   zero bytes, work offline, and stay tunable by ear rather than by guesswork.

   Every number below is a named field because `dev/audio/` edits them live.

   Two ideas run through all of it. Percussion is *two* layers, never one: a very
   short bright transient that tells you something was struck, and a body under
   it that tells you what it was made of — a single filtered noise burst is a
   click, and a click is what cheap synthesis sounds like. And the pitched
   voices are struck bars rather than oscillator beeps: a fundamental with two
   inharmonic partials above it, each decaying faster than the one below, which
   is what a wooden or metal bar actually does.
   ========================================================================= */

export type VoiceName =
  | 'place' | 'flip' | 'illegal' | 'turn' | 'pass'
  | 'tick' | 'end' | 'tap' | 'sheet' | 'peerJoin' | 'peerLeave';

export interface Voice {
  /** What the sound is, in the tuner's list. */
  label: string;
  /** Level relative to the master gain, in decibels. */
  gainDb: number;
  /** How much of this voice goes to the room, in decibels. −60 is dry. */
  sendDb: number;
  params: Record<string, number>;
}

/** Decibels are the unit a person tunes in; the graph wants a linear gain. */
export const dbToGain = (db: number): number => (db <= -60 ? 0 : 10 ** (db / 20));

export const VOICES: Record<VoiceName, Voice> = {
  place: {
    label: 'Disc placed',
    gainDb: -7,
    sendDb: -16,
    params: {
      // The transient: the rim of the disc meeting the board, and nothing more.
      tickHz: 2600,
      tickQ: 1.5,
      tickMs: 7,
      tickMix: 0.40,
      // The body: felt taking the weight. It falls in pitch as it is absorbed,
      // which is the difference between a disc landing and a note being played.
      bodyHz: 300,
      bodyToHz: 134,
      bodyMs: 95,
      bodyMix: 1,
      // A little of the table under it all.
      subHz: 76,
      subMs: 150,
      subMix: 0.30,
      /** No two placements are identical, or the board sounds like a machine. */
      pitchJitter: 0.05,
    },
  },
  flip: {
    label: 'Disc flipped',
    gainDb: -14,
    sendDb: -12,
    params: {
      tickHz: 3100,
      tickQ: 2.4,
      tickMs: 5,
      tickMix: 0.45,
      // A small struck bar, so a wave of them is a phrase rather than a rattle.
      bodyHz: 680,
      bodyMs: 70,
      partialRatio: 2.76,
      partialMix: 0.22,
      /** Each disc along the wave is one semitone above the last. */
      semitoneStep: 1,
      /** The step wraps here so a long wave does not climb out of the room. */
      semitoneWrap: 8,
    },
  },
  illegal: {
    label: 'Illegal tap',
    gainDb: -17,
    sendDb: -24,
    params: {
      // A closed, muffled no. It bends down a little, the way a knuckle on a
      // table does, and there is no transient at all — nothing was struck.
      thudHz: 108,
      thudToHz: 74,
      thudMs: 120,
      lowpassHz: 280,
    },
  },
  turn: {
    label: 'Turn change',
    gainDb: -21,
    sendDb: -18,
    params: {
      // A brush across the felt: pink noise through a bandpass that opens and
      // closes again. Quiet enough to be felt rather than heard.
      noiseMs: 170,
      fromHz: 460,
      toHz: 1250,
      q: 1.1,
    },
  },
  pass: {
    label: 'Pass',
    gainDb: -15,
    sendDb: -10,
    params: {
      firstHz: 523.25,
      secondHz: 392,
      noteMs: 240,
      gapMs: 90,
      decay: 0.55,
      partialRatio: 2.76,
      partialMix: 0.16,
    },
  },
  tick: {
    label: 'Timer low',
    gainDb: -16,
    sendDb: -20,
    params: { toneHz: 1046.5, toneMs: 70, partialRatio: 2.76, partialMix: 0.10 },
  },
  end: {
    label: 'Game end',
    gainDb: -11,
    sendDb: -6,
    params: {
      // A minor third resolve: the third note lands a minor third under the
      // second, so the figure settles rather than announcing itself.
      rootHz: 392,
      secondHz: 523.25,
      thirdHz: 440,
      noteMs: 320,
      gapMs: 150,
      decay: 0.55,
      partialRatio: 2.76,
      partialMix: 0.18,
    },
  },
  tap: {
    label: 'UI tap',
    gainDb: -13,
    sendDb: -30,
    params: { tickHz: 2100, tickQ: 1.2, tickMs: 5 },
  },
  sheet: {
    label: 'Sheet slide',
    gainDb: -25,
    sendDb: -16,
    params: { noiseMs: 200, fromHz: 1500, toHz: 420, q: 0.9 },
  },
  peerJoin: {
    label: 'Peer joined',
    gainDb: -15,
    sendDb: -10,
    params: {
      firstHz: 440, secondHz: 587.33, noteMs: 200, gapMs: 70, decay: 0.55,
      partialRatio: 2.76, partialMix: 0.16,
    },
  },
  peerLeave: {
    label: 'Peer lost',
    gainDb: -15,
    sendDb: -10,
    params: {
      firstHz: 587.33, secondHz: 415.30, noteMs: 200, gapMs: 70, decay: 0.55,
      partialRatio: 2.76, partialMix: 0.16,
    },
  },
};

/** The room every voice is heard in. Synthesised at unlock; no impulse file. */
export const ROOM = {
  /** Short and dark: a small panelled room, not a hall. */
  seconds: 0.9,
  /** How long before the first reflection arrives, in milliseconds. */
  predelayMs: 11,
  /** The tail is lowpassed as it decays, the way a soft room absorbs highs. */
  toneHz: 2400,
  /** e-folds over the length; higher is a faster, tighter decay. */
  decay: 5.2,
  /** Wet level at the bus, in decibels. */
  wetDb: -9,
};

/** At most six voices sound at once, per the brief. */
export const MAX_VOICES = 6;
/** Beyond this many discs in one wave, only every other one is heard. */
export const FLIP_THROTTLE_AFTER = 8;

/** The shortest fade in or out of any envelope, in seconds. Below about a
    millisecond the step itself is audible, and that step is the click. */
export const MIN_FADE = 0.0022;

/**
 * Which discs of a flip wave actually sound, and at what semitone.
 *
 * Pure, so the throttling and the pitch ladder are testable without an
 * AudioContext — which is the whole reason they live here rather than inline.
 */
export function flipWavePlan(count: number): { index: number; semitone: number }[] {
  const plan: { index: number; semitone: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index >= FLIP_THROTTLE_AFTER && index % 2 === 1) continue;
    plan.push({
      index,
      semitone: (index * VOICES.flip.params.semitoneStep!) % VOICES.flip.params.semitoneWrap!,
    });
  }
  return plan;
}

export const semitoneRatio = (semitones: number): number => 2 ** (semitones / 12);
