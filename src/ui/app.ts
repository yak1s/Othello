/* ============================================================================
   The shell. Owns the settings, the two screens, and the one live region, one
   toast and one sheet the whole app shares. Routing is a cross-fade between two
   screens — there is nothing here worth a router library.
   ========================================================================= */

import { el, ms, on } from './dom';
import { LiveRegion, SheetHost, Toast } from './chrome';
import { Sound } from '../audio';
import { GameScreen, danger, primary, passAndPlay, secondary, type Opponent } from './screens/game';
import { HomeScreen } from './screens/home';
import { settingsSheet } from './screens/settings';
import { helpSheet } from './screens/help';
import { openFriendFlow } from './screens/friend';
import { MatchSession } from '../net/session';
import { formatPin, pinFromLink } from '../net/pin';
import type { Emote, Transport } from '../net/protocol';
import { SettingsStore, applyDocumentSettings } from '../data/settings';
import { clearSavedGame, loadSavedGame, saveGame } from '../data/saved';
import { games, notation, rules, score } from '../engine';
import { BLACK, WHITE, type Color, type Game, type Square } from '../engine/types';
import { LEVEL_NAMES, afterGame, ladderLine, lockedReason } from '../data/ladder';
import type { Level, SavedGame } from '../data/types';

type Route = 'home' | 'game';

export class App {
  readonly el: HTMLElement;

  private readonly settings = new SettingsStore();
  private readonly live = new LiveRegion();
  private readonly toast = new Toast();
  private readonly sheets = new SheetHost();
  private readonly sound = new Sound();
  private readonly home: HomeScreen;
  private readonly game: GameScreen;

