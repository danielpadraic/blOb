import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertCheckinSubmitHref,
  bindChallengesStack,
  boundLeftoverId,
  challengeIdFromPath,
  challengeScreenGetId,
  challengesStackAtLobby,
  clearLastOpenChallenge,
  isForbiddenCheckinHref,
  isLobbyListPath,
  leftoverChallengePath,
  pushChallengeHref,
  pushNotificationHref,
  remountChallengesStack,
  resetChallengesNestedInTabs,
  resolveNamedChallengeHref,
  shouldForceCheckinNavigation,
  shouldPopBeforeChallengePush,
  shouldRemountBeforeNamedPush,
  type NestedNavState,
} from '@/lib/challengeNav';
import { challengeDetailHref } from '@/lib/routes';

const THIRTY = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1';
const PRAYER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CHALLENGE_ROUTE_NAMES = ['index', 'create', 'callout/create', '[id]'];

function challengesState(leaf: 'index' | 'live' | 'submit', id = THIRTY): NestedNavState {
  if (leaf === 'index') {
    return {
      index: 0,
      routeNames: CHALLENGE_ROUTE_NAMES,
      routes: [{ name: 'index' }],
    };
  }
  return {
    index: 1,
    routeNames: CHALLENGE_ROUTE_NAMES,
    routes: [
      { name: 'index' },
      {
        name: '[id]',
        params: { id },
        state:
          leaf === 'submit'
            ? { index: 1, routes: [{ name: 'index' }, { name: 'submit' }] }
            : { index: 0, routes: [{ name: 'index' }] },
      },
    ],
  };
}

afterEach(() => {
  bindChallengesStack(null);
});

describe('challengeIdFromPath', () => {
  it('reads only the path id, never create or callout', () => {
    expect(challengeIdFromPath(`/challenges/${PRAYER}/submit`)).toBe(PRAYER);
    expect(challengeIdFromPath(`/challenges/${THIRTY}?tab=feed`)).toBe(THIRTY);
    expect(challengeIdFromPath('/challenges/create')).toBeNull();
    expect(challengeIdFromPath('/challenges/callout/create')).toBeNull();
    expect(challengeIdFromPath('/feed')).toBeNull();
  });
});

describe('challengeScreenGetId', () => {
  it('keys the [id] screen to that row only, never a 30-Day default', () => {
    expect(challengeScreenGetId({ params: { id: PRAYER } })).toBe(PRAYER);
    expect(challengeScreenGetId({ params: { id: THIRTY } })).toBe(THIRTY);
    expect(challengeScreenGetId({ params: { id: PRAYER } })).not.toBe(THIRTY);
    expect(challengeScreenGetId({ params: {} })).toBeUndefined();
  });
});

describe('leftoverChallengePath', () => {
  it('reports leftover Live and leftover submit for that stacked id', () => {
    expect(leftoverChallengePath(challengesState('live'))).toBe(`/challenges/${THIRTY}`);
    expect(leftoverChallengePath(challengesState('submit', PRAYER))).toBe(
      `/challenges/${PRAYER}/submit`,
    );
    expect(leftoverChallengePath(challengesState('index'))).toBeNull();
  });
});

describe('shouldPopBeforeChallengePush', () => {
  it('pops leftover 30-Day Live before Prayer Check In', () => {
    expect(
      shouldPopBeforeChallengePush(
        '/feed',
        `/challenges/${PRAYER}/submit`,
        leftoverChallengePath(challengesState('live')),
      ),
    ).toBe(true);
  });

  it('pops leftover Prayer camera before a 30-Day Overview card', () => {
    expect(
      shouldPopBeforeChallengePush(
        '/feed',
        `/challenges/${THIRTY}`,
        leftoverChallengePath(challengesState('submit', PRAYER)),
      ),
    ).toBe(true);
  });

  it('does not pop same-challenge Begin on Live', () => {
    expect(
      shouldPopBeforeChallengePush(
        `/challenges/${THIRTY}`,
        `/challenges/${THIRTY}/submit`,
      ),
    ).toBe(false);
  });

  it('pops leftover submit when opening that challenge Overview', () => {
    expect(
      shouldPopBeforeChallengePush(
        '/feed',
        `/challenges/${PRAYER}`,
        leftoverChallengePath(challengesState('submit', PRAYER)),
      ),
    ).toBe(true);
  });
});

