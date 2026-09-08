/* The public surface the UI calls. One engine, one haptics, both created here so
   nothing else has to remember that there is only ever one AudioContext. */

import { AudioEngine } from './engine';
import { Haptics } from './haptics';
import type { VoiceName } from './voices';

export { VOICES, flipWavePlan, type VoiceName, type Voice } from './voices';
export { AudioEngine } from './engine';
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

  play(name: VoiceName, options?: { semitone?: number; delayMs?: number; throttleMs?: number }): void {
    this.audio.play(name, options);
  }

  place(): void {
    this.audio.play('place');
    this.haptics.place();
  }

  illegal(): void {
    this.audio.play('illegal', { throttleMs: 120 });
    this.haptics.illegal();
  }

  flipWave(count: number, stepMs: number, distanceOf: (index: number) => number): void {
    this.audio.playFlipWave(count, stepMs, distanceOf);
    this.haptics.flips(count);
  }
}
