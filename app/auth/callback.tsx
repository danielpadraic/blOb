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
import { reportAppError } from '@/lib/appErrors';
import { blobAuthCallbackDeepLink, loginHrefWithAuthError } from '@/lib/authRedirect';
import { hasAuthCallbackPayload, parseAuthRedirectParams } from '@/lib/authRedirectParams';
import { copy } from '@/lib/copy';
import { nativeCallbackUrlFromParams, pickCanonicalAuthCallbackUrl } from '@/lib/oauthRedirect';
import { TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
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
        console.log('[blob:auth-callback]', message);
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
    const current = session ?? (await supabase.auth.getSession()).data.session;
    const deepLink = blobAuthCallbackDeepLink(
      current
        ? { access_token: current.access_token, refresh_token: current.refresh_token }
        : null,
    );
    try {
      await Linking.openURL(deepLink);
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
            onPress={() => router.replace(TABS_HREF)}
          />
        </View>
      </Screen>
    );
  }

  if (isLoading || isBootstrapping || path === 'boot' || exchanging) {
    return (
      <Screen>
        <MascotState kind="loading" title={copy('auth.signingIn', tone)} />
      </Screen>
    );
  }

  if (isPasswordRecovery) {
    return <Redirect href={'/auth/reset-password' as Href} />;
  }

  if (emailConfirmed) {
    return <Redirect href={TABS_HREF} />;
  }

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'setup') {
    return <Redirect href="/onboarding/profile-setup" />;
  }

  return <Redirect href={TABS_HREF} />;
}
