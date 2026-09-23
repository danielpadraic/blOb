import { Platform } from 'react-native';

import { firstRouteParam } from '@/lib/challengeLoad';
import { checkinPeriodComplete, usesPeriodCheckinGate } from '@/lib/loggable';
import { challengeHref, checkinPickerHref as pickerHref, checkinSubmitHref } from '@/lib/routes';

export type NestedNavRoute = {
  name: string;
  key?: string;
  params?: Record<string, unknown>;
  state?: NestedNavState | null;
};

export type NestedNavState = {
  index?: number;
  key?: string;
  stale?: boolean;
  type?: string;
  routeNames?: string[];
  routes: NestedNavRoute[];
};

export type NavLike = {
  getState?: () => NestedNavState | undefined;
  getParent?: () => NavLike | undefined;
  dispatch?: (action: unknown) => void;
  setOptions?: (options: Record<string, unknown>) => void;
};

export type BoundChallengesNav = {
  nav: NavLike;
  target?: string;
};

let boundChallenges: BoundChallengesNav | null = null;
let challengesEpoch = 0;
const epochListeners = new Set<(epoch: number) => void>();

/** Expo Router reuses one `[id]` screen unless this returns THAT row’s id. */
export function challengeScreenGetId(input: { params?: Record<string, unknown> }): string | undefined {
  const id = firstRouteParam(input.params?.id);
  if (id) {
    return id;
  }
  // Missing params.id must not reuse leftover 30-Day / Prayer.
  return `unbound-${challengesEpoch}`;
}

export function challengesStackEpoch(): number {
  return challengesEpoch;
}

export function subscribeChallengesEpoch(listener: (epoch: number) => void): () => void {
  epochListeners.add(listener);
  return () => {
    epochListeners.delete(listener);
  };
}

/** Unmount every `/challenges/*` screen. Home must not restore last-open. */
export function remountChallengesStack(): number {
  challengesEpoch += 1;
  boundChallenges = null;
  epochListeners.forEach((listener) => listener(challengesEpoch));
  return challengesEpoch;
}

export function boundLeftoverId(): string {
  return challengeIdFromPath(boundLeftoverChallengePath()) ?? '';
}

const CHECKIN_NAV_SOURCES = new Set([
  'plus-checkin',
  'checkin-pick',
  'invite-checkin',
  'live-begin',
  'home-official',
]);
const HOME_NAMED_NAV_SOURCES = new Set([
  'home-pill',
  'home-in-challenge',
  'plus-checkin',
  'alert',
  'push-tap',
]);

export function logBlobNav(source: string, id: string, href: string, mountedId?: string): void {
  const leftover = mountedId ?? boundLeftoverId();
  if (HOME_NAMED_NAV_SOURCES.has(source) || CHECKIN_NAV_SOURCES.has(source)) {
    console.log('[blob:nav]', {
      source,
      id,
      href,
      ...(CHECKIN_NAV_SOURCES.has(source) ? { pickedId: id } : {}),
      mountedId: leftover,
    });
    return;
  }
  console.log('[blob:nav]', { source, id, href, mountedId: leftover });
}

function stripQuery(value: string | null | undefined): string {
  return String(value ?? '')
    .split('?')[0]
    .replace(/\/$/, '');
}

const RESERVED_CHALLENGE_SEGMENTS = new Set(['create', 'callout', 'u']);

/** `/challenges/{id}` or `/challenges/{id}/submit` — never create / callout / last-open. */
export function challengeIdFromPath(pathname?: string | null): string | null {
  const path = stripQuery(pathname);
  const match = path.match(/^\/challenges\/([^/]+)/);
  const id = match?.[1]?.trim() ?? '';
  if (!id || RESERVED_CHALLENGE_SEGMENTS.has(id)) {
    return null;
  }
  return id;
}

export function isChallengeSubmitPath(pathname?: string | null): boolean {
  const path = stripQuery(pathname);
  const id = challengeIdFromPath(path);
  return Boolean(id && path === `/challenges/${id}/submit`);
}

/** Challenges tab list only. Never a named challenge. */
export function isLobbyListPath(pathname?: string | null): boolean {
  return stripQuery(pathname) === '/challenges';
}

/**
 * Home pill / “in {name}” / View. Always `/challenges/{id}`.
 * Never rewrite a named tap to the Lobby list.
 */
export function resolveNamedChallengeHref(href: string, id: string): string {
  const destId = String(id ?? '').trim() || challengeIdFromPath(href) || '';
  if (!destId) {
    return String(href ?? '');
  }
  if (isLobbyListPath(href) || !challengeIdFromPath(href)) {
    return String(challengeHref(destId));
  }
  return String(href);
}

