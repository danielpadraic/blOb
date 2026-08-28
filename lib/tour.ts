export type TourStepId =
  | 'coins'
  | 'money'
  | 'search'
  | 'dm'
  | 'bell'
  | 'menu'
  | 'official'
  | 'waves'
  | 'rounds'
  | 'tabFeed'
  | 'tabLobby'
  | 'tabCreate'
  | 'tabFriends'
  | 'tabYou'
  | 'goal';

export type TourPlacement = 'below' | 'above' | 'center-low';

export type TourStep = {
  id: TourStepId;
  target: string | null;
  placement: TourPlacement;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'coins',
    target: 'tour-coins',
    placement: 'below',
    title: 'Coins',
    body: 'Rewards for showing up — login, streaks, firsts. Not for Official entry fees.',
  },
  {
    id: 'money',
    target: 'tour-money',
    placement: 'below',
    title: 'Real money',
    body: '1:1 with $. Official and paid challenges. Not interchangeable with coins.',
  },
  {
    id: 'search',
    target: 'tour-search',
    placement: 'below',
    title: 'Search',
    body: 'Find people and challenges.',
  },
  {
    id: 'dm',
    target: 'tour-dm',
    placement: 'below',
    title: 'DMs',
    body: 'One-to-one messages.',
  },
  {
    id: 'bell',
    target: 'tour-bell',
    placement: 'below',
    title: 'Bell',
    body: 'Friend requests, messages, and coin grants land here.',
  },
  {
    id: 'menu',
    target: 'tour-menu',
    placement: 'below',
    title: 'Menu',
    body: 'Create a Challenge, Create a Circle, Call someone out, Join, or Send Coins. These live here — not on the +.',
  },
  {
    id: 'official',
    target: 'tour-official',
    placement: 'below',
    title: 'Featured Challenge',
    body: 'This week’s Official. Join or check in from the strip. Open it for the full challenge.',
  },
  {
    id: 'waves',
    target: 'tour-waves',
    placement: 'below',
    title: 'Waves',
    body: 'Short clips — say hello, send a little encouragement, or a quick thought. About 30 seconds. Yours lives here. Tap + to make one.',
  },
  {
    id: 'rounds',
    target: 'tour-waves',
    placement: 'below',
    title: 'Rounds',
    body: 'Longer clips — show a workout, teach form, demo a move, or invite people into a challenge you made. Up to 3 minutes. Share to Feed only when you choose to.',
  },
  {
    id: 'tabFeed',
    target: 'tour-tab-feed',
    placement: 'above',
    title: 'Feed',
    body: 'Home. Friends, posts, and this week’s challenge.',
  },
  {
    id: 'tabLobby',
    target: 'tour-tab-lobby',
    placement: 'above',
    title: 'Lobby',
    body: 'View challenges hosted by you or others, challenges you have joined, or Official challenges hosted by',
  },
  {
    id: 'tabCreate',
    target: 'tour-tab-create',
    placement: 'above',
    title: '+',
    body: 'Quick Start. Check In when you are in a challenge that needs proof. Post opens Wave, Round, or a Feed update.',
  },
  {
    id: 'tabFriends',
    target: 'tour-tab-friends',
    placement: 'above',
    title: 'Friends',
    body: 'People you approve. Circles are your standing crew — a private group with its own feed, not a challenge and not a pot. Create a Circle from this tab.',
  },
  {
    id: 'tabYou',
    target: 'tour-tab-you',
    placement: 'above',
    title: 'You',
    body: 'Profile and settings. Replay this tour from Settings anytime.',
  },
  {
    id: 'goal',
    target: 'tour-official',
    placement: 'center-low',
    title: 'Why we are here',
    body: 'So you actually do the thing you already meant to do.',
  },
];
