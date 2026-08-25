import { describe, expect, it, vi } from 'vitest';

import { fallbackHref, popToFallback } from '@/lib/stackBack';

const TABS_HREF = '/feed';
const LOBBY_HREF = '/challenges';

function mockRouter(canGoBack = true) {
  return {
    canGoBack: () => canGoBack,
    back: vi.fn(),
    navigate: vi.fn(),
    replace: vi.fn(),
  };
}

describe('popToFallback', () => {
  it('returns to Home from a public post instead of popping lobby', () => {
    const router = mockRouter(true);
    popToFallback(router, fallbackHref('feed'));
    expect(router.navigate).toHaveBeenCalledWith(TABS_HREF);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('pops nested challenge screens when history is preferred', () => {
    const router = mockRouter(true);
    popToFallback(router, TABS_HREF, true);
    expect(router.back).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('pops lobby when that is the real previous screen', () => {
    const router = mockRouter(true);
    popToFallback(router, LOBBY_HREF);
    expect(router.back).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
