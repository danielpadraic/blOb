import { copy } from '@/lib/copy';
import { dmOpenUserMessage } from '@/lib/dmOpen';
import { GOOGLE_NOT_CONFIGURED, isGoogleClientConfigError } from '@/lib/googleSignInConfig';

const CHECKIN_SUBMIT_FAIL = 'Couldn’t submit this check-in. Try again.';

function isDevBuild(): boolean {
  return Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
}

export function getErrorMessage(error: unknown): string {
  const raw = extractRawMessage(error);
  return humanize(raw);
}

export function getDmOpenMessage(error: unknown): string {
  return dmOpenUserMessage(extractRawMessage(error) || getErrorMessage(error));
}

export function getStartUpdateMessage(error: unknown): string {
  logPostgrestError('start-roll', error);
  const raw = extractRawMessage(error).toLowerCase();
  if (raw.includes('duration_too_short') || raw.includes('duration has to stay')) {
    return 'Duration has to stay at least 1 day.';
  }
  return copy('error.startUpdate');
}

export function getCancelChallengeMessage(error: unknown): string {
  logPostgrestError('cancel-challenge', error);
  return copy('error.cancelChallenge');
}

export function getLeaveChallengeMessage(error: unknown): string {
  logPostgrestError('leave-challenge', error);
  return copy('error.leaveChallenge');
}

export function getInviteErrorMessage(error: unknown): string {
  logPostgrestError('invite-to-challenge', error);
  const raw = extractRawMessage(error);
  const text = getErrorMessage(error);
  const blob = `${text} ${raw}`.toLowerCase();
  if (blob.includes('already invited')) {
    return 'You already invited them.';
  }
  if (blob.includes('already in this challenge')) {
    return 'They’re already in this challenge.';
  }
  if (blob.includes('only the host can invite')) {
    return 'Only the host can invite people.';
  }
  if (blob.includes('can’t invite yourself') || blob.includes('cannot invite yourself')) {
    return 'You can’t invite yourself.';
  }
  if (blob.includes('add a friend first') || blob.includes('are_accepted_friends')) {
    return 'Add a friend first';
  }
  if (blob.includes('pick someone to invite')) {
    return 'Pick someone to invite.';
  }
  if (blob.includes('challenge not found')) {
    return 'This challenge could not be found.';
  }
  if (blob.includes('isn’t on the map') || blob.includes('isnt on the map')) {
    return 'That person isn’t on the map.';
  }
  if (
    /couldn.?t complete that just now|something went sideways/i.test(text) ||
    /42883|pgrst202|profile_display_name|could not find the function|no function matches/i.test(blob)
  ) {
    const code =
      error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
        ? String((error as { code: string }).code)
        : '';
    if (isDevBuild() && (code || raw)) {
      return `Couldn’t send that invite. ${code || raw}`.trim();
    }
    return 'Couldn’t send that invite. The host can invite friends to this challenge — try again.';
  }
  return text || 'Couldn’t send that invite.';
}

/** Invitee accept / decline / token errors. Never raw Postgres. */
export function getInviteAcceptMessage(error: unknown): string {
  logPostgrestError('accept-challenge-invite', error);
  const raw = extractRawMessage(error);
  const text = getErrorMessage(error);
  const blob = `${text} ${raw}`.toLowerCase();
  if (blob.includes('expired')) {
    return 'This invite has expired.';
  }
  if (blob.includes('invite_revoked') || blob.includes('invite is no longer valid') || /\brevoked\b/.test(blob)) {
    return 'That invite is no longer valid.';
  }
  if (
    blob.includes('already_joined') ||
    blob.includes('already_accepted') ||
    blob.includes('already in this challenge') ||
    blob.includes('already in')
  ) {
    return 'You’re already in this challenge.';
  }
  if (blob.includes('not_invited') || blob.includes('not invited')) {
    return 'This challenge is private. Ask the host for an invite.';
  }
  if (blob.includes('invite_used') || blob.includes('already used')) {
    return 'That invite was already used.';
  }
  if (
    blob.includes('invite_not_found') ||
    blob.includes('invite link is not valid') ||
    blob.includes('invalid link') ||
    blob.includes('missing an invite token')
  ) {
    return 'That invite link is not valid.';
  }
  if (/postgres|pgrst|sqlstate|p0001|42883|22p02/i.test(blob) || !text) {
    return 'That invite link is not valid.';
  }
  return text;
}

