import { copy } from '@/lib/copy';

export function getErrorMessage(error: unknown): string {
  const raw = extractRawMessage(error);
  return humanize(raw);
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

/** Auth password-update errors for the Account field. Never includes the new password. */
export function getPasswordUpdateMessage(error: unknown): string {
  const code = extractAuthCode(error);
  const message = `${extractRawMessage(error)} ${passwordReasons(error)}`.toLowerCase();

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
    code === 'unauthenticated' ||
    message.includes('not authenticated') ||
    message.includes('auth session missing') ||
    message.includes('session missing') ||
    (message.includes('session') && (message.includes('expired') || message.includes('invalid')))
  ) {
    return copy('error.passwordSession');
  }
  return copy('error.passwordUpdate');
}

function humanize(raw: string): string {
  const message = raw.toLowerCase();

  if (!raw) {
    return 'Something went sideways. Try again in a moment.';
  }
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'That email and password don’t match.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email, then come back to sign in.';
  }
  if (message.includes('already registered') || message.includes('user already')) {
    return 'That email is already in use. Try signing in instead.';
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
    return 'Insufficient Bucks';
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
    return 'Already logged today. Come back tomorrow.';
  }
  if (message.includes('missing_proofs') || message.includes('all three proofs')) {
    return 'Add all three proofs to log today.';
  }
  if (message.includes('not_participant')) {
    return 'Join this challenge before logging.';
  }
  if (message.includes('already submitted')) {
    return 'Already logged today. Come back tomorrow.';
  }
  if (message.includes('not_started') || message.includes('hasn’t started yet') || message.includes('hasnt started yet')) {
    return 'This challenge hasn’t started yet.';
  }
  if (message.includes('logging is closed')) {
    return 'Logging is closed for this challenge.';
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
    return 'Add all three proofs to log today.';
  }
  if (
    (message.includes('log_workout') ||
      message.includes('log_health_workout') ||
      message.includes('mark_challenge_judging')) &&
    (message.includes('does not exist') || message.includes('could not find') || message.includes('404'))
  ) {
    return message.includes('log_health_workout')
      ? copy('health.attachFailed')
      : 'Couldn’t reach the log service. Try again.';
  }
  if (message.includes('health_schema_missing')) {
    return copy('health.attachFailed');
  }
  if (message.includes('couldn’t publish the photos') || message.includes('could not publish the photos')) {
    return 'Your workout is logged, but we couldn’t attach the photos to the post.';
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
    return 'Already logged today. Come back tomorrow.';
  }
  if (message.includes('not a participant') || message.includes('is_challenge_participant')) {
    return 'Join this challenge before logging.';
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
    return 'Pick Blob Coins or Blob Bucks.';
  }
  if (message.includes('lane_required') || message.includes('choose coin challenge or private challenge')) {
    return 'Choose Coin Challenge or Private Challenge.';
  }
  if (message.includes('official_not_allowed') || message.includes('official competitions are hosted') || message.includes('official competitions are run')) {
    return 'Official competitions are hosted by blOb.';
  }
  if (message.includes('private_no_player_buy_in') || message.includes('private challenges can’t charge') || message.includes('private challenges can\'t charge')) {
    return 'Private challenges can’t charge competitors a buy-in for the prize.';
  }
  if (message.includes('insufficient_funds') || message.includes('insufficient credits') || message.includes('insufficient bucks')) {
    return 'Not enough Coins/Bucks to fund this prize.';
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
  if (message.includes('oauth') || message.includes('provider')) {
    return 'That sign-in didn’t finish. Please try again.';
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

  return raw;
}
