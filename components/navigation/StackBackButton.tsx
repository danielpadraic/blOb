import { useCallback } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { LOBBY_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

type StackBackButtonProps = {
  fallback?: Href;
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

export function StackBackButton({ fallback }: StackBackButtonProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const target = fallbackHref(params.returnTo, fallback);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={12}
      onPress={() => popToFallback(router, target)}
      className="items-center justify-center py-1 pr-3">
      <AppText
        className="text-[22px] font-semibold leading-7"
        style={{ color: THEME.textPrimary }}>
        ←
      </AppText>
    </Pressable>
  );
}
