// Screenshot harness for design review. Forces real pseudo-states through CDP
// rather than faking them with classes, so what is reviewed is what ships.
// Usage: node scripts/shoot.mjs <url> <out.png> [width] [height] [--full]
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

// This environment ships a Chromium that predates the build @playwright/test
// pins, so point at it directly rather than downloading a second copy.
export const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find((p) => existsSync(p));

const [, , url, out, w = '390', h = '844', ...rest] = process.argv;
if (!url || !out) { console.error('usage: shoot.mjs <url> <out.png> [w] [h] [--full]'); process.exit(1); }

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// Pseudo-state forcing: any element whose id ends in -hover/-focus/-active gets
// that state pinned so a single frame can show all six states at once.
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const { root } = await cdp.send('DOM.getDocument');
for (const [suffix, states] of [['-hover', ['hover']], ['-focus', ['focus', 'focus-visible']], ['-active', ['hover', 'active']]]) {
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `[id$="${suffix}"]` });
  for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states });
}

// Freeze looping animations on a representative frame so the shot is stable.
await page.addStyleTag({ content: '*{animation-play-state:paused !important}' });
await page.waitForTimeout(120);
await page.screenshot({ path: out, fullPage: rest.includes('--full') });
await browser.close();
console.log(`wrote ${out}`);
