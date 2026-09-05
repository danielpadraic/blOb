import { supabase } from '@/lib/supabase';

export const POSTS_CORE_COLUMNS =
  'id, author_id, challenge_id, content, media_urls, created_at';

/** Default posts select. Quote / deleted_at are added only if a limit-0 probe succeeds. */
export const POSTS_FEED_SELECT =
  'id, author_id, challenge_id, content, media_urls, audience, audience_user_ids, created_at, edited_at, hidden_media_urls, hidden_from_home';

export type PostsSchema = {
  select: string;
  hasAudience: boolean;
  hasModeration: boolean;
  hasQuote: boolean;
  hasDeletedAt: boolean;
  hasWall: boolean;
  hasCheckin: boolean;
  hasSource: boolean;
  hasHiddenFromHome: boolean;
  hasType: boolean;
  hasDuration: boolean;
  hasHiddenFromRail: boolean;
  hasParentId: boolean;
  hasCircleId: boolean;
  hasMediaCaptions: boolean;
  hasLiftSession: boolean;
};

const CORE_SCHEMA: PostsSchema = {
  select: POSTS_CORE_COLUMNS,
  hasAudience: false,
  hasModeration: false,
  hasQuote: false,
  hasDeletedAt: false,
  hasWall: false,
  hasCheckin: false,
  hasSource: false,
  hasHiddenFromHome: false,
  hasType: false,
  hasDuration: false,
  hasHiddenFromRail: false,
  hasParentId: false,
  hasCircleId: false,
  hasMediaCaptions: false,
  hasLiftSession: false,
};

let cached: Promise<PostsSchema> | null = null;
let latest: PostsSchema | null = null;

function schemaFromSelect(select: string): PostsSchema {
  return {
    select,
    hasAudience: select.includes('audience'),
    hasModeration: select.includes('moderation_status'),
    hasQuote: select.includes('quoted_post_id'),
    hasDeletedAt: select.includes('deleted_at'),
    hasWall: select.includes('wall_host_id'),
    hasCheckin: select.includes('checkin_id'),
    hasSource: /(^|,\s*)source(,|$)/.test(select),
    hasHiddenFromHome: select.includes('hidden_from_home'),
    hasType: /(^|,\s*)type(,|$)/.test(select),
    hasDuration: select.includes('duration_ms'),
    hasHiddenFromRail: select.includes('hidden_from_rail'),
    hasParentId: select.includes('parent_id'),
    hasCircleId: select.includes('circle_id'),
    hasMediaCaptions: select.includes('media_captions'),
    hasLiftSession: select.includes('lift_session_id'),
  };
}

function isMissingColumnError(message: string, column: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes(column.toLowerCase()) &&
    (text.includes('does not exist') ||
      text.includes('schema cache') ||
      text.includes('42703') ||
      text.includes('pgrst204'))
  );
}

export function selectWithoutCircleId(select: string): string {
  return select
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== 'circle_id')
    .join(', ');
}

export function isMissingCircleIdColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) {
    return false;
  }
  const message = String(error.message ?? '');
  const code = String(error.code ?? '');
  return isMissingColumnError(`${code} ${message}`, 'circle_id');
}

/** After a live select 400s on circle_id, later queries must not keep asking for it. */
export function dropCachedCircleId(): PostsSchema | null {
  if (!latest?.hasCircleId) {
    return latest;
  }
  latest = schemaFromSelect(selectWithoutCircleId(latest.select));
  cached = Promise.resolve(latest);
  return latest;
}

async function trySelect(select: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('posts').select(select).limit(0);
  if (!error) {
    return { ok: true };
  }
  return { ok: false, message: error.message };
}

async function loadPostsSchema(): Promise<PostsSchema> {
  const audience = await trySelect(POSTS_FEED_SELECT);
  let select = POSTS_FEED_SELECT;
  if (!audience.ok) {
    if (audience.message && isMissingColumnError(audience.message, 'audience')) {
      select = POSTS_CORE_COLUMNS;
    } else {
      const core = await trySelect(POSTS_CORE_COLUMNS);
      select = core.ok ? POSTS_CORE_COLUMNS : POSTS_CORE_COLUMNS;
    }
    const retry = await trySelect(select);
    if (!retry.ok) {
      return CORE_SCHEMA;
    }
  }

  const withQuote = `${select}, quoted_post_id, quote_snapshot, deleted_at`;
  const extra = await trySelect(withQuote);
  let working = extra.ok ? withQuote : select;
  const withWall = `${working}, wall_host_id, wall_removed_at`;
  const wall = await trySelect(withWall);
  working = wall.ok ? withWall : working;
  const withCheckin = `${working}, checkin_id, checkin_stage`;
  const checkin = await trySelect(withCheckin);
  working = checkin.ok ? withCheckin : working;
  const withSource = `${working}, source`;
  const source = await trySelect(withSource);
  working = source.ok ? withSource : working;
  const withPlace = `${working}, location_name`;
  const place = await trySelect(withPlace);
  working = place.ok ? withPlace : working;
  const withEdits = `${working}, edited_at, hidden_media_urls`;
  const edits = await trySelect(withEdits);
  working = edits.ok ? withEdits : working;
  const withHomeHide = `${working}, hidden_from_home`;
  const homeHide = await trySelect(withHomeHide);
  working = homeHide.ok ? withHomeHide : working;
  const withClip = `${working}, type, duration_ms, overlays, hidden_from_rail`;
  const clip = await trySelect(withClip);
  working = clip.ok ? withClip : working;
  const withParent = `${working}, parent_id`;
  const parent = await trySelect(withParent);
  working = parent.ok ? withParent : working;
  const withCircle = `${working}, circle_id`;
  const circle = await trySelect(withCircle);
  working = circle.ok ? withCircle : working;
  const withCaptions = `${working}, media_captions`;
  const captions = await trySelect(withCaptions);
  working = captions.ok ? withCaptions : working;
  const withStats = `${working}, checkin_stats`;
  const stats = await trySelect(withStats);
  working = stats.ok ? withStats : working;
  const withLift = `${working}, lift_session_id`;
  const lift = await trySelect(withLift);
  return schemaFromSelect(lift.ok ? withLift : working);
}

/** No RPC. Probe with limit 0, then cache the working select list. */
export function resolvePostsSchema(): Promise<PostsSchema> {
  if (!cached) {
    cached = loadPostsSchema().then((schema) => {
      latest = schema;
      return schema;
    });
  }
  return cached;
}

export function resetPostsSchemaCache() {
  cached = null;
  latest = null;
}
