/* ============================================================================
   The board. Semantic DOM: an 8×8 grid of real <button> cells for
   accessibility and hit-testing, with absolutely positioned discs above them so
   a flip is a pure composite. Motion follows the approved table in DESIGN.md §9
   exactly; every duration and easing is read from a token, never written here.
   ========================================================================= */

import { el, ms, on, reflow, wait } from './dom';
import { BLACK, type Color, type PositionState, type Square } from '../engine/types';

const SIZE = 8;
const FILES = 'abcdefgh';

export interface BoardOptions {
  coordinates: boolean;
  legalDots: boolean;
  lastMoveMarker: boolean;
  colorblindMarking: boolean;
}

export interface BoardCallbacks {
  /** A release inside a legal cell. */
  onCommit(square: Square): void;
  /** A release inside a cell that cannot be played. */
  onIllegal(square: Square): void;
  /** The discs a move here would turn over; empty when the move is illegal. */
  flipsFor(square: Square): readonly Square[];
  /** The full label a screen reader hears, e.g. "d3, empty, legal move". */
  describe(square: Square): string;
  /** `?` on the board: read the score out. */
  onAnnounceScore(): void;
}

const DEFAULTS: BoardOptions = {
  coordinates: false,
  legalDots: true,
  lastMoveMarker: true,
  colorblindMarking: false,
};

export const nameOf = (square: Square): string =>
  `${FILES[square % SIZE]}${Math.floor(square / SIZE) + 1}`;

export class BoardView {
  readonly el: HTMLElement;

  private readonly felt: HTMLElement;
  private readonly discLayer: HTMLElement;
  private readonly dotLayer: HTMLElement;
  private readonly sweep: HTMLElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly discs = new Map<Square, HTMLElement>();

  private options: BoardOptions = { ...DEFAULTS };
  private legal: ReadonlySet<Square> = new Set();
  private focused: Square = 27;
  private previewing: Square | null = null;
  private interactive = true;
  /** Resolves the currently running flip wave, so moves cannot overlap. */
  private settling: (() => void) | null = null;

  constructor(private readonly cb: BoardCallbacks) {
    this.felt = el('div', { class: 'board__felt', role: 'grid', 'aria-label': 'Reversi board' });
    this.discLayer = el('div', { class: 'board__discs', 'aria-hidden': 'true' });
    // Two squares in from each corner, at the intersections, exactly where a
    // printed board has them.
    this.dotLayer = el('div', { class: 'board__dots', 'aria-hidden': 'true' },
      [[2, 2], [6, 2], [2, 6], [6, 6]].map(([x, y]) =>
        el('span', { class: 'board__dot', '--x': String(x), '--y': String(y) })));
    this.sweep = el('div', { class: 'board__sweep', 'aria-hidden': 'true' });

    for (let rank = 0; rank < SIZE; rank += 1) {
      const row = el('div', { class: 'board__row', role: 'row' });
      for (let file = 0; file < SIZE; file += 1) {
        const square = rank * SIZE + file;
        const cell = el('button', {
          type: 'button',
          class: 'cell',
          role: 'gridcell',
          'data-square': square,
          'data-file': file,
          'data-rank': rank,
          '--file': String(file),
          '--rank': String(rank),
          tabindex: square === this.focused ? 0 : -1,
        }, [el('span', { class: 'cell__inner' }, [
          el('span', { class: 'cell__ghost' }),
          el('span', { class: 'cell__dot' }),
        ])]);
        if ((file + rank) % 2 === 1) cell.classList.add('is-alt');
        this.cells.push(cell);
        row.append(cell);
      }
      this.felt.append(row);
    }
    this.felt.append(this.dotLayer, this.discLayer, this.sweep);

    this.el = el('div', { class: 'board', 'data-dots': 'true', 'data-lastmove': 'true' }, [
      el('div', { class: 'board__files', 'aria-hidden': 'true' },
        [...FILES].map((f) => el('span', { text: f }))),
      el('div', { class: 'board__ranks', 'aria-hidden': 'true' },
        Array.from({ length: SIZE }, (_, i) => el('span', { text: String(i + 1) }))),
      this.felt,
    ]);

    this.wirePointer();
    this.wireKeyboard();
  }

  setOptions(next: Partial<BoardOptions>): void {
    this.options = { ...this.options, ...next };
    this.el.dataset.coords = String(this.options.coordinates);
    this.el.dataset.dots = String(this.options.legalDots);
    this.el.dataset.lastmove = String(this.options.lastMoveMarker);
    this.el.dataset.cbmark = String(this.options.colorblindMarking);
  }

  /** Locks input while the engine thinks, or while a peer is to move. */
  setInteractive(on: boolean): void {
    this.interactive = on;
    for (const cell of this.cells) cell.disabled = !on;
  }