describe('clearLastOpenChallenge', () => {
  it('resets the challenges stack to Lobby and never keeps last-open id', () => {
    const dispatch = vi.fn();
    bindChallengesStack({
      getState: () => challengesState('live'),
      dispatch,
    });
    expect(clearLastOpenChallenge()).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: { index: 0, routes: [{ name: 'index' }] },
    });
    expect(challengesStackAtLobby(challengesState('index'))).toBe(true);
  });

  it('does nothing when Lobby is already the stacked screen', () => {
    const dispatch = vi.fn();
    bindChallengesStack({
      getState: () => challengesState('index'),
      dispatch,
    });
    expect(clearLastOpenChallenge()).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('resets leftover [id] on the unfocused challenges tab from Home', () => {
    const dispatch = vi.fn();
    bindChallengesStack({
      getState: () => ({
        index: 0,
        routes: [
          { name: 'feed' },
          { name: 'challenges', state: { ...challengesState('live'), key: 'challenges-stack' } },
        ],
      }),
      dispatch,
    });
    expect(clearLastOpenChallenge()).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: {
        index: 0,
        stale: true,
        routes: [
          { name: 'feed' },
          {
            name: 'challenges',
            key: undefined,
            params: undefined,
            state: { index: 0, stale: true, routes: [{ name: 'index' }] },
          },
        ],
      },
    });
  });

  it('binds tabs from inside Live so Home can drop leftover 30-Day without focusing Lobby', () => {
    const dispatch = vi.fn();
    const tabs = {
      getState: () => ({
        index: 0,
        routes: [
          { name: 'feed' },
          { name: 'challenges', key: 'challenges-tab', state: challengesState('live') },
        ],
      }),
      dispatch,
    };
    const stack = {
      getState: () => challengesState('live'),
      getParent: () => tabs,
      dispatch: vi.fn(),
    };
    bindChallengesStack(stack);
    expect(boundLeftoverId()).toBe(THIRTY);
    expect(clearLastOpenChallenge()).toBe(true);
    expect(dispatch).toHaveBeenCalled();
    expect(stack.dispatch).not.toHaveBeenCalled();
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      type: 'RESET',
      payload: { index: 0 },
    });
  });
});

describe('remountChallengesStack', () => {
  it('clears leftover mountedId so Home is not last-open', () => {
    bindChallengesStack({
      getState: () => challengesState('live'),
      dispatch: vi.fn(),
    });
    expect(boundLeftoverId()).toBe(THIRTY);
    remountChallengesStack();
    expect(boundLeftoverId()).toBe('');
  });
});

describe('Check In href lock', () => {
  it('builds /challenges/{pickedId}/submit and never pulse Live query', () => {
    const href = assertCheckinSubmitHref(PRAYER);
    expect(href).toBe(`/challenges/${PRAYER}/submit`);
    expect(href).not.toContain('returnTo');
    expect(href).not.toContain('tab=feed');
    expect(href).not.toContain(THIRTY);
    expect(isForbiddenCheckinHref(`/challenges/${THIRTY}?returnTo=feed&tab=feed`, PRAYER)).toBe(true);
    expect(isForbiddenCheckinHref(`/challenges/${PRAYER}/submit`, PRAYER)).toBe(false);
    expect(shouldForceCheckinNavigation(`/challenges/${THIRTY}?returnTo=feed&tab=feed`, PRAYER)).toBe(
      true,
    );
    expect(shouldForceCheckinNavigation(`/challenges/${PRAYER}/submit`, PRAYER)).toBe(false);
  });

  it('resets leftover 30-Day on Home without focusing Lobby', () => {
    const home = {
      index: 0,
      routes: [
        { name: 'feed' },
        { name: 'challenges', key: 'challenges-tab', state: challengesState('live') },
      ],
    };
    const next = resetChallengesNestedInTabs(home);
    expect(next?.index).toBe(0);
    expect(next?.routes[0]?.name).toBe('feed');
    expect(next?.routes[1]).toMatchObject({
      name: 'challenges',
      key: 'challenges-tab',
      state: { index: 0, routes: [{ name: 'index' }] },
    });
    expect(leftoverChallengePath(next?.routes[1]?.state)).toBeNull();
  });
});

