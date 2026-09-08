/* Haptics (brief §10). A separate toggle from sound, and a silent no-op wherever
   the API is missing — which includes every iOS browser. */

export class Haptics {
  private enabled = true;

  constructor(private readonly vibrate: ((pattern: number | number[]) => boolean) | null =
    typeof navigator !== 'undefined' && 'vibrate' in navigator
      ? navigator.vibrate.bind(navigator)
      : null) {}

  setEnabled(enabled: boolean): void { this.enabled = enabled; }

  place(): void { this.buzz(8); }
  illegal(): void { this.buzz(20); }

  /** One pulse per flipped disc, capped at three: past that it is a rattle. */
  flips(count: number): void {
    if (count <= 0) return;
    const pulses = Math.min(3, count);
    const pattern: number[] = [];
    for (let i = 0; i < pulses; i += 1) {
      if (i > 0) pattern.push(40);
      pattern.push(4);
    }
    this.buzz(pattern);
  }

  private buzz(pattern: number | number[]): void {
    if (!this.enabled || !this.vibrate) return;
    try { this.vibrate(pattern); } catch { /* a policy-blocked vibrate is fine */ }
  }
}
