import { describe, expect, it } from 'vitest';

import {
  applyLobbyFilters,
  automationChip,
  challengeEndMeta,
  challengeScheduleState,
  defaultFiltersForTab,
  defaultSortForTab,
  effectiveLobbyFilters,
  fillGateLabel,
  fillGatePair,
  formatEndCountdown,
  formatStartsLine,
  isLobbyActiveParticipantStatus,
  lobbyCardClock,
  lobbyFilterBadgeCount,
  lobbyFilterChips,
  lobbyTabForChallenge,
  lobbyTabsForChallenge,
  sortEndingSoonest,
  sortLobbyRows,
  splitLobbyClockLine,
} from '@/lib/lobbyChallenge';
describe('lobby tabs', () => {
  it('puts host+player on Active and host-only on Hosting', () => {
    expect(
      lobbyTabForChallenge({ isOfficial: false, isParticipant: true, isCreator: true }),
    ).toBe('active');
    expect(
      lobbyTabForChallenge({ isOfficial: false, isParticipant: false, isCreator: true }),
    ).toBe('hosting');
    expect(
      lobbyTabForChallenge({ isOfficial: true, isParticipant: false, isCreator: false }),
    ).toBe('official');
  });

  it('lists Official plus Hosting/Active from created_by and membership, not sponsor', () => {
    expect(
      lobbyTabsForChallenge({
        isOfficial: true,
        isParticipant: false,
        isCreator: true,
      }),
    ).toEqual(['official', 'hosting']);
    expect(
      lobbyTabsForChallenge({
        isOfficial: true,
        isParticipant: true,
        isCreator: true,
      }),
    ).toEqual(['official', 'active']);
    expect(
      lobbyTabForChallenge({
        isOfficial: true,
        isParticipant: false,
        isCreator: true,
      }),
    ).toBe('official');
  });

  it('puts ended rows on Ended even when official or host+play', () => {
    expect(
      lobbyTabForChallenge({
        status: 'settled',
        isOfficial: true,
        isParticipant: true,
        isCreator: false,
      }),
    ).toBe('ended');
    expect(
      lobbyTabForChallenge({
        status: 'ended',
        isOfficial: false,
        isParticipant: true,
        isCreator: true,
      }),
    ).toBe('ended');
    expect(
      lobbyTabForChallenge({
        status: 'live',
        isOfficial: false,
        isParticipant: true,
        isCreator: true,
      }),
    ).toBe('active');
  });

  it('treats withdrawn and refunded as not Active participants', () => {
    expect(isLobbyActiveParticipantStatus('joined')).toBe(true);
    expect(isLobbyActiveParticipantStatus('eliminated')).toBe(true);
    expect(isLobbyActiveParticipantStatus('withdrawn')).toBe(false);
    expect(isLobbyActiveParticipantStatus('refunded_pre_start')).toBe(false);
  });
});