  private route: Route = 'home';
  private startedAt = 0;
  private installEvent: BeforeInstallPromptEvent | null = null;
  private finishedThisSession = false;
  private session: MatchSession | null = null;
  private sessionTimer: ReturnType<typeof setInterval> | undefined;
  private wakeLock: import('../pwa/wakelock').WakeLock | null = null;

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
      sound: this.sound,
      settings: () => this.settings.value,
      onExit: () => this.go('home'),
      onFinished: (finished, opponent) => this.onFinished(finished, opponent),
      onProgress: (progress, opponent) => this.autosave(progress, opponent),
      onLocalMove: (square) => { this.session?.playLocal(square); },
      openSettings: () => this.openSettings(),
      openHelp: () => this.openHelp(),
    });

    this.el = el('div', { id: 'app' }, [
      this.home.el, this.game.el, this.live.el, this.toast.el, this.sheets.backdrop, this.sheets.el,
    ]);

    applyDocumentSettings(this.settings.value);
    this.sound.apply(this.settings.value);
    // The context is constructed on the first gesture and never before: iOS
    // will otherwise stay silent for the rest of the session.
    this.sound.attachUnlock();
    this.settings.subscribe((next) => {
      applyDocumentSettings(next);
      this.sound.apply(next);
      this.game.applySettings(next);
    });

    this.wirePlatform();
    this.go('home');
    this.home.setResume(loadSavedGame());
    this.handleDeepLink();
    this.handleShortcut();
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
    const unlocked = this.settings.get('unlockedLevel');

    const list = el('div');
    for (const [level, blurb] of BLURBS) {
      const reason = lockedReason(unlocked, level);
      const open = reason === null;
      const name = LEVEL_NAMES[level];
      const row = el('button', {
        type: 'button',
        class: 'row',
        // Genuinely enabled, so a screen reader is told the same thing a finger
        // is: tap it and it explains itself, rather than going quiet (C10).
        ...(open ? {} : { 'data-unavailable': 'true', 'aria-label': `${level}. ${name}. ${reason}` }),
      }, [
        el('span', { class: 'row__label' }, [
          el('span', { text: `${level}. ${name}` }),
          el('span', { class: 'u-sr', text: blurb }),
        ]),
        ...(open ? [] : [el('span', { class: 'row__note', text: 'Locked' })]),
      ]);
      on(row, 'click', () => {
        if (!open) { this.toast.show(reason!); return; }
        this.sheets.close();
        this.settings.set('lastLevel', level);
        const variant = reverseToggle.checked ? 'reverse' : 'standard';
        this.settings.set('lastVariant', variant);
        this.startGame(this.computerOpponent(level, variant, 0));
      });
      list.append(row);
    }

    // Reverse Reversi is tucked in here and off by default, exactly as specified.
    // Label first, control last, like every other switch in the app.
    const reverseToggle = el('input', { type: 'checkbox', class: 'switch', id: 'reverse-variant' });
    const reverse = el('label', { class: 'field', for: 'reverse-variant' }, [
      el('span', {}, [
        el('span', { class: 'field__label', text: 'Reverse Reversi' }),
        el('span', { class: 'field__hint', text: 'Fewest discs wins.' }),
      ]),
      reverseToggle,
    ]);

    const ladder = el('p', { class: 't-body', text: ladderLine(unlocked) });

    this.sheets.open({
      title: 'Play the computer',
      body: el('div', {}, [ladder, list, reverse]),
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
    return {
      kind: 'computer',
      color: playerColor === 0 ? 1 : 0,
      label: LEVEL_NAMES[level],
      level,
      variant,
      allowUndo: true,
      think: async (game) => (await ensure())
        .think(game.position, level, variant, notation.serialize(game)),
      dispose: () => { client?.dispose(); client = null; },
    };
  }

  private openFriendSheet(pin?: string): void {
    // A self-hosted signalling relay can be named on the URL. The brief allows
    // one, and the end-to-end test uses it to prove the whole PIN path without
    // depending on a stranger's server being up.
    const relay = new URLSearchParams(location.search).get('relay');
    openFriendFlow({
      sheets: this.sheets,
      toast: this.toast,
      random: () => Math.random(),
      ...(relay ? { relayUrls: relay.split(',') } : {}),
      onPassAndPlay: () => this.startGame(passAndPlay(this.settings.get('lastVariant'))),
      onConnected: (transport, isHost, joined) => this.beginMatch(transport, isHost, joined),
    }, pin);
    if (pin) this.toast.show(`Joining ${formatPin(pin)}.`);
  }

  /* ── a match with another device ─────────────────────────────────────── */

  private beginMatch(transport: Transport, isHost: boolean, pin: string): void {
    this.endMatch();
    const session = new MatchSession({
      transport, rules, notation, games, isHost, code: pin,
      variant: this.settings.get('lastVariant'),
      hostSeat: 'coin',
      now: () => Date.now(),
      random: () => Math.random(),
    });
    this.session = session;

    // A move from the far side resolves whatever the screen is waiting on, so
    // the ordinary opponent loop drives the animation and the narration.
    let deliver: ((square: Square) => void) | null = null;
    session.onRemoteMove((square) => { deliver?.(square); deliver = null; });
    session.onEmote((emote, mine) => this.game.showEmote(EMOTE_TEXT[emote], mine));

    const opponentFor = (myColor: Color): Opponent => ({
      kind: 'friend',
      color: myColor === BLACK ? WHITE : BLACK,
      label: 'Your friend',
      variant: this.settings.get('lastVariant'),
      allowUndo: false,
      unavailableReason: 'Not available in a friend match.',
      think: () => new Promise<Square>((resolve) => { deliver = resolve; }),
      dispose: () => this.endMatch(),
    });

    // Seats are assigned by the host during the handshake, so the board cannot
    // open until they arrive. Reading myColor before then gave both peers the
    // same colour and left each waiting for the other.
    let seated: Color | null = null;
    session.onChange((view) => {
      if (view.myColor !== null && view.myColor !== seated) {
        seated = view.myColor;
        this.sheets.close();
        this.startGame(opponentFor(view.myColor), view.game);
        return;
      }
      if (seated === null) return;

      // A snapshot reconciled a disagreement: adopt it rather than drifting.
      if (view.game.position.moveNumber !== this.game.current.position.moveNumber
        && view.game.position.hash !== this.game.current.position.hash) {
        this.game.resetTo(view.game);
      }
      if (view.problem) this.game.setStatus(view.problem);
      else if (view.phase === 'reconnecting') {
        const seconds = Math.ceil(view.graceLeft / 1000);
        this.game.setStatus(`${theirColourWord(view.myColor)} disconnected. Waiting ${seconds}s…`);
      } else if (view.phase === 'lost') this.offerClaim();
    });

    this.sessionTimer = setInterval(() => session.tick(), 1000);
    void this.holdWakeLock();
    session.start();
  }

  private offerClaim(): void {
    if (this.sheets.isOpen) return;
    this.sheets.open({
      title: 'Your friend is gone',
      body: el('p', { class: 't-body', text: 'They have not come back within the grace window.' }),
      dismissible: false,
      actions: [
        primary('Claim the win', () => { this.sheets.close(); this.endMatch(); this.go('home'); }),
        secondary('Save and exit', () => { this.sheets.close(); this.endMatch(); this.go('home'); }),
      ],
    });
  }

  private endMatch(): void {
    clearInterval(this.sessionTimer);
    this.sessionTimer = undefined;
    this.session?.dispose();
    this.session = null;
    void this.wakeLock?.release();
  }

  /** Held only while an online match is live, and dropped on background. */
  private async holdWakeLock(): Promise<void> {
    if (!this.wakeLock) {
      const { WakeLock } = await import('../pwa/wakelock');
      this.wakeLock = new WakeLock();
    }
    await this.wakeLock.hold();
  }

  /* ── persistence ─────────────────────────────────────────────────────── */

  private autosave(game: Game, opponent: Opponent): void {
    if (rules.isTerminal(game.position)) { clearSavedGame(); return; }
    saveGame({
      transcript: notation.serialize(game),
      variant: opponent.variant,
      mode: opponent.kind,
      opponent: opponent.level ?? null,
      playerColor: opponent.color === null ? null : opponent.color === 0 ? 1 : 0,
      startedAt: this.startedAt,
      savedAt: Date.now(),
    });
  }

  private onFinished(game: Game, opponent: Opponent): string | null {
    clearSavedGame();
    this.finishedThisSession = true;
    const result = rules.outcome(game.position, opponent.variant);
    const winner = result?.kind === 'win' ? result.winner : 'draw';
    const playerColor = opponent.color === null ? null : opponent.color === BLACK ? WHITE : BLACK;

    void import('../data/archive').then(({ recordFinishedGame }) => {
      const s = score(game.position);
      void recordFinishedGame({
        transcript: notation.serialize(game),
        variant: opponent.variant,
        mode: opponent.kind,
        opponent: opponent.level ?? (opponent.kind === 'friend' ? opponent.label : null),
        playerColor,
        blackDiscs: s.black,
        whiteDiscs: s.white,
        winner,
        startedAt: this.startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - this.startedAt,
      });
    }).catch(() => {
      // The archive is a convenience. Losing a record must never surface as an
      // error over a finished game.
    });

    return this.maybeUnlock(opponent, winner === playerColor);
  }

  /** The ladder rule itself lives in data/ladder.ts, where it is unit-tested. */
  private maybeUnlock(opponent: Opponent, playerWon: boolean): string | null {
    if (opponent.kind !== 'computer' || opponent.level === undefined) return null;
    const step = afterGame(this.settings.get('unlockedLevel'), opponent.level, playerWon);
    if (step.note === null) return null;
    this.settings.set('unlockedLevel', step.unlockedLevel);
    this.settings.set('lastLevel', step.unlockedLevel);
    return step.note;
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

  /** The manifest's two shortcuts land here, as ?play=computer or ?play=pass. */
  private handleShortcut(): void {
    const play = new URLSearchParams(location.search).get('play');
    if (play !== 'computer' && play !== 'pass') return;
    // Strip it so a reload does not restart the game behind the person's back.
    history.replaceState(null, '', location.pathname);
    if (play === 'pass') this.startGame(passAndPlay(this.settings.get('lastVariant')));
    else this.openComputerSheet();
  }

  private handleDeepLink(): void {
    const pin = pinFromLink(location.hash);
    if (!pin) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.openFriendSheet(pin);
  }
}

/** What each level plays like. The names themselves live with the ladder. */
const BLURBS: readonly (readonly [Level, string])[] = [
  [1, 'Looks one move ahead and will happily give you a corner.'],
  [2, 'Sees three moves. Makes ordinary mistakes.'],
  [3, 'Counts mobility properly and rarely blunders.'],
  [4, 'Plays the edges well and punishes a loose corner.'],
  [5, 'Solves the last sixteen squares exactly.'],
  [6, 'No cap on depth, and the endgame is exact.'],
];

const EMOTE_TEXT: Record<Emote, string> = {
  'good-move': 'Good move',
  nice: 'Nice',
  oops: 'Oops',
  hurry: 'Hurry?',
  thanks: 'Thanks',
  rematch: 'Rematch?',
};

const theirColourWord = (mine: Color | null): string =>
  (mine === BLACK ? 'White' : 'Black');

/** Not in lib.dom yet, and we only need the two members we call. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

export { primary, danger };
