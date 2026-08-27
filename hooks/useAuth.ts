import type { EmailOtpType, Provider, Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { reportAppError } from '@/lib/appErrors';
import {
  authSessionFlightKey,
  hasAuthCallbackPayload,
  parseAuthRedirectParams,
} from '@/lib/authRedirectParams';
import {
  NATIVE_OAUTH_PATH,
  NATIVE_OAUTH_SCHEME,
  authorizeUrlHasBlobRedirectUri,
  authorizeUrlHost,
  isExpectedOAuthStartUrl,
  isNativeOAuthCallbackUrl,
  isProviderAuthorizeUrl,
  logOAuthAuthorizeUrl,
  logOAuthStage,
  pickCanonicalAuthCallbackUrl,
  resolveOAuthRedirectUri,
  sanitizeOAuthBrowserUrl,
} from '@/lib/oauthRedirect';
import {
  capturePasswordRecoveryFromUrl,
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from '@/lib/passwordRecovery';
import { GOOGLE_SIGN_IN_RETRY } from '@/lib/googleSignInConfig';
import { emailAuthRedirectTo } from '@/lib/authRedirect';
import { signInWithNativeGoogle } from '@/lib/googleNativeAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

WebBrowser.maybeCompleteAuthSession();

try {
  if (typeof window !== 'undefined') {
    capturePasswordRecoveryFromUrl(window.location.href);
  }
} catch {
  // Native and restricted web runtimes may not expose location.
}

const SIGN_IN_UNFINISHED = 'Sign-in didn’t finish. Try again.';
const SIGN_IN_TIMEOUT = 'Sign-in timed out. Check your connection and try again.';
const OAUTH_RESOLVE_MS = 15_000;
const NATIVE_REDIRECT = 'blob://auth/callback';

function oauthRedirectTo(): string {
  if (Platform.OS === 'web') {
    return resolveOAuthRedirectUri({
      platform: 'web',
      webOrigin: typeof window !== 'undefined' ? window.location.origin : null,
    });
  }
  const computedNative = makeRedirectUri({
    scheme: NATIVE_OAUTH_SCHEME,
    path: NATIVE_OAUTH_PATH,
    native: NATIVE_REDIRECT,
  });
  const nativeRedirect = resolveOAuthRedirectUri({
    platform: Platform.OS,
    computedNative,
  });
  return nativeRedirect === NATIVE_REDIRECT ? nativeRedirect : NATIVE_REDIRECT;
}

const EMAIL_OTP_TYPES = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function asEmailOtpType(value: string | null): EmailOtpType | null {
  if (value && EMAIL_OTP_TYPES.has(value)) {
    return value as EmailOtpType;
  }
  return null;
}

function currentWebHref(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }
  try {
    return typeof window !== 'undefined' ? window.location.href : null;
  } catch {
    return null;
  }
}

function stripWebAuthHash() {
  if (Platform.OS !== 'web') {
    return;
  }
  try {
    if (typeof window === 'undefined' || !window.location.hash) {
      return;
    }
    const next = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(window.history.state, '', next);
  } catch {
    // Hash cleanup is best-effort on web.
  }
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  oauthLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  finishPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let lastConsumedAuthUrl: string | null = null;
const inFlightSessions = new Map<string, Promise<Session | null>>();

function dismissNativeAuthSheet() {
  try {
    WebBrowser.dismissAuthSession();
  } catch {
    // Sheet may already be gone.
  }
}

function isCapturableAuthUrl(url?: string | null): url is string {
  if (!url) {
    return false;
  }
  return isNativeOAuthCallbackUrl(url) && hasAuthCallbackPayload(parseAuthRedirectParams(url));
}

const AUTH_SHEET_RECOVER_MS = 2_500;

function waitForNativeAuthCallback(ms: number): { promise: Promise<string | null>; cancel: () => void } {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let linking: { remove: () => void } | undefined;
  let appState: { remove: () => void } | undefined;
  let resolvePromise: (value: string | null) => void = () => undefined;

  const finish = (url: string | null) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timer) {
      clearTimeout(timer);
    }
    linking?.remove();
    appState?.remove();
    resolvePromise(url);
  };

  const take = (url?: string | null) => {
    if (!isCapturableAuthUrl(url)) {
      return;
    }
    dismissNativeAuthSheet();
    finish(url);
  };

  const promise = new Promise<string | null>((resolve) => {
    resolvePromise = resolve;
    // Subscribe before openAuthSessionAsync so blob://auth/callback is not missed.
    linking = Linking.addEventListener('url', ({ url }) => take(url));
    appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      take(Linking.getLinkingURL());
      void Linking.getInitialURL().then(take).catch(() => undefined);
    });
    take(Linking.getLinkingURL());
    void Linking.getInitialURL().then(take).catch(() => undefined);
    timer = setTimeout(() => finish(null), ms);
  });

  return {
    promise,
    cancel: () => finish(null),
  };
}