describe('named challenge href lock', () => {
  it('never collapses a Home pill or in-challenge tap to the Lobby list', () => {
    expect(isLobbyListPath('/challenges')).toBe(true);
    expect(isLobbyListPath(`/challenges/${THIRTY}`)).toBe(false);
    expect(resolveNamedChallengeHref('/challenges', THIRTY)).toBe(`/challenges/${THIRTY}`);
    expect(resolveNamedChallengeHref(`/challenges/${THIRTY}?tab=feed`, THIRTY)).toBe(
      `/challenges/${THIRTY}?tab=feed`,
    );
    expect(resolveNamedChallengeHref(`/challenges/${PRAYER}`, PRAYER)).not.toBe('/challenges');
    expect(shouldRemountBeforeNamedPush(THIRTY, PRAYER)).toBe(true);
    expect(shouldRemountBeforeNamedPush('', THIRTY)).toBe(false);
    expect(shouldRemountBeforeNamedPush(THIRTY, THIRTY)).toBe(false);
  });

  it('pushes the full /challenges/{id} from Home without resetting to Lobby', () => {
    const dispatch = vi.fn();
    const push = vi.fn();
    bindChallengesStack({
      getState: () => ({
        index: 0,
        routes: [{ name: 'feed' }, { name: 'challenges', state: challengesState('index') }],
      }),
      dispatch,
    });
    pushChallengeHref({ push }, `/challenges/${THIRTY}?tab=feed`, 'home-pill', THIRTY, '/feed');
    expect(push).toHaveBeenCalledWith(`/challenges/${THIRTY}?tab=feed`);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('notification tap lock', () => {
  it('remounts leftover 30-Day Live before a Prayer check-in reminder Overview', () => {
    vi.useFakeTimers();
    try {
      const push = vi.fn();
      bindChallengesStack({
        getState: () => challengesState('live'),
        dispatch: vi.fn(),
      });
      expect(boundLeftoverId()).toBe(THIRTY);
      const href = String(challengeDetailHref(PRAYER, 'lobby', null, { tab: 'overview' }));
      expect(href).toBe(`/challenges/${PRAYER}?tab=overview`);
      pushNotificationHref({ push }, href, 'alert');
      expect(push).not.toHaveBeenCalled();
      expect(boundLeftoverId()).toBe('');
      vi.advanceTimersByTime(60);
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0]?.[0]).toBe(`/challenges/${PRAYER}?tab=overview`);
      expect(String(push.mock.calls[0]?.[0])).not.toMatch(/submit/);
      expect(push.mock.calls[0]?.[0]).not.toBe('/challenges');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rewrites leftover camera submit to Overview and never opens Lobby with no id', () => {
    const push = vi.fn();
    pushNotificationHref({ push }, `/challenges/${PRAYER}/submit`, 'push-tap');
    expect(push).toHaveBeenCalledWith(`/challenges/${PRAYER}?tab=overview`);
    push.mockClear();
    pushNotificationHref({ push }, '/challenges', 'alert');
    expect(push).not.toHaveBeenCalled();
  });
});
