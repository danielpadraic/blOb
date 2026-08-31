import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('../docs/blOb_Bob_Notification_Copy.md', import.meta.url);
const CATEGORIES = [
  'checkin_streak_5plus',
  'checkin_streak_2',
  'login_after_gap',
  'streak_broke',
  'gone_3',
  'gone_7',
  'gone_14',
  'miss_still_in',
  'miss_removed',
  'final_week',
  'podium_d3',
];

const md = readFileSync(SOURCE, 'utf8');
const catalog = {};
let categoryIndex = -1;
let gentle = [];
let honest = [];

for (const raw of md.split('\n')) {
  const line = raw.trimEnd();
  if (/^## \d+\./.test(line)) {
    if (categoryIndex >= 0) {
      catalog[CATEGORIES[categoryIndex]] = { gentle, honest };
    }
    categoryIndex += 1;
    gentle = [];
    honest = [];
    continue;
  }
  if (categoryIndex < 0 || categoryIndex >= CATEGORIES.length) {
    continue;
  }
  if (line.startsWith('- Gentle:')) {
    gentle.push(line.slice('- Gentle:'.length).trim());
  } else if (line.startsWith('- Honest:')) {
    honest.push(line.slice('- Honest:'.length).trim());
  }
}
if (categoryIndex >= 0) {
  catalog[CATEGORIES[categoryIndex]] = { gentle, honest };
}

for (const key of CATEGORIES) {
  const row = catalog[key];
  if (!row || row.gentle.length !== 10 || row.honest.length !== 10) {
    throw new Error(`${key} expected 10+10 lines, got ${row?.gentle.length}/${row?.honest.length}`);
  }
}

const json = `${JSON.stringify(catalog, null, 2)}\n`;
writeFileSync(new URL('../copy/bobCatalog.generated.json', import.meta.url), json);
writeFileSync(
  new URL('../copy/bobCatalog.generated.ts', import.meta.url),
  `/** Generated from docs/blOb_Bob_Notification_Copy.md. Do not edit by hand. */\nexport const BOB_CATALOG = ${JSON.stringify(catalog, null, 2)} as const;\n`,
);
console.log('wrote copy/bobCatalog.generated.ts');
