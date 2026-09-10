import { describe, expect, it } from 'vitest';

import {
  formatNotificationCopy,
  namedChallengePhrase,
  notificationChallengeKind,
  quotedChallengeTitle,
  stripAlertJargon,
} from '@/lib/challengeNotifyName';

describe('challenge notify names', () => {
  it('quotes the title so it cannot read as a verdict', () => {
    expect(quotedChallengeTitle('30-Day Consistency')).toBe('\u201c30-Day Consistency\u201d');
    expect(namedChallengePhrase('30-Day Consistency')).toBe(
      'Your Challenge: \u201c30-Day Consistency\u201d',
    );
    expect(namedChallengePhrase('Official Weekly', 'the')).toBe(
      'The Challenge: \u201cOfficial Weekly\u201d',
    );
    expect(notificationChallengeKind('friend_challenge')).toBe('the');
    expect(notificationChallengeKind('live_checkin')).toBe('your');
  });

  it('truncates a long title inside the quotes', () => {
    const phrase = namedChallengePhrase('A'.repeat(80), 'your', 40);
    expect(phrase.startsWith('Your Challenge: \u201c')).toBe(true);
    expect(phrase.endsWith('\u201d')).toBe(true);
    expect(phrase).toContain('…');
    expect(phrase.length).toBeLessThanOrEqual(40);
  });

  it('rewrites start-moved to one sentence plus the date', () => {
    const copy = formatNotificationCopy({
      type: 'start_rolled',
      title: 'Not enough people yet. Start moved to Sep 10.',
      body: 'Not enough people yet. Start moved to Sep 10.',
      challengeTitle: '6 Workouts in a Week',
    });
    expect(copy.title).toBe(
      'Your Challenge: \u201c6 Workouts in a Week\u201d — not enough people yet.',
    );
    expect(copy.body).toBe('Start moved to Sep 10.');
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