async function lookupNativeCallbackUrl(): Promise<string | null> {
  let initial: string | null = null;
  try {
    initial = await Linking.getInitialURL();
  } catch {
    initial = null;
  }
  const picked = pickCanonicalAuthCallbackUrl([Linking.getLinkingURL(), initial]);
  return isCapturableAuthUrl(picked) ? picked : null;
}

async function sessionFromCallbackUrl(url?: string | null): Promise<Session | null> {
  if (!url) {
    return null;
  }
  const params = parseAuthRedirectParams(url);
  if (params.error) {
    throw new Error(params.error_description || params.error);
  }
  if (!isCapturableAuthUrl(url) && !hasAuthCallbackPayload(params)) {
    return null;
  }
  return createSessionFromUrl(url);
}

async function recoverSessionAfterAuthSheet(incoming: Promise<string | null>): Promise<Session | null> {
  logOAuthStage('recover callback');
  const linked = await Promise.race([
    incoming,
    new Promise<string | null>((resolve) => setTimeout(() => resolve(null), AUTH_SHEET_RECOVER_MS)),
  ]);
  const session =
    (await sessionFromCallbackUrl(linked)) ??
    (await sessionFromCallbackUrl(await lookupNativeCallbackUrl()));
  if (session) {
    return session;
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function createSessionFromUrlInner(url: string, flightKey: string): Promise<Session | null> {
  const params = parseAuthRedirectParams(url);
  capturePasswordRecoveryFromUrl(url);

  if (params.error) {
    throw new Error(params.error_description || params.error);
  }

  if (!hasAuthCallbackPayload(params)) {
    return null;
  }

  if (params.code && !params.access_token) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw error;
    }
    lastConsumedAuthUrl = flightKey;
    stripWebAuthHash();
    return data.session;
  }

  if (params.access_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token ?? '',
    });
    if (error) {
      throw error;
    }
    lastConsumedAuthUrl = flightKey;
    stripWebAuthHash();
    return data.session;
  }

  const otpType = asEmailOtpType(params.type);
  if (params.token_hash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: otpType,
    });
    if (error) {
      throw error;
    }
    lastConsumedAuthUrl = flightKey;
    stripWebAuthHash();
    return data.session;
  }

  if (params.token && otpType && params.email) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: params.email,
      token: params.token,
      type: otpType,
    });
    if (error) {
      throw error;
    }
    lastConsumedAuthUrl = flightKey;
    stripWebAuthHash();
    return data.session;
  }

  return null;
}

async function createSessionFromUrl(url: string): Promise<Session | null> {
  const flightKey = authSessionFlightKey(url);
  const existing = inFlightSessions.get(flightKey);
  if (existing) {
    return existing;
  }
  if (lastConsumedAuthUrl === flightKey || lastConsumedAuthUrl === url) {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  const flight = createSessionFromUrlInner(url, flightKey).finally(() => {
    inFlightSessions.delete(flightKey);
  });
  inFlightSessions.set(flightKey, flight);
  return flight;
}

function takeProviderAuthorizeUrl(candidate?: string | null): string | null {
  if (!candidate || !isExpectedOAuthStartUrl(candidate)) {
    return null;
  }
  const cleaned = sanitizeOAuthBrowserUrl(candidate);
  logOAuthAuthorizeUrl(cleaned);
  if (authorizeUrlHasBlobRedirectUri(cleaned)) {
    throw new Error('Google OAuth is misconfigured: redirect_uri must stay on Supabase HTTPS.');
  }
  return isProviderAuthorizeUrl(cleaned) ? cleaned : null;
}

async function withOAuthResolveTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(SIGN_IN_TIMEOUT));
          controller.abort();
        }, OAUTH_RESOLVE_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Resolve Supabase /authorize to accounts.google.com so we can strip redirect_to=blob.
 * iOS fetch often hides Location (opaque redirect). If follow finishes without a Google
 * host, open the original Supabase authorize URL in the auth sheet instead of hanging.
 * Tradeoff: Google may see extra redirect_to=blob (Android 400 risk) vs infinite spin.
 */
