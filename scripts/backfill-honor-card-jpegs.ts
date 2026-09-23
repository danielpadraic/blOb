/**
 * Honor recap backfill entry.
 *
 * SQL (stats + drawable, no second Live row):
 *   artifacts/ops_honor_card_backfill.sql
 *
 * JPEG pixels for new / same-day Sends:
 *   lib/checkin/attachHonorCard.ts → HonorProofCard / HonorCardRasterHost
 *
 * Recap URL recognition (skip these posts):
 *   checkin_stats.card_url honor_card-* file
 *   media_urls path /honor_card-<digits>.(jpg|jpeg|png|webp)
 *   source = honor_card with honor_fields (Amber — already has the card)
 *
 * Target: live comparable_points, Rookies vs. Veterans first.
 * Never 8fce711b. Never 30-Day / fitness. Never db push --include-all.
 */
export const HONOR_CARD_BACKFILL = {
  sql: 'artifacts/ops_honor_card_backfill.sql',
  submitHook: 'app/(tabs)/challenges/[id]/submit.tsx',
  attach: 'lib/checkin/attachHonorCard.ts',
  renderer: 'components/challenge/HonorProofCard.tsx',
  rasterHost: 'components/challenge/HonorCardRasterHost.tsx',
  pinnacleId: '16af3e82-15c0-479f-af52-328440b0c87e',
  excludeId: '8fce711b-03a5-45e5-b5e8-272c6b3e9a05',
  source: 'honor_card',
  pathPrefix: 'honor_card-',
} as const;
