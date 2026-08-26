import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import * as Linking from 'expo-linking';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { createSessionFromUrl, useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useMyProfile } from '@/hooks/useProfile';
import { reportAppError } from '@/lib/appErrors';
import { loginHrefWithAuthError } from '@/lib/authRedirect';
import { hasAuthCallbackPayload, parseAuthRedirectParams } from '@/lib/authRedirectParams';
import { copy } from '@/lib/copy';
import { nativeCallbackUrlFromParams, pickCanonicalAuthCallbackUrl } from '@/lib/oauthRedirect';
import { TABS_HREF } from '@/lib/routes';
import { getErrorMessage } from '@/utils/errors';

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

export default function AuthCallbackScreen() {
  const { isLoading, isPasswordRecovery } = useAuth();
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

  useEffect(() => {
    const url = pickCanonicalAuthCallbackUrl([
      nativeCallbackUrlFromParams(params),
      linkingUrl,
      Linking.getLinkingURL(),
      currentWebHref(),
    ]);
    if (!url) {
      return;
    }
    const parsed = parseAuthRedirectParams(url);
    if (!hasAuthCallbackPayload(parsed) && !parsed.error) {
      return;
    }

    let cancelled = false;
    setExchanging(true);
    setCallbackError(null);
    void createSessionFromUrl(url)
      .then(() => {
        if (!cancelled) {
          setExchanging(false);
        }
      })
      .catch((error) => {
        const message = getErrorMessage(error);
        reportAppError({ route: 'auth/callback', error });
        console.log('[blob:auth-callback]', message);
        if (!cancelled) {
          setExchanging(false);
          setCallbackError(message);
        }
      });

    return () => {
      cancelled = true;
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
  ]);

  if (callbackError) {
    return (
      <Screen>
        <MascotState kind="error" title={copy('auth.signingIn', tone)} body={callbackError} />
        <Redirect href={loginHrefWithAuthError(callbackError) as Href} />
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

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'setup') {
    return <Redirect href="/onboarding/profile-setup" />;
  }

  return <Redirect href={TABS_HREF} />;
}
