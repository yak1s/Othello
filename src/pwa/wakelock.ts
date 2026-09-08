/* A screen wake lock, held only while an online match is actually live and
   released the moment the tab goes away (brief §12). Never held for a local
   game: there is no reason to keep someone's screen on for a board they are
   holding in their hand. */

interface WakeLockSentinelLike { release(): Promise<void> }
interface WakeLockLike { request(type: 'screen'): Promise<WakeLockSentinelLike> }

export class WakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;

  constructor(private readonly api: WakeLockLike | undefined =
    (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.drop();
      else if (this.wanted) void this.take();
    });
  }

  async hold(): Promise<void> {
    this.wanted = true;
    await this.take();
  }

  async release(): Promise<void> {
    this.wanted = false;
    await this.drop();
  }

  private async take(): Promise<void> {
    if (this.sentinel || !this.api || document.hidden) return;
    try {
      this.sentinel = await this.api.request('screen');
    } catch {
      // Refused by the platform, or the battery is low. Not worth telling anyone.
    }
  }

  private async drop(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    try { await sentinel?.release(); } catch { /* already gone */ }
  }
}
