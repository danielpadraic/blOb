/**
 * Backfill entry point for LIVE Pinnacle honor recap cards.
 *
 * This file does not invent log numbers. Apply the SQL next to it:
 *   artifacts/ops_pinnacle_honor_card_backfill.sql
 *
 * Target: title = 'Rookies vs. Veterans', private_corporate, live.
 * Never the TEST clone (8fce711b) or older Rookies / Rockstars rows.
 *
 * SCRIPT A preview / SCRIPT B apply / SCRIPT C confirm
 * paste at https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
 *
 * After SCRIPT B, Live / Home read posts.checkin_stats (source = honor_card)
 * for chips + the Board-chrome recap slide. New logs also upload a JPEG.
 */
export const PINNACLE_HONOR_CARD_BACKFILL = {
  sql: 'artifacts/ops_pinnacle_honor_card_backfill.sql',
  challengeTitle: 'Rookies vs. Veterans',
  excludeTitle: 'TEST — Rookies vs. Veterans',
  excludeId: '8fce711b-03a5-45e5-b5e8-272c6b3e9a05',
  source: 'honor_card',
} as const;
