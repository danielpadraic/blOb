import { describe, expect, it } from 'vitest';

import { shouldRunScrollToTop } from '@/lib/authScroll';

describe('shouldRunScrollToTop', () => {
  it('scrolls once when the auth step mounts as email', () => {
    expect(
      shouldRunScrollToTop({ stepKey: 'email', appliedKey: 'gate', fieldFocused: false }),
    ).toBe(true);
  });

  it('does not scroll again for the same step', () => {
    expect(
      shouldRunScrollToTop({ stepKey: 'email', appliedKey: 'email', fieldFocused: false }),
    ).toBe(false);
  });

  it('does not scroll while an email or password field is focused', () => {
    expect(
      shouldRunScrollToTop({ stepKey: 'email', appliedKey: 'gate', fieldFocused: true }),
    ).toBe(false);
  });

  it('does not treat keyboard or resize as a new step', () => {
    expect(
      shouldRunScrollToTop({ stepKey: 'email', appliedKey: 'email', fieldFocused: true }),
    ).toBe(false);
  });
});
