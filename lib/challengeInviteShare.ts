import { BLOB_APEX_HOST } from '@/lib/webHost';

export function needsInviteShareLink(privacyMode?: string | null): boolean {
  const mode = String(privacyMode ?? '').toLowerCase();
  return mode === 'private' || mode === 'private_corporate';
}

export function challengePublicShareUrl(challengeId: string): string {
  const id = String(challengeId ?? '').trim();
  if (!id) {
    return '';
  }
  return `https://${BLOB_APEX_HOST}/challenges/${id}`;
}

export function challengeInviteShareUrl(challengeId: string, token: string): string {
  const id = String(challengeId ?? '').trim();
  const invite = encodeURIComponent(String(token ?? '').trim());
  if (!id || !invite) {
    return '';
  }
  return `https://${BLOB_APEX_HOST}/challenges/${id}?invite=${invite}`;
}

/**
 * Why a copy could not produce a URL. The share sheet logs these verbatim so a
 * failure is never a generic invite toast.
 */
export type InviteLinkFailure = 'token-missing' | 'rpc-403' | 'closed';

export type InviteLinkResult =
  | { ok: true; token: string; created: boolean }
  | { ok: false; failure: InviteLinkFailure; detail: string };

function isForbiddenRpcError(error: { code?: string; message?: string }): boolean {
  const code = String(error.code ?? '');
  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') {
    return true;
  }
  return /permission denied|not authorized|do not have access|sign in to copy/i.test(
    String(error.message ?? ''),
  );
}

/** Maps one mint_challenge_invite_link answer onto a token or a named failure. */
export function classifyInviteLinkResponse(input: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}): InviteLinkResult {
  if (input.error) {
    return {
      ok: false,
      failure: isForbiddenRpcError(input.error) ? 'rpc-403' : 'token-missing',
      detail: String(input.error.message ?? 'rpc failed'),
    };
  }
  const row = (Array.isArray(input.data) ? input.data[0] : input.data) as
    | { token?: string | null; reason?: string | null; created?: boolean }
    | null
    | undefined;
  const token = String(row?.token ?? '').trim();
  if (token) {
    return { ok: true, token, created: Boolean(row?.created) };
  }
  const reason = String(row?.reason ?? '').trim();
  if (reason === 'closed') {
    return { ok: false, failure: 'closed', detail: reason };
  }
  // reason 'ask_host', or the RPC answered 200 with an empty token.
  return { ok: false, failure: 'token-missing', detail: reason || 'empty token' };
}

/** Ready-to-copy URL. Private / corporate need a live invite token or this is "". */
export function resolveChallengeCopyUrl(input: {
  challengeId?: string | null;
  privacyMode?: string | null;
  inviteToken?: string | null;
}): string {
  const id = String(input.challengeId ?? '').trim();
  if (!id) {
    return '';
  }
  if (needsInviteShareLink(input.privacyMode)) {
    return challengeInviteShareUrl(id, String(input.inviteToken ?? ''));
  }
  return challengePublicShareUrl(id);
}
