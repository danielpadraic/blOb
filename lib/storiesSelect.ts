import { supabase } from '@/lib/supabase';

/** Columns that exist on live stories today. Probe extras before adding them. */
export const STORIES_CORE_COLUMNS =
  'id, user_id, media_url, media_type, challenge_id, caption, expires_at, created_at';

export const STORIES_OPTIONAL_COLUMNS = [
  'sequence_id',
  'sequence_index',
  'clip_start_ms',
  'clip_duration_ms',
  'thumbnail_url',
  'post_id',
] as const;

export type StoriesOptionalColumn = (typeof STORIES_OPTIONAL_COLUMNS)[number];

export type StoriesSchema = {
  select: string;
  hasSequenceId: boolean;
  hasSequenceIndex: boolean;
  hasClipStartMs: boolean;
  hasClipDurationMs: boolean;
  hasThumbnailUrl: boolean;
  hasPostId: boolean;
};

const CORE_SCHEMA: StoriesSchema = schemaFromSelect(STORIES_CORE_COLUMNS);

let cached: Promise<StoriesSchema> | null = null;
let latest: StoriesSchema | null = null;

export function schemaFromSelect(select: string): StoriesSchema {
  const parts = new Set(
    select
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return {
    select: [...parts].join(', '),
    hasSequenceId: parts.has('sequence_id'),
    hasSequenceIndex: parts.has('sequence_index'),
    hasClipStartMs: parts.has('clip_start_ms'),
    hasClipDurationMs: parts.has('clip_duration_ms'),
    hasThumbnailUrl: parts.has('thumbnail_url'),
    hasPostId: parts.has('post_id'),
  };
}

export function selectWithoutStoriesColumn(select: string, column: string): string {
  return select
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== column)
    .join(', ');
}

function isMissingColumnError(message: string, column: string): boolean {
  const text = message.toLowerCase();
  const name = column.toLowerCase();
  return (
    text.includes(name) &&
    (text.includes('does not exist') ||
      text.includes('schema cache') ||
      text.includes('42703') ||
      text.includes('pgrst204'))
  );
}

export function missingStoriesColumn(error: {
  message?: string;
  code?: string;
} | null | undefined): StoriesOptionalColumn | null {
  if (!error) {
    return null;
  }
  const blob = `${error.code ?? ''} ${error.message ?? ''}`;
  for (const column of STORIES_OPTIONAL_COLUMNS) {
    if (isMissingColumnError(blob, column)) {
      return column;
    }
  }
  return null;
}

function logSkippedColumn(name: string) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[blob:stories] skipped column', name);
  }
}

export function dropCachedStoriesColumn(column: string): StoriesSchema {
  const current = latest ?? CORE_SCHEMA;
  latest = schemaFromSelect(selectWithoutStoriesColumn(current.select, column));
  cached = Promise.resolve(latest);
  return latest;
}

async function trySelect(select: string): Promise<{ ok: boolean; message?: string; code?: string }> {
  const { error } = await supabase.from('stories').select(select).limit(0);
  if (!error) {
    return { ok: true };
  }
  return { ok: false, message: error.message, code: error.code };
}

async function loadStoriesSchema(): Promise<StoriesSchema> {
  const core = await trySelect(STORIES_CORE_COLUMNS);
  let working = STORIES_CORE_COLUMNS;
  if (!core.ok) {
    return CORE_SCHEMA;
  }
  for (const column of STORIES_OPTIONAL_COLUMNS) {
    const next = `${working}, ${column}`;
    const probe = await trySelect(next);
    if (probe.ok) {
      working = next;
      continue;
    }
    logSkippedColumn(column);
  }
  return schemaFromSelect(working);
}

export function resolveStoriesSelect(): Promise<StoriesSchema> {
  if (!cached) {
    cached = loadStoriesSchema().then((schema) => {
      latest = schema;
      return schema;
    });
  }
  return cached;
}

export function peekStoriesSelect(): StoriesSchema | null {
  return latest;
}

export function resetStoriesSelectCache() {
  cached = null;
  latest = null;
}
