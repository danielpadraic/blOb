import { describe, expect, it } from 'vitest';

import {
  asHostRoundPromptTone,
  HOST_ROUND_PROMPT_COPY,
  HOST_ROUND_PROMPT_MAX,
  challengeDayStamp,
  hostRoundCaptureHref,
  hostRoundPromptLine,
  isHostRoundPromptHost,
  reelOnChallengeDay,
  shouldShowHostRoundPrompt,
} from '@/lib/hostRoundPrompt';

describe('hostRoundPromptLine', () => {
  it('picks Gentle or Honest and stays under 100 characters', () => {
    expect(hostRoundPromptLine('gentle')).toBe(HOST_ROUND_PROMPT_COPY.gentle);
    expect(hostRoundPromptLine('honest')).toBe(HOST_ROUND_PROMPT_COPY.honest);
    expect(hostRoundPromptLine('neutral')).toBe(HOST_ROUND_PROMPT_COPY.gentle);
    expect(asHostRoundPromptTone('neutral')).toBe('gentle');
    expect(hostRoundPromptLine('honest').length).toBeLessThanOrEqual(HOST_ROUND_PROMPT_MAX);
    expect(hostRoundPromptLine('gentle').length).toBeLessThanOrEqual(HOST_ROUND_PROMPT_MAX);
  });
});

describe('shouldShowHostRoundPrompt', () => {
  it('shows only for a live host who has not posted or dismissed today', () => {
    expect(
      shouldShowHostRoundPrompt({
        isHost: true,
        status: 'live',
        postedRoundToday: false,
        dismissedLocalDay: false,
      }),
    ).toBe(true);
    expect(
      shouldShowHostRoundPrompt({
        isHost: false,
        status: 'live',
        postedRoundToday: false,
        dismissedLocalDay: false,
      }),
    ).toBe(false);
    expect(
      shouldShowHostRoundPrompt({
        isHost: true,
        status: 'upcoming',
        postedRoundToday: false,
        dismissedLocalDay: false,
      }),
    ).toBe(false);
    expect(
      shouldShowHostRoundPrompt({
        isHost: true,
        status: 'live',
        postedRoundToday: true,
        dismissedLocalDay: false,
      }),
    ).toBe(false);
    expect(
      shouldShowHostRoundPrompt({
        isHost: true,
        status: 'live',
        postedRoundToday: false,
        dismissedLocalDay: true,
      }),
    ).toBe(false);
  });
});

describe('isHostRoundPromptHost', () => {
  it('is the creator only — joiners never count', () => {
    expect(isHostRoundPromptHost({ viewerId: 'me', createdBy: 'me' })).toBe(true);
    expect(isHostRoundPromptHost({ viewerId: 'me', createdBy: 'host' })).toBe(false);
  });
});

describe('reelOnChallengeDay', () => {
  it('uses the challenge timezone calendar day', () => {
    expect(challengeDayStamp(new Date('2026-09-02T05:00:00.000Z'), 'America/Denver')).toBe(
      '2026-09-01',
    );
    expect(
      reelOnChallengeDay('2026-09-02T05:30:00.000Z', 'America/Denver', '2026-09-01'),
    ).toBe(true);
    expect(
      reelOnChallengeDay('2026-09-02T06:30:00.000Z', 'America/Denver', '2026-09-01'),
    ).toBe(false);
  });
});

describe('hostRoundCaptureHref', () => {
  it('opens Round capture tagged to that challenge, not Wave or Check In', () => {
    expect(hostRoundCaptureHref('30-day')).toBe(
      '/capture?mode=reel&media=video&challengeId=30-day',
    );
  });
});
