import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import {
  useLiftUnit,
  useOpenLiftSession,
  useStartLiftSession,
} from '@/hooks/useLift';
import { LIFTS_HISTORY_HREF, liftSessionHref } from '@/lib/routes';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * Start a lift. The first tap on a new session is Add exercise — muscle chips never gate create.
 * An already-open draft is resumed so Save / tab blur cannot spawn a second session.
 */
export default function LiftStartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useLiftUnit();
  const open = useOpenLiftSession();
  const start = useStartLiftSession();
  const [error, setError] = useState<string | null>(null);

  const busy = start.isPending;
  const openSession = open.data ?? null;

  async function startNew() {
    setError(null);
    try {
      const id = await start.mutateAsync({ muscles: [], unit });
      router.push(liftSessionHref(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start that lift.');
    }
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText
              style={{
                flex: 1,
                fontSize: 24,
                fontWeight: '800',
                color: THEME.textPrimary,
              }}>
              Lift
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your lifts"
              hitSlop={8}
              onPress={() => router.push(LIFTS_HISTORY_HREF)}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.surface,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}>
              <Glyph name={GLYPH.clock} color={THEME.textPrimary} size={13} />
              <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.textPrimary }}>
                History
              </AppText>
            </Pressable>
          </View>
          <AppText style={{ marginTop: 4, fontSize: 14, color: THEME.textMuted }}>
            Add any exercise. Filter by group only if you want to.
          </AppText>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 16, gap: 12 }}>
          {openSession ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Resume ${openSession.title}`}
              onPress={() => router.push(liftSessionHref(openSession.id))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 16,
                backgroundColor: THEME.accentSoft,
                borderWidth: 1,
                borderColor: THEME.accentBright,
              }}>
              <Glyph name={GLYPH.lift} color={THEME.accent} size={18} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: '800', color: THEME.accent }}>
                  Pick up {openSession.title}
                </AppText>
                <AppText style={{ fontSize: 12, color: THEME.textMuted }}>
                  Still open · {openSession.setCount} sets
                </AppText>
              </View>
              <Glyph name={GLYPH.chevronRight} color={THEME.accent} size={14} />
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 10,
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: tabBarLift(insets.bottom, 'sticky') + 12,
            ...themeShadow('bar'),
          }}>
          {error ? (
            <AppText style={{ fontSize: 13, fontWeight: '600', color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}
          <Button
            title={busy ? 'Starting…' : 'Start lift'}
            loading={busy}
            onPress={() => void startNew()}
          />
        </View>
      </View>
    </Screen>
  );
}
