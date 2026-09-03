import { describe, expect, it } from 'vitest';

import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import {
  INTEREST_ROOMS,
  INTEREST_ROOM_SLUGS,
  NONE_CHIP_SLUG,
  ROOM_REQUEST,
  roomDef,
} from '@/lib/interestsCatalog';
import {
  allRoomsComplete,
  continueBlocked,
  roomContinueBlocked,
  roomsNeedYouDot,
  setChipMark,
  stanceFromMarks,
  stanceFromTrack,
  stanceFromTrackTop,
  stanceMarks,
  stateForSave,
  toggleChipStance,
  toggleRoomPickerChip,
} from '@/lib/interests';

describe('interests catalog', () => {
  it('has six rooms including Academics, Fasting, Work, and the eSports list', () => {
    expect(INTEREST_ROOM_SLUGS).toHaveLength(6);
    const personal = roomDef('personal_development').chips.map((chip) => chip.slug);
    expect(personal).toEqual(expect.arrayContaining(['academics', 'fasting', 'work']));
    const health = roomDef('health_fitness').chips.map((chip) => chip.slug);
    expect(health).toEqual(expect.arrayContaining(['diet_nutrition', 'mobility', 'yoga', 'running']));
    expect(health).not.toContain('yoga_mobility');
    const esports = roomDef('esports').chips.map((chip) => chip.label);
    expect(esports).toEqual(
      expect.arrayContaining([
        'League',
        'CS2',
        'Valorant',
        'Dota 2',
        'MLBB',
        'PUBG Mobile',
        'Fortnite',
        'Rocket League',
        'Apex',
        'CoD',
        'EA FC',
        'NBA 2K',
        'SF/Tekken',
        'Smash',
        'StarCraft II',
        'Free Fire',
        'Other',
      ]),
    );
  });

  it('keeps Skip incomplete, None complete_empty, and cards complete_filled only when done', () => {
    expect(stateForSave('skip', 3)).toBe('incomplete');
    expect(stateForSave('select', 2)).toBe('incomplete');
    expect(stateForSave('card', 2, false)).toBe('incomplete');
    expect(stateForSave('none', 0)).toBe('complete_empty');
    expect(stateForSave('card', 2, true)).toBe('complete_filled');
  });

  it('uses the Screen A request line', () => {
    expect(ROOM_REQUEST).toBe('Which of these are you currently doing or would like to improve?');
  });
});

describe('interests stance', () => {
  it('defaults to 3 (both marks) and maps 1–2 level up, 4–5 excel', () => {
    expect(stanceMarks(3)).toEqual({ excel: true, levelUp: true });
    expect(stanceMarks(1)).toEqual({ excel: false, levelUp: true });
    expect(stanceMarks(5)).toEqual({ excel: true, levelUp: false });
    expect(stanceFromMarks(true, false, null)).toBe(4);
    expect(stanceFromMarks(false, true, null)).toBe(2);
    expect(stanceFromMarks(true, true, 3)).toBe(3);
    const selected = toggleChipStance({}, 'c1');
    expect(selected.c1).toEqual({ excel: true, levelUp: true });
    const both = setChipMark(selected, 'c1', 'levelUp');
    expect(both.c1.excel).toBe(true);
  });

  it('maps a horizontal track with Leveling up at the left to stance 1–5', () => {
    expect(stanceFromTrack(0)).toBe(1);
    expect(stanceFromTrack(0.5)).toBe(3);
    expect(stanceFromTrack(1)).toBe(5);
    expect(stanceFromTrackTop(0)).toBe(1);
  });

  it('clears activities when None of these is tapped, and Continue needs a choice', () => {
    const picked = toggleRoomPickerChip({ selected: {}, noneOfThese: false }, 'running');
    expect(picked.selected.running).toBeTruthy();
    const none = toggleRoomPickerChip(picked, NONE_CHIP_SLUG);
    expect(none.noneOfThese).toBe(true);
    expect(none.selected).toEqual({});
    const again = toggleRoomPickerChip(none, 'lifting');
    expect(again.noneOfThese).toBe(false);
    expect(again.selected.lifting).toBeTruthy();
    expect(roomContinueBlocked({ selected: {}, noneOfThese: false })).toMatch(/none of these/i);
    expect(roomContinueBlocked(none)).toBeNull();
  });

  it('requires occupation and employer when Work is on', () => {
    expect(
      continueBlocked({
        stances: { work: { excel: true, levelUp: false } },
        workOn: true,
        occupation: '',
        employer: 'Acme',
        otherOn: false,
        otherText: '',
      }),
    ).toMatch(/occupation and employer/i);
    expect(
      continueBlocked({
        stances: { work: { excel: true, levelUp: false } },
        workOn: true,
        occupation: 'Coach',
        employer: 'Acme',
        otherOn: false,
        otherText: '',
      }),
    ).toBeNull();
  });
});

describe('You reminder dot', () => {
  it('stays off until Home skip or setup, then on while any room is incomplete', () => {
    const empty = Object.fromEntries(INTEREST_ROOMS.map((room) => [room.slug, 'incomplete' as const]));
    expect(roomsNeedYouDot({ states: empty })).toBe(false);
    expect(roomsNeedYouDot({ dismissedHome: '2026-09-02', states: empty })).toBe(true);
    expect(
      roomsNeedYouDot({
        dismissedHome: '2026-09-02',
        states: { sports: 'complete_empty' },
      }),
    ).toBe(true);
    const done = Object.fromEntries(
      INTEREST_ROOM_SLUGS.map((slug) => [slug, 'complete_empty' as const]),
    );
    expect(roomsNeedYouDot({ dismissedHome: '2026-09-02', states: done })).toBe(false);
    expect(allRoomsComplete(done)).toBe(true);
  });
});

describe('public profile', () => {
  it('does not select birth date, occupation, employer, ratings, stance, or proof', () => {
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(
      /date_of_birth|occupation|employer|rating_value|preferred_proof|preferred_proofs|stance_score|extras|diet/,
    );
  });
});
