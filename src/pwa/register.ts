/* Registers the service worker and offers the update quietly. Never reloads by
   itself: a reload mid-game would throw away the board (brief §12). */

import { el, on } from '../ui/dom';

export function registerServiceWorker(): void {
  void navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration) => {
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          offerUpdate(installing);
        }
      });
    });
  }).catch(() => {
    // No service worker means no offline cache; the app still runs.
  });
}

function offerUpdate(worker: ServiceWorker): void {
  if (document.querySelector('.update-chit')) return;
  const reload = el('button', { type: 'button', class: 'home__link', text: 'Reload' });
  const chit = el('p', { class: 'chit update-chit', role: 'status' }, [
    el('span', { text: 'Update ready. ' }),
    reload,
  ]);
  on(reload, 'click', () => {
    worker.postMessage({ type: 'skip-waiting' });
    location.reload();
  });
  document.body.append(chit);
}
