/* The app's furniture: the live region, one toast at a time, and bottom sheets.
   All three are single instances — the brief allows exactly one of each on
   screen, and enforcing that here means no screen has to remember to. */

import { el, ms, on } from './dom';

/** The screen-reader account of the game. It is how a blind player follows it,
    so the wording is the game's narration, not a debug log. */
export class LiveRegion {
  readonly el = el('div', { class: 'u-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  private last = '';

  say(message: string): void {
    if (!message || message === this.last) {
      // Repeating identical text is silently dropped by most screen readers, so
      // nudge it with a trailing space rather than losing the announcement.
      this.el.textContent = '';
    }
    this.last = message;
    this.el.textContent = message;
  }
}

export class Toast {
  readonly el = el('div', { class: 'toast chit', role: 'status' });
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string): void {
    this.el.textContent = message;
    this.el.classList.add('is-open');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.remove('is-open'), ms('--t-toast'));
  }

  hide(): void {
    clearTimeout(this.timer);
    this.el.classList.remove('is-open');
  }
}

export interface SheetContent {
  title: string;
  body?: Node;
  actions?: HTMLElement[];
  /**
   * What should hold focus when the sheet opens. Without it the first button
   * does, which is right for a sheet you read and wrong for one you type into —
   * and having the screen fix that afterwards is a race the sheet wins about
   * half the time (C29).
   */
  initialFocus?: HTMLElement;
  /** A sheet the user must answer (game over) has no handle and no backdrop tap. */
  dismissible?: boolean;
  onClose?: () => void;
}

/** One sheet at a time, dismissible by drag and by backdrop tap. */
export class SheetHost {
  readonly backdrop = el('div', { class: 'backdrop', hidden: true });
  readonly el = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', hidden: true });

  private onClose: (() => void) | null = null;
  private dragFrom = 0;
  private lastFocus: HTMLElement | null = null;

  constructor() {
    on(this.backdrop, 'pointerdown', () => { if (this.dismissible) this.close(); });
    on(this.el, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.dismissible) { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') this.trapTab(event);
    });
    this.wireDrag();
  }

  private dismissible = true;

  get isOpen(): boolean { return !this.el.hidden; }

  open(content: SheetContent): void {
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.dismissible = content.dismissible !== false;
    this.onClose = content.onClose ?? null;
    this.el.replaceChildren();
    if (this.dismissible) this.el.append(el('div', { class: 'sheet__handle' }));
    this.el.append(el('h2', { class: 'sheet__title', text: content.title }));
    if (content.body) this.el.append(el('div', { class: 'sheet__body' }, [content.body]));
    if (content.actions?.length) {
      this.el.append(el('div', { class: 'sheet__actions' }, content.actions));
    }
    this.el.setAttribute('aria-label', content.title);

    this.backdrop.hidden = false;
    this.el.hidden = false;
    requestAnimationFrame(() => {
      this.backdrop.classList.add('is-open');
      this.el.classList.add('is-open');
      const wanted = content.initialFocus
        ?? this.el.querySelector<HTMLElement>('button, input, [tabindex]')
        ?? this.el;
      wanted.focus();
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.classList.remove('is-open');
    this.backdrop.classList.remove('is-open');
    const after = (): void => {
      this.el.hidden = true;
      this.backdrop.hidden = true;
      this.el.style.transform = '';
      this.lastFocus?.focus();
      const fn = this.onClose;
      this.onClose = null;
      fn?.();
    };
    setTimeout(after, ms('--t-screen'));
  }

  private wireDrag(): void {
    on(this.el, 'pointerdown', (event: PointerEvent) => {
      if (!this.dismissible) return;
      const handle = (event.target as Element).closest('.sheet__handle, .sheet__title');
      if (!handle) return;
      this.dragFrom = event.clientY;
      this.el.setPointerCapture(event.pointerId);
    });
    on(this.el, 'pointermove', (event: PointerEvent) => {
      if (!this.dragFrom) return;
      const dy = Math.max(0, event.clientY - this.dragFrom);
      this.el.style.transition = 'none';
      this.el.style.transform = `translateY(${dy}px)`;
    });
    const end = (event: PointerEvent): void => {
      if (!this.dragFrom) return;
      const dy = event.clientY - this.dragFrom;
      this.dragFrom = 0;
      this.el.style.transition = '';
      this.el.style.transform = '';
      if (dy > 64) this.close();
    };
    on(this.el, 'pointerup', end);
    on(this.el, 'pointercancel', end);
  }

  private trapTab(event: KeyboardEvent): void {
    const focusable = [...this.el.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])',
    )];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
