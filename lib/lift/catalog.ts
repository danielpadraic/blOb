import { OFFICIAL_EXERCISE_SEEDS, type ExerciseSeed } from '@/lib/lift/catalogData';
import { isMuscleKey, type MuscleKey } from '@/lib/lift/muscles';

/**
 * Catalog lookup and typeahead.
 *
 * The official list ships with the app so search is instant and works offline on every platform.
 * The database holds the same rows (generated from `catalogData.ts`) because session rows reference
 * them, and a user's private customs come from `lift_custom_exercises`.
 */

export type ExerciseOption = {
  /** Slug for official rows, uuid for a user's own custom. */
  id: string;
  name: string;
  muscle: MuscleKey;
  secondaries: MuscleKey[];
  /** Search-only spellings. Never shown. */
  aliases: string[];
  official: boolean;
};

/**
 * Gym shorthand, both directions, so "db press" and "dumbbell press" find the same row.
 * Keys and values are normalised tokens.
 */
const TOKEN_ALIASES: Record<string, string> = {
  bb: 'barbell',
  db: 'dumbbell',
  sm: 'smith',
  kb: 'kettlebell',
};

const EXPANDED_TO_SHORT: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_ALIASES).map(([short, long]) => [long, short]),
);

/** Whole-name shorthand people actually type. */
const PHRASE_ALIASES: Array<[RegExp, string]> = [
  [/\boverhead press\b/g, 'ohp'],
  [/\bromanian deadlift\b/g, 'rdl'],
  [/\bstiff leg deadlift\b/g, 'sldl'],
  [/\bbulgarian split squat\b/g, 'bss'],
  [/\bglute ham raise\b/g, 'ghr'],
  [/\bgood morning\b/g, 'gm'],
  [/\bbench press\b/g, 'bench'],
  [/\blat pulldown\b/g, 'pulldown'],
  [/\bpull up\b/g, 'pullup'],
  [/\bchin up\b/g, 'chinup'],
  [/\bpush up\b/g, 'pushup'],
  [/\bstep up\b/g, 'stepup'],
  [/\bsit up\b/g, 'situp'],
  [/\bhip thrust\b/g, 'thrust'],
  [/\brear delt\b/g, 'reardelt'],
  [/\bskull crusher\b/g, 'skullcrusher'],
];

