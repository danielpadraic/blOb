import type { Provider, Session, User } from '@supabase/supabase-js';
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
import { Platform } from 'react-native';

import { reportAppError } from '@/lib/appErrors';
import { authRedirectUrl } from '@/lib/authRedirect';
import {
  hasAuthSessionTokens,
  parseAuthRedirectParams,
} from '@/lib/authRedirectParams';
import {
  NATIVE_OAUTH_PATH,
  NATIVE_OAUTH_REDIRECT_URI,
  NATIVE_OAUTH_SCHEME,
  resolveOAuthRedirectUri,
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

function oauthRedirectTo(): string {
  if (Platform.OS === 'web') {
    return resolveOAuthRedirectUri({
      platform: 'web',
      webOrigin: typeof window !== 'undefined' ? window.location.origin : null,
    });
  }
  return resolveOAuthRedirectUri({
    platform: Platform.OS,
    computedNative: makeRedirectUri({
      scheme: NATIVE_OAUTH_SCHEME,
      path: NATIVE_OAUTH_PATH,
      native: NATIVE_OAUTH_REDIRECT_URI,
    }),
  });
}

function passwordResetRedirectTo(): string {
  return authRedirectUrl() ?? oauthRedirectTo();
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

async function createSessionFromUrl(url: string): Promise<Session | null> {
  const params = parseAuthRedirectParams(url);
  capturePasswordRecoveryFromUrl(url);

  if (params.error) {
    throw new Error(params.error_description || params.error);
  }

  if (!hasAuthSessionTokens(params)) {
    return null;
  }

  if (params.code && !params.access_token) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw error;
    }
    stripWebAuthHash();
    return data.session;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: params.access_token ?? '',
    refresh_token: params.refresh_token ?? '',
  });

  if (error) {
    throw error;
  }

  stripWebAuthHash();
  return data.session;
}

async function signInWithOAuthProvider(provider: Provider): Promise<void> {
  const redirectTo = oauthRedirectTo();

  if (Platform.OS === 'web') {
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    throw new Error(getErrorMessage(error ?? new Error('OAuth did not start')));
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('cancel');
  }

  if (result.type !== 'success' || !result.url) {
    throw new Error('That sign-in didn’t finish. Please try again.');
  }

  await createSessionFromUrl(result.url);
}

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
    const { data, error } = await supabase.auth.signUp({ email, password });
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
      redirectTo: passwordResetRedirectTo(),
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
