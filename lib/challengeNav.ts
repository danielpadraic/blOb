import { firstRouteParam } from '@/lib/challengeLoad';

export type NestedNavRoute = {
  name: string;
  key?: string;
  params?: Record<string, unknown>;
  state?: NestedNavState | null;
};

export type NestedNavState = {
  index?: number;
  key?: string;
  routeNames?: string[];
  routes: NestedNavRoute[];
};

export type NavLike = {
  getState?: () => NestedNavState | undefined;
  getParent?: () => NavLike | undefined;
  dispatch?: (action: unknown) => void;
};

export type BoundChallengesNav = {
  nav: NavLike;
  target?: string;
};

let boundChallenges: BoundChallengesNav | null = null;

export function logBlobNav(source: string, id: string, href: string): void {
  console.log('[blob:nav]', { source, id, href });
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
  while (current) {
    const state = current.getState?.();
    if (isChallengesStackState(state)) {
      return { nav: current };
    }
    const nested = state?.routes?.find((route) => route.name === 'challenges')?.state;
    if (nested?.key) {
      return { nav: current, target: nested.key };
    }
    current = current.getParent?.();
  }
  return null;
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

/** Pop leftover `[id]` / submit so Home is not a last-open challenge. */
export function clearLastOpenChallenge(): boolean {
  const bound = boundChallenges;
  if (!bound?.nav.dispatch) {
    return false;
  }
  const state = bound.nav.getState?.();
  const nested = nestedChallengesState(state) ?? state;
  if (!nested || challengesStackAtLobby(nested)) {
    return false;
  }
  const action = bound.target
    ? { ...resetChallengesToLobbyAction(), target: bound.target }
    : resetChallengesToLobbyAction();
  bound.nav.dispatch(action);
  return true;
}

/**
 * Home / Check In / a different challenge must pop leftover Live or camera.
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
  logBlobNav(source, id, href);
  if (shouldPopBeforeChallengePush(pathname, href, boundLeftoverChallengePath())) {
    const popped = clearLastOpenChallenge();
    if (popped) {
      setTimeout(() => router.push(href as never), 60);
      return;
    }
  }
  router.push(href as never);
}

export function goHome(
  router: { navigate: (href: never) => void },
  extra?: { alreadyHome?: boolean; after?: () => void },
): void {
  logBlobNav('home', '', '/feed');
  clearLastOpenChallenge();
  if (extra?.alreadyHome) {
    extra.after?.();
    return;
  }
  router.navigate('/feed' as never);
  extra?.after?.();
}
