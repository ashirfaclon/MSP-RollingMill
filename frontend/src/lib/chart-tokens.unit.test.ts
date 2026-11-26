/**
 * Every chart colour a drill-down names (`token: '--…'`) must be defined in the theme: an unknown one draws its bars
 * grey and its legend item without a swatch — it happened twice (RMS Defective, RMD CCM bypass, 26 Nov 2026).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = path.resolve(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

describe('chart colours', () => {
  test('every token a chart uses is defined in the theme', () => {
    const theme = readFileSync(path.join(SRC, 'styles', 'theme.css'), 'utf8');
    const defined = new Set([...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const missing = files(path.join(SRC, 'components')).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/token: '(--[a-z0-9-]+)'/g)]
        .filter((m) => !defined.has(m[1]))
        .map((m) => `${path.relative(SRC, f)}: ${m[1]}`));
    expect(missing).toEqual([]);
  });
});
