/* ============================================================================
   The game screen. Owns the Game, the board view, the score strip and the thumb
   bar, and narrates everything that happens — on screen and to the live region.
   Copy follows brief §14: terse, concrete, and it says what happened.
   ========================================================================= */

import { BoardView, nameOf } from '../board';
import { el, ms, on, tweenInt } from '../dom';
import type { LiveRegion, SheetHost, Toast } from '../chrome';
import type { Sound } from '../../audio';
import {
  apply, canUndo, games, legalMoves, outcome, play, positionAt, rules, score, undo,
} from '../../engine';
import { BLACK, WHITE, type Color, type Game, type ScoreMode, type Square, type Variant } from '../../engine/types';
import type { Settings } from '../../data/types';

export interface Opponent {
  kind: 'pass' | 'computer' | 'friend';
  /** The colour the opponent holds; null in pass & play, where both are local. */
  color: Color | null;
  /** How the opponent is named in the score strip and the status line. */
  label: string;
  variant: Variant;
  /** Undo and Hint are unavailable in a friend match, and say so on tap. */
  allowUndo: boolean;
  allowHint: boolean;
  unavailableReason?: string;
  think?(game: Game): Promise<Square>;
  hint?(game: Game): Promise<{ square: Square; reason: string }>;
  dispose?(): void;
}

export interface GameScreenHost {
  live: LiveRegion;
  toast: Toast;
  sheets: SheetHost;
  sound: Sound;
  settings: () => Settings;
  onExit(): void;
  onFinished(game: Game, opponent: Opponent): void;
  onProgress(game: Game, opponent: Opponent): void;
  openSettings(): void;
  openHelp(): void;
}

const colorWord = (c: Color): string => (c === BLACK ? 'Black' : 'White');

export class GameScreen {
  readonly el: HTMLElement;

  private readonly board: BoardView;
  private readonly strip: HTMLElement;
  private readonly turnRule: HTMLElement;
  private readonly scoreText: HTMLElement;
  private readonly capsules: [HTMLElement, HTMLElement];
  private readonly counts: [HTMLElement, HTMLElement];
  private readonly status: HTMLElement;
  private readonly label: HTMLElement;
  private readonly thumbs: Record<'undo' | 'hint' | 'moves' | 'more', HTMLButtonElement>;
  private readonly chitHost: HTMLElement;

