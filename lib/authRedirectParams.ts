/** Parse Supabase Auth redirect params from query or hash without throwing. */

export type AuthRedirectParams = {
  type: string | null;
  access_token: string | null;
  refresh_token: string | null;
  code: string | null;
  error: string | null;
  error_description: string | null;
};

const EMPTY: AuthRedirectParams = {
  type: null,
  access_token: null,
  refresh_token: null,
  code: null,
  error: null,
  error_description: null,
};

function readPairs(source: string, into: Map<string, string>) {
  if (!source) {
    return;
  }
  for (const pair of source.split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : '';
    let key = rawKey;
    let value = rawValue;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      // Keep the raw pair if a token fragment is malformed.
    }
    if (key) {
      into.set(key, value);
    }
  }
}

export function parseAuthRedirectParams(url?: string | null): AuthRedirectParams {
  if (!url || typeof url !== 'string') {
    return EMPTY;
  }
  try {
    const params = new Map<string, string>();
    const hashIndex = url.indexOf('#');
    const queryIndex = url.indexOf('?');
    const queryEnd = hashIndex >= 0 && (queryIndex < 0 || hashIndex > queryIndex) ? hashIndex : url.length;
    const queryPart = queryIndex >= 0 ? url.slice(queryIndex + 1, queryEnd) : '';
    const hashPart = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
    readPairs(queryPart, params);
    readPairs(hashPart, params);
    return {
      type: params.get('type') ?? null,
      access_token: params.get('access_token') ?? null,
      refresh_token: params.get('refresh_token') ?? null,
      code: params.get('code') ?? null,
      error: params.get('error') ?? params.get('errorCode') ?? null,
      error_description: params.get('error_description') ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export function isRecoveryRedirect(params: AuthRedirectParams): boolean {
  return params.type === 'recovery' && Boolean(params.access_token || params.code);
}

export function hasAuthSessionTokens(params: AuthRedirectParams): boolean {
  return Boolean(params.access_token || params.code);
}
