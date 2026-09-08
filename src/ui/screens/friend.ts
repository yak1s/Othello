/* ============================================================================
   Play a friend (brief §8).

   Create a game and share a six-letter code, a link or a QR; or type in the
   code you were given. When the signalling media are blocked, fall back to
   handing the connection details over by any means at all.
   ========================================================================= */

import { el, on } from '../dom';
import { qrSvg } from '../qrview';
import { primary, secondary } from './game';
import type { SheetContent, SheetHost, Toast } from '../chrome';
import { formatCode, makeCode, parseCode } from '../../net/codes';
import { joinLink } from '../../net/codes';
import type { Transport } from '../../net/protocol';

export interface FriendFlow {
  /** Called once a transport is live and the match can begin. */
  onConnected(transport: Transport, isHost: boolean, code: string): void;
  onPassAndPlay(): void;
  sheets: SheetHost;
  toast: Toast;
  random: () => number;
}

export function openFriendFlow(flow: FriendFlow): void {
  flow.sheets.open(chooser(flow));
}

function chooser(flow: FriendFlow): SheetContent {
  return {
    title: 'Play a friend',
    body: el('p', { class: 't-body', text: 'Two devices, no accounts, and no server in between. Share a code and the game runs directly between you.' }),
    dismissible: true,
    actions: [
      primary('Start a game', () => host(flow)),
      secondary('Enter a code', () => guest(flow)),
    ],
  };
}

/* ── hosting ─────────────────────────────────────────────────────────────── */

function host(flow: FriendFlow): void {
  const code = makeCode(flow.random);
  const link = joinLink(code, location.href.split('#')[0]!);
  const status = el('p', { class: 't-body', text: 'Waiting for your friend to join.' });

  const body = el('div', {}, [
    el('p', { class: 'code', text: formatCode(code) }),
    qrSvg(link, { size: 176 }),
    el('p', { class: 't-body', style: 'text-align:center;margin-top:var(--s3)', text: 'Read the code out, or let them scan this.' }),
    status,
  ]);

  const actions: HTMLElement[] = [];
  if (typeof navigator.share === 'function') {
    actions.push(secondary('Share the link', () => {
      void navigator.share({ title: 'Kissa', text: `Join my game: ${formatCode(code)}`, url: link })
        .catch(() => { /* the person dismissed the sheet */ });
    }));
  }
  actions.push(secondary('Enter codes manually', () => manualHost(flow)));

  flow.sheets.open({
    title: 'Your game',
    body,
    actions,
    dismissible: true,
    onClose: () => controller.abort(),
  });

  const controller = new AbortController();
  void connectWith(flow, code, true, status, controller.signal);
}

function guest(flow: FriendFlow): void {
  const input = el('input', {
    class: 'code-input', type: 'text', inputmode: 'text', autocapitalize: 'characters',
    autocomplete: 'off', spellcheck: 'false', maxlength: '9', placeholder: 'ABC-DEF',
    'aria-label': 'The code your friend gave you',
  });
  const status = el('p', { class: 't-body' });
  const controller = new AbortController();

  const join = (): void => {
    const code = parseCode(input.value);
    if (!code) { status.textContent = 'That is not a six-letter code.'; input.focus(); return; }
    status.textContent = 'Looking for your friend.';
    void connectWith(flow, code, false, status, controller.signal);
  };
  on(input, 'keydown', (event: KeyboardEvent) => { if (event.key === 'Enter') join(); });

  flow.sheets.open({
    title: 'Enter a code',
    body: el('div', {}, [input, status]),
    dismissible: true,
    actions: [
      primary('Join', join),
      secondary('Enter codes manually', () => manualGuest(flow)),
    ],
    onClose: () => controller.abort(),
  });
  setTimeout(() => input.focus(), 60);
}

async function connectWith(
  flow: FriendFlow,
  code: string,
  isHost: boolean,
  status: HTMLElement,
  signal: AbortSignal,
): Promise<void> {
  try {
    const { connect } = await import('../../net/transport');
    const { transport } = await connect({
      code,
      signal,
      onStrategy: (name) => {
        status.textContent = name === 'nostr'
          ? 'Looking for your friend.'
          : 'Still looking, over a second route.';
      },
    });
    if (signal.aborted) { void transport.leave(); return; }
    flow.onConnected(transport, isHost, code);
  } catch (error) {
    if (signal.aborted) return;
    void error;
    showFailure(flow);
  }
}