  private game: Game = games.newGame();
  private opponent: Opponent = passAndPlay('standard');
  private lastMove: Square | null = null;
  private busy = false;
  private undosUsed = 0;
  private shown: [number, number] = [2, 2];
  private cancelTween: (() => void) | null = null;
  private thinkingTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: GameScreenHost) {
    this.board = new BoardView({
      onCommit: (square) => void this.commit(square),
      onIllegal: (square) => { this.board.illegal(square); this.host.sound.illegal(); },
      flipsFor: (square) => this.flipsFor(square),
      describe: (square) => this.describe(square),
      onAnnounceScore: () => this.announceScore(),
    });

    this.capsules = [this.capsule(BLACK), this.capsule(WHITE)];
    // The count appears once, centred, as in the brief's diagram. Showing it on
    // each capsule as well put the same two numbers on screen three times.
    this.counts = [el('span'), el('span')];
    this.scoreText = el('span', { class: 'strip__score', text: '2 : 2' });
    this.turnRule = el('div', { class: 'strip__turn' });
    this.strip = el('div', { class: 'strip' }, [
      el('div', { class: 'strip__side' }, [this.capsules[0]]),
      this.scoreText,
      el('div', { class: 'strip__side strip__side--right' }, [this.capsules[1]]),
      this.turnRule,
    ]);

    this.status = el('p', { class: 'status t-body' });
    this.chitHost = el('div', { class: 'chit-host', 'aria-hidden': 'true' });
    this.label = el('p', { class: 'topbar__label' });

    const thumb = (name: string, text: string): HTMLButtonElement =>
      el('button', { type: 'button', class: 'thumbbar__slot', 'data-thumb': name, text });
    this.thumbs = {
      undo: thumb('undo', 'Undo'),
      hint: thumb('hint', 'Hint'),
      moves: thumb('moves', 'Moves'),
      more: thumb('more', 'More'),
    };

    const back = el('button', { type: 'button', class: 'topbar__back', 'aria-label': 'Back to the menu' },
      [chevron('left')]);
    on(back, 'click', () => this.host.onExit());
    on(this.thumbs.undo, 'click', () => void this.undoMove());
    on(this.thumbs.hint, 'click', () => void this.askHint());
    on(this.thumbs.moves, 'click', () => this.openMoves());
    on(this.thumbs.more, 'click', () => this.openMore());

    this.el = el('section', { class: 'screen game', 'aria-label': 'Game' }, [
      el('div', { class: 'topbar' }, [back, this.label, el('span')]),
      this.strip,
      el('div', { class: 'stage' }, [this.board.el, this.status, this.chitHost]),
      el('div', { class: 'thumbbar' },
        [this.thumbs.undo, this.thumbs.hint, this.thumbs.moves, this.thumbs.more]),
    ]);
  }

  start(opponent: Opponent, from?: Game): void {
    if (opponent !== this.opponent) this.opponent.dispose?.();
    this.opponent = opponent;
    this.game = from ?? games.newGame(opponent.variant);
    this.lastMove = this.game.history.at(-1)?.move ?? null;
    this.undosUsed = 0;
    const s = score(this.game.position);
    this.shown = [s.black, s.white];
    this.label.textContent = this.matchLabel();
    this.nameCapsules();
    this.applySettings(this.host.settings());
    this.announce(this.turnSentence());
    void this.maybeOpponentMove();
  }

  applySettings(settings: Settings): void {
    this.board.setOptions({
      coordinates: settings.coordinates,
      legalDots: settings.legalDots,
      lastMoveMarker: settings.lastMoveMarker,
      colorblindMarking: settings.colorblindMarking,
    });
    this.refresh();
  }

  /** The tab went away: stop taking input and let the caller abort any search. */
  suspend(): void {
    this.board.setInteractive(false);
  }

  resume(): void {
    this.refresh();
  }

  get current(): Game { return this.game; }
  get currentOpponent(): Opponent { return this.opponent; }

  /* ── the move loop ───────────────────────────────────────────────────── */

  private async commit(square: Square): Promise<void> {
    if (this.busy) return;
    const state = this.game.position;
    if (!rules.isLegal(state, square)) { this.board.illegal(square); return; }

    this.busy = true;
    this.board.setInteractive(false);

    const mover = state.turn;
    const result = apply(state, square);
    this.game = play(this.game, square);
    this.lastMove = square;

    // The numerals start at the wave's midpoint, so they land as the discs do.
    const after = score(this.game.position);
    setTimeout(() => this.tweenScore(after.black, after.white),
      this.board.waveMidpoint(result.flipped.length));

    // The disc lands, then the wave: the sound follows the animation's own
    // stagger, so a click arrives with each disc rather than all at once.
    this.host.sound.place();
    const chebyshev = (i: number): number => {
      const target = result.flipped[i]!;
      return Math.max(
        Math.abs((target % 8) - (square % 8)),
        Math.abs(Math.floor(target / 8) - Math.floor(square / 8)),
      );
    };
    this.host.sound.flipWave(result.flipped.length, ms('--t-stagger'), chebyshev);

    await this.board.play(square, mover, result.flipped);

    this.narrate(mover, square, result.flipped.length, result.passedBy);
    this.refresh();
    this.host.onProgress(this.game, this.opponent);

    this.busy = false;
    if (rules.isTerminal(this.game.position)) { this.finish(); return; }
    await this.maybeOpponentMove();
  }

  private async maybeOpponentMove(): Promise<void> {
    const opp = this.opponent;
    if (!opp.think || opp.color === null || rules.isTerminal(this.game.position)) {
      this.refresh();
      return;
    }
    if (this.game.position.turn !== opp.color) { this.refresh(); return; }

    this.board.setInteractive(false);
    this.setThinking(true);
    try {
      const square = await opp.think(this.game);
      this.setThinking(false);
      await this.commit(square);
    } catch {
      // An aborted search (a new game, a backgrounded tab) is not an error; the
      // next start() or resume() puts the board back in charge.
      this.setThinking(false);
      this.refresh();
    }
  }

  private finish(): void {
    const settings = this.host.settings();
    const result = outcome(this.game.position, this.opponent.variant, settings.scoreMode);
    if (!result) return;
    this.board.finish(result.kind === 'win' ? result.winner : null);
    this.host.sound.play('end');
    this.refresh();
    this.host.onFinished(this.game, this.opponent);

    const line = this.resultLine(settings.scoreMode);
    this.announce(line);
    // One orchestrated moment: the discs settle, the sweep runs, then the sheet
    // rises. The final board stays visible above it.
    setTimeout(() => {
      this.host.sheets.open({
        title: line,
        dismissible: true,
        actions: [
          primary('Play again', () => { this.host.sheets.close(); this.start(this.opponent); }),
          secondary('Back to the menu', () => { this.host.sheets.close(); this.host.onExit(); }),
        ],
      });
    }, ms('--t-sweep'));
  }

  /* ── narration ───────────────────────────────────────────────────────── */

  private narrate(mover: Color, square: Square, flips: number, passedBy?: Color): void {
    const disc = flips === 1 ? 'disc' : 'discs';
    let line = `${colorWord(mover)} plays ${nameOf(square)}, flips ${flips} ${disc}.`;
    if (passedBy !== undefined && !rules.isTerminal(this.game.position)) {
      line += ` ${colorWord(passedBy)} has no move.`;
      this.showPass(passedBy);
      this.host.sound.play('pass');
    }
    this.announce(line);
  }

  /** A pass is never silent: the capsule dims and a paper chit says why. */
  private showPass(passer: Color): void {
    const capsule = this.capsules[passer];
    capsule.dataset.passed = 'true';
    setTimeout(() => delete capsule.dataset.passed, ms('--t-pass') + 40);

    const other = passer === BLACK ? WHITE : BLACK;
    const isMine = this.opponent.color !== null && passer !== this.opponent.color;
    const text = isMine
      ? `You have no legal move. ${colorWord(other)} plays again.`
      : `${colorWord(passer)} has no legal move. ${colorWord(other)} plays again.`;

    const chit = el('p', { class: 'chit', text });
    this.chitHost.replaceChildren(chit);
    setTimeout(() => chit.remove(), ms('--t-pass') + 1200);
  }

  private announce(message: string): void {
    this.host.live.say(message);
    this.status.textContent = message;
  }

  private announceScore(): void {
    const s = score(this.game.position);
    this.host.live.say(`Black ${s.black}, White ${s.white}. ${this.turnSentence()}`);
  }

  private turnSentence(): string {
    const turn = this.game.position.turn;
    if (this.opponent.color === null) return `${colorWord(turn)} to play.`;
    return turn === this.opponent.color ? `${this.opponent.label} is thinking.` : 'Your turn.';
  }

  private resultLine(mode: ScoreMode): string {
    const raw = score(this.game.position);
    const s = score(this.game.position, mode);
    const result = outcome(this.game.position, this.opponent.variant, mode);
    if (!result) return '';
    const prefix = rules.terminalReason(this.game.position) === 'wipeout'
      ? `No ${raw.black === 0 ? 'black' : 'white'} discs left. `
      : '';
    if (result.kind === 'draw') return `${prefix}Draw, ${s.black}–${s.white}.`;
    const high = Math.max(s.black, s.white);
    const low = Math.min(s.black, s.white);
    if (this.opponent.color === null) return `${prefix}${colorWord(result.winner)} wins, ${high}–${low}.`;
    return result.winner === this.opponent.color
      ? `${prefix}${this.opponent.label} wins, ${high}–${low}.`
      : `${prefix}You win, ${high}–${low}.`;
  }

  /* ── view ────────────────────────────────────────────────────────────── */

  private refresh(): void {
    const state = this.game.position;
    const over = rules.isTerminal(state);
    this.board.setMover(state.turn);
    this.board.render(state, over ? [] : legalMoves(state), this.lastMove);
    this.board.setInteractive(!this.busy && this.isLocalTurn());

    const s = score(state);
    this.setCount(0, s.black);
    this.setCount(1, s.white);
    this.scoreText.textContent = `${s.black} : ${s.white}`;
    this.shown = [s.black, s.white];

    for (const c of [BLACK, WHITE] as const) {
      this.capsules[c].dataset.active = String(state.turn === c && !over);
    }
    this.slideTurnRule(state.turn, over);
    if (!over) this.status.textContent = this.turnSentence();

    // aria-disabled rather than disabled: the control must stay tappable,
    // because the tap is how the reason gets told (brief §5.2).
    const canUndoNow = this.opponent.allowUndo && canUndo(this.game) && this.undoBudgetLeft();
    this.thumbs.undo.setAttribute('aria-disabled', String(!canUndoNow));
    this.thumbs.hint.setAttribute('aria-disabled',
      String(!this.opponent.allowHint || !this.host.settings().hints || !this.isLocalTurn()));
  }

  private isLocalTurn(): boolean {
    if (rules.isTerminal(this.game.position)) return false;
    return this.opponent.color === null || this.game.position.turn !== this.opponent.color;
  }

  private setCount(side: 0 | 1, value: number): void {
    this.counts[side].textContent = String(value);
  }

  private tweenScore(black: number, white: number): void {
    this.cancelTween?.();
    const duration = ms('--t-score');
    const [fromB, fromW] = this.shown;
    const cancelB = tweenInt(fromB, black, duration, (v) => this.setCount(0, v));
    const cancelW = tweenInt(fromW, white, duration, (v) => {
      this.setCount(1, v);
      this.scoreText.textContent = `${this.counts[0].textContent} : ${v}`;
    });
    this.scoreText.setAttribute('aria-label', `Black ${black}, White ${white}`);
    this.shown = [black, white];
    this.cancelTween = () => { cancelB(); cancelW(); };
  }

  private slideTurnRule(turn: Color, over: boolean): void {
    this.turnRule.hidden = over;
    if (over) return;
    const stripBox = this.strip.getBoundingClientRect();
    const box = this.capsules[turn].getBoundingClientRect();
    if (!box.width) return;
    this.turnRule.style.width = `${Math.round(box.width)}px`;
    this.turnRule.style.setProperty('--turn-x', `${Math.round(box.left - stripBox.left)}px`);
  }

  private capsule(color: Color): HTMLElement {
    return el('span', { class: 'capsule', 'data-side': String(color) }, [
      el('span', { class: `capsule__mark capsule__mark--${color === BLACK ? 'dark' : 'light'}` }),
      el('span', { class: 'capsule__name' }),
    ]);
  }

  private nameCapsules(): void {
    const names: [string, string] = this.opponent.color === null
      ? ['Black', 'White']
      : this.opponent.color === WHITE ? ['You', this.opponent.label] : [this.opponent.label, 'You'];
    for (const c of [0, 1] as const) {
      this.capsules[c].querySelector('.capsule__name')!.textContent = names[c];
    }
  }

  private matchLabel(): string {
    if (this.opponent.kind === 'pass') return 'Pass and play';
    if (this.opponent.kind === 'computer') return this.opponent.label;
    return `Playing ${this.opponent.label}`;
  }

  /** The hairline rule appears only if the search is still running at 500ms. */
  private setThinking(running: boolean): void {
    clearTimeout(this.thinkingTimer);
    const capsule = this.opponent.color === null ? null : this.capsules[this.opponent.color];
    if (!capsule) return;
    if (!running) { capsule.querySelector('.capsule__thinking')?.remove(); return; }
    this.thinkingTimer = setTimeout(() => {
      if (!capsule.querySelector('.capsule__thinking')) {
        capsule.append(el('span', { class: 'capsule__thinking' }));
      }
    }, 500);
  }

  private describe(square: Square): string {
    const state = this.game.position;
    const bit = 1n << BigInt(square);
    const name = nameOf(square);
    if ((state.black & bit) !== 0n) return `${name}, black disc`;
    if ((state.white & bit) !== 0n) return `${name}, white disc`;
    return rules.isLegal(state, square) ? `${name}, empty, legal move` : `${name}, empty`;
  }

  private flipsFor(square: Square): readonly Square[] {
    const state = this.game.position;
    if (!rules.isLegal(state, square)) return [];
    return apply(state, square).flipped;
  }

  /* ── thumb bar ───────────────────────────────────────────────────────── */

  private undoBudgetLeft(): boolean {
    const allowance = this.host.settings().undoAllowance;
    if (allowance === 'off') return false;
    if (allowance === 'three') return this.undosUsed < 3;
    return true;
  }

  private async undoMove(): Promise<void> {
    if (!this.opponent.allowUndo) {
      this.host.toast.show(this.opponent.unavailableReason ?? 'Not available in this match.');
      return;
    }
    if (!canUndo(this.game)) { this.host.toast.show('Nothing to undo yet.'); return; }
    if (!this.undoBudgetLeft()) { this.host.toast.show('No undos left this game.'); return; }

    await this.board.settle();
    // Against the computer one undo takes back the pair, so the player is
    // returned to their own decision instead of watching it move again.
    let next = undo(this.game);
    if (this.opponent.color !== null && next.position.turn === this.opponent.color && canUndo(next)) {
      next = undo(next);
    }
    this.game = next;
    this.undosUsed += 1;
    this.lastMove = this.game.history.at(-1)?.move ?? null;
    const s = score(this.game.position);
    this.shown = [s.black, s.white];
    this.refresh();
    this.announce(`Took back to move ${this.game.position.moveNumber}. ${this.turnSentence()}`);
    this.host.onProgress(this.game, this.opponent);
  }

  private async askHint(): Promise<void> {
    if (!this.opponent.allowHint || !this.opponent.hint) {
      this.host.toast.show(this.opponent.unavailableReason ?? 'Not available in this match.');
      return;
    }
    if (!this.host.settings().hints) { this.host.toast.show('Hints are off in Settings.'); return; }
    if (!this.isLocalTurn()) { this.host.toast.show('Wait for your turn.'); return; }

    this.thumbs.hint.setAttribute('aria-busy', 'true');
    try {
      const { square, reason } = await this.opponent.hint(this.game);
      this.board.focusSquare(square);
      this.host.toast.show(`${nameOf(square)}. ${reason}.`);
      this.announce(`Hint: ${nameOf(square)}. ${reason}.`);
    } finally {
      this.thumbs.hint.removeAttribute('aria-busy');
    }
  }

  private openMoves(): void {
    const list = el('div', { class: 'moves' });
    if (this.game.history.length === 0) {
      list.append(el('p', { class: 't-body', text: 'No moves yet.' }));
    }
    this.game.history.forEach((ply, index) => {
      const item = el('button', {
        type: 'button',
        class: 'moves__item',
        'aria-current': String(index === this.game.history.length - 1),
      }, [
        el('span', { class: 'moves__ply', text: String(index + 1) }),
        el('span', { text: nameOf(ply.move) }),
      ]);
      on(item, 'click', () => {
        this.board.render(positionAt(this.game, index + 1), [], ply.move);
        for (const other of list.querySelectorAll('.moves__item')) {
          other.setAttribute('aria-current', String(other === item));
        }
      });
      list.append(item);
      if (ply.passedBy !== undefined) {
        list.append(el('span', {
          class: 'moves__item moves__pass',
          text: `${colorWord(ply.passedBy)} passed`,
        }));
      }
    });

    this.host.sheets.open({
      title: 'Moves',
      body: list,
      dismissible: true,
      // Previewing is read-only: closing puts the live position back.
      onClose: () => this.refresh(),
    });
  }

  private openMore(): void {
    const actions: HTMLElement[] = [
      secondary('New game', () => { this.host.sheets.close(); this.start(this.opponent); }),
      secondary('Settings', () => { this.host.sheets.close(); this.host.openSettings(); }),
      secondary('How to play', () => { this.host.sheets.close(); this.host.openHelp(); }),
    ];
    if (!rules.isTerminal(this.game.position)) actions.push(danger('Resign', () => this.confirmResign()));
    this.host.sheets.open({ title: 'This game', actions, dismissible: true });
  }

  private confirmResign(): void {
    this.host.sheets.close();
    setTimeout(() => {
      this.host.sheets.open({
        title: 'Resign this game?',
        body: el('p', { class: 't-body', text: 'It is recorded as a loss and cannot be resumed.' }),
        dismissible: true,
        actions: [
          danger('Resign', () => {
            this.host.sheets.close();
            const loser = this.opponent.color === null
              ? this.game.position.turn
              : this.opponent.color === BLACK ? WHITE : BLACK;
            this.announce(`${colorWord(loser)} resigned.`);
            this.host.onExit();
          }),
          secondary('Keep playing', () => this.host.sheets.close()),
        ],
      });
    }, ms('--t-screen'));
  }
}

/* ── shared little builders ─────────────────────────────────────────────── */

function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', { type: 'button', class: `btn ${cls}` },
    [el('span', { class: 'btn__label', text })]);
  on(node, 'click', onClick);
  return node;
}

export const primary = (text: string, onClick: () => void): HTMLButtonElement =>
  button('btn--primary', text, onClick);
export const secondary = (text: string, onClick: () => void): HTMLButtonElement =>
  button('btn--secondary', text, onClick);
export const danger = (text: string, onClick: () => void): HTMLButtonElement =>
  button('btn--danger', text, onClick);

/** A hairline chevron. Not an emoji, not an icon font, not a `→` on a label. */
export function chevron(direction: 'left' | 'right'): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '8');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 8 12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', direction === 'left' ? 'M6.5 1 1.5 6l5 5' : 'M1.5 1l5 5-5 5');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  svg.append(path);
  return svg;
}

export function passAndPlay(variant: Variant): Opponent {
  return {
    kind: 'pass', color: null, label: 'Pass and play', variant,
    allowUndo: true, allowHint: true,
  };
}
