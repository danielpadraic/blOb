import { interpolateCopy } from '@/lib/copy';

export const OFFICIAL_DETAILS_LINES = [
  'Thirty minutes of elevated heart rate. A picture before, a picture after, and proof of the activity.',
  'If 10+ finish (or everyone), prize split evenly. If fewer, they split the $10 prize.',
  'Official days end at 11:59 p.m. Central Time.',
  'A phone camera is required. Heart-rate proof is required (Watch, Fitness, or a screenshot).',
  'Anyone in the challenge can anonymously flag a post that does not meet these rules. Flagged posts are reviewed.',
  'Miss a day, forget to post, post incorrect proof, or post no proof, and you are out. Join the next challenge and try again.',
  'Entry fees are not refundable. Finishers are paid from the prize.',
  '18+. Void where prohibited. Not medical advice.',
] as const;

const BOB_PITCH =
  'I’m Bob. Humans are very good at knowing they should move, and very good at not moving. The couch will still be there. You do not have to be. Finish the week. Split the prize with everyone else who did. Make money, make friends, support each other, and do it again.';

const OFFICIAL_BOB = {
  loginHeadline: 'A small promise. Then you move.',
  loginBody: BOB_PITCH,
  loginCta: 'See this week’s challenge',
  loginSkip: 'Not now',
  cardPromise: OFFICIAL_DETAILS_LINES[0],
  cardSplit: OFFICIAL_DETAILS_LINES[1],
  legalBoard: OFFICIAL_DETAILS_LINES[1],
  legalPot: OFFICIAL_DETAILS_LINES[1],
  legalDays: OFFICIAL_DETAILS_LINES[2],
  legalAge: OFFICIAL_DETAILS_LINES[7],
  proofCamera: 'A phone camera is required for this challenge.',
  proofHeart:
    'Heart-rate proof is required (Watch, Fitness, or a screenshot). If Apple Health was denied, turn it on in iPhone Settings → Health → blOb.',
  detailsHardware: OFFICIAL_DETAILS_LINES[3],
  detailsFlag: OFFICIAL_DETAILS_LINES[4],
  detailsOut: OFFICIAL_DETAILS_LINES[5],
  detailsRefund: OFFICIAL_DETAILS_LINES[6],
  geoBlocked: 'Sorry, this Challenge isn’t available in your State.',
  joinBob: BOB_PITCH,
  joinLegal:
    'Entry fee is {amount}. If 10+ finish (or everyone), prize split evenly. If fewer, they split the $10 prize. This is not a guaranteed profit.',
  missed:
    'You dropped. The stake stays with the people who didn’t. The workouts already happened. I do not take those back.',
  finished: 'You stayed. That is the whole sport.',
  finishedShare: 'Here is your share. The board is public. Anyone can add it up.',
  stillWon: 'If the coins go, the week of effort does not.',
} as const;

export type OfficialBobKey = keyof typeof OFFICIAL_BOB;

export function officialBob(
  key: OfficialBobKey,
  vars?: Record<string, string | number>,
): string {
  return interpolateCopy(OFFICIAL_BOB[key], vars);
}