export function getJoinChallengeMessage(error: unknown): string {
  logPostgrestError('join-challenge', error);
  const text = getErrorMessage(error);
  const raw = extractRawMessage(error);
  if (
    /42883|pgrst202|could not find the function|no function matches|user_can_access_challenge/i.test(
      `${text} ${raw}`,
    )
  ) {
    return 'Couldn’t join. Try again.';
  }
  if (
    /42703|ref_type|pgrst204/i.test(text) ||
    isUnknownColumnError(error)
  ) {
    return 'Couldn’t complete that just now. Try again.';
  }
  return text;
}

export function logPostgrestError(scope: string, error: unknown) {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  console.log(`[blob:${scope}]`, {
    code: record?.code ?? null,
    message: record?.message ?? (error instanceof Error ? error.message : String(error ?? '')),
    details: record?.details ?? null,
    hint: record?.hint ?? null,
  });
}

/** Confirm / Submit: never render Postgres or PostgREST. Logs the code. */
export function getCheckinSubmitMessage(error: unknown): string {
  logPostgrestError('checkin-submit', error);
  const raw = extractRawMessage(error).toLowerCase();
  if (raw.includes('already_logged_today') || raw.includes('already checked in') || raw.includes('already submitted')) {
    return 'Already checked in today. Come back tomorrow.';
  }
  if (raw.includes('missing_proofs') || raw.includes('required proof')) {
    return 'Add every required proof to submit.';
  }
  if (raw.includes('not_participant') || raw.includes('join this challenge')) {
    return 'Join this challenge before you check in.';
  }
  if (raw.includes('begin check-in first')) {
    return 'Begin check-in first.';
  }
  if (raw.includes('not_started') || raw.includes('hasn’t started') || raw.includes('hasnt started')) {
    return 'This challenge hasn’t started yet.';
  }
  if (raw.includes('logging is closed') || raw.includes('check-in is closed')) {
    return 'Check-in is closed for this challenge.';
  }
  if (raw.includes('eliminated from this challenge')) {
    return 'You have been eliminated from this challenge.';
  }
  if (raw.includes('not authenticated') || raw.includes('sign in')) {
    return 'You need to be signed in.';
  }
  return CHECKIN_SUBMIT_FAIL;
}

const CREATE_RPC_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Sign in to continue.',
  TITLE_REQUIRED: 'Give the challenge a title before you publish.',
  INVALID_CURRENCY: 'Pick Blob Coins or $.',
  MAX_PARTICIPANTS_MIN_1: 'Max competitors must be at least 1.',
  LMS_REQUIRES_CONSISTENCY: 'Last Man Standing only works with a consistency challenge.',
  FULL_LOBBY_REQUIRES_MAX: 'A full-lobby start needs a max number of competitors.',
  PROFILE_NOT_FOUND: 'Finish setting up your profile first.',
  NEGATIVE_AMOUNT: 'Amounts can’t be negative.',
  INSUFFICIENT_FUNDS: 'Not enough Coins/$ to fund this prize.',
  START_IN_PAST: 'Start time has to be in the future.',
  OFFICIAL_NOT_ALLOWED: 'Official competitions are hosted by blOb.',
  PRIVATE_NO_PLAYER_BUY_IN: 'Private challenges can’t charge competitors an entry fee for the prize.',
};

export function getCreateChallengeMessage(error: unknown): string {
  logPostgrestError('create', error);
  const raw = extractRawMessage(error);
  if (raw.startsWith('Couldn’t create this challenge')) {
    return raw;
  }
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (CREATE_RPC_MESSAGES[trimmed]) {
    return CREATE_RPC_MESSAGES[trimmed];
  }
  for (const [key, label] of Object.entries(CREATE_RPC_MESSAGES)) {
    if (upper.includes(key)) {
      return label;
    }
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('insufficient') ||
    lower.includes('not enough') ||
    (lower.includes('you need') && (lower.includes('fund') || lower.includes('wallet')))
  ) {
    return trimmed;
  }
  if (
    lower.includes('start_in_past') ||
    (lower.includes('start') && (lower.includes('future') || lower.includes('past')))
  ) {
    return 'Start time has to be in the future.';
  }
  if (
    lower.includes('42501') ||
    lower.includes('row-level security') ||
    lower.includes('rls') ||
    (lower.includes('permission denied') && lower.includes('challenges'))
  ) {
    return 'Couldn’t create this challenge. You don’t have permission.';
  }
  if (!trimmed) {
    return 'Couldn’t create this challenge. Try again.';
  }
  return `Couldn’t create this challenge. ${trimmed}`;
}

