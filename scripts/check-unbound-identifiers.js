#!/usr/bin/env node
/**
 * Fail CI if TypeScript reports an unbound identifier (TS2304 / TS2552).
 * Full `tsc --noEmit` still has unrelated errors; this gate is the one that
 * would have caught BootScreen / OfficialPitchHost shipping to production.
 */
const { spawnSync } = require('node:child_process');

const result = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
  encoding: 'utf8',
  shell: false,
});
const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const unbound = text
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => /error TS2304:|error TS2552:/.test(line));

if (unbound.length > 0) {
  console.error('Unbound identifier(s) — every JSX name needs an import or a local function:\n');
  console.error(unbound.join('\n'));
  process.exit(1);
}

console.log('No unbound TypeScript identifiers.');
