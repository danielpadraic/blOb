import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useLiftHistory } from '@/hooks/useLift';
import { muscleSummary } from '@/lib/lift/muscles';
import { shortDate } from '@/lib/lift/session';
import type { LiftSessionSummary } from '@/lib/lift/types';
import { THEME, themeShadow } from '@/lib/theme';

/**
 * Picks one of your saved lifts to attach to a post.
 *
 * Saved only. A session still in progress is a workout you are in the middle of, not something to
 * put in front of people — and attaching one would mean the card changed under its readers every
 * time you logged another set.
 */

type LiftPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (session: LiftSessionSummary) => void;
};

export function LiftPickerSheet({ visible, onClose, onPick }: LiftPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const history = useLiftHistory();
  const sessions = history.data ?? [];

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end" zIndex={140}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '80%',
          minHeight: 280,
          paddingBottom: Math.max(insets.bottom, 12),
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

        {history.isLoading ? (
          <MascotState kind="loading" title="Loading your lifts…" />
        ) : sessions.length === 0 ? (
          <MascotState
            kind="empty"
            title="No saved lifts yet"
            body="Finish a session and it will show up here to attach."
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
            {sessions.map((session) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                accessibilityLabel={`Attach ${session.title}`}
                onPress={() => onPick(session)}
                style={({ pressed }) => ({
                  minHeight: 64,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
                })}>
                <Glyph name={GLYPH.lift} color={THEME.accent} size={17} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    numberOfLines={1}
                    style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
                    {session.title}
                  </AppText>
                  <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
                    {[
                      shortDate(session.performedAt),
                      muscleSummary(session.muscleKeys),
                      `${session.exerciseCount} ${session.exerciseCount === 1 ? 'exercise' : 'exercises'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
                <Glyph name={GLYPH.chevronRight} color={THEME.textMuted} size={13} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </ChromeOverlay>
  );
}
