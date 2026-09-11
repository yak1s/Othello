/* ============================================================================
   Play a friend (brief §8, revised to a four-digit PIN).

   One person starts a game and reads out four digits; the other types them in.
   Nothing else — no accounts, no QR to line up, no server in between. When the
   signalling relays are blocked, the connection details can be handed over by
   any means at all instead.
   ========================================================================= */

import { el, on } from '../dom';
import { primary, secondary } from './game';
import type { SheetContent, SheetHost, Toast } from '../chrome';
import { PIN_LENGTH, formatPin, joinLink, makePin, parsePin } from '../../net/pin';
import type { Transport } from '../../net/protocol';

export interface FriendFlow {
  /** Called once a transport is live and the match can begin. */
  onConnected(transport: Transport, isHost: boolean, pin: string): void;
  onPassAndPlay(): void;
  sheets: SheetHost;
  toast: Toast;
  random: () => number;
  /** A self-hosted relay, when one has been named. Normally undefined. */
  relayUrls?: readonly string[];
}

/**
 * Every step can be left mid-flight — a search still running, an offer still
 * gathering — and an answer arriving afterwards must not reopen a sheet the
 * person has moved on from. One counter settles it: a step bumps it and aborts
 * what the last step started, and every continuation checks it is still current.
 */
interface Nav { step: number; abort: AbortController | null }

function advance(nav: Nav): number {
  nav.abort?.abort();
  nav.abort = new AbortController();
  nav.step += 1;
  return nav.step;
}

export function openFriendFlow(flow: FriendFlow, joinPin?: string): void {
  const nav: Nav = { step: 0, abort: null };
  advance(nav);
  if (joinPin) guest(flow, nav, joinPin);
  else flow.sheets.open(chooser(flow, nav));
}

function chooser(flow: FriendFlow, nav: Nav): SheetContent {
  return {
    title: 'Play a friend',
    body: el('p', { class: 't-body', text: 'Two devices, no accounts, and no server in between. One of you starts a game and reads out four digits; the other types them in.' }),
    dismissible: true,
    onClose: () => nav.abort?.abort(),
    actions: [
      primary('Start a game', () => host(flow, nav)),
      secondary('Enter a PIN', () => guest(flow, nav)),
    ],
  };
}

/* ── hosting ─────────────────────────────────────────────────────────────── */

function host(flow: FriendFlow, nav: Nav): void {
  const step = advance(nav);
  const pin = makePin(flow.random);
  const status = el('p', { class: 'waiting', text: 'Waiting for your friend to join.' });

  const body = el('div', {}, [
    el('p', { class: 'pin', text: formatPin(pin) }),
    el('p', { class: 't-body centred', text: 'Read these four digits to your friend. They tap “Play a friend”, then “Enter a PIN”.' }),
    status,
  ]);

  const actions: HTMLElement[] = [];
  if (typeof navigator.share === 'function') {
    actions.push(secondary('Share the PIN', () => {
      void navigator.share({
        title: 'Kissa',
        text: `Join my game. The PIN is ${pin}.`,
        url: joinLink(pin, location.href.split('#')[0]!),
      }).catch(() => { /* the person dismissed the share sheet */ });
    }));
  }
  actions.push(secondary('Connect by hand instead', () => manualHost(flow, nav)));

  flow.sheets.open({
    title: 'Your PIN',
    body,
    actions,
    dismissible: true,
    onClose: () => { if (nav.step === step) nav.abort?.abort(); },
  });

  void connectWith(flow, nav, step, pin, true, status);
}

function guest(flow: FriendFlow, nav: Nav, prefill?: string): void {
  const step = advance(nav);
  const input = el('input', {
    class: 'pin-input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    spellcheck: 'false',
    // No maxlength. The PIN is *shown* spaced — 9 8 7 6 — so a pasted one is
    // eight characters, and the browser would cut it to four before anything
    // here saw it, leaving "987". The handler below does the limiting instead,
    // after the spaces are gone.
    size: String(PIN_LENGTH),
    placeholder: '0000',
    'aria-label': 'The four-digit PIN your friend read out',
    value: prefill ?? '',
  });
  const status = el('p', { class: 'waiting' });

  const join = (): void => {
    const pin = parsePin(input.value);
    if (!pin) {
      status.textContent = 'A PIN is four digits.';
      input.focus();
      return;
    }
    status.textContent = 'Looking for your friend.';
    void connectWith(flow, nav, step, pin, false, status);
  };

  // Digits only, and join the moment the fourth one lands: nobody should have
  // to reach for a button after typing four characters. Anything that is not a
  // digit is dropped rather than rejected, so a PIN pasted the way it is shown
  // — spaced, or with the sentence around it — still works.
  let joined = false;
  on(input, 'input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (digits !== input.value) input.value = digits;
    if (digits.length < PIN_LENGTH) { joined = false; return; }
    // Once per complete PIN, not once per keystroke after the fourth: a person
    // correcting a digit re-arms it, a person still typing does not re-fire it.
    if (!joined) { joined = true; join(); }
  });
  on(input, 'keydown', (event: KeyboardEvent) => { if (event.key === 'Enter') join(); });

  flow.sheets.open({
    title: 'Enter the PIN',
    body: el('div', {}, [input, status]),
    dismissible: true,
    // The sheet exists to take four digits, so the field holds the focus and
    // the keyboard is already up. Said here rather than fixed afterwards.
    initialFocus: input,
    actions: [
      primary('Join', join),
      secondary('Connect by hand instead', () => manualGuest(flow, nav)),
    ],
    onClose: () => { if (nav.step === step) nav.abort?.abort(); },
  });
  if (prefill) join();
}

