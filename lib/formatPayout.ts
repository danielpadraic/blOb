import type { PrizeStructure, TopPlacesDistribution, TopPlacesMode } from '@/lib/types';

export type FormatFamily = 'consistency' | 'points';

export type ConsistencyPayoutId = 'even_split_remaining' | 'last_standing';
export type PointsPayoutId = 'winner_take_all' | 'top_count' | 'top_percent' | 'scaled';
export type PayoutControlId = ConsistencyPayoutId | PointsPayoutId;

export type PayoutPair = {
  prize_structure: PrizeStructure;
  payout_mode: 'even_split_remaining' | 'winner_take_all' | 'top_places';
  top_places_mode: TopPlacesMode;
  top_places_value: string;
  top_places_distribution: TopPlacesDistribution;
};

export type PayoutOption = {
  id: PayoutControlId;
  label: string;
  helper: string;
};

const CONSISTENCY_OPTIONS: PayoutOption[] = [
  {
    id: 'even_split_remaining',
    label: 'Even split remaining',
    helper: 'Everyone still in at the end splits the prize evenly.',
  },
  {
    id: 'last_standing',
    label: 'Last standing',
    helper: 'The last person still in takes the prize.',
  },
];

const POINTS_OPTIONS: PayoutOption[] = [
  {
    id: 'winner_take_all',
    label: 'Winner take all',
    helper: 'First place takes the entire prize.',
  },
  {
    id: 'top_count',
    label: 'Top #',
    helper: 'The top number of finishers split the prize evenly.',
  },
  {
    id: 'top_percent',
    label: 'Top %',
    helper: 'The top percent of finishers split the prize evenly.',
  },
  {
    id: 'scaled',
    label: 'Scaled among those places',
    helper: 'Those places share the prize with 1st earning the most.',
  },
];

export function formatFamilyOf(input: {
  format?: string | null;
  challenge_type?: string | null;
  duration_type?: string | null;
  scoring?: string | null;
}): FormatFamily {
  if (input.duration_type === 'unlimited' || input.format === 'lms') {
    return 'consistency';
  }
  const key = String(input.format ?? input.challenge_type ?? input.scoring ?? 'consistency').toLowerCase();
  if (key === 'points' || key === 'cumulative') {
    return 'points';
  }
  return 'consistency';
}

export function payoutOptionsForFamily(family: FormatFamily): PayoutOption[] {
  return family === 'points' ? POINTS_OPTIONS : CONSISTENCY_OPTIONS;
}

export function defaultPayoutIdForFamily(family: FormatFamily): PayoutControlId {
  return family === 'points' ? 'winner_take_all' : 'even_split_remaining';
}

function defaultTopValue(id: PayoutControlId): string {
  if (id === 'top_percent') {
    return '25';
  }
  return '3';
}

export function pairFromPayoutControl(
  id: PayoutControlId,
  current?: Partial<PayoutPair>,
): PayoutPair {
  const value = current?.top_places_value?.trim() || defaultTopValue(id);
  if (id === 'even_split_remaining') {
    return {
      prize_structure: 'equal_split',
      payout_mode: 'even_split_remaining',
      top_places_mode: current?.top_places_mode ?? 'count',
      top_places_value: value,
      top_places_distribution: current?.top_places_distribution ?? 'even',
    };
  }
  if (id === 'last_standing' || id === 'winner_take_all') {
    return {
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
      top_places_mode: current?.top_places_mode ?? 'count',
      top_places_value: value,
      top_places_distribution: current?.top_places_distribution ?? 'even',
    };
  }
  if (id === 'top_percent') {
    return {
      prize_structure: 'top_places',
      payout_mode: 'top_places',
      top_places_mode: 'percent',
      top_places_value: current?.top_places_mode === 'percent' ? value : '25',
      top_places_distribution: 'even',
    };
  }
  if (id === 'scaled') {
    return {
      prize_structure: 'top_places',
      payout_mode: 'top_places',
      top_places_mode: current?.top_places_mode === 'percent' ? 'percent' : 'count',
      top_places_value: value,
      top_places_distribution: 'scaled',
    };
  }
  return {
    prize_structure: 'top_places',
    payout_mode: 'top_places',
    top_places_mode: 'count',
    top_places_value: current?.top_places_mode === 'count' ? value : '3',
    top_places_distribution: 'even',
  };
}

export function defaultPayoutPairForFamily(family: FormatFamily): PayoutPair {
  return pairFromPayoutControl(defaultPayoutIdForFamily(family));
}

export function payoutControlFromPair(
  family: FormatFamily,
  input: {
    prize_structure?: string | null;
    payout_mode?: string | null;
    top_places_mode?: string | null;
    top_places_distribution?: string | null;
  },
): PayoutControlId {
  const structure = String(input.prize_structure ?? '').toLowerCase();
  const payout = String(input.payout_mode ?? '').toLowerCase();
  if (family === 'consistency') {
    if (structure === 'winner_take_all' || payout === 'winner_take_all') {
      return 'last_standing';
    }
    return 'even_split_remaining';
  }
  if (structure === 'top_places' || payout === 'top_places') {
    if (String(input.top_places_distribution ?? '') === 'scaled') {
      return 'scaled';
    }
    if (String(input.top_places_mode ?? '') === 'percent') {
      return 'top_percent';
    }
    return 'top_count';
  }
  if (structure === 'equal_split' || payout === 'even_split_remaining') {
    return 'winner_take_all';
  }
  return 'winner_take_all';
}

export function isIllegalFormatPayoutPair(input: {
  format?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
}): boolean {
  const family = formatFamilyOf(input);
  const structure = String(input.prize_structure ?? '').toLowerCase();
  const payout = String(input.payout_mode ?? '').toLowerCase();
  if (family === 'consistency' && structure === 'top_places') {
    return true;
  }
  if (family === 'points' && payout === 'even_split_remaining') {
    return true;
  }
  return false;
}

export function durationIntegerForPublish(days: number | null | undefined): number {
  return Math.max(Math.floor(Number(days) || 0) || 1, 1);
}

export function publishPayoutFields(values: {
  format?: string | null;
  challenge_type?: string | null;
  duration_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
  top_places_mode?: string | null;
  top_places_value?: string | number | null;
  top_places_distribution?: string | null;
}): PayoutPair {
  const family = formatFamilyOf(values);
  const pair = pairFromPayoutControl(
    payoutControlFromPair(family, values),
    {
      prize_structure: values.prize_structure as PayoutPair['prize_structure'],
      payout_mode: values.payout_mode as PayoutPair['payout_mode'],
      top_places_mode: values.top_places_mode as PayoutPair['top_places_mode'],
      top_places_value: values.top_places_value != null ? String(values.top_places_value) : undefined,
      top_places_distribution: values.top_places_distribution as PayoutPair['top_places_distribution'],
    },
  );
  if (
    isIllegalFormatPayoutPair({
      format: values.format,
      challenge_type: values.challenge_type,
      prize_structure: pair.prize_structure,
      payout_mode: pair.payout_mode,
    })
  ) {
    if (family === 'consistency') {
      throw new Error('Consistency challenges can’t use Top #, Top %, or Scaled. Pick Even split remaining or Last standing.');
    }
    throw new Error('Points and cumulative challenges can’t use Even split remaining. Pick Winner take all or top places.');
  }
  return pair;
}
