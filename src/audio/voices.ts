/* ============================================================================
   The sound recipes (brief §10).

   Plastic discs on felt in a quiet room. Everything is synthesised at play time
   — there are no audio files, which is what makes the whole sound design cost
   zero bytes, work offline, and stay tunable by ear rather than by guesswork.

   Every number below is a named field because `dev/audio/` edits them live.
   ========================================================================= */

export type VoiceName =
  | 'place' | 'flip' | 'illegal' | 'turn' | 'pass'
  | 'tick' | 'end' | 'tap' | 'sheet' | 'peerJoin' | 'peerLeave';

export interface Voice {
  /** What the sound is, in the tuner's list. */
  label: string;
  /** Level relative to the master gain, in decibels. */
  gainDb: number;
  params: Record<string, number>;
}

/** Decibels are the unit a person tunes in; the graph wants a linear gain. */
export const dbToGain = (db: number): number => 10 ** (db / 20);

export const VOICES: Record<VoiceName, Voice> = {
  place: {
    label: 'Disc placed',
    gainDb: -6,
    params: {
      // A short noise burst through a bandpass is the plastic; the sine under it
      // is the felt taking the weight.
      noiseMs: 8,
      bandHz: 1800,
      bandQ: 2.2,
      thudHz: 180,
      thudMs: 60,
      thudMix: 0.55,
      pitchJitter: 0.04,
    },
  },
  flip: {
    label: 'Disc flipped',
    gainDb: -11,
    params: {
      clickHz: 2400,
      clickMs: 35,
      bandQ: 4,
      /** Each disc along the wave is one semitone above the last. */
      semitoneStep: 1,
      /** The step wraps here so a long wave does not climb out of the room. */
      semitoneWrap: 8,
    },
  },
  illegal: {
    label: 'Illegal tap',
    gainDb: -16,
    params: { thudHz: 90, thudMs: 70, lowpassHz: 220 },
  },
  turn: {
    label: 'Turn change',
    gainDb: -26,
    params: { noiseMs: 120, lowpassHz: 900, highpassHz: 300 },
  },
  pass: {
    label: 'Pass',
    gainDb: -14,
    params: { firstHz: 520, secondHz: 390, noteMs: 90, gapMs: 70, decay: 0.5 },
  },
  tick: {
    label: 'Timer low',
    gainDb: -18,
    params: { toneHz: 1000, toneMs: 28, decay: 0.4 },
  },
  end: {
    label: 'Game end',
    gainDb: -10,
    params: {
      // A minor third resolve: the third note lands a minor third under the
      // second, so the figure settles rather than announcing itself.
      rootHz: 392,
      secondHz: 523.25,
      thirdHz: 440,
      noteMs: 260,
      gapMs: 150,
      decay: 0.55,
    },
  },
  tap: {
    label: 'UI tap',
    gainDb: -24,
    params: { toneHz: 2000, toneMs: 6 },
  },
  sheet: {
    label: 'Sheet slide',
    gainDb: -24,
    params: { noiseMs: 180, lowpassHz: 1400, sweepTo: 500 },
  },
  peerJoin: {
    label: 'Peer joined',
    gainDb: -14,
    params: { firstHz: 440, secondHz: 587.33, noteMs: 110, gapMs: 60, decay: 0.5 },
  },
  peerLeave: {
    label: 'Peer lost',
    gainDb: -14,
    params: { firstHz: 587.33, secondHz: 415.30, noteMs: 110, gapMs: 60, decay: 0.5 },
  },
};

/** At most six voices sound at once, per the brief. */
export const MAX_VOICES = 6;
/** Beyond this many discs in one wave, only every other one is heard. */
export const FLIP_THROTTLE_AFTER = 8;

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
