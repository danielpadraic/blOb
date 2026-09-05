#!/usr/bin/env node
/**
 * Regenerates the official lift catalog SQL seed from `lib/lift/catalogData.ts`.
 *
 * The TypeScript module is the source of truth so the app can search offline. Running this keeps
 * the database rows byte-for-byte in step with it.
 *
 *   node scripts/buildLiftSeed.mjs
 *
 * Prints the per-muscle counts, then writes the migration listed in SEED_FILE.
 */

import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = path.join(ROOT, 'supabase/migrations/20260905210100_lift_exercise_catalog.sql');

async function loadCatalog() {
  const dir = await mkdtemp(path.join(tmpdir(), 'blob-lift-seed-'));
  const outfile = path.join(dir, 'catalog.mjs');
  await build({
    entryPoints: [path.join(ROOT, 'lib/lift/catalog.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    alias: { '@': ROOT },
  });
  try {
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  if (!values.length) {
    return "'{}'::text[]";
  }
  return `array[${values.map(sqlString).join(', ')}]::text[]`;
}

function buildSql(rows) {
  const values = rows
    .map(
      (row) =>
        `  (${sqlString(row.id)}, ${sqlString(row.name)}, ${sqlString(row.muscle)}, ` +
        `${sqlTextArray(row.secondaries)}, ${sqlTextArray(row.aliases)})`,
    )
    .join(',\n');

  return `-- Official lift exercise catalog.
--
-- GENERATED FILE. Do not hand-edit. Regenerate with:
--   node scripts/buildLiftSeed.mjs
-- The source of truth is lib/lift/catalogData.ts, which the app also reads so typeahead works
-- offline on iOS, Android, and Web.
--
-- Re-runnable: an existing id is refreshed, never duplicated. Nothing is deleted here, and no
-- policy or grant is changed by this file.

insert into public.lift_exercises (id, name, primary_muscle, secondary_muscles, aliases)
values
${values}
on conflict (id) do update set
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  aliases = excluded.aliases,
  is_official = true;
`;
}

async function main() {
  const { OFFICIAL_EXERCISES, officialCatalogCounts } = await loadCatalog();
  const rows = [...OFFICIAL_EXERCISES];

  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.id)) {
      throw new Error(`Duplicate exercise id "${row.id}": ${seen.get(row.id)} / ${row.name}`);
    }
    seen.set(row.id, row.name);
  }

  const counts = officialCatalogCounts();
  const width = Math.max(...Object.keys(counts).map((key) => key.length));
  for (const [muscle, count] of Object.entries(counts)) {
    console.log(`${muscle.padEnd(width)}  ${count}`);
  }
  console.log(`${'total'.padEnd(width)}  ${rows.length}`);

  const sql = buildSql(rows);
  const current = await readFile(SEED_FILE, 'utf8').catch(() => null);
  if (current === sql) {
    console.log('\nSeed already up to date.');
    return;
  }
  await writeFile(SEED_FILE, sql, 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, SEED_FILE)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
