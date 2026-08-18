export const COPY_TONES = ['gentle', 'neutral', 'honest'] as const;

export type CopyTone = (typeof COPY_TONES)[number];

const STRINGS = {
  'bfp.sliderHint': {
    gentle: 'Move this until this Blob looks like you do right now.',
    neutral: 'Match the slider to your current body fat, or type the exact %.',
    honest: 'This is what you look like today, not what you wish. Slide until it matches, or type the number if you have it.',
  },
  'bfp.enterExact': 'Enter exact %',
  'bfp.exactLabel': 'Exact body fat %',
  'training.lastDoneHint': 'When is the last time you participated in these activities?',
  'training.aims': 'Aims',
  'profile.update': 'Update profile',
  'profile.saved': 'Saved.',
  'profile.toneLabel': 'How should Bob talk to you?',
  'profile.toneGentle': 'Gentle',
  'profile.toneNeutral': 'Neutral',
  'profile.toneHonest': 'Honest',
  'error.uploadPhoto': 'Couldn’t upload photo. Try again.',
  'error.notEnoughPeople': 'Not enough people joined.',
  'post.deleteConfirm': 'Delete?',
  'post.delete': 'Delete',
  'error.deletePost': 'Couldn’t delete.',
  'account.passwordHint': 'Use upper and lower case, a number, and a symbol.',
  'account.passwordUpdated': 'Password updated.',
  'error.passwordWeak': 'Needs a lowercase, uppercase, number, and symbol.',
  'error.passwordSame': 'Pick a different password.',
  'error.passwordSession': 'Sign in again, then try.',
  'error.passwordUpdate': 'Couldn’t update password. Try again.',
  'error.passwordMismatch': 'Those passwords don’t match.',
  'auth.welcome': {
    gentle: 'Welcome back. I saved you a spot.',
    neutral: 'Welcome back.',
    honest: 'You’re late. Sign in.',
  },
  'auth.subtitle': {
    gentle: 'I’m Bob. We can go slow. We still go.',
    neutral: 'I’m Bob. Sign in and we’ll get to work.',
    honest: 'I’m Bob. Effort is the only door. Sign in.',
  },
  'auth.signingIn': {
    gentle: 'Almost in. Don’t wander off.',
    neutral: 'Signing you in.',
    honest: 'Waiting on you, not the internet.',
  },
  'auth.createAccount': 'Create account',
  'auth.signIn': 'Sign in',
  'auth.newHere': 'New here?',
  'home.header': 'Home',
  'home.loading': {
    gentle: 'Checking who showed up for you.',
    neutral: 'Checking who showed up.',
    honest: 'If this takes a while, it is not because you stretched.',
  },
  'home.error': {
    gentle: 'Home didn’t load. Try again when you’re ready.',
    neutral: 'Home didn’t load.',
    honest: 'Home didn’t load. Tapping again is allowed.',
  },
  'home.empty': {
    gentle: 'Nobody you know has posted. You can go first. I will watch.',
    neutral: 'Nobody you know has posted.',
    honest: 'Empty on purpose until someone posts. That can be you.',
  },
  'home.composer': {
    gentle: 'What did you do? Even a little counts.',
    neutral: 'What did you do?',
    honest: 'What did you actually do?',
  },
  'lobby.subtitle': 'Find a challenge. Buy in. Prove the work.',
  'lobby.loading': {
    gentle: 'Looking for Challenges. Stay here.',
    neutral: 'Looking for Challenges.',
    honest: 'Looking for Challenges. They will not find you first.',
  },
  'lobby.empty': {
    gentle: 'Nothing open yet. You could start one. I’ll stand next to it.',
    neutral: 'Nothing open yet. You could start one.',
    honest: 'Nothing open. Create one or go home. Those are the options.',
  },
  'lobby.unreachable': 'Couldn’t load the Lobby.',
  'friends.loading': {
    gentle: 'Finding your people.',
    neutral: 'Finding your people.',
    honest: 'Looking up who actually knows you.',
  },
  'friends.empty': {
    gentle: 'No friends yet. That’s a beginning, not a verdict.',
    neutral: 'No friends yet.',
    honest: 'No friends yet. Search. Send a request. Waiting is not a strategy.',
  },
  'friends.noneMatch': {
    gentle: 'Nobody matches that. Try a different name.',
    neutral: 'Nobody matches that.',
    honest: 'Nobody matches that. Check the spelling before you invent a person.',
  },
  'friends.searchPlaceholder': 'Name, @username, email, or phone',
  'alerts.empty': {
    gentle: 'Nothing new. I’ll tap you when there is.',
    neutral: 'Nothing new.',
    honest: 'Nothing new. That is not the same as done.',
  },
  'alerts.loading': 'Checking your inbox.',
  'alerts.error': 'Couldn’t load notifications.',
  'messages.empty': {
    gentle: 'No chats yet. Say something kind. Or useful. Both is better.',
    neutral: 'No chats yet.',
    honest: 'No chats. Messages do not send themselves.',
  },
  'messages.error': 'Couldn’t load messages.',
  'messages.loading': 'Opening your inbox.',
  'profile.loading': {
    gentle: 'Looking you up.',
    neutral: 'Looking you up.',
    honest: 'Loading the facts. Not the story you tell yourself.',
  },
  'profile.error': 'Couldn’t load your profile.',
  'profile.notFound': 'Couldn’t load that profile.',
  'notFound.title': {
    gentle: 'That door doesn’t go anywhere. Let’s go back.',
    neutral: 'That door doesn’t go anywhere.',
    honest: 'That door doesn’t go anywhere. Stop knocking.',
  },
  'challenge.logClosed': 'Logging is closed.',
  'challenge.notStarted': 'This challenge hasn’t started yet.',
  'challenge.eliminated': 'You have been eliminated.',
  'challenge.notFound': 'Challenge not found.',
  'challenge.joinFirst': 'Join first.',
  'create.screenTitle': 'New Challenge',
  'create.currency': 'Currency',
  'create.coins': 'Coins',
  'create.bucks': 'Bucks',
  'create.youFundPrize': 'You fund the prize.',
  'create.hostPrize': 'Host prize',
  'create.buyIn': 'Buy-in',
  'create.type': 'Type',
  'create.titleLabel': 'Title',
  'create.titlePlaceholder': 'Morning miles',
  'create.descriptionLabel': 'Description',
  'create.descriptionPlaceholder': 'Optional',
  'create.start': 'Start',
  'create.duration': 'Duration',
  'create.days': 'Days',
  'create.taskLabel': 'Task',
  'create.taskPlaceholder': 'Run 1 mile',
  'create.frequency': 'Frequency',
  'create.checkins': 'Check-ins',
  'create.proof': 'Proof',
  'create.visibility': 'Visibility',
  'create.public': 'Public',
  'create.friends': 'Friends',
  'create.invite': 'Invite',
  'create.submit': 'Create',
  'create.advanced': 'Advanced',
  'create.simple': 'Simple',
  'create.setHostPrize': 'Set a host prize.',
  'create.needTitle': 'Give it a title.',
  'create.needStart': 'Pick a start.',
  'create.startFuture': 'Start has to be in the future.',
  'create.needDuration': 'Duration has to be at least 1 day.',
  'create.needTask': 'Add a task.',
  'create.needCheckins': 'Set how many check-ins.',
  'create.signIn': 'Sign in to create',
  'create.signInBody': 'Challenges are published under your account.',
  'create.backLobby': 'Back to Lobby',
  'board.remaining': 'Remaining',
  'board.donePeriod': 'done this period',
  'board.dropped': 'Dropped',
  'board.liveShare': 'Live share {amount}',
  'proof.flag': 'Flag proof',
  'proof.flagged': 'Flagged',
  'money.realUsd': 'This is real money, 1:1 with USD.',
  'money.irreversible': 'This cannot be reversed.',
  'money.leavesNow': 'The exact amount leaves now.',
  'money.immediate': 'This happens immediately.',
  'wallet.finishChallenges': 'Finish challenges',
  'wallet.finishChallengesBody': 'Prize pools pay Coins or Bucks.',
  'wave.empty': 'No Waves right now.',
  'wave.yours': 'Your Wave',
  'wave.add': 'Add Wave',
  'wave.share': 'Share Wave',
  'wave.new': 'New Wave',
  'wave.noun': 'Wave',
  'wave.hint': 'Share a 24-hour Wave. Tap Your Wave to start.',
  'wave.gone': 'This Wave is gone',
  'wave.goneBody': 'It may have expired, or the link is no longer valid.',
  'wave.posting': 'Posting your Wave…',
  'wave.posted': 'posted a Wave',
  'wave.chip': 'Optional. Shows a chip on your Wave.',
  'wave.library': 'Turn on library access in Settings so you can pick a photo or short video for your Wave.',
  'wave.signIn': 'You need to be signed in to post a Wave.',
  'wave.needMedia': 'Waves need a photo or a short video.',
  'wave.close': 'Close Wave',
  'wave.prev': 'Previous Wave',
  'wave.next': 'Next Wave',
  'round.empty': 'No Rounds yet.',
  'round.new': 'New Round',
  'round.share': 'Share Round',
  'round.noun': 'Round',
  'round.title': 'Rounds',
  'round.fallback': 'Round',
  'round.notReady': 'Rounds aren’t ready. Use a Wave or a post.',
  'round.posted': 'posted a Round',
  'official.badge': 'Official.',
  'official.infinity': '∞',
  'official.friends': 'Friends',
  'official.sendConfirm': 'Check all three. This cannot be reversed.',
} as const;

export type CopyKey = keyof typeof STRINGS;

type CopyNode = string | { readonly [K in CopyTone]: string };

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  );
}

export function asCopyTone(value: unknown): CopyTone {
  if (value === 'gentle' || value === 'neutral' || value === 'honest') {
    return value;
  }
  return 'neutral';
}

export function copy(key: CopyKey, tone: CopyTone = 'neutral', vars?: Record<string, string | number>): string {
  const node = STRINGS[key] as CopyNode;
  const template = typeof node === 'string' ? node : (node[tone] ?? node.neutral);
  return interpolate(template, vars);
}

export const COPY_TONE_OPTIONS: { value: CopyTone; key: CopyKey }[] = [
  { value: 'gentle', key: 'profile.toneGentle' },
  { value: 'neutral', key: 'profile.toneNeutral' },
  { value: 'honest', key: 'profile.toneHonest' },
];
