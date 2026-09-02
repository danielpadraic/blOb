import { describe, expect, it } from 'vitest';

import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import {
  INTEREST_ROOMS,
  INTEREST_ROOM_SLUGS,
  roomDef,
} from '@/lib/interestsCatalog';
import {
  allRoomsComplete,
  continueBlocked,
  roomsNeedYouDot,
  setChipMark,
  stateForSave,
  toggleChipStance,
} from '@/lib/interests';

describe('interests catalog', () => {
  it('has six rooms including Academics, Fasting, Work, and the eSports list', () => {
    expect(INTEREST_ROOM_SLUGS).toHaveLength(6);
    const personal = roomDef('personal_development').chips.map((chip) => chip.slug);
    expect(personal).toEqual(expect.arrayContaining(['academics', 'fasting', 'work']));
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

  it('keeps Skip incomplete and None of these complete_empty', () => {
    expect(stateForSave('skip', 3)).toBe('incomplete');
    expect(stateForSave('none', 0)).toBe('complete_empty');
    expect(stateForSave('save', 2)).toBe('complete_filled');
  });
});

describe('interests stance', () => {
  it('defaults Excel on first tap and keeps at least one mark', () => {
    const selected = toggleChipStance({}, 'c1');
    expect(selected.c1).toEqual({ excel: true, levelUp: false });
    const both = setChipMark(selected, 'c1', 'levelUp');
    expect(both.c1).toEqual({ excel: true, levelUp: true });
    const excelOff = setChipMark(both, 'c1', 'excel');
    expect(excelOff.c1).toEqual({ excel: false, levelUp: true });
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
  it('does not select birth date, occupation, employer, ratings, or proof', () => {
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(
      /date_of_birth|occupation|employer|rating_value|preferred_proof/,
    );
  });
});
