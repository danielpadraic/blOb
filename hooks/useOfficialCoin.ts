import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { chicagoDateStamp } from '@/lib/chicagoToday';
import { normalizePeriodKey } from '@/lib/checkinPeriod';
import {
  canRejoinOfficialCoin,
  isOfficialCoinChallenge,
  officialCoinAllowedDays,
  officialCoinKind,
  type OfficialCoinChallenge,
  type OfficialCoinKind,
  type OfficialCoinMembership,
} from '@/lib/officialCoin';
import { supabase } from '@/lib/supabase';
import { HOME_PULSE_KEY } from '@/lib/homePulse';
import { getErrorMessage, logPostgrestError } from '@/utils/errors';

export const OFFICIAL_COIN_KEY = 'official-coin';
export const OFFICIAL_COIN_DAYS_KEY = 'official-coin-days';

const ROOM_SELECT =
  'id, title, task, description, rules, status, starts_at, ends_at, days_required, official_kind, score_mode, window_reset, prize_guarantee_coins, is_official, created_by, sponsor_name, currency, timezone';

export type OfficialCoinRoom = {
  kind: OfficialCoinKind;
  challenge: OfficialCoinChallenge & {
    id: string;
    title: string;
    status?: string | null;
  };
  joined: boolean;
  membership: OfficialCoinMembership | null;
  allowedDays: number;
  daysLogged: number;
};

export type OfficialCoinStatus = {
  rooms: OfficialCoinRoom[];
  weekly: OfficialCoinRoom | null;
  monthly: OfficialCoinRoom | null;
  /** In at least one room. */
  joined: boolean;
  /** They left Official Coin, so backfill leaves them alone. */
  optedOut: boolean;
  /** Home Live rail should offer Rejoin in slot 0. */
  canRejoin: boolean;
  /** Today's Chicago slot is already filled on an Official Coin room. */
  checkedInToday: boolean;
  todayKey: string;
};

const EMPTY_STATUS: OfficialCoinStatus = {
  rooms: [],
  weekly: null,
  monthly: null,
  joined: false,
  optedOut: false,
  canRejoin: false,
  checkedInToday: false,
  todayKey: '',
};

let rollAt = 0;
const ROLL_THROTTLE_MS = 60_000;

/**
 * Close a finished Chicago window, settle it, and reopen the SAME rows on the
 * next one. There is no pg_cron on this project, so the app ticks it the same
 * way it ticks the Official series.
 */
export async function tickOfficialCoinWindows(): Promise<void> {
  const now = Date.now();
  if (now - rollAt < ROLL_THROTTLE_MS) {
    return;
  }
  rollAt = now;
  try {
    await supabase.rpc('official_coin_roll_windows');
  } catch (error) {
    logPostgrestError('official-coin-roll', error);
  }
}

export function useOfficialCoinStatus() {
  const { user } = useAuth();
  const todayKey = chicagoDateStamp();

  const query = useQuery({
    queryKey: [OFFICIAL_COIN_KEY, user?.id, todayKey],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<OfficialCoinStatus> => {
      void tickOfficialCoinWindows();
      const rooms = await supabase
        .from('challenges')
        .select(ROOM_SELECT)
        .not('official_kind', 'is', null);
      if (rooms.error) {
        // A pre-migration client must not break Home or the picker.
        logPostgrestError('official-coin-rooms', rooms.error);
        return { ...EMPTY_STATUS, todayKey };
      }
      const challenges = (rooms.data ?? []) as unknown as OfficialCoinRoom['challenge'][];
      const ids = challenges.map((row) => String(row.id)).filter(Boolean);
      if (ids.length === 0) {
        return { ...EMPTY_STATUS, todayKey };
      }

      const [members, checkins, me] = await Promise.all([
        supabase
          .from('challenge_participants')
          .select('challenge_id, status, eliminated_at, room_id, window_starts_at, window_ends_at')
          .eq('user_id', user!.id)
          .in('challenge_id', ids),
        supabase
          .from('challenge_checkins')
          .select('challenge_id, period_key, status, submitted_at')
          .eq('user_id', user!.id)
          .in('challenge_id', ids),
        supabase
          .from('profiles')
          .select('official_coin_opted_out_at')
          .eq('id', user!.id)
          .maybeSingle(),
      ]);
      if (members.error) {
        throw new Error(getErrorMessage(members.error));
      }
      const optedOut = Boolean(
        (me.data as { official_coin_opted_out_at?: string | null } | null)
          ?.official_coin_opted_out_at,
      );

      const membership = new Map<string, OfficialCoinMembership>();
      for (const row of (members.data ?? []) as (OfficialCoinMembership & {
        status?: string | null;
        eliminated_at?: string | null;
      })[]) {
        const id = String(row.challenge_id ?? '');
        const status = String(row.status ?? 'joined');
        if (!id || row.eliminated_at || status === 'withdrawn' || status === 'refunded_pre_start') {
          continue;
        }
        membership.set(id, row);
      }

      const loggedDays = new Map<string, Set<string>>();
      let checkedInToday = false;
      for (const row of (checkins.data ?? []) as {
        challenge_id?: string | null;
        period_key?: string | null;
        status?: string | null;
        submitted_at?: string | null;
      }[]) {
        if (row.status !== 'submitted' || !row.submitted_at) {
          continue;
        }
        const id = String(row.challenge_id ?? '');
        const key = normalizePeriodKey(row.period_key);
        if (!id || !key) {
          continue;
        }
        const set = loggedDays.get(id) ?? new Set<string>();
        set.add(key);
        loggedDays.set(id, set);
        if (key === todayKey) {
          checkedInToday = true;
        }
      }

      const now = new Date();
      const built: OfficialCoinRoom[] = [];
      for (const challenge of challenges) {
        const kind = officialCoinKind(challenge);
        if (!kind) {
          continue;
        }
        const id = String(challenge.id);
        const mine = membership.get(id) ?? null;
        const startKey = normalizePeriodKey(challenge.starts_at ?? '');
        const endKey = normalizePeriodKey(challenge.ends_at ?? '');
        const inWindow = [...(loggedDays.get(id) ?? new Set<string>())].filter(
          (key) => (!startKey || key >= startKey) && (!endKey || key < endKey),
        );
        built.push({
          kind,
          challenge,
          joined: Boolean(mine),
          membership: mine,
          allowedDays: officialCoinAllowedDays(challenge, mine, now),
          daysLogged: inWindow.length,
        });
      }

      const weekly = built.find((room) => room.kind === 'coin_weekly') ?? null;
      const monthly = built.find((room) => room.kind === 'coin_monthly') ?? null;
      return {
        rooms: built,
        weekly,
        monthly,
        joined: built.some((room) => room.joined),
        optedOut,
        canRejoin: canRejoinOfficialCoin({
          roomsExist: built.length > 0,
          optedOut,
          weeklyJoined: weekly?.joined,
          monthlyJoined: monthly?.joined,
        }),
        checkedInToday,
        todayKey,
      };
    },
  });

  return { ...query, status: query.data ?? EMPTY_STATUS };
}