  /**
   * Bring the board to `state` with no animation. Used on load, on undo, on a
   * move-list preview and on a P2P snapshot — anywhere the position changes
   * without the user having watched it happen.
   */
  render(state: PositionState, legal: readonly Square[], lastMove: Square | null): void {
    this.legal = new Set(legal);
    for (let square = 0; square < SIZE * SIZE; square += 1) {
      const bit = 1n << BigInt(square);
      const occupant: Color | null =
        (state.black & bit) !== 0n ? 0 : (state.white & bit) !== 0n ? 1 : null;
      if (occupant === null) this.removeDisc(square);
      else this.putDisc(square, occupant);

      const cell = this.cells[square]!;
      cell.dataset.legal = String(this.legal.has(square));
      cell.dataset.last = String(lastMove === square);
      cell.setAttribute('aria-label', this.cb.describe(square));
      delete cell.dataset.ghost;
    }
  }

  /**
   * The one memorable moment in the app. The disc lands first, then each
   * captured disc rotates 180° about the axis of its own capture direction, so
   * the run reads as a single wave travelling outward from the placed square.
   */
  async play(placed: Square, mover: Color, flipped: readonly Square[]): Promise<void> {
    await this.settle();

    const disc = this.putDisc(placed, mover);
    disc.classList.add('is-placing');
    const place = ms('--t-place');
    await wait(place);
    disc.classList.remove('is-placing');

    if (flipped.length === 0) return;

    // Over twenty discs the wave compresses rather than dropping frames.
    const step = flipped.length > 20 ? ms('--t-stagger-tight') : ms('--t-stagger');
    const flip = ms('--t-flip');
    let last = 0;

    for (const square of flipped) {
      const target = this.discs.get(square);
      if (!target) continue;
      const df = (square % SIZE) - (placed % SIZE);
      const dr = Math.floor(square / SIZE) - Math.floor(placed / SIZE);
      // The rotation axis is the capture direction itself, which is what makes a
      // horizontal capture roll vertically. See DESIGN.md §9, correction C11.
      target.style.setProperty('--ax', String(Math.sign(df)));
      target.style.setProperty('--ay', String(Math.sign(dr)));
      // Chebyshev distance is the disc's index along its own ray, so every ray
      // starts at the placed square and travels outward at the same rate.
      const delay = step * Math.max(Math.abs(df), Math.abs(dr));
      target.style.transitionDelay = `${delay}ms`;
      target.style.willChange = 'transform';
      target.classList.add('is-flipping');
      last = Math.max(last, delay);
    }

    await new Promise<void>((resolve) => {
      const done = (): void => {
        this.settling = null;
        for (const square of flipped) {
          const target = this.discs.get(square);
          if (!target) continue;
          this.finishFlip(target, mover);
        }
        resolve();
      };
      this.settling = done;
      setTimeout(() => { if (this.settling === done) done(); }, last + flip + 40);
    });
  }

  /** The midpoint of a wave, so the score numerals land as the discs settle. */
  waveMidpoint(flipCount: number): number {
    if (flipCount === 0) return 0;
    const step = flipCount > 20 ? ms('--t-stagger-tight') : ms('--t-stagger');
    return ms('--t-place') + (step * 3 + ms('--t-flip')) / 2;
  }

  /** Finish any running wave immediately. Undo and rapid play both need this. */
  settle(): Promise<void> {
    if (!this.settling) return Promise.resolve();
    this.settling();
    return Promise.resolve();
  }

  illegal(square: Square): void {
    const cell = this.cells[square];
    if (!cell) return;
    cell.classList.remove('is-illegal');
    reflow(cell);
    cell.classList.add('is-illegal');
    setTimeout(() => cell.classList.remove('is-illegal'), ms('--t-illegal-fade') + 40);
  }

  /** One slow sweep in the winner's colour, once. No confetti, no roll-up. */
  finish(winner: Color | null): void {
    if (winner === null) return;
    const tone = winner === BLACK ? 'var(--ink)' : 'var(--bone)';
    this.sweep.style.background = `linear-gradient(100deg, transparent 30%, ${tone} 50%, transparent 70%)`;
    this.sweep.classList.remove('is-running');
    reflow(this.sweep);
    this.sweep.classList.add('is-running');
  }

  focusSquare(square: Square): void {
    const cell = this.cells[square];
    if (!cell) return;
    this.cells[this.focused]?.setAttribute('tabindex', '-1');
    this.focused = square;
    cell.setAttribute('tabindex', '0');
    cell.focus();
  }

  /* ── discs ───────────────────────────────────────────────────────────── */

