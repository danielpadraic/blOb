import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { KeyboardSheet } from '@/components/ui/KeyboardSheet';
import { useLiftHistory } from '@/hooks/useLift';
import { attachStatusChip, filterAttachableSessions } from '@/lib/lift/attachPicker';
import { shortDate } from '@/lib/lift/session';
import { LIFT_START_HREF } from '@/lib/routes';
import type { LiftSessionSummary } from '@/lib/lift/types';
import { THEME, themeShadow } from '@/lib/theme';

/**
 * Picks one of the owner's lift sessions to attach to a check-in or Home post.
 *
 * Explicit tap only. The list sits above the keyboard with the search field, so the first row is
 * never the hidden default. Keyboard hide does not remount this sheet or clear the parent's
 * chosen session.
 */

type LiftPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (session: LiftSessionSummary) => void;
};

export function LiftPickerSheet({ visible, onClose, onPick }: LiftPickerSheetProps) {
  const router = useRouter();
  const history = useLiftHistory();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) {
      setQuery('');
    }
  }, [visible]);

  const sessions = useMemo(
    () => filterAttachableSessions(history.data ?? [], query),
    [history.data, query],
  );

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end" zIndex={140}>
      <KeyboardSheet>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            minHeight: 0,
            flexGrow: 1,
            ...themeShadow('card'),
          }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ height: 4, width: 40, borderRadius: 999, backgroundColor: THEME.border }} />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 6,
            }}>
            <AppText style={{ flex: 1, fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>
              Attach a lift
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name={GLYPH.close} color={THEME.textPrimary} size={16} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                height: 46,
                paddingHorizontal: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: THEME.background,
              }}>
              <Glyph name={GLYPH.search} color={THEME.textMuted} size={15} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your lifts"
                placeholderTextColor={THEME.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  color: THEME.textPrimary,
                  paddingVertical: 0,
                }}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                  onPress={() => setQuery('')}
                  style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name={GLYPH.close} color={THEME.textMuted} size={13} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {history.isLoading ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
              <AppText style={{ fontSize: 14, color: THEME.textMuted }}>Loading your lifts…</AppText>
            </View>
          ) : sessions.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 20, gap: 12 }}>
              <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>
                No lifts yet
              </AppText>
              <AppText style={{ fontSize: 14, color: THEME.textMuted }}>
                {query.trim()
                  ? 'Nothing matches that search.'
                  : 'Start a lift, then attach it here. This is never a blank panel.'}
              </AppText>
              {query.trim() ? null : (
                <Button
                  title="Start lift"
                  onPress={() => {
                    onClose();
                    router.push(LIFT_START_HREF);
                  }}
                />
              )}
            </View>
          ) : (
            <ScrollView
              style={{ flexGrow: 1, minHeight: 0 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
              {sessions.map((session) => {
                const chip = attachStatusChip(session);
                return (
                  <Pressable
                    key={session.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Attach ${session.title}, ${chip}`}
                    onPress={() => onPick(session)}
                    style={({ pressed }) => ({
                      minHeight: 64,
                      gap: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: THEME.border,
                      backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
                    })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Glyph name={GLYPH.lift} color={THEME.accent} size={17} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={{
                            width: '100%',
                            minHeight: 20,
                            lineHeight: 20,
                            fontSize: 15,
                            fontWeight: '800',
                            color: THEME.textPrimary,
                          }}>
                          {session.title}
                        </AppText>
                        <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
                          {shortDate(session.performedAt)}
                        </AppText>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          height: 22,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: chip === 'Completed' ? THEME.accentSoft : THEME.background,
                          borderWidth: 1,
                          borderColor: chip === 'Completed' ? THEME.accent : THEME.border,
                        }}>
                        <AppText
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: chip === 'Completed' ? THEME.accent : THEME.textMuted,
                          }}>
                          {chip}
                        </AppText>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </KeyboardSheet>
    </ChromeOverlay>
  );
}