/** Leave Official drops BOTH rooms and records the opt-out so backfill respects it. */
export function useLeaveOfficialCoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('official_coin_leave');
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OFFICIAL_COIN_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants'] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation'] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
      void queryClient.invalidateQueries({ queryKey: [HOME_PULSE_KEY] });
    },
  });
}

export function useRejoinOfficialCoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('official_coin_rejoin');
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OFFICIAL_COIN_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants'] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation'] });
      void queryClient.invalidateQueries({ queryKey: ['loggable-challenge'] });
      void queryClient.invalidateQueries({ queryKey: [HOME_PULSE_KEY] });
    },
  });
}

export type OfficialCoinDay = {
  day: number;
  periodKey: string;
  userId: string;
  checkinId: string;
  postId: string | null;
};

/**
 * Every submitted day in this room's window, per person, with the Live post that
 * holds that day's proof. Board row expand turns these into Day 1, Day 2, … links.
 */
export function useOfficialCoinDays(
  challenge?: OfficialCoinChallenge | null,
  enabled = true,
) {
  const challengeId = String(challenge?.id ?? '').trim();
  const startKey = normalizePeriodKey(challenge?.starts_at ?? '');
  const endKey = normalizePeriodKey(challenge?.ends_at ?? '');
  const on = enabled && Boolean(challengeId) && isOfficialCoinChallenge(challenge);

  return useQuery({
    queryKey: [OFFICIAL_COIN_DAYS_KEY, challengeId, startKey, endKey],
    enabled: on,
    queryFn: async (): Promise<Map<string, OfficialCoinDay[]>> => {
      const byUser = new Map<string, OfficialCoinDay[]>();
      const checkins = await supabase
        .from('challenge_checkins')
        .select('id, user_id, period_key, status, submitted_at')
        .eq('challenge_id', challengeId)
        .eq('status', 'submitted')
        .gte('period_key', startKey)
        .lt('period_key', endKey)
        .order('period_key', { ascending: true });
      if (checkins.error) {
        logPostgrestError('official-coin-days', checkins.error);
        return byUser;
      }
      const rows = (checkins.data ?? []) as {
        id: string;
        user_id: string;
        period_key: string;
        submitted_at?: string | null;
      }[];
      const live = rows.filter((row) => Boolean(row.submitted_at));
      if (live.length === 0) {
        return byUser;
      }

      const postByCheckin = new Map<string, string>();
      const posts = await supabase
        .from('posts')
        .select('id, checkin_id')
        .in('checkin_id', live.map((row) => row.id))
        .is('deleted_at', null);
      if (!posts.error) {
        for (const row of (posts.data ?? []) as { id: string; checkin_id: string | null }[]) {
          const key = String(row.checkin_id ?? '');
          if (key && !postByCheckin.has(key)) {
            postByCheckin.set(key, String(row.id));
          }
        }
      }

      for (const row of live) {
        const userId = String(row.user_id);
        const list = byUser.get(userId) ?? [];
        list.push({
          day: 0,
          periodKey: normalizePeriodKey(row.period_key),
          userId,
          checkinId: String(row.id),
          postId: postByCheckin.get(String(row.id)) ?? null,
        });
        byUser.set(userId, list);
      }
      // Day numbers are per person: their first logged day is Day 1.
      for (const [userId, list] of byUser) {
        list.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
        byUser.set(
          userId,
          list.map((row, index) => ({ ...row, day: index + 1 })),
        );
      }
      return byUser;
    },
  });
}
