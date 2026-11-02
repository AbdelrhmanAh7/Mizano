import { readFileSync } from 'fs';
import { join } from 'path';
import { BRAND_COLORS } from '@mizano/shared-types';

// WCAG 2.x contrast of the design tokens in app/globals.css: every text/background pair the
// components use must reach AA (4.5:1 for text, 3:1 for the focus ring against the page).
type RGB = [number, number, number];

const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  const re = /--([\w-]+):\s*([^;]+);/g;
  for (let m = re.exec(body); m; m = re.exec(body)) vars[m[1]] = m[2].trim();
  return vars;
}

function hslToRgb(value: string): RGB {
  const [h, s, l] = value.split(/\s+/).map((v) => parseFloat(v));
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

const luminance = (c: RGB) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** A token at `alpha` over a background, as Tailwind's bg-success/10 paints it. */
const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
  fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as RGB;

const STATUS = ['primary', 'success', 'warning', 'info', 'destructive'];

describe.each([':root', '.dark'])('design tokens %s', (selector) => {
  const vars = block(selector);
  const c = (name: string) => {
    expect(vars[name]).toBeDefined();
    return hslToRgb(vars[name]);
  };

  it.each([
    ['foreground', 'background'],
    ['card-foreground', 'card'],
    ['popover-foreground', 'popover'],
    ['primary-foreground', 'primary'],
    ['secondary-foreground', 'secondary'],
    ['muted-foreground', 'muted'],
    ['muted-foreground', 'background'],
    ['accent-foreground', 'accent'],
    ['destructive-foreground', 'destructive'],
    ['success-foreground', 'success'],
    ['warning-foreground', 'warning'],
    ['info-foreground', 'info'],
    ['brand-foreground', 'brand-dark'],
    ['brand-foreground', 'brand-deep'],
  ])('%s on %s passes AA', (fg, bg) => {
    expect(contrast(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STATUS)('text-%s passes AA on the page and on its own soft badge', (token) => {
    const bg = c('background');
    expect(contrast(c(token), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c(token), over(c(token), bg, 0.1))).toBeGreaterThanOrEqual(4.5);
  });

  it('the focus ring stands out from the page (3:1)', () => {
    expect(contrast(c('ring'), c('background'))).toBeGreaterThanOrEqual(3);
  });
});

describe('BRAND_COLORS (PDFs and emails)', () => {
  it.each(Object.entries(BRAND_COLORS))('%s passes AA as text on white', (_name, hex) => {
    expect(contrast(hexToRgb(hex), [1, 1, 1])).toBeGreaterThanOrEqual(4.5);
  });

  it('matches the web primary token', () => {
    const primary = hslToRgb(block(':root').primary);
    const hex = hexToRgb(BRAND_COLORS.primary);
    primary.forEach((v, i) => expect(Math.abs(v - hex[i])).toBeLessThan(0.01));
  });
});
