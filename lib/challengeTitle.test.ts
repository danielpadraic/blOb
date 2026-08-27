import { describe, expect, it } from 'vitest';

import { challengeDisplayTitle, isPlaceholderChallengeTitle } from '@/lib/challengeTitle';

describe('challengeDisplayTitle', () => {
  it('prefers a real title', () => {
    expect(challengeDisplayTitle({ title: 'Workout Group #2', task: 'Run' })).toBe('Workout Group #2');
  });

  it('skips Untitled / Unknown and uses task', () => {
    expect(isPlaceholderChallengeTitle('Untitled challenge')).toBe(true);
    expect(challengeDisplayTitle({ title: 'Untitled challenge', task: 'Workout Group #2' })).toBe(
      'Workout Group #2',
    );
    expect(challengeDisplayTitle({ title: 'Unknown Challenge', task: 'Prayer' })).toBe('Prayer');
  });

  it('uses the first extra task when title and task are empty', () => {
    expect(
      challengeDisplayTitle({
        title: '',
        task: '  ',
        tasks: [{ title: '' }, { title: 'Journal tonight' }],
      }),
    ).toBe('Journal tonight');
  });

  it('falls back to Challenge when nothing real exists', () => {
    expect(challengeDisplayTitle({ title: 'Untitled challenge' })).toBe('Challenge');
    expect(challengeDisplayTitle(null)).toBe('');
  });
});
