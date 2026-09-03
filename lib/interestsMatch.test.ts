import { describe, expect, it } from 'vitest';

import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { roomsNeedYouDot } from '@/lib/interests';
import { INTEREST_ROOM_SLUGS } from '@/lib/interestsCatalog';
import {
  cardDifficulty,
  familyForChip,
  interestsRankProfile,
  isInterestBoostable,
  mealPlanCopyOnCard,
  pickJoinableOfficialHero,
  pickStartThisStarter,
  preferredDifficultyFromStance,
  rankInterestChallenges,
  shouldOfferStartThis,
  simpleDraftFromStarter,
  starterForChip,
  starterFromCreateParams,
  startThisHref,
  type InterestsRankProfile,
  type RankableChallenge,
} from '@/lib/interestsMatch';
import { OFFICIAL_WEEK_10_SLUG } from '@/lib/officialSeries';
import { SIMPLE_TYPES } from '@/lib/simpleChallenge';
import { copy } from '@/lib/copy';

function room(slug: string, state: 'incomplete' | 'complete_empty' | 'complete_filled') {
  return { room_slug: slug, state };
}

function chip(input: {
  slug: string;
  room: string;
  label?: string;
  stance?: number;
  sort?: number;
  extras?: Record<string, unknown>;
}) {
  return {
    stance_score: input.stance ?? 25,
    extras: input.extras ?? {},
    catalog: {
      slug: input.slug,
      room_slug: input.room,
      label: input.label ?? input.slug,
      sort_order: input.sort ?? 0,
    },
  };
}

function card(id: string, extra: Partial<RankableChallenge> = {}): RankableChallenge {
  return { id, title: id, ...extra };
}

const empty: InterestsRankProfile = { hasCompletedRoom: false, chips: [] };

describe('interests ranking signal', () => {
  it('does not boost when every room is still incomplete or skipped', () => {
    const profile = interestsRankProfile({
      rooms: [room('health_fitness', 'incomplete'), room('sports', 'incomplete')],
      chips: [chip({ slug: 'running', room: 'health_fitness' })],
    });
    expect(profile.hasCompletedRoom).toBe(false);
    expect(profile.chips).toEqual([]);
    const rows = [card('lift', { title: 'Strength block' }), card('run', { title: '30-Day Run Club' })];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual(['lift', 'run']);
  });

  it('treats None of these as a completed room but does not boost that family', () => {
    const profile = interestsRankProfile({
      rooms: [room('sports', 'complete_empty')],
      chips: [chip({ slug: 'pickleball', room: 'sports' })],
    });
    expect(profile.hasCompletedRoom).toBe(true);
    expect(profile.chips).toEqual([]);
    const rows = [
      card('golf', { title: 'Golf league' }),
      card('pickle', { title: 'Pickleball ladder' }),
    ];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual(['golf', 'pickle']);
  });

  it('never boosts Diet & Nutrition into a meal-plan Official', () => {
    const profile = interestsRankProfile({
      rooms: [room('health_fitness', 'complete_filled')],
      chips: [chip({ slug: 'diet_nutrition', room: 'health_fitness', label: 'Diet & Nutrition' })],
    });
    expect(profile.chips).toEqual([]);
    expect(familyForChip('health_fitness', 'diet_nutrition')).toBeNull();
    expect(mealPlanCopyOnCard('Meal-plan Official')).toBe(true);
  });
});

