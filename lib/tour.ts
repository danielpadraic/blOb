import type { Href } from 'expo-router';

export type TourStepId =
  | 'wallet'
  | 'header'
  | 'tabs'
  | 'official'
  | 'create'
  | 'friends'
  | 'goal';

export type TourStep = {
  id: TourStepId;
  target: string | null;
  href?: Href;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'wallet',
    target: 'tour-wallet',
    href: '/feed',
    title: 'Wallet',
    body: 'Coins are rewards for showing up. Bucks are real-money stakes for Official and paid challenges. They are not interchangeable.',
  },
  {
    id: 'header',
    target: 'tour-header',
    href: '/feed',
    title: 'Search, DMs, bell',
    body: 'Search people and challenges. DMs are one-to-one. The bell is your inbox — friend requests, messages, and coin grants land there.',
  },
  {
    id: 'tabs',
    target: 'tour-tabs',
    href: '/feed',
    title: 'The bar',
    body: 'Feed, Lobby, +, Friends, You. + is where you log, post, or create. You is your profile and settings.',
  },
  {
    id: 'official',
    target: 'tour-official',
    href: '/feed',
    title: 'Featured Challenge',
    body: 'This week’s Featured Challenge. Weekly $10 is skin in the game, not a fortune. Official days run on America/Chicago time.',
  },
  {
    id: 'create',
    target: 'tour-create',
    href: '/challenges/create',
    title: 'Create',
    body: 'Start with Simple: public toggle, coins or bucks, start, duration, task, and proof. Advanced is there for everything else. You do not have to use it.',
  },
  {
    id: 'friends',
    target: 'tour-friends',
    href: '/friends',
    title: 'Friends',
    body: 'Send a request. They approve. Bob is already a friend.',
  },
  {
    id: 'goal',
    target: null,
    href: '/feed',
    title: 'Why we are here',
    body: 'We are here so you actually do the thing you already meant to do.',
  },
];
