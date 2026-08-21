import { useCallback } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

type StackBackButtonProps = {
  fallback?: Href;
  /** Pop the previous screen when there is history, then use fallback. */
  preferHistory?: boolean;
};

function fallbackHref(returnTo?: string | string[], explicit?: Href): Href {
  if (explicit) {
    return explicit;
  }
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (value === 'feed') {
    return '/feed';
  }
  return LOBBY_HREF;
}

export function popToFallback(router: ReturnType<typeof useRouter>, fallback: Href) {
  if (fallback === TABS_HREF) {
    router.dismissTo(fallback);
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

export function useDismissTo(target: Href) {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        popToFallback(router, target);
        return true;
      });
      return () => sub.remove();
    }, [router, target]),
  );
}

export function StackBackButton({ fallback, preferHistory = false }: StackBackButtonProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const target = fallbackHref(params.returnTo, fallback);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => {
        if (preferHistory && router.canGoBack()) {
          router.back();
          return;
        }
        popToFallback(router, target);
      }}
      className="h-11 w-11 items-center justify-center">
      <AppText
        className="text-[22px] font-semibold leading-7"
        style={{ color: THEME.textPrimary }}>
        ←
      </AppText>
    </Pressable>
  );
}
