/* ============================================================================
   The shell. Owns the settings, the two screens, and the one live region, one
   toast and one sheet the whole app shares. Routing is a cross-fade between two
   screens — there is nothing here worth a router library.
   ========================================================================= */

import { el, ms, on } from './dom';
import { LiveRegion, SheetHost, Toast } from './chrome';
import { GameScreen, danger, primary, passAndPlay, secondary, type Opponent } from './screens/game';
import { HomeScreen } from './screens/home';
import { settingsSheet } from './screens/settings';
import { helpSheet } from './screens/help';
import { SettingsStore, applyDocumentSettings } from '../data/settings';
import { clearSavedGame, loadSavedGame, saveGame } from '../data/saved';
import { notation, rules, score } from '../engine';
import type { Game } from '../engine/types';
import type { Level, SavedGame } from '../data/types';

type Route = 'home' | 'game';

export class App {
  readonly el: HTMLElement;

  private readonly settings = new SettingsStore();
  private readonly live = new LiveRegion();
  private readonly toast = new Toast();
  private readonly sheets = new SheetHost();
  private readonly home: HomeScreen;
  private readonly game: GameScreen;

  private route: Route = 'home';
  private startedAt = 0;
  private installEvent: BeforeInstallPromptEvent | null = null;
  private finishedThisSession = false;

  constructor() {
    this.home = new HomeScreen({
      onPassAndPlay: () => this.startGame(passAndPlay(this.settings.get('lastVariant'))),
      onPlayFriend: () => this.openFriendSheet(),
      onPlayComputer: () => this.openComputerSheet(),
      onResume: (saved) => this.resume(saved),
      onSettings: () => this.openSettings(),
      onHelp: () => this.openHelp(),
      onInstall: () => void this.promptInstall(),
      onDismissInstall: () => this.settings.set('installPromptDismissed', true),
    });

    this.game = new GameScreen({
      live: this.live,
      toast: this.toast,
      sheets: this.sheets,
      settings: () => this.settings.value,
      onExit: () => this.go('home'),
      onFinished: (finished, opponent) => this.onFinished(finished, opponent),
      onProgress: (progress, opponent) => this.autosave(progress, opponent),
      openSettings: () => this.openSettings(),
      openHelp: () => this.openHelp(),
    });

    this.el = el('div', { id: 'app' }, [
      this.home.el, this.game.el, this.live.el, this.toast.el, this.sheets.backdrop, this.sheets.el,
    ]);

    applyDocumentSettings(this.settings.value);
    this.settings.subscribe((next) => {
      applyDocumentSettings(next);
      this.game.applySettings(next);
    });

    this.wirePlatform();
    this.go('home');
    this.home.setResume(loadSavedGame());
    this.handleDeepLink();
  }

  /* ── routing ─────────────────────────────────────────────────────────── */

  private go(route: Route): void {
    if (this.sheets.isOpen) this.sheets.close();
    this.route = route;
    for (const [name, screen] of [['home', this.home.el], ['game', this.game.el]] as const) {
      const current = name === route;
      screen.classList.toggle('is-current', current);
      screen.classList.toggle('is-entering', current);
      if (current) setTimeout(() => screen.classList.remove('is-entering'), ms('--t-screen'));
    }
    if (route === 'home') {
      this.home.setResume(loadSavedGame());
      this.home.setInstallOffer(this.canOfferInstall());
    }
  }

  private startGame(opponent: Opponent, from?: Game): void {
    this.startedAt = Date.now();
    this.go('game');
    this.game.start(opponent, from);
  }

  private resume(saved: SavedGame): void {
    try {
      const game = notation.parse(saved.transcript, saved.variant);
      this.startedAt = saved.startedAt || Date.now();
      const opponent = saved.mode === 'computer' && typeof saved.opponent === 'number'
        ? this.computerOpponent(saved.opponent, saved.variant, saved.playerColor ?? 0)
        : passAndPlay(saved.variant);
      this.go('game');
      this.game.start(opponent, game);
    } catch {
      this.toast.show('That saved game could not be reopened.');
      clearSavedGame();
      this.home.setResume(null);
    }
  }

  /* ── opponents ───────────────────────────────────────────────────────── */

  private openComputerSheet(): void {
    const levels: [Level, string, string][] = [
      [1, 'Beginner', 'Looks one move ahead and will happily give you a corner.'],
      [2, 'Casual', 'Sees three moves. Makes ordinary mistakes.'],
      [3, 'Club', 'Counts mobility properly and rarely blunders.'],
      [4, 'Strong', 'Plays the edges well and punishes a loose corner.'],
      [5, 'Expert', 'Solves the last sixteen squares exactly.'],
      [6, 'Merciless', 'No cap on depth, and the endgame is exact.'],
    ];

    const list = el('div');
    for (const [level, name, blurb] of levels) {
      const row = el('button', { type: 'button', class: 'row' }, [
        el('span', { class: 'row__label' }, [
          el('span', { text: `${level}. ${name}` }),
          el('span', { class: 'u-sr', text: blurb }),
        ]),
      ]);
      on(row, 'click', () => {
        this.sheets.close();
        this.settings.set('lastLevel', level);
        const variant = reverseToggle.checked ? 'reverse' : 'standard';
        this.settings.set('lastVariant', variant);
        this.startGame(this.computerOpponent(level, variant, 0));
      });
      list.append(row);
    }

    // Reverse Reversi is tucked in here and off by default, exactly as specified.
    const reverseToggle = el('input', { type: 'checkbox', id: 'reverse-variant' });
    const reverse = el('label', { class: 'field', for: 'reverse-variant' }, [
      reverseToggle,
      el('span', {}, [
        el('span', { class: 'field__label', text: 'Reverse Reversi' }),
        el('span', { class: 'field__hint', text: 'Fewest discs wins.' }),
      ]),
    ]);

    this.sheets.open({
      title: 'Play the computer',
      body: el('div', {}, [list, reverse]),
      dismissible: true,
    });
  }