export function shouldRemountBeforeNamedPush(
  mountedId: string,
  destId: string,
  leftoverPath?: string | null,
): boolean {
  if (!destId) {
    return false;
  }
  if (mountedId && mountedId !== destId) {
    return true;
  }
  return Boolean(mountedId) && mountedId === destId && isChallengeSubmitPath(leftoverPath);
}

export function isChallengesStackState(state?: NestedNavState | null): boolean {
  const names = state?.routeNames ?? state?.routes?.map((route) => route.name) ?? [];
  return names.includes('[id]') && names.includes('callout/create');
}

export function findChallengesStack(nav: NavLike | null | undefined): NavLike | null {
  let current: NavLike | null | undefined = nav;
  while (current) {
    if (isChallengesStackState(current.getState?.())) {
      return current;
    }
    current = current.getParent?.();
  }
  return null;
}

export function leftoverChallengePath(state?: NestedNavState | null): string | null {
  const focused = state?.routes?.[state?.index ?? 0];
  const route = focused?.name === '[id]' ? focused : state?.routes?.find((row) => row.name === '[id]');
  if (!route || route.name !== '[id]') {
    return null;
  }
  const id = firstRouteParam(route.params?.id);
  if (!id) {
    return null;
  }
  const inner = route.state;
  const leaf = inner?.routes?.[inner.index ?? 0]?.name;
  if (leaf === 'submit') {
    return `/challenges/${id}/submit`;
  }
  return `/challenges/${id}`;
}

export function challengesStackAtLobby(state?: NestedNavState | null): boolean {
  if (!state) {
    return true;
  }
  return !state.routes.some((route) => route.name === '[id]');
}

export function nestedChallengesState(state?: NestedNavState | null): NestedNavState | null {
  if (isChallengesStackState(state)) {
    return state ?? null;
  }
  return state?.routes?.find((route) => route.name === 'challenges')?.state ?? null;
}

export function findChallengesDispatch(nav: NavLike | null | undefined): BoundChallengesNav | null {
  let current: NavLike | null | undefined = nav;
  let stack: BoundChallengesNav | null = null;
  let tabs: BoundChallengesNav | null = null;
  while (current) {
    const state = current.getState?.();
    const names = state?.routes?.map((route) => route.name) ?? [];
    if (names.includes('challenges') && names.includes('feed')) {
      const nested = state?.routes?.find((route) => route.name === 'challenges')?.state;
      tabs = { nav: current, target: nested?.key };
    } else if (isChallengesStackState(state) && !stack) {
      stack = { nav: current };
    }
    current = current.getParent?.();
  }
  return tabs ?? stack;
}

export function resetChallengesToLobbyAction(): { type: 'RESET'; payload: { index: number; routes: { name: string }[] } } {
  return {
    type: 'RESET',
    payload: {
      index: 0,
      routes: [{ name: 'index' }],
    },
  };
}

/** Keep the current tab focused. Drop leftover `/challenges/[id]` so the next push cannot merge into 30-Day. */
export function resetChallengesNestedInTabs(state?: NestedNavState | null): NestedNavState | null {
  if (!state?.routes?.some((route) => route.name === 'challenges')) {
    return null;
  }
  return {
    ...state,
    stale: true,
    index: state.index ?? 0,
    routes: state.routes.map((route) => {
      if (route.name !== 'challenges') {
        return route;
      }
      return {
        name: 'challenges',
        key: route.key,
        params: undefined,
        state: {
          index: 0,
          stale: true,
          routes: [{ name: 'index' }],
        },
      };
    }),
  };
}

export function isForbiddenCheckinHref(href: string, pickedId: string): boolean {
  const raw = String(href ?? '');
  const path = stripQuery(raw);
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  if (params.has('returnTo') || params.get('tab') === 'feed') {
    return true;
  }
  const id = String(pickedId ?? '').trim();
  return !id || path !== `/challenges/${id}/submit`;
}

/** Picker row: submit for an open period, Overview when that day is already stamped. */
export function checkinPickerHref(row: {
  id: string;
  checkinPhase?: string | null;
  submittedThisPeriod?: boolean;
  remainingProofLabels?: readonly string[] | null;
  format?: string | null;
  challenge_type?: string | null;
  frequency?: string | null;
  cumulative_target?: number | null;
  cumulative_metric?: string | null;
  metrics?: unknown;
  scoring_method?: string | null;
  comparable_points_config?: unknown;
  target_count?: number | null;
  title?: string | null;
  task?: string | null;
}): string {
  const id = String(row.id ?? '').trim();
  const complete = checkinPeriodComplete(row, {
    submittedThisPeriod: row.submittedThisPeriod,
    checkinPhase: row.checkinPhase,
    remainingProofLabels: row.remainingProofLabels,
  });
  return String(pickerHref(id, complete && usesPeriodCheckinGate(row)));
}