/** Missing column / schema-cache miss (PGRST204, 42703). */
export function isUnknownColumnError(error: unknown): boolean {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const code = String(record?.code ?? '').toUpperCase();
  const raw = extractRawMessage(error).toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    raw.includes('pgrst204') ||
    (raw.includes('schema cache') && raw.includes('column')) ||
    (raw.includes('could not find the') && raw.includes('column'))
  );
}

/** Missing table / schema-cache miss (PGRST205, 42P01, 404). Safe to treat as empty. */
export function isMissingRelationError(error: unknown): boolean {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const code = String(record?.code ?? '').toUpperCase();
  const raw = extractRawMessage(error).toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    raw.includes('pgrst205') ||
    raw.includes('42p01') ||
    raw.includes('schema cache') ||
    raw.includes('does not exist') ||
    raw.includes('could not find the table') ||
    (raw.includes('404') && (raw.includes('invites') || raw.includes('relation')))
  );
}

function extractRawMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '';
}

function extractAuthCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const record = error as Record<string, unknown>;
  if (typeof record.code === 'string') {
    return record.code.toLowerCase();
  }
  const nested = record.error;
  if (nested && typeof nested === 'object' && typeof (nested as { code?: unknown }).code === 'string') {
    return String((nested as { code: string }).code).toLowerCase();
  }
  return '';
}

function passwordReasons(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const record = error as Record<string, unknown>;
  const weak = record.weak_password;
  if (weak && typeof weak === 'object') {
    const reasons = (weak as { reasons?: unknown }).reasons;
    if (Array.isArray(reasons)) {
      return reasons.map((item) => String(item).toLowerCase()).join(' ');
    }
  }
  return '';
}

function extractAuthUserMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message.trim() : '';
  }
  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return '';
}

/** Auth password-update errors. Logs the Auth payload and prefers the real message. */
export function getPasswordUpdateMessage(error: unknown): string {
  logPostgrestError('password-update', error);
  if (error instanceof Error && error.message === 'timeout') {
    return copy('error.passwordUpdate');
  }

  const code = extractAuthCode(error);
  const authMessage = extractAuthUserMessage(error);
  const message = `${authMessage} ${extractRawMessage(error)} ${passwordReasons(error)}`.toLowerCase();

  if (
    code === 'weak_password' ||
    message.includes('weak_password') ||
    message.includes('character of each') ||
    (message.includes('password') &&
      (message.includes('lowercase') ||
        message.includes('uppercase') ||
        message.includes('symbol')) &&
      message.includes('character'))
  ) {
    return copy('error.passwordWeak');
  }
  if (
    message.includes('same as') ||
    message.includes('same password') ||
    message.includes('different from the old') ||
    message.includes('should be different') ||
    (message.includes('password') && message.includes('identical'))
  ) {
    return copy('error.passwordSame');
  }
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    code === 'unauthenticated' ||
    code === 'reauthentication_needed' ||
    message.includes('reauthentication') ||
    message.includes('re-auth') ||
    message.includes('recent login') ||
    message.includes('session from the past') ||
    message.includes('not authenticated') ||
    message.includes('auth session missing') ||
    message.includes('session missing') ||
    message.includes('should be authenticated') ||
    (message.includes('session') && (message.includes('expired') || message.includes('invalid')))
  ) {
    return copy('error.passwordSession');
  }
  if (authMessage && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(authMessage) && authMessage.length <= 280) {
    return authMessage;
  }
  return authMessage ? `${copy('error.passwordUpdate')} ${authMessage}` : copy('error.passwordUpdate');
}

function isNetworkAuthError(blob: string): boolean {
  return (
    blob.includes('load failed') ||
    blob.includes('failed to fetch') ||
    blob.includes('networkrequestfailed') ||
    blob.includes('network request failed') ||
    blob.includes('network error') ||
    blob.includes('typeerror')
  );
}

function leaksAuthCode(text: string): boolean {
  return /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/.test(text);
}

