import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as tokens from '../src/ui/tokens';

// T-1159: the 2D UI reads every colour, spacing step and type size from `ui/tokens.css`.
const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const css = read('ui/tokens.css');

/** Custom properties declared in tokens.css, with `var()` references resolved. */
function declared(): Map<string, string> {
  const raw = new Map<string, string>();
  for (const m of css.matchAll(/(--ov-[a-z0-9-]+):\s*([^;]+);/g)) raw.set(m[1]!, m[2]!.trim());
  const resolve = (value: string, depth = 0): string =>
    depth > 8
      ? value
      : value.replace(/var\((--ov-[a-z0-9-]+)\)/g, (_, name: string) =>
          resolve(raw.get(name) ?? `missing(${name})`, depth + 1),
        );
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}
const values = declared();

type Rgba = [number, number, number, number];
function parseColor(name: string): Rgba {
  const value = values.get(`--ov-${name}`);
  if (!value) throw new Error(`token ${name} missing`);
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  throw new Error(`token ${name} is not a colour: ${value}`);
}
/** Composites layers (bottom first) over an opaque backdrop. */
function over(backdrop: Rgba, ...layers: Rgba[]): Rgba {
  return layers.reduce<Rgba>(
    (base, [r, g, b, a]) => [
      r * a + base[0] * (1 - a),
      g * a + base[1] * (1 - a),
      b * a + base[2] * (1 - a),
      1,
    ],
    backdrop,
  );
}
function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Translucent HUD panels are checked over a white backdrop, the worst case for light text
// (the 3D view behind them is never brighter than white).
const WHITE: Rgba = [255, 255, 255, 1];
const c = parseColor;
const hud = () => over(WHITE, c('color-hud'));

/** Text / background pairs of the six surfaces; the recorded values are in plan §3.6. */
const TEXT_PAIRS: [string, Rgba, Rgba][] = [
  ['join: text on card', c('color-text'), over(WHITE, c('color-surface-light'))],
  ['join: muted text on card', c('color-text-muted'), over(WHITE, c('color-surface-light'))],
  ['join: error on card', c('color-danger'), over(WHITE, c('color-surface-light'))],
  ['join: input text', c('color-text'), c('color-paper')],
  ['join: Join Office button', c('color-on-accent'), c('color-accent')],
  ['join: Join Office button hover', c('color-on-accent'), c('color-accent-hover')],
  ['HUD: text on panel', c('color-hud-text'), hud()],
  ['HUD: muted text on panel', c('color-hud-text-muted'), hud()],
  ['HUD: unavailable prompt / URL error', c('color-hud-danger-text'), hud()],
  ['HUD: button text', c('color-hud-text'), over(hud(), c('color-hud-control'))],
  ['HUD: button hover text', c('color-hud-text'), over(hud(), c('color-hud-control-hover'))],
  ['TV: selected catalog entry', c('color-hud-text'), over(hud(), c('color-selected'))],
  ['TV: error box text', c('color-hud-text'), over(hud(), c('color-hud-danger-bg'))],
  ['TV: error box muted text', c('color-hud-text-muted'), over(hud(), c('color-hud-danger-bg'))],
  ['banner: connection lost', c('color-alert-text'), over(WHITE, c('color-alert'))],
];

describe('design tokens (T-1159)', () => {
  it('resolves every token the components and base styles reference', () => {
    const refs = new Set<string>();
    const collect = (value: unknown): void => {
      if (typeof value === 'string')
        for (const m of value.matchAll(/var\((--ov-[a-z0-9-]+)\)/g)) refs.add(m[1]!);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(tokens);
    collect(read('ui/ui.css'));
    expect(refs.size).toBeGreaterThan(20);
    for (const name of refs) expect(values.has(name), name).toBe(true);
    for (const value of values.values()) expect(value).not.toMatch(/missing\(/);
  });

  it.each([
    'ui/JoinScreen.tsx',
    'ui/EmployeeList.tsx',
    'ui/Prompt.tsx',
    'ui/ConnectionBanner.tsx',
    'ui/TvPanel.tsx',
    'ui/ChatPanel.tsx',
    'App.tsx',
    'ui/ui.css',
  ])('%s has no hard-coded colour or font', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\b(rgba?|hsla?)\(/i);
    expect(source).not.toMatch(/system-ui/);
  });

  it.each(TEXT_PAIRS)('%s meets 4.5:1', (_, fg, bg) => {
    expect(contrast(over(bg, fg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('focus rings reach 3:1 against the surface they sit on (WCAG 1.4.11)', () => {
    expect(contrast(c('color-focus-light'), c('color-surface-light'))).toBeGreaterThanOrEqual(3);
    expect(contrast(c('color-focus-light'), c('color-page'))).toBeGreaterThanOrEqual(3);
    expect(contrast(c('color-focus-dark'), hud())).toBeGreaterThanOrEqual(3);
    expect(contrast(c('color-border'), c('color-paper'))).toBeGreaterThanOrEqual(3);
    expect(contrast(c('color-alert-text'), over(WHITE, c('color-alert')))).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('prints the checked contrast values', () => {
    const table = TEXT_PAIRS.map(
      ([name, fg, bg]) => `${name}: ${contrast(over(bg, fg), bg).toFixed(2)}`,
    );
    console.info(`UI contrast (T-1159)\n${table.join('\n')}`);
    expect(table).toHaveLength(TEXT_PAIRS.length);
  });
});
