/* Renders a QR code as inline SVG. No canvas, no image request: it has to work
   with the network switched off, which is the whole reason we encode our own. */

import { encodeQr, qrToPath, type EcLevel } from '../lib/qr';

export function qrSvg(text: string, options: { size?: number; ecLevel?: EcLevel } = {}): SVGElement {
  const code = encodeQr(text, { ecLevel: options.ecLevel ?? 'M' });
  const quiet = 4;
  const span = code.size + quiet * 2;
  const ns = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'qr');
  svg.setAttribute('viewBox', `0 0 ${span} ${span}`);
  svg.setAttribute('width', String(options.size ?? 200));
  svg.setAttribute('height', String(options.size ?? 200));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Scan to join this game');
  // shape-rendering keeps the modules crisp at any scale; a blurred QR is a
  // QR that does not scan.
  svg.setAttribute('shape-rendering', 'crispEdges');

  const ground = document.createElementNS(ns, 'rect');
  ground.setAttribute('width', String(span));
  ground.setAttribute('height', String(span));
  ground.setAttribute('fill', 'var(--bone)');
  svg.append(ground);

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('transform', `translate(${quiet} ${quiet})`);
  path.setAttribute('d', qrToPath(code));
  path.setAttribute('fill', 'var(--ink)');
  svg.append(path);
  return svg;
}
