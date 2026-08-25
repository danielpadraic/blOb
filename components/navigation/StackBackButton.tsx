import { useCallback } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { useFocusEffect, useGlobalSearchParams, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { fallbackHref, popToFallback } from '@/lib/stackBack';
import { THEME } from '@/lib/theme';

type StackBackButtonProps = {
  fallback?: Href;
  /** Pop the previous screen when there is history, then use fallback. */
  preferHistory?: boolean;
};

export { popToFallback };

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
  const local = useLocalSearchParams<{ returnTo?: string }>();
  const global = useGlobalSearchParams<{ returnTo?: string }>();
  const target = fallbackHref(local.returnTo ?? global.returnTo, fallback);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => {
        popToFallback(router, target, preferHistory);
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