async function followAuthorizeToProvider(
  authorizeUrl: string,
  signal: AbortSignal,
): Promise<string | null> {
  const headers = { Accept: 'text/html,application/xhtml+xml' };
  logOAuthStage('started fetch', { host: authorizeUrlHost(authorizeUrl) });

  // iOS: do not follow to Google (loading that HTML often hangs). Read Location/url;
  // if the host is not Google, caller opens the original Supabase authorize URL.
  if (Platform.OS === 'ios') {
    try {
      const response = await fetch(authorizeUrl, {
        method: 'GET',
        redirect: 'manual',
        headers,
        signal,
      });
      const location = response.headers.get('Location') ?? response.headers.get('location') ?? '';
      const followed = typeof response.url === 'string' ? response.url : '';
      return takeProviderAuthorizeUrl(location) ?? takeProviderAuthorizeUrl(followed);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      if (name === 'AbortError' || (error instanceof Error && error.message === SIGN_IN_TIMEOUT)) {
        throw new Error(SIGN_IN_TIMEOUT);
      }
      if (error instanceof Error && /misconfigured/i.test(error.message)) {
        throw error;
      }
      logOAuthStage('error', { name });
      return null;
    }
  }

  try {
    const response = await fetch(authorizeUrl, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal,
    });
    const location = response.headers.get('Location') ?? response.headers.get('location') ?? '';
    const followed = typeof response.url === 'string' ? response.url : '';
    const cleaned = takeProviderAuthorizeUrl(location) ?? takeProviderAuthorizeUrl(followed);
    if (cleaned) {
      return cleaned;
    }
  } catch (error) {
    if (error instanceof Error && /misconfigured/i.test(error.message)) {
      throw error;
    }
    logOAuthStage('error', { name: error instanceof Error ? error.name : 'Error' });
  }

  const followedResponse = await fetch(authorizeUrl, {
    method: 'GET',
    redirect: 'follow',
    headers,
    signal,
  });
  return takeProviderAuthorizeUrl(followedResponse.url);
}

function isGoogleBrowserOAuthUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('accounts.google.com') || /[?&]provider=google(?:&|$)/.test(lower);
}

async function resolveNativeOAuthBrowserUrl(startUrl: string, signal: AbortSignal): Promise<string> {
  if (isGoogleBrowserOAuthUrl(startUrl)) {
    throw new Error(GOOGLE_SIGN_IN_RETRY);
  }
  if (!isExpectedOAuthStartUrl(startUrl)) {
    throw new Error('Sign-in did not start from Google or Supabase.');
  }
  logOAuthAuthorizeUrl(startUrl);

  const cleanedStart = sanitizeOAuthBrowserUrl(startUrl);
  if (authorizeUrlHasBlobRedirectUri(cleanedStart)) {
    throw new Error('Google OAuth is misconfigured: redirect_uri must stay on Supabase HTTPS.');
  }

  if (isProviderAuthorizeUrl(cleanedStart)) {
    logOAuthStage('got google host', { host: authorizeUrlHost(cleanedStart) });
    return cleanedStart;
  }

  let resolved: string | null = null;
  try {
    resolved = await followAuthorizeToProvider(cleanedStart, signal);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    logOAuthStage('error', { name });
    if (error instanceof Error && error.message === SIGN_IN_TIMEOUT) {
      throw error;
    }
    if (name === 'AbortError') {
      throw new Error(SIGN_IN_TIMEOUT);
    }
    if (error instanceof Error && /misconfigured/i.test(error.message)) {
      throw error;
    }
    throw new Error(getErrorMessage(error) || 'Could not start Google sign-in. Try again.');
  }

  if (resolved) {
    logOAuthStage('got google host', { host: authorizeUrlHost(resolved) });
    return resolved;
  }

  // Fetch finished but Location/final URL was not accounts.google.com (opaque iOS hop).
  if (Platform.OS === 'ios') {
    logOAuthStage('fallback supabase authorize', { host: authorizeUrlHost(cleanedStart) });
    return cleanedStart;
  }

  throw new Error('Could not start Google sign-in. Try again.');
}

async function completeNativeOAuth(authorizeUrl: string, redirectTo: string): Promise<void> {
  if (isGoogleBrowserOAuthUrl(authorizeUrl)) {
    throw new Error(GOOGLE_SIGN_IN_RETRY);
  }
  const incoming = waitForNativeAuthCallback(180_000);
  try {
    let result: { type: string; url?: string | null };
    try {
      result = await WebBrowser.openAuthSessionAsync(
        authorizeUrl,
        redirectTo,
        Platform.OS === 'android' ? { createTask: false } : undefined,
      );
    } catch (error) {
      logOAuthStage('error', { name: error instanceof Error ? error.name : 'Error' });
      const recovered = await recoverSessionAfterAuthSheet(incoming.promise);
      if (recovered) {
        return;
      }
      throw error;
    }

    logOAuthStage('openAuthSession', {
      host: authorizeUrlHost(authorizeUrl),
      name: result.type,
    });

    if (result.type === 'success' && result.url) {
      const session = await sessionFromCallbackUrl(result.url);
      if (session) {
        return;
      }
    }

    const recovered = await recoverSessionAfterAuthSheet(incoming.promise);
    if (recovered) {
      return;
    }

    throw new Error(SIGN_IN_UNFINISHED);
  } finally {
    incoming.cancel();
  }
}

