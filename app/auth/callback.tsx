import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Linking from 'expo-linking';

import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { createSessionFromUrl, useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useMyProfile } from '@/hooks/useProfile';
import { useStalled } from '@/hooks/useStalled';
import { reportAppError } from '@/lib/appErrors';
import {
  blobAuthCallbackDeepLink,
  loginHrefWithAuthError,
  postAuthLandingHref,
  stripWebAuthCallbackUrl,
} from '@/lib/authRedirect';
import { hasAuthCallbackPayload, parseAuthRedirectParams } from '@/lib/authRedirectParams';
import { copy } from '@/lib/copy';
import { nativeCallbackUrlFromParams, pickCanonicalAuthCallbackUrl } from '@/lib/oauthRedirect';
import { THEME } from '@/lib/theme';
import { apexBlobUrl, canonicalizeWwwBlobHost } from '@/lib/webHost';
import { getAuthCallbackMessage, getErrorMessage } from '@/utils/errors';

canonicalizeWwwBlobHost();

const EXCHANGE_MS = 15_000;

function currentWebHref(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }
  try {
    return typeof window !== 'undefined' ? apexBlobUrl(window.location.href) : null;
  } catch {
    return null;
  }
}

function isEmailConfirmType(type: string | null): boolean {
  return type === 'signup' || type === 'invite' || type === 'email';
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { isLoading, isPasswordRecovery, session } = useAuth();
  const { isBootstrapping, path } = useMyProfile();
  const tone = useCopyTone();
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    token_hash?: string;
    token?: string;
    email?: string;
    type?: string;
    error?: string;
    error_description?: string;
  }>();
  const linkingUrl = Linking.useLinkingURL();
  const [exchanging, setExchanging] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const settling = isLoading || isBootstrapping || path === 'boot' || exchanging;
  // Longer than the root layout's 2s boot budget: a real OAuth exchange plus profile load can
  // legitimately take a few seconds on a cold network.
  const settleStalled = useStalled(settling, 9000);

  useEffect(() => {
    const url = pickCanonicalAuthCallbackUrl([
      nativeCallbackUrlFromParams(params),
      linkingUrl,
      Linking.getLinkingURL(),
      currentWebHref(),
    ]);
    const parsed = url ? parseAuthRedirectParams(url) : parseAuthRedirectParams(null);
    if (!url || (!hasAuthCallbackPayload(parsed) && !parsed.error && !parsed.error_description)) {
      return;
    }

    if (parsed.error || parsed.error_description) {
      const message =
        getAuthCallbackMessage({
          code: parsed.error,
          message: parsed.error_description || parsed.error,
        }) || copy('auth.confirmLinkBad');
      setExchanging(false);
      setCallbackError(message);
      return;
    }

    let cancelled = false;
    setExchanging(true);
    setCallbackError(null);
    const timer = setTimeout(() => {
      if (!cancelled) {
        setExchanging(false);
        setCallbackError(copy('auth.confirmLinkBad'));
      }
    }, EXCHANGE_MS);

    void createSessionFromUrl(url)
      .then((next) => {
        if (cancelled) {
          return;
        }
        stripWebAuthCallbackUrl();
        clearTimeout(timer);
        setExchanging(false);
        if (parsed.type === 'recovery') {
          return;
        }
        if (parsed.token_hash || isEmailConfirmType(parsed.type)) {
          setEmailConfirmed(true);
          return;
        }
        if (!next && !parsed.code && !parsed.access_token) {
          setCallbackError(copy('auth.confirmLinkBad'));
        }
      })
      .catch((error) => {
        const message = getAuthCallbackMessage(error) || copy('auth.confirmLinkBad');
        reportAppError({ route: 'auth/callback', error });
        stripWebAuthCallbackUrl();
        if (!cancelled) {
          clearTimeout(timer);
          setExchanging(false);
          setCallbackError(message);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    linkingUrl,
    params.code,
    params.access_token,
    params.refresh_token,
    params.token_hash,
    params.token,
    params.email,
    params.type,
    params.error,
    params.error_description,
  ]);

  async function openBlob() {
    setOpenError(null);
    stripWebAuthCallbackUrl();
    try {
      await Linking.openURL(blobAuthCallbackDeepLink());
    } catch (error) {
      setOpenError(getErrorMessage(error) || copy('auth.confirmLinkBad'));
    }
  }

  const callbackEmail = (Array.isArray(params.email) ? params.email[0] : params.email)?.trim() ?? '';

  if (callbackError) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title={copy('auth.confirmTitle')}
          body={callbackError}
          actionLabel={copy('auth.signIn')}
          onAction={() =>
            router.replace(loginHrefWithAuthError(callbackError, callbackEmail || undefined) as Href)
          }
        />
      </Screen>
    );
  }

  if (emailConfirmed && Platform.OS === 'web') {
    return (
      <Screen className="items-center justify-center">
        <MascotState kind="success" title={copy('auth.emailConfirmed')} compact />
        {openError ? (
          <AppText className="mb-3 text-center text-sm" style={{ color: THEME.danger }}>
            {openError}
          </AppText>
        ) : null}
        <View style={{ width: '100%', gap: 12, paddingHorizontal: 8 }}>
          <Button title={copy('auth.openBlob')} size="lg" onPress={() => void openBlob()} />
          <Button
            title={copy('auth.continueInBrowser')}
            size="lg"
            variant="ghost"
            onPress={() => router.replace(postAuthLandingHref(path) as Href)}
          />
        </View>
      </Screen>
    );
  }

  // The root layout stops blocking on boot after 2s, but this screen waits on the profile query
  // too. When that never resolved the user sat on "Signing in…" with nothing to tap, so once the
  // wait stops being plausible we hand off. A session that is not clearly complete goes to
  // /onboarding (legal first), never straight to Home.
  if (settleStalled) {
    return session ? (
      <Redirect href={postAuthLandingHref(path === 'app' ? 'app' : 'setup') as Href} />
    ) : (
      <Redirect href={loginHrefWithAuthError(copy('auth.signInTimeout', tone)) as Href} />
    );
  }

  if (settling) {
    return (
      <Screen>
        <MascotState kind="loading" title={copy('auth.signingIn', tone)} />
      </Screen>
    );
  }

  if (isPasswordRecovery) {
    return <Redirect href={'/auth/reset-password' as Href} />;
  }

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (emailConfirmed && path !== 'app') {
    return <Redirect href={postAuthLandingHref('setup') as Href} />;
  }

  return <Redirect href={postAuthLandingHref(path) as Href} />;
}