/** Check In / Begin only. Never pulse Live (`?returnTo=feed&tab=feed`). */
export function assertCheckinSubmitHref(
  pickedId: string,
  extra?: { from?: 'multi'; done?: string[] | string | null },
): string {
  const href = String(checkinSubmitHref(pickedId, extra));
  if (isForbiddenCheckinHref(href, pickedId)) {
    return String(checkinSubmitHref(pickedId));
  }
  return href;
}

export function shouldForceCheckinNavigation(currentUrl: string, pickedId: string): boolean {
  return isForbiddenCheckinHref(currentUrl, pickedId);
}

export function bindChallengesStack(nav: NavLike | null | undefined): () => void {
  if (nav == null) {
    boundChallenges = null;
    return () => {};
  }
  const found = findChallengesDispatch(nav);
  if (found) {
    boundChallenges = found;
  }
  return () => {
    if (found && boundChallenges === found) {
      boundChallenges = null;
    }
  };
}

export function boundLeftoverChallengePath(): string | null {
  const state = boundChallenges?.nav.getState?.() ?? null;
  return leftoverChallengePath(nestedChallengesState(state) ?? state);
}

const AFTER_STACK_MS = 80;

function afterChallengesReady(go: () => void): void {
  let done = false;
  const run = () => {
    if (done) {
      return;
    }
    done = true;
    go();
  };
  const unsub = subscribeChallengesEpoch(() => {
    unsub();
    setTimeout(run, 32);
  });
  setTimeout(() => {
    unsub();
    run();
  }, AFTER_STACK_MS);
}

/** Reset leftover `[id]` first, then remount. Remounting first rehydrates 30-Day on Web. */
export function resetChallengesTabHistory(opts?: { remount?: boolean }): boolean {
  const leftover = Boolean(boundLeftoverId());
  const bound = boundChallenges;
  if (bound?.nav.dispatch) {
    const state = bound.nav.getState?.();
    const tabReset = resetChallengesNestedInTabs(state);
    if (tabReset) {
      bound.nav.dispatch({ type: 'RESET', payload: tabReset });
    } else {
      const nested = nestedChallengesState(state) ?? state;
      if (nested && !challengesStackAtLobby(nested)) {
        const action = bound.target
          ? { ...resetChallengesToLobbyAction(), target: bound.target }
          : resetChallengesToLobbyAction();
        bound.nav.dispatch(action);
      }
    }
  }
  if (opts?.remount !== false) {
    remountChallengesStack();
  }
  return leftover;
}

/** Unmount leftover `[id]` / submit so Home is not a last-open challenge. */
export function clearLastOpenChallenge(): boolean {
  return resetChallengesTabHistory();
}

/**
 * Home / Check In / a different challenge must unmount leftover Live or camera.
 * Same-challenge Begin (Live → that submit) must not flash Lobby.
 */
export function shouldPopBeforeChallengePush(
  pathname: string | null | undefined,
  href: string,
  leftoverPath?: string | null,
): boolean {
  const dest = stripQuery(href);
  const destId = challengeIdFromPath(dest);
  if (!destId) {
    return false;
  }
  const live = stripQuery(pathname);
  const from = challengeIdFromPath(live) ? live : stripQuery(leftoverPath) || live;
  const fromId = challengeIdFromPath(from);
  if (fromId && fromId === destId) {
    return isChallengeSubmitPath(from) && !isChallengeSubmitPath(dest);
  }
  return true;
}

export function pushChallengeHref(
  router: { push: (href: never) => void },
  href: string,
  source: string,
  id: string,
  pathname?: string | null,
): void {
  const destId = challengeIdFromPath(href) ?? String(id ?? '').trim();
  const destHref = destId ? resolveNamedChallengeHref(href, destId) : String(href);
  const leftoverPath = boundLeftoverChallengePath();
  const mountedId = boundLeftoverId();
  logBlobNav(source, destId, destHref, mountedId);
  if (!destId || isLobbyListPath(destHref)) {
    return;
  }
  const go = () => {
    router.push(destHref as never);
    ensureWebNamedChallengeHref(destHref, destId);
  };
  if (shouldRemountBeforeNamedPush(mountedId, destId, leftoverPath)) {
    remountChallengesStack();
    afterChallengesReady(go);
    return;
  }
  if (!mountedId) {
    afterChallengesReady(go);
    return;
  }
  go();
}

