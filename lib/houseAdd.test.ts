import { describe, expect, it } from 'vitest';

import {
  houseAddLiveNote,
  houseAddLivePostRow,
  houseAddPeopleLabel,
  houseAddUnknownLine,
  isHouseAddAlreadyIn,
  parsePastedUsernames,
} from '@/lib/houseAdd';

describe('house add copy', () => {
  it('confirms a batch and writes one Live note', () => {
    expect(houseAddPeopleLabel(12, 'Rookies vs. Veterans')).toBe(
      'Add 12 people to Rookies vs. Veterans?',
    );
    expect(houseAddPeopleLabel(1, 'Rookies vs. Veterans')).toBe(
      'Add 1 person to Rookies vs. Veterans?',
    );
    expect(houseAddLiveNote('Daniel', ['Courtney', 'Silas', 'Ava', 'Ben'])).toBe(
      'Daniel added Courtney, Silas, and 2 others.',
    );
    expect(houseAddLiveNote('Daniel', ['Courtney', 'Silas'])).toBe(
      'Daniel added Courtney and Silas.',
    );
  });

  it('parses a paste list of @usernames', () => {
    expect(parsePastedUsernames('@courtney\nsilas\n@Courtney\n')).toEqual(['courtney', 'silas']);
  });

  it('lists unknown paste names without failing the batch', () => {
    expect(houseAddUnknownLine(['ghost', 'missing'])).toBe('Couldn’t find @ghost, @missing.');
    expect(isHouseAddAlreadyIn('They’re already in.')).toBe(true);
  });

  it('writes one Live note off Home', () => {
    expect(
      houseAddLivePostRow({
        authorId: 'host',
        challengeId: '16af3e82',
        content: 'Daniel added Courtney, Silas, and 10 others.',
      }),
    ).toMatchObject({
      source: 'challenge',
      hidden_from_home: true,
      challenge_id: '16af3e82',
    });
  });
});
