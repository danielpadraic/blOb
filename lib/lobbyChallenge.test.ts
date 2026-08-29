import { describe, expect, it } from 'vitest';

import {
  applyLobbyFilters,
  automationChip,
  challengeEndMeta,
  challengeScheduleState,
  defaultFiltersForTab,
  defaultSortForTab,
  fillGateLabel,
  fillGatePair,
  formatEndCountdown,
  formatStartsLine,
  officialStripStart,
  isLobbyActiveParticipantStatus,
  lobbyFilterChips,
  lobbyTabForChallenge,
  sortEndingSoonest,
  sortLobbyRows,
} from '@/lib/lobbyChallenge';
import { isHomeOfficialSlide, officialStripPrize } from '@/lib/officialSeries';

describe('lobby tabs', () => {
  it('puts host+player on Active and host-only on Hosting', () => {
    expect(
      lobbyTabForChallenge({ isOfficial: false, isParticipant: true, isCreator: true }),
    ).toBe('active');
    expect(
      lobbyTabForChallenge({ isOfficial: false, isParticipant: false, isCreator: true }),
    ).toBe('hosting');
    expect(
      lobbyTabForChallenge({ isOfficial: true, isParticipant: true, isCreator: false }),
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

  it('defaults Ended to the past 30 days and live tabs to ending soonest', () => {
    expect(defaultFiltersForTab('ended').when).toBe('30d');
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
});

describe('home Official rail', () => {
  it('only lists upcoming and live Officials', () => {
    expect(isHomeOfficialSlide({ is_official: true, status: 'live' })).toBe(true);
    expect(isHomeOfficialSlide({ is_official: true, status: 'filling' })).toBe(true);
    expect(isHomeOfficialSlide({ is_official: true, status: 'settled' })).toBe(false);
    expect(isHomeOfficialSlide({ is_official: false, status: 'live' })).toBe(false);
  });

  it('uses Live or Starts {short} with no countdown copy', () => {
    expect(officialStripStart({ status: 'live' })).toBe('Live');
    const now = new Date(2026, 7, 29, 18, 0, 0).getTime();
    const start = new Date(2026, 7, 30, 6, 0, 0);
    expect(officialStripStart({ status: 'filling', starts_at: start.toISOString() }, now)).toBe(
      'Starts Tomorrow 6:00 AM',
    );
  });

  it('takes the higher of guaranteed prize and live pot', () => {
    expect(officialStripPrize({ prize_pool: 8, host_budget: 10 })).toBe(10);
    expect(officialStripPrize({ prize_pool: 40, host_budget: 10 })).toBe(40);
  });

  it('shows n/min without needed copy', () => {
    expect(fillGatePair({ min_participants: 10, participant_count: 3 })).toEqual({
      count: 3,
      min: 10,
    });
    expect(fillGateLabel({ min_participants: 10, participant_count: 3 })).toBe('3/10 needed');
  });
});