describe('interests lobby boost', () => {
  it('lifts running-family public Simples after a filled Running chip at Level Up', () => {
    const profile = interestsRankProfile({
      rooms: [room('health_fitness', 'complete_filled')],
      chips: [chip({ slug: 'running', room: 'health_fitness', label: 'Running', stance: 1 })],
    });
    expect(preferredDifficultyFromStance(1)).toBe('beginner');
    const rows = [
      card('lift', { title: 'Strength block', days_required: 21 }),
      card('run-long', { title: 'Marathon block', days_required: 30 }),
      card('run-intro', { title: 'Couch to 5K', days_required: 7 }),
    ];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual([
      'run-intro',
      'run-long',
      'lift',
    ]);
  });

  it('prefers longer running Simples when stance is Excel', () => {
    const profile = interestsRankProfile({
      rooms: [room('health_fitness', 'complete_filled')],
      chips: [chip({ slug: 'running', room: 'health_fitness', label: 'Running', stance: 50 })],
    });
    expect(preferredDifficultyFromStance(50)).toBe('advanced');
    const rows = [
      card('run-intro', { title: 'Couch to 5K', days_required: 7 }),
      card('run-long', { title: 'Marathon block', days_required: 30 }),
    ];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual([
      'run-long',
      'run-intro',
    ]);
  });

  it('does not rerank Official Challenges or the Weekly $10 hero', () => {
    const profile = interestsRankProfile({
      rooms: [room('health_fitness', 'complete_filled')],
      chips: [chip({ slug: 'running', room: 'health_fitness', label: 'Running', stance: 50 })],
    });
    const rows = [
      card('week', {
        title: 'Weekly $10',
        series_id: OFFICIAL_WEEK_10_SLUG,
        is_official: true,
        days_required: 7,
      }),
      card('official-run', { title: '30-Day Run Club', is_official: true, days_required: 7 }),
      card('peer-run', { title: 'Morning run', visibility: 'public', days_required: 7 }),
    ];
    expect(isInterestBoostable(rows[0])).toBe(false);
    expect(isInterestBoostable(rows[1])).toBe(false);
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual([
      'peer-run',
      'week',
      'official-run',
    ]);
  });

  it('does not let college pickleball bury a Running card', () => {
    const profile = interestsRankProfile({
      rooms: [
        room('health_fitness', 'complete_filled'),
        room('sports', 'complete_filled'),
      ],
      chips: [
        chip({ slug: 'running', room: 'health_fitness', label: 'Running', sort: 1, stance: 50 }),
        chip({
          slug: 'pickleball',
          room: 'sports',
          label: 'Pickleball',
          sort: 2,
          stance: 1,
          extras: { highest_level: 'college' },
        }),
      ],
    });
    const rows = [
      card('pickle-adv', { title: 'College pickleball', days_required: 30 }),
      card('run', { title: '30-Day Run Club', days_required: 7 }),
    ];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual([
      'pickle-adv',
      'run',
    ]);
  });

  it('uses highest level only as a tie-break inside the same sport', () => {
    const profile = interestsRankProfile({
      rooms: [room('sports', 'complete_filled')],
      chips: [
        chip({
          slug: 'pickleball',
          room: 'sports',
          label: 'Pickleball',
          stance: 25,
          extras: { highest_level: 'college' },
        }),
      ],
    });
    const rows = [
      card('easy', { title: 'Pickleball intro', days_required: 7 }),
      card('hard', { title: 'Pickleball season', days_required: 30 }),
    ];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual(['hard', 'easy']);
  });

  it('never boosts a private corporate card', () => {
    const profile = interestsRankProfile({
      rooms: [room('health_fitness', 'complete_filled')],
      chips: [chip({ slug: 'running', room: 'health_fitness', label: 'Running' })],
    });
    const rows = [
      card('corp', { title: 'Company 5K', privacy_mode: 'private_corporate', days_required: 7 }),
      card('open', { title: 'Open 5K', days_required: 7 }),
    ];
    expect(rankInterestChallenges(rows, profile).map((row) => row.id)).toEqual(['open', 'corp']);
  });

  it('keeps Weekly $10 as the Home hero even when a running Official is joinable', () => {
    const picked = pickJoinableOfficialHero(
      [
        card('run', { title: 'Run Club', days_required: 7, is_official: true }),
        card('week', {
          title: 'Weekly $10',
          series_id: OFFICIAL_WEEK_10_SLUG,
          days_required: 7,
          is_official: true,
        }),
      ],
      new Set(),
      () => true,
    );
    expect(picked?.id).toBe('week');
  });
});

