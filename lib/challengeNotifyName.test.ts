import { describe, expect, it } from 'vitest';

import {
  formatNotificationCopy,
  namedChallengePhrase,
  notificationChallengeKind,
  quotedChallengeTitle,
  stripAlertJargon,
} from '@/lib/challengeNotifyName';

describe('challenge notify names', () => {
  it('uses the bare title', () => {
    expect(quotedChallengeTitle('30-Day Consistency')).toBe('\u201c30-Day Consistency\u201d');
    expect(namedChallengePhrase('30-Day Consistency')).toBe('30-Day Consistency');
    expect(namedChallengePhrase('Official Weekly', 'the')).toBe('Official Weekly');
    expect(notificationChallengeKind('friend_challenge')).toBe('the');
    expect(notificationChallengeKind('live_checkin')).toBe('your');
  });

  it('truncates a long title', () => {
    const phrase = namedChallengePhrase('A'.repeat(80), 'your', 40);
    expect(phrase).toContain('…');
    expect(phrase.length).toBeLessThanOrEqual(40);
    expect(phrase).not.toContain('Your Challenge:');
  });

  it('rewrites start-moved to one sentence plus the date', () => {
    const copy = formatNotificationCopy({
      type: 'start_rolled',
      title: 'Not enough people yet. Start moved to Sep 10.',
      body: 'Not enough people yet. Start moved to Sep 10.',
      challengeTitle: '6 Workouts in a Week',
    });
    expect(copy.title).toBe('6 Workouts in a Week: not enough people yet.');
    expect(copy.body).toBe('Start moved to Sep 10.');
  });

  it('replaces stored sermons with one named line', () => {
    expect(
      formatNotificationCopy({
        type: 'bob_encouragement',
        title: 'Monthly Fitness Challenge does not save you a seat. You check in or you don’t.',
        body: null,
        tone: 'honest',
      }).title,
    ).toBe('Monthly Fitness Challenge: check in today.');
    expect(
      formatNotificationCopy({
        type: 'bob_encouragement',
        title: 'People in fourth would like your skip on Weekly Fitness Challenge. Do not donate.',
        body: null,
        tone: 'gentle',
      }).title,
    ).toBe('Time to check in to Weekly Fitness Challenge.');
    expect(
      formatNotificationCopy({
        type: 'bob_encouragement',
        title: 'If you skip Prayer Challenge now I will still like you. I will also say you skipped.',
        body: null,
        tone: 'honest',
      }).title,
    ).toBe('Prayer Challenge: check in today.');
    expect(
      formatNotificationCopy({
        type: 'bob_encouragement',
        title: 'Podium photos are for after the last check-in on Monthly Fitness Challenge. Not before.',
        body: null,
        tone: 'gentle',
        offsetHours: 2,
      }).title,
    ).toBe('2 hours left to check in to Monthly Fitness Challenge.');
  });

  it('names the person for check-ins, reactions, and friend requests', () => {
    expect(
      formatNotificationCopy({
        type: 'challenge_checkin',
        title: 'Alex Check-In',
        body: null,
        challengeTitle: 'Weekly Fitness Challenge',
        actorName: 'Alex',
      }).title,
    ).toBe('Alex checked in to Weekly Fitness Challenge.');
    expect(
      formatNotificationCopy({
        type: 'friend_request',
        title: 'New request',
        body: null,
        actorName: 'Sam',
        tone: 'gentle',
      }).title,
    ).toBe('Sam sent you a friend request.');
    expect(
      formatNotificationCopy({
        type: 'friend_accepted',
        title: 'Accepted',
        body: null,
        actorName: 'Sam',
        tone: 'honest',
      }).title,
    ).toBe('Sam accepted your friend request.');
    expect(
      formatNotificationCopy({
        type: 'post_reaction',
        title: 'Sam and 3 others reacted to your post',
        body: null,
        actorName: 'Sam',
      }).title,
    ).toBe('Sam and 3 others reacted to your post');
  });

  it('strips Chicago and window jargon from alerts', () => {
    expect(stripAlertJargon('Chicago day opened. Check today’s window.')).toBe(
      'today opened. Check today.',
    );
    expect(stripAlertJargon('first open of the America/Chicago period_key')).not.toMatch(
      /chicago|period_key|first open of the/i,
    );
  });
});