  private computerOpponent(level: Level, variant: Game['variant'], playerColor: 0 | 1): Opponent {
    // The engine is loaded on first use, never at startup: the board must reach
    // interactive without the search code (brief §15).
    let client: import('../ai/client').EngineClient | null = null;
    const ensure = async (): Promise<import('../ai/client').EngineClient> => {
      if (!client) {
        const { EngineClient } = await import('../ai/client');
        client = new EngineClient();
      }
      return client;
    };
    const names: Record<Level, string> = {
      1: 'Beginner', 2: 'Casual', 3: 'Club', 4: 'Strong', 5: 'Expert', 6: 'Merciless',
    };
    return {
      kind: 'computer',
      color: playerColor === 0 ? 1 : 0,
      label: names[level],
      variant,
      allowUndo: true,
      allowHint: true,
      think: async (game) => (await ensure())
        .think(game.position, level, variant, notation.serialize(game)),
      hint: async (game) => (await ensure()).hint(game.position, variant),
      dispose: () => { client?.dispose(); client = null; },
    };
  }

  private openFriendSheet(): void {
    // Built in the multiplayer phase; the row is never a dead end in the meantime.
    this.sheets.open({
      title: 'Play a friend',
      body: el('p', { class: 't-body', text: 'Two devices, no accounts, no server. Share a six-letter code or a link and the game runs directly between you.' }),
      dismissible: true,
      actions: [secondary('Play on this device instead', () => {
        this.sheets.close();
        this.startGame(passAndPlay(this.settings.get('lastVariant')));
      })],
    });
  }

  /* ── persistence ─────────────────────────────────────────────────────── */

  private autosave(game: Game, opponent: Opponent): void {
    if (rules.isTerminal(game.position)) { clearSavedGame(); return; }
    saveGame({
      transcript: notation.serialize(game),
      variant: opponent.variant,
      mode: opponent.kind,
      opponent: opponent.kind === 'computer' ? this.settings.get('lastLevel') : null,
      playerColor: opponent.color === null ? null : opponent.color === 0 ? 1 : 0,
      startedAt: this.startedAt,
      savedAt: Date.now(),
    });
  }

  private onFinished(game: Game, opponent: Opponent): void {
    clearSavedGame();
    this.finishedThisSession = true;
    void import('../data/archive').then(({ recordFinishedGame }) => {
      const s = score(game.position);
      const result = rules.outcome(game.position, opponent.variant);
      void recordFinishedGame({
        transcript: notation.serialize(game),
        variant: opponent.variant,
        mode: opponent.kind,
        opponent: opponent.kind === 'computer' ? this.settings.get('lastLevel') : opponent.label,
        playerColor: opponent.color === null ? null : opponent.color === 0 ? 1 : 0,
        blackDiscs: s.black,
        whiteDiscs: s.white,
        winner: result?.kind === 'win' ? result.winner : 'draw',
        startedAt: this.startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - this.startedAt,
      });
    }).catch(() => {
      // The archive is a convenience. Losing a record must never surface as an
      // error over a finished game.
    });
  }

  /* ── sheets ──────────────────────────────────────────────────────────── */

  openSettings(): void {
    this.sheets.open(settingsSheet(this.settings, this.toast));
  }

  openHelp(): void {
    this.sheets.open(helpSheet());
  }

  /* ── platform ────────────────────────────────────────────────────────── */

  private wirePlatform(): void {
    on(globalThis, 'beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      this.installEvent = event as BeforeInstallPromptEvent;
      if (this.route === 'home') this.home.setInstallOffer(this.canOfferInstall());
    });

    // Pause everything the moment the tab goes away, and put the board back
    // together on return (brief §12).
    on(document, 'visibilitychange', () => {
      if (document.hidden) this.game.suspend();
      else if (this.route === 'game') this.game.resume();
    });

    on(globalThis, 'hashchange', () => this.handleDeepLink());
  }

  private canOfferInstall(): boolean {
    return this.installEvent !== null
      && this.finishedThisSession
      && !this.settings.get('installPromptDismissed');
  }

  private async promptInstall(): Promise<void> {
    const event = this.installEvent;
    if (!event) return;
    this.installEvent = null;
    await event.prompt();
    this.settings.set('installPromptDismissed', true);
    this.home.setInstallOffer(false);
  }

  private handleDeepLink(): void {
    const match = /[#&]j=([A-Za-z-]{6,8})/.exec(location.hash);
    if (!match) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.openFriendSheet();
  }
}

/** Not in lib.dom yet, and we only need the two members we call. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

export { primary, danger };