/**
 * The honest failure, worded as the brief specifies. Some networks simply do
 * not allow two devices to talk directly, and getting through them needs a
 * relay we do not run — so say that, rather than blaming the person's Wi-Fi.
 */
function showFailure(flow: FriendFlow): void {
  flow.sheets.open({
    title: 'No connection',
    body: el('p', { class: 't-body', text: 'Couldn’t reach your friend. Some networks block direct connections between devices. Try the same Wi-Fi, or enter codes manually.' }),
    dismissible: true,
    actions: [
      primary('Enter codes manually', () => manualHost(flow)),
      secondary('Play on this device instead', () => { flow.sheets.close(); flow.onPassAndPlay(); }),
    ],
  });
}

/* ── the manual exchange ─────────────────────────────────────────────────── */

function manualHost(flow: FriendFlow): void {
  const offerBox = el('textarea', { class: 'blob', readonly: true, 'aria-label': 'Your code, to send to your friend' });
  const answerBox = el('textarea', { class: 'blob', placeholder: 'Paste their reply here', 'aria-label': 'Your friend’s reply' });
  const qrSlot = el('div');
  const status = el('p', { class: 't-body', text: 'Making your code.' });

  flow.sheets.open({
    title: 'Codes by hand',
    body: el('div', {}, [
      el('p', { class: 't-body', text: 'Send them the first code any way you like, then paste back what they send you. This works with no internet at all, as long as both devices are on the same network.' }),
      offerBox, qrSlot, answerBox, status,
    ]),
    dismissible: true,
    actions: [
      secondary('Copy my code', () => {
        void navigator.clipboard?.writeText(offerBox.value);
        flow.toast.show('Copied.');
      }),
      primary('Connect', () => { void finish(); }),
    ],
  });

  let offer: Awaited<ReturnType<typeof import('../../net/manual')['createOffer']>> | null = null;
  void (async () => {
    const { createOffer } = await import('../../net/manual');
    offer = await createOffer();
    offerBox.value = offer.blob;
    qrSlot.replaceChildren(qrSvg(offer.blob, { size: 200, ecLevel: 'L' }));
    status.textContent = 'Send it over, then paste their reply.';
  })().catch(() => { status.textContent = 'This browser cannot make a direct connection.'; });

  const finish = async (): Promise<void> => {
    if (!offer || !answerBox.value.trim()) { status.textContent = 'Paste their reply first.'; return; }
    status.textContent = 'Connecting.';
    try {
      const transport = await offer.accept(answerBox.value.trim());
      flow.onConnected(transport, true, 'manual');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'That reply could not be read.';
    }
  };
}

function manualGuest(flow: FriendFlow): void {
  const offerBox = el('textarea', { class: 'blob', placeholder: 'Paste their code here', 'aria-label': 'Their code' });
  const answerBox = el('textarea', { class: 'blob', readonly: true, 'aria-label': 'Your reply, to send back' });
  const qrSlot = el('div');
  const status = el('p', { class: 't-body' });

  flow.sheets.open({
    title: 'Codes by hand',
    body: el('div', {}, [
      el('p', { class: 't-body', text: 'Paste the code they sent you, then send back the reply this makes.' }),
      offerBox, answerBox, qrSlot, status,
    ]),
    dismissible: true,
    actions: [
      primary('Make my reply', () => { void reply(); }),
      secondary('Copy my reply', () => {
        void navigator.clipboard?.writeText(answerBox.value);
        flow.toast.show('Copied.');
      }),
    ],
  });

  const reply = async (): Promise<void> => {
    if (!offerBox.value.trim()) { status.textContent = 'Paste their code first.'; return; }
    status.textContent = 'Making your reply.';
    try {
      const { acceptOffer } = await import('../../net/manual');
      const { blob, transport } = await acceptOffer(offerBox.value.trim());
      answerBox.value = blob;
      qrSlot.replaceChildren(qrSvg(blob, { size: 200, ecLevel: 'L' }));
      status.textContent = 'Send this back to them, then wait.';
      flow.onConnected(await transport, false, 'manual');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'That code could not be read.';
    }
  };
}