describe('Start this starter', () => {
  it('picks a live Simple running template and skips Diet', () => {
    expect(SIMPLE_TYPES.map((item) => item.value)).toContain('running');
    const picked = pickStartThisStarter([
      { slug: 'diet_nutrition', label: 'Diet & Nutrition', room: 'health_fitness', stanceScore: 25 },
      { slug: 'running', label: 'Running', room: 'health_fitness', stanceScore: 1 },
    ]);
    expect(picked?.chipSlug).toBe('running');
    expect(picked?.starter.templateId).toBe('running');
    expect(picked?.starter.durationDays).toBe(7);
    expect(String(startThisHref(picked!.starter))).toContain('mode=simple');
    expect(String(startThisHref(picked!.starter))).toContain('template=running');
    expect(String(startThisHref(picked!.starter))).toContain('src=interests');
    expect(copy('interests.startThisTitle', 'gentle', { chip: 'Running' })).toBe(
      'Start a Running challenge.',
    );
    expect(copy('interests.startThisTitle', 'honest', { chip: 'Running' })).toBe(
      'Start a Running challenge now.',
    );
    expect(starterForChip({ slug: 'diet_nutrition', label: 'Diet & Nutrition', room: 'health_fitness', stanceScore: 25 })).toBeNull();
  });

  it('skips the sheet when no Simple template exists for the selected chips', () => {
    expect(
      pickStartThisStarter([
        { slug: 'dating', label: 'Dating', room: 'relationships', stanceScore: 25 },
      ]),
    ).toBeNull();
  });

  it('keeps chore-like templates Friends and coins / host-funded defaults', () => {
    const starter = starterForChip({
      slug: 'hiking',
      label: 'Hiking',
      room: 'outdoors',
      stanceScore: 25,
    });
    expect(starter?.templateId).toBe('custom');
    expect(starter?.visibility).toBe('friends');
    const draft = simpleDraftFromStarter(starter!);
    expect(draft.currency).toBe('coins');
    expect(draft.buy_in).toBe(0);
    expect(draft.scoring).toBe('consistency');
    expect(draft.visibility).toBe('friends');
  });

  it('offers the sheet once per room, never on You edit or reopen', () => {
    expect(
      shouldOfferStartThis({ wasAlreadyFilled: false, dismissedAt: null, completeFilled: true }),
    ).toBe(true);
    expect(
      shouldOfferStartThis({
        wasAlreadyFilled: false,
        dismissedAt: null,
        completeFilled: true,
        fromYouEditor: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferStartThis({ wasAlreadyFilled: true, dismissedAt: null, completeFilled: true }),
    ).toBe(false);
    expect(
      shouldOfferStartThis({ wasAlreadyFilled: false, dismissedAt: '2026-09-03', completeFilled: true }),
    ).toBe(false);
    expect(
      shouldOfferStartThis({ wasAlreadyFilled: false, dismissedAt: null, completeFilled: false }),
    ).toBe(false);
  });

  it('ignores create params unless src=interests and the template is live', () => {
    expect(starterFromCreateParams({ template: 'running', src: 'lobby' })).toBeNull();
    expect(starterFromCreateParams({ template: 'meal_plan', src: 'interests' })).toBeNull();
    expect(starterFromCreateParams({ template: 'running', src: 'interests', days: '7' })?.templateId).toBe(
      'running',
    );
  });
});

describe('You tab and public surfaces', () => {
  it('keeps the You-dot until every room is complete_empty or complete_filled', () => {
    const skipped = Object.fromEntries(INTEREST_ROOM_SLUGS.map((slug) => [slug, 'incomplete' as const]));
    skipped.health_fitness = 'incomplete';
    expect(
      roomsNeedYouDot({
        dismissedHome: '2026-09-02',
        states: { ...skipped, health_fitness: 'incomplete' },
      }),
    ).toBe(true);
    const done = Object.fromEntries(INTEREST_ROOM_SLUGS.map((slug) => [slug, 'complete_empty' as const]));
    expect(roomsNeedYouDot({ dismissedHome: '2026-09-02', states: done })).toBe(false);
  });

  it('does not put diet extras or ratings on the public profile select list', () => {
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(/extras|diet|goals|rating_value|stance_score/);
    expect(cardDifficulty(card('x', { days_required: 7 }))).toBe('beginner');
  });
});