  private putDisc(square: Square, color: Color): HTMLElement {
    let disc = this.discs.get(square);
    if (!disc) {
      disc = el('div', {
        class: 'disc',
        '--file': String(square % SIZE),
        '--rank': String(Math.floor(square / SIZE)),
      });
      this.discs.set(square, disc);
      this.discLayer.append(disc);
    }
    disc.dataset.color = String(color);
    return disc;
  }

  private removeDisc(square: Square): void {
    const disc = this.discs.get(square);
    if (!disc) return;
    disc.remove();
    this.discs.delete(square);
  }

  /**
   * Land the disc: drop the rotation and adopt the new colour in the same frame.
   * Both faces are pre-rotated about the axis the flip used, so the composed
   * transform is the identity either way and the swap is invisible.
   */
  private finishFlip(disc: HTMLElement, color: Color): void {
    const previous = disc.style.transition;
    disc.style.transition = 'none';
    disc.style.transitionDelay = '';
    disc.classList.remove('is-flipping');
    disc.dataset.color = String(color);
    reflow(disc);
    disc.style.transition = previous;
    disc.style.willChange = '';
  }

  /* ── input ───────────────────────────────────────────────────────────── */

  private squareFrom(target: EventTarget | null): Square | null {
    const cell = (target as Element | null)?.closest?.('.cell');
    if (!(cell instanceof HTMLElement)) return null;
    const square = Number(cell.dataset.square);
    return Number.isInteger(square) ? square : null;
  }

  private wirePointer(): void {
    // Commit on release inside the cell, never on press. Cells are ~37px at the
    // narrowest supported width, so a mis-aim has to be correctable: press shows
    // the preview, sliding moves it, releasing outside cancels. DESIGN.md §7.
    on(this.felt, 'pointerdown', (event: PointerEvent) => {
      if (!this.interactive || event.button !== 0) return;
      const square = this.squareFrom(event.target);
      if (square === null) return;
      this.felt.setPointerCapture(event.pointerId);
      this.preview(square);
    });

    on(this.felt, 'pointermove', (event: PointerEvent) => {
      if (this.previewing === null) return;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      this.preview(this.squareFrom(under));
    });

    const release = (event: PointerEvent): void => {
      const started = this.previewing;
      this.clearPreview();
      if (started === null) return;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      if (this.squareFrom(under) !== started) return;
      if (this.legal.has(started)) this.cb.onCommit(started);
      else this.cb.onIllegal(started);
    };

    on(this.felt, 'pointerup', release);
    on(this.felt, 'pointercancel', () => this.clearPreview());
  }

  private preview(square: Square | null): void {
    if (square === this.previewing) return;
    this.clearPreview();
    if (square === null) return;
    this.previewing = square;
    if (!this.legal.has(square)) return;

    const cell = this.cells[square]!;
    cell.dataset.ghost = this.el.dataset.mover === '1' ? 'light' : 'dark';
    for (const target of this.cb.flipsFor(square)) {
      this.discs.get(target)?.classList.add('is-would-flip');
    }
  }

  private clearPreview(): void {
    if (this.previewing === null) return;
    delete this.cells[this.previewing]!.dataset.ghost;
    for (const disc of this.discs.values()) disc.classList.remove('is-would-flip');
    this.previewing = null;
  }

  /** Whose disc the ghost preview should show. */
  setMover(color: Color): void {
    this.el.dataset.mover = String(color);
  }

  private wireKeyboard(): void {
    on(this.felt, 'keydown', (event: KeyboardEvent) => {
      const square = this.squareFrom(event.target);
      if (square === null) return;
      const file = square % SIZE;
      const rank = Math.floor(square / SIZE);
      const move = (df: number, dr: number): void => {
        event.preventDefault();
        const f = Math.min(SIZE - 1, Math.max(0, file + df));
        const r = Math.min(SIZE - 1, Math.max(0, rank + dr));
        this.focusSquare(r * SIZE + f);
      };
      switch (event.key) {
        case 'ArrowLeft': return move(-1, 0);
        case 'ArrowRight': return move(1, 0);
        case 'ArrowUp': return move(0, -1);
        case 'ArrowDown': return move(0, 1);
        case 'Home': return move(-SIZE, 0);
        case 'End': return move(SIZE, 0);
        case 'PageUp': return move(0, -SIZE);
        case 'PageDown': return move(0, SIZE);
        case '?': event.preventDefault(); return this.cb.onAnnounceScore();
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!this.interactive) return;
          if (this.legal.has(square)) this.cb.onCommit(square);
          else this.cb.onIllegal(square);
          return;
        default:
      }
    });

    on(this.felt, 'focusin', (event: FocusEvent) => {
      const square = this.squareFrom(event.target);
      if (square === null || square === this.focused) return;
      this.cells[this.focused]?.setAttribute('tabindex', '-1');
      this.focused = square;
      this.cells[square]?.setAttribute('tabindex', '0');
    });
  }
}