/** Lowercase, strip punctuation, collapse whitespace. Everything compares in this space. */
export function normalizeExerciseText(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function exerciseSlug(name: string): string {
  return normalizeExerciseText(name).replace(/ /g, '-');
}

function swapTokens(normalized: string, table: Record<string, string>): string | null {
  let changed = false;
  const swapped = normalized
    .split(' ')
    .map((token) => {
      const next = table[token];
      if (next) {
        changed = true;
        return next;
      }
      return token;
    })
    .join(' ');
  return changed ? swapped : null;
}

/** Search spellings for a name: expanded shorthand, collapsed shorthand, and phrase acronyms. */
export function buildAliases(name: string): string[] {
  const base = normalizeExerciseText(name);
  const out = new Set<string>();
  const expanded = swapTokens(base, TOKEN_ALIASES);
  const shortened = swapTokens(base, EXPANDED_TO_SHORT);
  if (expanded) {
    out.add(expanded);
  }
  if (shortened) {
    out.add(shortened);
  }
  for (const candidate of [base, expanded, shortened].filter(Boolean) as string[]) {
    for (const [pattern, replacement] of PHRASE_ALIASES) {
      pattern.lastIndex = 0;
      if (pattern.test(candidate)) {
        pattern.lastIndex = 0;
        out.add(candidate.replace(pattern, replacement).replace(/\s+/g, ' ').trim());
      }
    }
  }
  out.delete(base);
  return [...out].filter(Boolean);
}

function toOption(seed: ExerciseSeed): ExerciseOption {
  return {
    id: exerciseSlug(seed.name),
    name: seed.name,
    muscle: seed.muscle,
    secondaries: seed.secondaries,
    aliases: buildAliases(seed.name),
    official: true,
  };
}

export const OFFICIAL_EXERCISES: readonly ExerciseOption[] = OFFICIAL_EXERCISE_SEEDS.map(toOption);

const BY_ID = new Map(OFFICIAL_EXERCISES.map((row) => [row.id, row]));

export function officialExercise(id: string): ExerciseOption | null {
  return BY_ID.get(String(id ?? '')) ?? null;
}

export function officialCatalogSize(): number {
  return OFFICIAL_EXERCISES.length;
}

/** Count per primary muscle. Used by the catalog test and the PR note. */
export function officialCatalogCounts(): Record<MuscleKey, number> {
  const counts = {} as Record<MuscleKey, number>;
  for (const row of OFFICIAL_EXERCISES) {
    counts[row.muscle] = (counts[row.muscle] ?? 0) + 1;
  }
  return counts;
}

/** An exercise belongs to a muscle if it is the primary or one of the tagged secondaries. */
export function touchesMuscle(option: ExerciseOption, muscle: MuscleKey): boolean {
  return option.muscle === muscle || option.secondaries.includes(muscle);
}

function haystacks(option: ExerciseOption): string[] {
  return [normalizeExerciseText(option.name), ...option.aliases];
}

/** Word-boundary prefix match, so "bench" hits "Flat BB Bench Press" but "ench" does not. */
function hasTokenPrefix(haystack: string, token: string): boolean {
  if (haystack.startsWith(token)) {
    return true;
  }
  return haystack.includes(` ${token}`);
}

function scoreOption(option: ExerciseOption, tokens: string[], query: string): number {
  const texts = haystacks(option);
  for (const token of tokens) {
    if (!texts.some((text) => hasTokenPrefix(text, token))) {
      return -1;
    }
  }
  const name = texts[0];
  let score = 100;
  if (name === query) {
    score += 400;
  } else if (name.startsWith(query)) {
    score += 220;
  } else if (hasTokenPrefix(name, tokens[0] ?? '')) {
    score += 90;
  }
  if (option.official) {
    score += 10;
  }
  // Shorter names are the plainer movement; "Back Squat" should beat "Banded Back Squat".
  score -= Math.min(name.length, 60) / 4;
  return score;
}

export type ExerciseSearchInput = {
  query: string;
  /** Selected muscles for the session. Empty means no filter. */
  muscles?: readonly MuscleKey[];
  /** The signed-in user's private exercises. */
  customs?: readonly ExerciseOption[];
  limit?: number;
};

/**
 * Typeahead over official rows intersected with the selected muscles, plus the owner's customs.
 * One character is enough — this suggests as they type.
 */
export function searchExercises({
  query,
  muscles = [],
  customs = [],
  limit = 40,
}: ExerciseSearchInput): ExerciseOption[] {
  const normalized = normalizeExerciseText(query);
  const tokens = normalized.split(' ').filter(Boolean);
  const wanted = muscles.filter(isMuscleKey);
  const pool = [...customs, ...OFFICIAL_EXERCISES].filter(
    (option) => wanted.length === 0 || wanted.some((muscle) => touchesMuscle(option, muscle)),
  );

  if (tokens.length === 0) {
    // No query yet: show the plainest movements for the muscles they picked, primary first.
    return pool
      .filter((option) => wanted.length === 0 || wanted.includes(option.muscle))
      .slice()
      .sort((a, b) => Number(b.official) - Number(a.official) || a.name.length - b.name.length)
      .slice(0, limit);
  }

  const scored: Array<{ option: ExerciseOption; score: number }> = [];
  for (const option of pool) {
    const score = scoreOption(option, tokens, normalized);
    if (score >= 0) {
      scored.push({ option, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name));
  return scored.slice(0, limit).map((row) => row.option);
}

/** True when the typed name already exists, so we do not offer to create a duplicate custom. */
export function exerciseNameTaken(
  query: string,
  customs: readonly ExerciseOption[] = [],
): boolean {
  const normalized = normalizeExerciseText(query);
  if (!normalized) {
    return true;
  }
  return (
    OFFICIAL_EXERCISES.some((row) => normalizeExerciseText(row.name) === normalized) ||
    customs.some((row) => normalizeExerciseText(row.name) === normalized)
  );
}