/**
 * Alert / push taps. Named challenge id uses the Home-pill remount path.
 * Overview href stays Overview. Never camera submit. Never Lobby with no id.
 */
export function pushNotificationHref(
  router: { push: (href: never) => void },
  href: string | object,
  source: 'alert' | 'push-tap',
  pathname?: string | null,
): void {
  if (typeof href !== 'string') {
    router.push(href as never);
    return;
  }
  const destId = challengeIdFromPath(href);
  if (!destId) {
    if (isLobbyListPath(href)) {
      return;
    }
    router.push(href as never);
    return;
  }
  const destHref = isChallengeSubmitPath(href)
    ? `/challenges/${destId}?tab=overview`
    : href;
  pushChallengeHref(router, destHref, source, destId, pathname);
}

type CheckinAssign = (href: string) => void;

let assignCheckinHref: CheckinAssign | null = null;

/** Tests only. Production uses `window.location.assign` on Web when Expo keeps leftover Live. */
export function setCheckinAssignHref(fn: CheckinAssign | null): void {
  assignCheckinHref = fn;
}

function ensureWebCheckinHref(href: string, pickedId: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) {
    return;
  }
  setTimeout(() => {
    const current = `${window.location.pathname}${window.location.search}`;
    if (!shouldForceCheckinNavigation(current, pickedId)) {
      return;
    }
    if (assignCheckinHref) {
      assignCheckinHref(href);
      return;
    }
    window.location.assign(href);
  }, 100);
}

function ensureWebNamedChallengeHref(href: string, destId: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) {
    return;
  }
  setTimeout(() => {
    const currentId = challengeIdFromPath(window.location.pathname);
    if (currentId === destId) {
      return;
    }
    if (assignCheckinHref) {
      assignCheckinHref(href);
      return;
    }
    window.location.assign(href);
  }, 100);
}

/**
 * Plus Check In / Begin / picker. Picker row id is the only id.
 * Never `?returnTo=feed&tab=feed`, last-open, or mounted `[id]`.
 */
export function pushCheckinSubmit(
  router: { push: (href: never) => void },
  pickedId: string,
  source: 'plus-checkin' | 'checkin-pick' | 'invite-checkin' | 'live-begin' | 'home-official',
  extra?: { from?: 'multi'; done?: string[] | string | null },
  pathname?: string | null,
): void {
  const id = String(pickedId ?? '').trim();
  if (!id) {
    return;
  }
  const href = assertCheckinSubmitHref(id, extra);
  const leftoverPath = boundLeftoverChallengePath();
  const mountedId = boundLeftoverId();
  logBlobNav(source, id, href, mountedId);
  const sameLive =
    Boolean(id) &&
    mountedId === id &&
    challengeIdFromPath(pathname) === id &&
    !isChallengeSubmitPath(pathname);
  const go = () => {
    router.push(href as never);
    ensureWebCheckinHref(href, id);
  };
  if (sameLive) {
    go();
    return;
  }
  if (mountedId && (mountedId !== id || isChallengeSubmitPath(leftoverPath))) {
    resetChallengesTabHistory({ remount: true });
    afterChallengesReady(go);
    return;
  }
  afterChallengesReady(go);
}

export function pushCheckinPickerRow(
  router: { push: (href: never) => void },
  row: Parameters<typeof checkinPickerHref>[0],
  source: 'plus-checkin' | 'checkin-pick' | 'invite-checkin' | 'live-begin' | 'home-official',
  extra?: { from?: 'multi'; done?: string[] | string | null },
  pathname?: string | null,
): void {
  const href = checkinPickerHref(row);
  if (href.includes('/submit')) {
    pushCheckinSubmit(router, row.id, source, extra, pathname);
    return;
  }
  const id = String(row.id ?? '').trim();
  if (!id || isLobbyListPath(href)) {
    return;
  }
  const mountedId = boundLeftoverId();
  logBlobNav(source, id, href, mountedId);
  const go = () => {
    router.push(href as never);
  };
  if (mountedId && mountedId !== id) {
    resetChallengesTabHistory({ remount: true });
    afterChallengesReady(go);
    return;
  }
  afterChallengesReady(go);
}

export function goHome(
  router: { navigate: (href: never) => void },
  extra?: { alreadyHome?: boolean; after?: () => void },
): void {
  clearLastOpenChallenge();
  logBlobNav('home', '', '/feed', '');
  if (extra?.alreadyHome) {
    extra.after?.();
    return;
  }
  router.navigate('/feed' as never);
  extra?.after?.();
}
