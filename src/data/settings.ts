/* ============================================================================
   Settings (brief §13). localStorage, namespaced and version-keyed, with full
   defaults merged over whatever is stored so a new field never breaks an old
   install. Nothing here ever leaves the device.
   ========================================================================= */

import { SETTINGS_KEY, type Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  sound: true,
  effectsVolume: 0.7,
  haptics: true,
  turnSoundInPassPlay: false,
  felt: 'baize',
  coordinates: false,
  legalDots: true,
  lastMoveMarker: true,
  discCounters: true,
  colorblindMarking: false,
  rotateBetweenTurns: false,
  scoreMode: 'tournament',
  undoAllowance: 'unlimited',
  motion: 'full',
  unlockedLevel: 1,
  lastLevel: 1,
  lastVariant: 'standard',
  installPromptDismissed: false,
};

type Listener = (settings: Settings) => void;

/** Safari in private mode throws on write, so every access is guarded. */
function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = `${SETTINGS_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.current = this.load();
  }

  get value(): Settings {
    return this.current;
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.current[key];
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.current[key] === value) return;
    this.current = { ...this.current, [key]: value };
    this.persist();
    for (const listener of this.listeners) listener(this.current);
  }

  replace(next: Settings): void {
    this.current = { ...DEFAULT_SETTINGS, ...next, version: DEFAULT_SETTINGS.version };
    this.persist();
    for (const listener of this.listeners) listener(this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Settings {
    const stored = this.storage?.getItem(SETTINGS_KEY);
    const base: Settings = {
      ...DEFAULT_SETTINGS,
      // Pre-checked from the platform, not guessed. A person who has asked their
      // OS to reduce motion should never see the flip wave once.
      motion: prefersReducedMotion() ? 'reduced' : 'full',
    };
    if (!stored) return base;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed !== 'object' || parsed === null) return base;
      const merged: Record<string, unknown> = { ...base };
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const value = (parsed as Record<string, unknown>)[key];
        if (value !== undefined && typeof value === typeof merged[key]) merged[key] = value;
      }
      return merged as unknown as Settings;
    } catch {
      return base;
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.current));
    } catch {
      // Out of quota or a private window. Settings are a convenience; losing
      // them must never interrupt a game in progress.
    }
  }
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Push the two settings that the stylesheet reads onto the document root. */
export function applyDocumentSettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.felt = settings.felt;
  root.dataset.motion = settings.motion;
}