async function signInWithOAuthProvider(provider: Provider): Promise<void> {
  if (Platform.OS === 'web') {
    const redirectTo = oauthRedirectTo();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: false,
      },
    });
    if (error) {
      throw new Error(getErrorMessage(error));
    }
    return;
  }

  if (provider === 'google') {
    throw new Error(GOOGLE_SIGN_IN_RETRY);
  }

  const nativeRedirect = resolveOAuthRedirectUri({
    platform: Platform.OS,
    computedNative: makeRedirectUri({
      scheme: NATIVE_OAUTH_SCHEME,
      path: NATIVE_OAUTH_PATH,
      native: NATIVE_REDIRECT,
    }),
  });
  const browserUrl = await withOAuthResolveTimeout(async (signal) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: nativeRedirect,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      throw new Error(getErrorMessage(error ?? new Error('OAuth did not start')));
    }

    return resolveNativeOAuthBrowserUrl(data.url, signal);
  });
  logOAuthStage('openAuthSession', { host: authorizeUrlHost(browserUrl) });
  await completeNativeOAuth(browserUrl, nativeRedirect);
}

export { createSessionFromUrl };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [isPasswordRecovery, setPasswordRecovery] = useState(isPasswordRecoveryPending);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    function noteRecoveryFromUrl(url?: string | null) {
      capturePasswordRecoveryFromUrl(url);
      if (isPasswordRecoveryPending()) {
        setPasswordRecovery(true);
      }
    }

    function consumeAuthUrl(url?: string | null) {
      if (!url) {
        return;
      }
      if (Platform.OS !== 'web' && isCapturableAuthUrl(url)) {
        dismissNativeAuthSheet();
      }
      noteRecoveryFromUrl(url);
      void createSessionFromUrl(url).catch((error) => {
        reportAppError({ route: 'auth/deep-link', error });
        console.log('[blob:auth-redirect]', getErrorMessage(error));
      });
    }

    noteRecoveryFromUrl(currentWebHref());

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryPending();
        setPasswordRecovery(true);
      }
      setSession(nextSession);
    });

    const linking = Linking.addEventListener('url', ({ url }) => {
      consumeAuthUrl(url);
    });

    void Linking.getInitialURL()
      .then((url) => {
        consumeAuthUrl(url);
        if (Platform.OS === 'web') {
          consumeAuthUrl(currentWebHref());
        }
      })
      .catch((error) => {
        reportAppError({ route: 'auth/initial-url', error });
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linking.remove();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const emailRedirectTo = emailAuthRedirectTo();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
    });
    if (error) {
      throw error;
    }
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setOauthLoading(true);
    try {
      if (Platform.OS === 'web') {
        await signInWithOAuthProvider('google');
        return;
      }
      await signInWithNativeGoogle();
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setOauthLoading(true);
      try {
        await signInWithOAuthProvider('apple');
      } finally {
        setOauthLoading(false);
      }
      return;
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setOauthLoading(true);
      try {
        await signInWithOAuthProvider('apple');
      } finally {
        setOauthLoading(false);
      }
      return;
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return a sign-in token. Please try again.');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      throw new Error(getErrorMessage(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    clearPasswordRecoveryPending();
    setPasswordRecovery(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(getErrorMessage(error));
    }
  }, []);

  const updateEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) {
      throw new Error(getErrorMessage(error));
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw error;
    }
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const redirectTo = emailAuthRedirectTo();
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) {
      throw error;
    }
  }, []);

  const finishPasswordRecovery = useCallback(() => {
    clearPasswordRecoveryPending();
    setPasswordRecovery(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: isSupabaseConfigured,
      isPasswordRecovery,
      oauthLoading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
      updateEmail,
      updatePassword,
      resetPasswordForEmail,
      finishPasswordRecovery,
    }),
    [
      finishPasswordRecovery,
      isLoading,
      isPasswordRecovery,
      oauthLoading,
      resetPasswordForEmail,
      session,
      signIn,
      signInWithApple,
      signInWithGoogle,
      signOut,
      signUp,
      updateEmail,
      updatePassword,
    ],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
