/* ============================================================================
   Home. This is the main menu: there is no hamburger, no tab bar, and no grid
   of cards. Three rows, a resume slip when there is something to resume, and
   two quiet links. Layout per brief §5.1.
   ========================================================================= */

import { el, on } from '../dom';
import { chevron } from './game';
import { BLACK, type Color, type PositionState } from '../../engine/types';
import { notation, rules, score } from '../../engine';
import type { SavedGame } from '../../data/types';

export interface HomeActions {
  onPassAndPlay(): void;
  onPlayFriend(): void;
  onPlayComputer(): void;
  onResume(saved: SavedGame): void;
  onSettings(): void;
  onHelp(): void;
  onInstall(): void;
  onDismissInstall(): void;
}

export class HomeScreen {
  readonly el: HTMLElement;

  private readonly resumeSlot: HTMLElement;
  private readonly installSlot: HTMLElement;

  constructor(private readonly actions: HomeActions) {
    this.resumeSlot = el('div');
    this.installSlot = el('div');

    const menu = el('nav', { class: 'home__menu', 'aria-label': 'Start a game' }, [
      this.row('Pass & play', () => this.actions.onPassAndPlay()),
      this.row('Play a friend', () => this.actions.onPlayFriend()),
      this.row('Play the computer', () => this.actions.onPlayComputer()),
    ]);

    const settings = el('button', { type: 'button', class: 'home__link', text: 'Settings' });
    const help = el('button', { type: 'button', class: 'home__link', text: 'How to play' });
    on(settings, 'click', () => this.actions.onSettings());
    on(help, 'click', () => this.actions.onHelp());

    this.el = el('section', { class: 'screen home', 'aria-label': 'Kissa' }, [
      el('header', {}, [
        el('h1', { class: 'home__title t-title', text: 'Kissa' }),
        el('p', { class: 'home__lede t-body', text: 'Reversi for two, or one.' }),
      ]),
      el('div', {}, [this.resumeSlot, menu]),
      el('footer', {}, [
        this.installSlot,
        el('div', { class: 'home__foot' }, [settings, help]),
      ]),
    ]);
  }

  /** The Continue slip, shown only when a game is genuinely in progress. */
  setResume(saved: SavedGame | null): void {
    this.resumeSlot.replaceChildren();
    if (!saved) return;

    let position: PositionState;
    try {
      position = notation.parse(saved.transcript, saved.variant).position;
    } catch {
      // A transcript we cannot replay is not worth offering; the archive keeps
      // the record and the player is not shown a button that would fail.
      return;
    }
    if (rules.isTerminal(position)) return;

    const s = score(position);
    const yours = saved.playerColor === null
      ? `${position.turn === BLACK ? 'Black' : 'White'} to play`
      : position.turn === saved.playerColor ? 'your turn' : 'their turn';

    const slip = el('button', { type: 'button', class: 'resume' }, [
      thumbnail(position),
      el('span', {}, [
        el('span', { class: 'resume__line' }, [
          el('span', { class: 'capsule__mark capsule__mark--dark' }),
          el('span', { class: 'resume__count', text: String(s.black) }),
          el('span', { class: 'capsule__mark capsule__mark--light' }),
          el('span', { class: 'resume__count', text: String(s.white) }),
          el('span', { class: 'resume__state', text: yours }),
        ]),
        el('span', { class: 'resume__go', text: 'Continue' }),
      ]),
    ]);
    slip.setAttribute('aria-label', `Continue: black ${s.black}, white ${s.white}, ${yours}`);
    on(slip, 'click', () => this.actions.onResume(saved));
    this.resumeSlot.append(slip);
  }

  /**
   * One dismissible line, and only after a game has been finished. Never a modal
   * on first load (brief §12).
   */
  setInstallOffer(show: boolean): void {
    this.installSlot.replaceChildren();
    if (!show) return;
    const add = el('button', { type: 'button', class: 'home__link', text: 'Add Kissa to your home screen' });
    const no = el('button', { type: 'button', class: 'home__link', text: 'Not now' });
    on(add, 'click', () => this.actions.onInstall());
    on(no, 'click', () => { this.actions.onDismissInstall(); this.setInstallOffer(false); });
    this.installSlot.append(el('p', { class: 'install' }, [add, no]));
  }

  private row(label: string, onClick: () => void): HTMLButtonElement {
    const node = el('button', { type: 'button', class: 'row' }, [
      el('span', { class: 'row__label', text: label }),
      el('span', { class: 'row__mark' }, [chevron('right')]),
    ]);
    on(node, 'click', onClick);
    return node;
  }
}

/** A 44px paper thumbnail of the saved position. No canvas, no image request. */
function thumbnail(position: PositionState): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'resume__thumb');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('aria-hidden', 'true');

  const felt = document.createElementNS(ns, 'rect');
  felt.setAttribute('width', '8');
  felt.setAttribute('height', '8');
  felt.setAttribute('fill', 'var(--felt)');
  svg.append(felt);

  for (let square = 0; square < 64; square += 1) {
    const bit = 1n << BigInt(square);
    const occupant: Color | null =
      (position.black & bit) !== 0n ? 0 : (position.white & bit) !== 0n ? 1 : null;
    if (occupant === null) continue;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', String((square % 8) + 0.5));
    dot.setAttribute('cy', String(Math.floor(square / 8) + 0.5));
    dot.setAttribute('r', '0.38');
    dot.setAttribute('fill', occupant === 0 ? 'var(--ink)' : 'var(--bone)');
    svg.append(dot);
  }
  return svg;
}
