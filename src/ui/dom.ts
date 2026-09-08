/* Tiny DOM helpers. There is no framework here: the app's whole tree is a few
   hundred nodes and the board is the only thing that changes often, so a
   framework would cost more than it saves. */

type Attrs = Record<string, string | number | boolean | null | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('--')) node.style.setProperty(key, String(value));
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

export const frag = (children: (Node | string)[]): DocumentFragment => {
  const f = document.createDocumentFragment();
  for (const child of children) f.append(child);
  return f;
};

export function on<T extends EventTarget, K extends string>(
  target: T,
  type: K,
  handler: (event: never) => void,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler as EventListener, options);
  return () => target.removeEventListener(type, handler as EventListener, options);
}

/** Force a style recalculation, so a class removal does not get transitioned. */
export const reflow = (node: HTMLElement): void => void node.offsetHeight;

/** Resolves after `ms`, or on the next frame when `ms` is 0. */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0) requestAnimationFrame(() => resolve());
    else setTimeout(resolve, ms);
  });

/** The numeric value of a CSS custom property on :root, in milliseconds. */
export function ms(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (raw.endsWith('ms')) return Number.parseFloat(raw);
  if (raw.endsWith('s')) return Number.parseFloat(raw) * 1000;
  return Number.parseFloat(raw) || 0;
}

/**
 * Tween an integer, for the score numerals. Transform and opacity are the only
 * things we animate in CSS; a changing number is not either of those, so it gets
 * a real tween rather than a transition.
 */
export function tweenInt(
  from: number,
  to: number,
  duration: number,
  write: (value: number) => void,
): () => void {
  if (from === to || duration <= 0) {
    write(to);
    return () => {};
  }
  let raf = 0;
  let start = 0;
  const step = (now: number): void => {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / duration);
    // Ease out, so the number settles as the discs do rather than crawling in.
    write(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
