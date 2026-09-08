/* How to play. Short, concrete, and it explains the two rules people actually
   get wrong: that a move must capture, and that a turn can be skipped. */

import { el } from '../dom';
import type { SheetContent } from '../chrome';

export function helpSheet(): SheetContent {
  const body = el('div', { class: 'prose' });
  body.append(
    el('p', { text: 'Black plays first. A move puts a disc on an empty square and must trap at least one line of your opponent’s discs between the new disc and one of yours. Every disc in every line you trap turns over.' }),
    el('p', { text: 'Lines run in all eight directions, and one move can trap several at once. A line only counts if it ends on a disc of yours: if it runs into an empty square or off the edge, nothing turns over. Discs that have just turned over do not go on to trap anything themselves.' }),

    el('h3', { text: 'When you cannot move' }),
    el('p', { text: 'If you have no move that traps anything, your turn is skipped and your opponent plays again. Kissa always says so rather than letting the board change while you wait. If neither player can move, the game is over.' }),

    el('h3', { text: 'Winning' }),
    el('p', { text: 'The game also ends when the board is full, or when one colour has no discs left. Whoever has more discs wins; equal counts are a draw. Under the tournament convention the empty squares are awarded to the winner, so a result always adds up to 64 — you can switch that in Settings.' }),

    el('h3', { text: 'Three things that help' }),
    el('ol', {}, [
      el('li', { text: 'Corners can never be turned over. Everything else can.' }),
      el('li', { text: 'The squares beside an empty corner usually hand it to your opponent.' }),
      el('li', { text: 'Having more discs in the middle of the game is often bad: it leaves you fewer moves.' }),
    ]),
  );
  return { title: 'How to play', body, dismissible: true };
}
