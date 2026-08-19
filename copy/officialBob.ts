import { interpolateCopy } from '@/lib/copy';

const OFFICIAL_BOB = {
  loginHeadline: 'A small promise. Then you move.',
  loginBody:
    'I’m Bob. Humans are very good at knowing they should move, and very good at not moving. A buy-in is not a fortune. It is a promise with weight. Finish the week. Split the pot with everyone else who did.',
  loginCta: 'See this week’s challenge',
  loginSkip: 'Not now',
  cardPromise: 'Skin in the game. Thirty minutes. A picture before, a picture after.',
  cardSplit: 'If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee.',
  legalBoard: 'If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee.',
  legalPot: 'If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee.',
  legalAllFinish: 'If everyone finishes, they split the pot — that even split returns your buy-in.',
  legalZero: 'If nobody finishes and there are no valid days, the guarantee rolls into the next Official week.',
  legalDays: 'Official days end at 11:59 p.m. Central Time.',
  legalAge: '18+. Void where prohibited. Not medical advice.',
  proofCamera: 'A phone camera is required for this challenge.',
  proofHeart:
    'Heart-rate proof is required (Watch, Fitness, or a screenshot). If Apple Health was denied, turn it on in iPhone Settings → Health → blOb.',
  detailsHardware:
    'A phone camera is required. Heart-rate proof is required (Watch, Fitness, or a screenshot).',
  geoBlocked: 'Sorry, this Challenge isn’t available in your State.',
  joinBob: 'This is so Future You does not negotiate with the couch.',
  joinLegal: 'Buy-in is {amount}. If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee. This is not a guaranteed profit.',
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
