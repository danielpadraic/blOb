import { describe, expect, it } from 'vitest';

import { challengeIdFromShareText, textWithoutChallengeLinks } from '@/lib/challengeLink';

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('challengeIdFromShareText', () => {
  it('reads blob:// and https://blob.mobi challenge links', () => {
    expect(challengeIdFromShareText(`blob://challenges/${ID}`)).toBe(ID);
    expect(challengeIdFromShareText(`blob:///challenges/${ID}`)).toBe(ID);
    expect(challengeIdFromShareText(`https://blob.mobi/challenges/${ID}`)).toBe(ID);
    expect(challengeIdFromShareText(`https://www.blob.mobi/challenges/${ID}?tab=overview`)).toBe(ID);
  });

  it('returns null when there is no challenge id', () => {
    expect(challengeIdFromShareText('hello')).toBeNull();
    expect(challengeIdFromShareText('blob://wave/not-a-challenge')).toBeNull();
  });
});

describe('textWithoutChallengeLinks', () => {
  it('clears a bubble that is only the challenge link', () => {
    expect(textWithoutChallengeLinks(`blob://challenges/${ID}`)).toBe('');
    expect(textWithoutChallengeLinks(`https://blob.mobi/challenges/${ID}`)).toBe('');
  });

  it('keeps other words around the link', () => {
    expect(textWithoutChallengeLinks(`Join us blob://challenges/${ID} tonight`)).toBe('Join us tonight');
  });
});
