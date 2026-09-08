import './styles/index.css';
import { App } from './ui/app';

const app = new App();
document.body.replaceChildren(app.el);

// The service worker is registered after the first paint, so it never competes
// with getting an interactive board on screen (brief §15).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    void import('./pwa/register').then((m) => m.registerServiceWorker());
  });
}
