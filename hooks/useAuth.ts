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
  isExpectedOAuthStartUrl,
  isNativeOAuthCallbackUrl,
  isProviderAuthorizeUrl,
  logOAuthAuthorizeUrl,
  resolveOAuthRedirectUri,
  sanitizeOAuthBrowserUrl,
} from '@/lib/oauthRedirect';
import {
  capturePasswordRecoveryFromUrl,
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from '@/lib/passwordRecovery';
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

function waitForNativeAuthCallback(ms: number): { promise: Promise<string | null>; cancel: () => void } {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let linking: { remove: () => void } | undefined;
  let appState: { remove: () => void } | undefined;

  const finish = (url: string | null, resolve: (value: string | null) => void) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timer) {
      clearTimeout(timer);
    }
    linking?.remove();
    appState?.remove();
    resolve(url);
  };

  const promise = new Promise<string | null>((resolve) => {
    const take = (url?: string | null) => {
      if (!isCapturableAuthUrl(url)) {
        return;
      }
      dismissNativeAuthSheet();
      finish(url, resolve);
    };

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
    timer = setTimeout(() => finish(null, resolve), ms);
  });

  return {
    promise,
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
      }
      linking?.remove();
      appState?.remove();
      settled = true;
    },
  };
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

async function resolveNativeOAuthBrowserUrl(startUrl: string): Promise<string> {
  if (!isExpectedOAuthStartUrl(startUrl)) {
    throw new Error('Sign-in did not start from Google or Supabase.');
  }
  logOAuthAuthorizeUrl(startUrl);

  const cleanedStart = sanitizeOAuthBrowserUrl(startUrl);
  if (authorizeUrlHasBlobRedirectUri(cleanedStart)) {
    throw new Error('Google OAuth is misconfigured: redirect_uri must stay on Supabase HTTPS.');
  }

  if (isProviderAuthorizeUrl(cleanedStart)) {
    return cleanedStart;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const takeProviderUrl = (candidate?: string | null) => {
    if (!candidate || !isExpectedOAuthStartUrl(candidate)) {
      return null;
    }
    const cleaned = sanitizeOAuthBrowserUrl(candidate);
    logOAuthAuthorizeUrl(cleaned);
    if (authorizeUrlHasBlobRedirectUri(cleaned)) {
      throw new Error('Google OAuth is misconfigured: redirect_uri must stay on Supabase HTTPS.');
    }
    return isProviderAuthorizeUrl(cleaned) ? cleaned : null;
  };

  try {
    try {
      const response = await fetch(cleanedStart, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
      });
      const location = response.headers.get('Location') ?? response.headers.get('location') ?? '';
      const followed = typeof response.url === 'string' ? response.url : '';
      const cleaned = takeProviderUrl(location) ?? takeProviderUrl(followed);
      if (cleaned) {
        return cleaned;
      }
    } catch (error) {
      if (error instanceof Error && /misconfigured/i.test(error.message)) {
        throw error;
      }
    }

    const followedResponse = await fetch(cleanedStart, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    const cleaned = takeProviderUrl(followedResponse.url);
    if (cleaned) {
      return cleaned;
    }
  } finally {
    clearTimeout(timer);
  }

  throw new Error('Could not start Google sign-in. Try again.');
}

async function completeNativeOAuth(authorizeUrl: string, redirectTo: string): Promise<void> {
  const incoming = waitForNativeAuthCallback(180_000);
  try {
    const raced = await Promise.race([
      WebBrowser.openAuthSessionAsync(
        authorizeUrl,
        redirectTo,
        Platform.OS === 'android' ? { createTask: false } : { preferHttps: false },
      ).then((result) => {
        if (__DEV__) {
          console.log('[blob:oauth]', { redirectTo, resultType: result.type });
        }
        return {
          kind: 'sheet' as const,
          result,
        };
      }),
      incoming.promise.then((url) => ({ kind: 'link' as const, url })),
    ]);

    if (raced.kind === 'link' && raced.url) {
      const session = await createSessionFromUrl(raced.url);
      if (session) {
        return;
      }
    }

    if (raced.kind === 'sheet') {
      const { result } = raced;
      if (result.type === 'success' && result.url) {
        const session = await createSessionFromUrl(result.url);
        if (session) {
          return;
        }
      }
      const linked = await Promise.race([
        incoming.promise,
        new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (linked) {
        const session = await createSessionFromUrl(linked);
        if (session) {
          return;
        }
      }
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

  const nativeRedirect = resolveOAuthRedirectUri({
    platform: Platform.OS,
    computedNative: makeRedirectUri({
      scheme: NATIVE_OAUTH_SCHEME,
      path: NATIVE_OAUTH_PATH,
      native: NATIVE_REDIRECT,
    }),
  });
  if (__DEV__) {
    console.log('[blob:oauth]', { redirectTo: nativeRedirect });
  }

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

  const browserUrl = await resolveNativeOAuthBrowserUrl(data.url);
  await completeNativeOAuth(browserUrl, nativeRedirect);
}

export { createSessionFromUrl };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: oauthRedirectTo(),
      },
    });
    if (error) {
      throw error;
    }
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithOAuthProvider('google');
  }, []);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      await signInWithOAuthProvider('apple');
      return;
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      await signInWithOAuthProvider('apple');
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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: oauthRedirectTo(),
    });
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
