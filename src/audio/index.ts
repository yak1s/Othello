/* The public surface the UI calls. One engine, one haptics, both created here so
   nothing else has to remember that there is only ever one AudioContext. */

import { AudioEngine } from './engine';
import { Haptics } from './haptics';
import type { VoiceName } from './voices';
import type { PlayOptions } from './engine';

export { ROOM, VOICES, flipWavePlan, type VoiceName, type Voice } from './voices';
export { AudioEngine, type PlayOptions } from './engine';

/**
 * Where on the board something happened, as a stereo position. Kept narrow on
 * purpose: a game heard on a phone speaker should feel placed, not ping-ponged,
 * and anyone on headphones should never have to look up from the board because
 * a sound came from somewhere they were not expecting.
 */
export const panForSquare = (square: number): number => ((square % 8) - 3.5) / 3.5 * 0.35;
export { Haptics } from './haptics';

export class Sound {
  readonly audio = new AudioEngine();
  readonly haptics = new Haptics();
  private unlocked = false;

  /** Wire to the first user gesture. Repeated calls are free. */
  attachUnlock(target: EventTarget = document): void {
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.audio.unlock();
    };
    for (const type of ['pointerdown', 'keydown']) {
      target.addEventListener(type, unlock, { once: false, passive: true });
    }
  }

  apply(settings: { sound: boolean; effectsVolume: number; haptics: boolean }): void {
    this.audio.setMuted(!settings.sound);
    this.audio.setVolume(settings.effectsVolume);
    this.haptics.setEnabled(settings.haptics);
  }

  play(name: VoiceName, options?: PlayOptions): void {
    this.audio.play(name, options);
  }

  place(square?: number): void {
    this.audio.play('place', square === undefined ? {} : { pan: panForSquare(square) });
    this.haptics.place();
  }

  illegal(square?: number): void {
    this.audio.play('illegal', {
      throttleMs: 120,
      ...(square === undefined ? {} : { pan: panForSquare(square) }),
    });
    this.haptics.illegal();
  }

  flipWave(
    count: number,
    stepMs: number,
    distanceOf: (index: number) => number,
    squareOf?: (index: number) => number,
  ): void {
    this.audio.playFlipWave(count, stepMs, distanceOf,
      squareOf ? (i) => panForSquare(squareOf(i)) : undefined);
    this.haptics.flips(count);
  }
}