/** Register / login. Never returns a Supabase Auth code. */
export function getAuthFormMessage(error: unknown): string {
  logPostgrestError('auth', error);
  const code = extractAuthCode(error);
  const raw = extractRawMessage(error);
  const blob = `${code} ${raw}`.toLowerCase();

  if (
    code === 'over_email_send_rate_limit' ||
    blob.includes('over_email_send_rate_limit') ||
    (blob.includes('email') && blob.includes('rate') && blob.includes('limit'))
  ) {
    return copy('auth.waitRetry');
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    blob.includes('user_already_exists') ||
    blob.includes('already registered') ||
    blob.includes('user already') ||
    blob.includes('email already')
  ) {
    return copy('auth.emailExists');
  }
  if (
    code === 'weak_password' ||
    blob.includes('weak_password') ||
    (blob.includes('password') &&
      (blob.includes('weak') ||
        blob.includes('character of each') ||
        (blob.includes('uppercase') && blob.includes('lowercase') && blob.includes('symbol')))) ||
    (blob.includes('password') && blob.includes('least'))
  ) {
    return copy('error.passwordWeak');
  }
  if (isNetworkAuthError(blob)) {
    return copy('auth.network');
  }
  if (blob.includes('play services')) {
    return GOOGLE_NOT_CONFIGURED;
  }
  if (blob.includes('did not return a sign-in token') || blob.includes('no idtoken')) {
    return 'Google did not return a sign-in token. Try again.';
  }
  if (isGoogleClientConfigError(`${code} ${raw}`)) {
    return GOOGLE_NOT_CONFIGURED;
  }

  const human = humanize(raw);
  if (!human || leaksAuthCode(human)) {
    return copy('auth.waitRetry');
  }
  return human;
}

