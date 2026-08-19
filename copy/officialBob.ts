import { interpolateCopy } from '@/lib/copy';

const OFFICIAL_BOB = {
  loginHeadline: 'A small promise. Then you move.',
  loginBody:
    'I’m Bob. Humans are very good at knowing they should move, and very good at not moving. A buy-in is not a fortune. It is a promise with weight. Finish the week. Split the pot with everyone else who did.',
  loginCta: 'See this week’s challenge',
  loginSkip: 'Not now',
  cardPromise: 'Skin in the game. Thirty minutes. A picture before, a picture after.',
  cardSplit: 'If you stay in, you split the pot. If everyone stays in, you get your buy-in back.',
  legalPot: 'Finishers split the pot. Miss a day and your buy-in stays in the pot.',
  legalAllFinish: 'If everyone finishes, you get your buy-in back.',
  legalZero: 'If nobody finishes, the pot rolls into the next Official challenge.',
  legalAge: '18+. Void where prohibited. Not medical advice.',
  geoBlocked: 'Sorry, this Challenge isn’t available in your State.',
  joinBob: 'This is so Future You does not negotiate with the couch.',
  joinLegal: 'Buy-in is {amount}. Finishers split the pot. This is not a guaranteed profit.',
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