async function connectWith(
  flow: FriendFlow,
  nav: Nav,
  step: number,
  pin: string,
  isHost: boolean,
  status: HTMLElement,
): Promise<void> {
  const signal = nav.abort!.signal;
  try {
    const { connect } = await import('../../net/transport');
    const { transport } = await connect({
      pin,
      signal,
      ...(flow.relayUrls ? { relayUrls: flow.relayUrls } : {}),
      onStrategy: (name) => {
        if (nav.step !== step) return;
        status.textContent = name === 'nostr'
          ? 'Looking for your friend.'
          : 'Still looking, over a second route.';
      },
    });
    if (signal.aborted || nav.step !== step) { void transport.leave(); return; }
    flow.onConnected(transport, isHost, pin);
  } catch (error) {
    void error;
    // The person has moved on — to the manual exchange, or out of the sheet
    // entirely. Reporting a failure now would replace whatever they are using.
    if (signal.aborted || nav.step !== step) return;
    showFailure(flow, nav);
  }
}

/**
 * The honest failure. Some networks simply do not allow two devices to talk
 * directly, and getting through them needs a relay we do not run — so say that,
 * rather than blaming the person's Wi-Fi.
 */
function showFailure(flow: FriendFlow, nav: Nav): void {
  flow.sheets.open({
    title: 'No connection',
    body: el('p', { class: 't-body', text: 'Couldn’t reach your friend. Some networks block direct connections between devices. Try the same Wi-Fi, check you both typed the same PIN, or connect by hand.' }),
    dismissible: true,
    actions: [
      primary('Connect by hand', () => manualHost(flow, nav)),
      secondary('Play on this device instead', () => { flow.sheets.close(); flow.onPassAndPlay(); }),
    ],
  });
}

/* ── the manual exchange, for networks that block everything ─────────────── */

function manualHost(flow: FriendFlow, nav: Nav): void {
  advance(nav);
  const offerBox = el('textarea', { class: 'blob', readonly: true, 'aria-label': 'Your code, to send to your friend' });
  const answerBox = el('textarea', { class: 'blob', placeholder: 'Paste their reply here', 'aria-label': 'Your friend’s reply' });
  const status = el('p', { class: 't-body', text: 'Making your code.' });

  flow.sheets.open({
    title: 'Connect by hand',
    body: el('div', {}, [
      el('p', { class: 't-body', text: 'Send them the first code any way you like, then paste back what they send you. This works with no internet at all, as long as both devices are on the same network.' }),
      offerBox, answerBox, status,
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
    status.textContent = 'Send it over, then paste their reply.';
  })().catch(() => { status.textContent = 'This browser cannot make a direct connection.'; });

  const finish = async (): Promise<void> => {
    if (!offer || !answerBox.value.trim()) { status.textContent = 'Paste their reply first.'; return; }
    status.textContent = 'Connecting.';
    try {
      flow.onConnected(await offer.accept(answerBox.value.trim()), true, 'byhand');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'That reply could not be read.';
    }
  };
}

function manualGuest(flow: FriendFlow, nav: Nav): void {
  advance(nav);
  const offerBox = el('textarea', { class: 'blob', placeholder: 'Paste their code here', 'aria-label': 'Their code' });
  const answerBox = el('textarea', { class: 'blob', readonly: true, 'aria-label': 'Your reply, to send back' });
  const status = el('p', { class: 't-body' });

  flow.sheets.open({
    title: 'Connect by hand',
    body: el('div', {}, [
      el('p', { class: 't-body', text: 'Paste the code they sent you, then send back the reply this makes.' }),
      offerBox, answerBox, status,
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
      status.textContent = 'Send this back to them, then wait.';
      flow.onConnected(await transport, false, 'byhand');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'That code could not be read.';
    }
  };
}