function humanize(raw: string): string {
  const message = raw.toLowerCase();

  if (!raw) {
    return 'Something went sideways. Try again in a moment.';
  }
  if (
    message.includes('can’t message this person') ||
    message.includes("can't message this person") ||
    message.includes('dm_blocked') ||
    message.includes('direct_thread_is_blocked') ||
    message.includes('friendship_is_blocked')
  ) {
    return copy('messages.blocked');
  }
  if (message.includes('you can only message accepted friends')) {
    return copy('messages.openFailed');
  }
  if (message.includes('groups are for accepted friends')) {
    return 'Groups are for accepted friends.';
  }
  if (
    message.includes('42883') ||
    message.includes('pgrst202') ||
    message.includes('no function matches') ||
    (message.includes('could not find the function') && message.includes('join_challenge'))
  ) {
    return 'Couldn’t complete that just now. Try again.';
  }
  if (
    message.includes('42703') ||
    message.includes('ref_type') ||
    message.includes('pgrst204') ||
    (message.includes('schema cache') && message.includes('column')) ||
    (message.includes('could not find the') && message.includes('column'))
  ) {
    return 'Couldn’t complete that just now. Try again.';
  }
  if (
    message.includes('load failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkrequestfailed') ||
    message.includes('network request failed') ||
    message.includes('typeerror')
  ) {
    return 'We couldn’t reach blOb just now. Try again.';
  }
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'That email and password don’t match.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email, then come back to sign in.';
  }
  if (
    message.includes('over_email_send_rate_limit') ||
    (message.includes('email') && message.includes('rate') && message.includes('limit'))
  ) {
    return copy('auth.waitRetry');
  }
  if (message.includes('already registered') || message.includes('user already') || message.includes('user_already_exists')) {
    return copy('auth.emailExists');
  }
  if (
    message.includes('weak_password') ||
    (message.includes('password') &&
      (message.includes('weak') ||
        message.includes('character of each') ||
        message.includes('uppercase') ||
        message.includes('lowercase') && message.includes('symbol')))
  ) {
    return copy('error.passwordWeak');
  }
  if (message.includes('password') && message.includes('least')) {
    return copy('error.passwordWeak');
  }
  if (message.includes('invalid recipient') || message.includes('isn’t on the map') || message.includes('isnt on the map')) {
    return 'That person isn’t a valid recipient.';
  }
  if (message.includes('forbidden')) {
    return 'You can’t send to that person.';
  }
  if (message.includes('insufficient bucks')) {
    return 'Insufficient $';
  }
  if (message.includes('insufficient credits') || message.includes('enough coins') || message.includes('insufficient coins')) {
    return 'Insufficient Coins';
  }
  if (
    (message.includes('transfer_funds') ||
      message.includes('transfer_coins') ||
      message.includes('send_coins') ||
      message.includes('create_callout')) &&
    (message.includes('does not exist') || message.includes('could not find'))
  ) {
    return 'Wallet transfers aren’t set up on the server yet. Run the send-coins SQL.';
  }
  if (message.includes('send to yourself') || message.includes('can’t send to yourself') || message.includes('cannot send')) {
    if (message.includes('yourself')) {
      return 'You can’t send to yourself.';
    }
  }
  if (message.includes('send at least') || message.includes('stake at least')) {
    return message.includes('stake') ? 'Stake at least 0.01.' : 'Send at least 0.01.';
  }
  if (message.includes('10,000') || message.includes('10000')) {
    return 'Keep that amount at 10,000 or less.';
  }
  if (message.includes('pick someone to send')) {
    return 'Pick someone to send to.';
  }
  if (message.includes('pick someone else to call out') || message.includes('pick someone to call out')) {
    return 'Pick someone else to call out.';
  }
  if (message.includes('only the person who was called out can accept')) {
    return 'Only the person who was called out can accept.';
  }
  if (message.includes('no longer waiting for an accept')) {
    return 'This call-out is no longer waiting for an accept.';
  }
  if (message.includes('call-out expired') || message.includes('callout expired')) {
    return 'This call-out expired.';
  }
  if (message.includes('say what a win looks like')) {
    return 'Say what a win looks like.';
  }
  if (message.includes('set a deadline in the future')) {
    return 'Set a deadline in the future.';
  }
  if (message.includes('not your call-out') || message.includes('not your callout')) {
    return 'That’s not your call-out.';
  }
  if (message.includes('not open for a result')) {
    return 'This call-out is not open for a result.';
  }
  if (message.includes('pick one of the two people')) {
    return 'Pick one of the two people in this call-out.';
  }
  if (message.includes('already settled')) {
    if (message.includes('call-out') || message.includes('callout')) {
      return 'This call-out is already settled.';
    }
    return 'Already paid out.';
  }
  if (message.includes('call-out not found') || message.includes('callout not found')) {
    return 'Call-out not found.';
  }
  if (message.includes('not_invited') || message.includes('not invited')) {
    return 'This challenge is private. Ask the host for an invite.';
  }
  if (message.includes('invite_not_found') || message.includes('invite link is not valid')) {
    return 'That invite link is not valid.';
  }
  if (message.includes('invite_used') || message.includes('invite was already used')) {
    return 'That invite was already used.';
  }
  if (message.includes('invite_revoked')) {
    return 'That invite is no longer valid.';
  }
  if (message.includes('add a friend first')) {
    return 'Add a friend first';
  }
  if (message.includes('already invited')) {
    return 'You already invited them.';
  }
  if (message.includes('already in this challenge')) {
    return 'They’re already in this challenge.';
  }
  if (message.includes('only the host can invite')) {
    return 'Only the host can invite people.';
  }
  if (message.includes('can’t invite yourself') || message.includes('cannot invite yourself')) {
    return 'You can’t invite yourself.';
  }
  if (message.includes('pick someone to invite')) {
    return 'Pick someone to invite.';
  }
  if (message.includes('already_logged_today') || message.includes('already logged')) {
    return 'Already checked in today. Come back tomorrow.';
  }
  if (message.includes('missing_proofs') || message.includes('all three proofs')) {
    return 'Add all three proofs to check in today.';
  }
  if (message.includes('not_participant') || message.includes('before you log a workout')) {
    return 'Join this challenge before you check in.';
  }
  if (message.includes('calendar day to log')) {
    return 'Pick a calendar day to check in.';
  }
  if (
    message.includes('42804') ||
    message.includes('22p02') ||
    (message.includes('task_ids') && (message.includes('jsonb') || message.includes('uuid[]')))
  ) {
    return 'Couldn’t submit this check-in. Try again.';
  }
  if (message.includes('begin check-in first')) {
    return 'Begin check-in first.';
  }
  if (message.includes('already submitted')) {
    return 'Already checked in today. Come back tomorrow.';
  }
  if (message.includes('not_started') || message.includes('hasn’t started yet') || message.includes('hasnt started yet')) {
    return 'This challenge hasn’t started yet.';
  }
  if (message.includes('logging is closed') || message.includes('check-in is closed')) {
    return 'Check-in is closed for this challenge.';
  }
  if (message.includes('eliminated from this challenge')) {
    return 'You have been eliminated from this challenge.';
  }
  if (message.includes('pick at least one task')) {
    return 'Pick at least one task you completed.';
  }
  if (message.includes('not part of this challenge')) {
    return 'Those tasks are not part of this challenge.';
  }
  if (message.includes('upload every required proof') || message.includes('required proof')) {
    return 'Add all three proofs to check in today.';
  }
  if (
    (message.includes('log_workout') ||
      message.includes('log_health_workout') ||
      message.includes('mark_challenge_judging')) &&
    (message.includes('does not exist') || message.includes('could not find') || message.includes('404'))
  ) {
    return message.includes('log_health_workout')
      ? copy('health.attachFailed')
      : 'Couldn’t check in. Try again.';
  }
  if (message.includes('health_schema_missing')) {
    return copy('health.attachFailed');
  }
  if (message.includes('couldn’t publish the photos') || message.includes('could not publish the photos')) {
    return 'Your check-in went through, but we couldn’t attach the photos to the post.';
  }
  if (message.includes('challenge_not_ended') || message.includes('hasn’t ended') || message.includes('hasnt ended')) {
    return 'This challenge hasn’t ended yet.';
  }
  if (message.includes('no_end_date') || message.includes('no_end_time')) {
    return 'This challenge doesn’t have an end date.';
  }
  if (message.includes('too_early_distribute') || message.includes('cooldown_active')) {
    return 'Payout unlocks 1 hour after the challenge ends.';
  }
  if (message.includes('already_settled') || message.includes('already_distributed')) {
    return 'Already paid out.';
  }
  if (message.includes('not_creator') || message.includes('only the host can close') || message.includes('only the host can')) {
    return 'Only the host can close or pay out.';
  }
  if (message.includes('not authenticated') || message.includes('not_authenticated')) {
    return 'Sign in to continue.';
  }
  if (
    (message.includes('duplicate') || message.includes('unique')) &&
    message.includes('workout_submissions')
  ) {
    return 'Already checked in today. Come back tomorrow.';
  }
  if (message.includes('not a participant') || message.includes('is_challenge_participant')) {
    return 'Join this challenge before you check in.';
  }
  if (message.includes('mime type') || message.includes('not supported') || message.includes('allowed_mime')) {
    return 'That photo type isn’t supported. Try a JPEG or PNG.';
  }
  if (message.includes('maximum size') || message.includes('payload too large') || message.includes('file size')) {
    return 'That photo is too large. Try a smaller one.';
  }
  if (
    message.includes('status code 400') ||
    (message.includes('400') &&
      (message.includes('storage') || message.includes('bucket') || message.includes('upload')))
  ) {
    return 'We couldn’t upload that photo. Try another JPEG or PNG.';
  }
  if (message.includes('bucket') || message.includes('storage')) {
    return 'We couldn’t save that photo. Check your connection and try again.';
  }
  if (message.includes('title_required') || message.includes('give the challenge a title')) {
    return 'Give the challenge a title before you publish.';
  }
  if (message.includes('invalid_currency') || message.includes('pick blob coins or blob bucks')) {
    return 'Pick Blob Coins or $.';
  }
  if (message.includes('lane_required') || message.includes('choose coin challenge or private challenge')) {
    return 'Choose Coin Challenge or Private Challenge.';
  }
  if (message.includes('official_not_allowed') || message.includes('official competitions are hosted') || message.includes('official competitions are run')) {
    return 'Official competitions are hosted by blOb.';
  }
  if (message.includes('private_no_player_buy_in') || message.includes('private challenges can’t charge') || message.includes('private challenges can\'t charge')) {
    return 'Private challenges can’t charge competitors an entry fee for the prize.';
  }
  if (message.includes('insufficient_funds') || message.includes('insufficient credits') || message.includes('insufficient bucks')) {
    return 'Not enough in your wallet.';
  }
  if (message.includes('no_refund_after_start')) {
    return 'Refunds are not allowed after the official start.';
  }
  if (message.includes('already_started')) {
    return 'This challenge already started.';
  }
  if (message.includes('already_distributed')) {
    return 'Already paid out.';
  }
  if (message.includes('cooldown_active')) {
    return 'Payout unlocks 1 hour after the challenge ends.';
  }
  if (message.includes('open_disputes')) {
    return 'Payouts wait until open disputes are resolved.';
  }
  if (message.includes('lobby_full')) {
    return 'This challenge is full.';
  }
  if (
    message.includes('are_accepted_friends') ||
    ((message.includes('function') || message.includes('rpc') || message.includes('could not find the')) &&
      message.includes('does not exist'))
  ) {
    return 'Couldn’t complete that just now. Try again.';
  }
  if (message.includes('legal_required')) {
    return 'Agree to the Terms, Privacy Policy, and skill statement to continue.';
  }
  if (message.includes('row-level security') || message.includes('42501')) {
    return 'Couldn’t save that (permission). Try again.';
  }
  if (message.includes('profile_missing')) {
    return 'Couldn’t save that. Try again.';
  }
  if (message.includes('not_joinable')) {
    return 'This challenge is not accepting competitors.';
  }
  if (message.includes('body_metrics_required') || message.includes('add body metrics first')) {
    return 'Add body metrics first to join Official Fitness Challenges.';
  }
  if (message.includes('lms_not_finished')) {
    return 'Last Man Standing is not down to one person yet.';
  }
  if (message.includes('already joined') || message.includes('already_joined') || message.includes('already in this challenge')) {
    return 'You’re already in this challenge.';
  }
  if (message.includes('challenge is full') || message.includes('this challenge is full')) {
    return 'This challenge is full.';
  }
  if (message.includes('challenge not found')) {
    return 'This challenge could not be found.';
  }
  if (message.includes('no longer accepting') || message.includes('not open to join')) {
    return 'This challenge is no longer accepting competitors.';
  }
  if (message.includes('has ended')) {
    return 'This challenge has ended.';
  }
  if (message.includes('not authenticated')) {
    return 'Sign in to join a challenge.';
  }
  if (
    message.includes('username') &&
    (message.includes('duplicate') ||
      message.includes('unique') ||
      message.includes('already exists'))
  ) {
    return 'That username is taken. Try another one.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'We couldn’t reach blOb just now. Check your connection and try again.';
  }
  if (isGoogleClientConfigError(raw)) {
    return GOOGLE_NOT_CONFIGURED;
  }
  if (message.includes('oauth') || message.includes('provider')) {
    return 'That sign-in didn’t finish. Please try again.';
  }
  if (
    message.includes('DURATION_TOO_SHORT') ||
    message.includes('duration has to stay')
  ) {
    return 'Duration has to stay at least 1 day.';
  }
  if (
    message.includes('not enough people') ||
    message.includes('underfill') ||
    message.includes('cancelled_underfilled')
  ) {
    return copy('error.notEnoughPeople');
  }
  if (message.includes('already_cancelled') || message.includes('already cancelled')) {
    return 'This challenge was already cancelled.';
  }
  if (message.includes('cancel_challenge') || message.includes('cannot cancel')) {
    return 'You can’t cancel this challenge.';
  }
  if (message.includes('sign-in was cancelled') || message.includes('auth cancelled')) {
    return 'Sign-in was cancelled.';
  }
  if (message.includes('cancel') && (message.includes('sign') || message.includes('oauth') || message.includes('auth'))) {
    return 'Sign-in was cancelled.';
  }
  if (message.includes('permission') || message.includes('denied')) {
    return 'We need permission to continue. You can change this in Settings.';
  }
  if (
    message.includes('pgrst204') ||
    (message.includes('schema cache') && message.includes('column')) ||
    (message.includes('could not find the') && message.includes('column')) ||
    (message.includes('motivation_tone') &&
      (message.includes('could not find') || message.includes('schema cache')))
  ) {
    return copy('error.preferenceSave');
  }

  if (
    message.includes('stripe') ||
    message.includes('paymentintent') ||
    message.includes('payment_intent')
  ) {
    return 'Something went sideways. Try again in a moment.';
  }
  if (message.includes('postgrest') || message.includes('pgrst')) {
    const cleaned = raw.replace(/\bPGRST\d+\b/gi, '').replace(/^[:\s.,-]+/, '').trim();
    if (cleaned.length > 12) {
      return cleaned;
    }
    return 'Couldn’t complete that just now. Try again.';
  }

  const withoutCode = raw.replace(/\bP0001\b/gi, '').replace(/^[:\s.,-]+/, '').trim();
  if (withoutCode && withoutCode !== raw) {
    return withoutCode;
  }
  return raw;
}