describe('lobby end clock', () => {
  it('sorts ending soonest and leaves unlimited last', () => {
    const rows = sortEndingSoonest([
      { id: 'later', ends_at: '2026-09-02T12:00:00.000Z' },
      { id: 'soon', ends_at: '2026-08-30T12:00:00.000Z' },
      { id: 'open', ends_at: null, is_unlimited: true },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['soon', 'later', 'open']);
  });

  it('uses mm:ss under an hour and h:mm under a day, red only in the last hour', () => {
    expect(formatEndCountdown(5 * 60 * 1000 + 7 * 1000)).toBe('5:07');
    expect(formatEndCountdown(90 * 60 * 1000)).toBe('1:30');
    const now = Date.parse('2026-08-29T12:00:00.000Z');
    const hour = challengeEndMeta('2026-08-29T12:40:00.000Z', now);
    expect(hour.urgent).toBe(true);
    expect(hour.countdown).toBe('40:00');
    const day = challengeEndMeta('2026-08-30T06:00:00.000Z', now);
    expect(day.urgent).toBe(false);
    expect(day.countdown).toBe('18:00');
    const later = challengeEndMeta('2026-09-10T12:00:00.000Z', now);
    expect(later.countdown).toBeNull();
    expect(later.datetime).toMatch(/Ends Sep 10/);
  });
});

describe('challenge schedule copy', () => {
  it('prefers Tomorrow 6:00 AM for the next local morning', () => {
    const now = new Date(2026, 7, 29, 18, 0, 0).getTime();
    const start = new Date(2026, 7, 30, 6, 0, 0);
    expect(formatStartsLine(start.toISOString(), now)).toBe('Starts Tomorrow 6:00 AM');
    expect(automationChip({ starts_at: start.toISOString(), start_mode: 'fixed' }, now)).toBe(
      'Tomorrow morning',
    );
  });

  it('shows start + fill gate before go-live and hides the end clock', () => {
    const now = Date.parse('2026-08-29T12:00:00.000Z');
    const state = challengeScheduleState(
      {
        status: 'filling',
        starts_at: '2026-08-30T12:00:00.000Z',
        ends_at: '2026-08-29T12:40:00.000Z',
        min_participants: 10,
        participant_count: 3,
        start_mode: 'fixed',
        start_rule: 'at_starts_at',
      },
      now,
    );
    expect(state.phase).toBe('prestart');
    expect(state.datetime).toMatch(/^Starts /);
    expect(state.gate).toBe('3/10 needed');
    expect(state.countdown).toBeNull();
  });

  it('uses 1 more needed when one seat remains', () => {
    expect(
      fillGateLabel({ min_participants: 8, participant_count: 7 }),
    ).toBe('1 more needed');
  });

  it('shows live end countdown and hides start gate', () => {
    const now = Date.parse('2026-08-29T12:00:00.000Z');
    const state = challengeScheduleState(
      {
        status: 'live',
        starts_at: '2026-08-20T12:00:00.000Z',
        ends_at: '2026-08-29T12:40:00.000Z',
        min_participants: 10,
        participant_count: 3,
      },
      now,
    );
    expect(state.phase).toBe('live');
    expect(state.datetime).toMatch(/^Ends /);
    expect(state.countdown).toBe('40:00');
    expect(state.urgent).toBe(true);
    expect(state.gate).toBeNull();
    expect(state.chip).toBeNull();
  });

  it('labels settled with the end datetime and no join copy', () => {
    const state = challengeScheduleState({
      status: 'settled',
      ends_at: '2026-08-28T15:00:00.000Z',
    });
    expect(state.phase).toBe('settled');
    expect(state.datetime).toMatch(/^Ended /);
    expect(state.gate).toBeNull();
  });

  it('prints lobby card time as Starts, Ends in, or Ended datetime', () => {
    const now = new Date(2026, 7, 29, 12, 0, 0).getTime();
    expect(
      lobbyCardClock(
        { status: 'upcoming', starts_at: new Date(2026, 7, 24, 8, 0, 0).toISOString() },
        now,
      )?.lines,
    ).toEqual(['Starts Aug 24,', '8:00 AM']);
    expect(splitLobbyClockLine('Starts Aug 24, 8:00 AM')).toEqual(['Starts Aug 24,', '8:00 AM']);
    expect(
      lobbyCardClock(
        { status: 'upcoming', starts_at: new Date(2026, 7, 31, 23, 0, 0).toISOString() },
        now,
      )?.line,
    ).toBe('Starts Aug 31, 11:00 PM');
    expect(
      lobbyCardClock(
        { status: 'live', ends_at: new Date(2026, 7, 29, 12, 40, 0).toISOString() },
        now,
      ),
    ).toEqual({ line: 'Ends in 40:00', lines: ['Ends in 40:00'], urgent: true });
    expect(
      lobbyCardClock(
        { status: 'live', ends_at: new Date(2026, 7, 31, 23, 0, 0).toISOString() },
        now,
      )?.line,
    ).toBe('Ends Aug 31, 11:00 PM');
    expect(
      lobbyCardClock(
        { status: 'settled', ends_at: new Date(2026, 7, 28, 15, 0, 0).toISOString() },
        now,
      )?.line,
    ).toBe('Ended Aug 28, 3:00 PM');
  });

  it('uses live arming mm:ss instead of a static 1 hour chip', () => {
    const now = Date.parse('2026-08-29T12:00:00.000Z');
    expect(
      automationChip(
        { status: 'arming', armed_at: '2026-08-29T11:20:00.000Z', is_official: true, series_id: 'week' },
        now,
      ),
    ).toBe('Starts in 20:00');
  });
});

describe('lobby filters', () => {
  const now = Date.parse('2026-08-29T12:00:00.000Z');

  it('defaults every tab to empty When and live tabs to ending soonest', () => {
    expect(defaultFiltersForTab('ended').when).toBe('all');
    expect(defaultFiltersForTab('official').when).toBe('all');
    expect(defaultSortForTab('ended')).toBe('ended_recently');
    expect(defaultSortForTab('active')).toBe('ending_soonest');
    expect(defaultFiltersForTab('active').when).toBe('all');
  });

  it('ANDs stacked groups and keeps only matching rows', () => {
    const filters = {
      ...defaultFiltersForTab('ended'),
      when: 'week' as const,
      durations: ['8-30' as const],
      currencies: ['coins' as const],
    };
    const rows = [
      {
        id: 'keep',
        title: 'Keep',
        currency: 'coins',
        days_required: 14,
        ends_at: '2026-08-25T12:00:00.000Z',
        prize_pool: 10,
      },
      {
        id: 'bucks',
        title: 'Bucks',
        currency: 'bucks',
        days_required: 14,
        ends_at: '2026-08-25T12:00:00.000Z',
        prize_pool: 20,
      },
      {
        id: 'short',
        title: 'Short',
        currency: 'coins',
        days_required: 3,
        ends_at: '2026-08-25T12:00:00.000Z',
        prize_pool: 30,
      },
      {
        id: 'old',
        title: 'Old',
        currency: 'coins',
        days_required: 14,
        ends_at: '2026-07-01T12:00:00.000Z',
        prize_pool: 40,
      },
    ];
    const filtered = applyLobbyFilters(rows, 'ended', filters, { nowMs: now });
    expect(filtered.map((row) => row.id)).toEqual(['keep']);
  });

  it('sorts without changing which filters are stacked', () => {
    const filters = {
      ...defaultFiltersForTab('ended'),
      when: 'week' as const,
      currencies: ['coins' as const],
    };
    const chipsBefore = lobbyFilterChips('ended', filters).map((chip) => chip.id);
    const rows = [
      { id: 'b', title: 'Beta', currency: 'coins', ends_at: '2026-08-28T12:00:00.000Z', prize_pool: 5 },
      { id: 'a', title: 'Alpha', currency: 'coins', ends_at: '2026-08-26T12:00:00.000Z', prize_pool: 9 },
    ];
    const filtered = applyLobbyFilters(rows, 'ended', filters, { nowMs: now });
    expect(sortLobbyRows(filtered, 'title').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortLobbyRows(filtered, 'prize_desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(lobbyFilterChips('ended', filters).map((chip) => chip.id)).toEqual(chipsBefore);
  });

  it('hides live rows when When is Upcoming and keeps Score separate from Challenge type', () => {
    const filters = {
      ...defaultFiltersForTab('active'),
      when: 'upcoming' as const,
      types: ['consistency' as const],
      categories: ['fitness' as const],
    };
    const rows = [
      {
        id: 'live',
        title: 'Workout Group #2',
        status: 'live',
        starts_at: '2026-08-20T12:00:00.000Z',
        ends_at: '2026-08-31T23:00:00.000Z',
        challenge_type: 'consistency',
        category: 'fitness',
      },
      {
        id: 'soon',
        title: 'Later',
        status: 'upcoming',
        starts_at: '2026-09-01T12:00:00.000Z',
        challenge_type: 'consistency',
        category: 'fitness',
      },
      {
        id: 'points',
        title: 'Points later',
        status: 'upcoming',
        starts_at: '2026-09-01T12:00:00.000Z',
        challenge_type: 'points',
        category: 'fitness',
      },
      {
        id: 'reading',
        title: 'Read later',
        status: 'upcoming',
        starts_at: '2026-09-01T12:00:00.000Z',
        challenge_type: 'consistency',
        category: 'reading',
      },
    ];
    expect(applyLobbyFilters(rows, 'active', filters, { nowMs: now }).map((row) => row.id)).toEqual([
      'soon',
    ]);
    expect(lobbyFilterChips('active', filters).map((chip) => chip.id)).toEqual([
      'when',
      'type:consistency',
      'category:fitness',
    ]);
  });

  it('keeps Currency Free and Cost Free as separate chips', () => {
    const filters = {
      ...defaultFiltersForTab('active'),
      currencies: ['free' as const],
      costs: ['free' as const],
    };
    expect(lobbyFilterChips('active', filters)).toEqual([
      { id: 'currency:free', label: 'Free' },
      { id: 'cost:free', label: 'Free' },
    ]);
  });

  it('opens Official with a zero badge and drops saved filters that hide every row', () => {
    expect(lobbyFilterBadgeCount('official', defaultFiltersForTab('official'))).toBe(0);
    const rows = [
      { id: 'rookies', title: 'Rookies vs. Rockstars', is_official: true, status: 'upcoming' },
      { id: 'weekly', title: 'Weekly $10', is_official: true, status: 'filling' },
    ];
    const saved = { ...defaultFiltersForTab('official'), statuses: ['live'] };
    expect(applyLobbyFilters(rows, 'official', saved, { nowMs: now })).toEqual([]);
    expect(effectiveLobbyFilters('official', saved, rows, { nowMs: now })).toEqual(
      defaultFiltersForTab('official'),
    );
  });
});

describe('fill gate pair', () => {
  it('returns n/min for Lobby fill-gate copy', () => {
    expect(fillGatePair({ min_participants: 10, participant_count: 3 })).toEqual({
      count: 3,
      min: 10,
    });
    expect(fillGateLabel({ min_participants: 10, participant_count: 3 })).toBe('3/10 needed');
  });

  it('uses joined / 1.5× min headcount for Official Home strip', () => {
    expect(
      fillGatePair({
        is_official: true,
        host_budget: 10,
        prize_pool: 3,
        buy_in_amount: 1,
        participant_count: 3,
        min_participants: 0,
      }),
    ).toEqual({ count: 3, min: 15 });
  });
});
