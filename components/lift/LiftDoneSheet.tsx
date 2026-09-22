import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { THEME, themeShadow } from '@/lib/theme';

type LiftDoneSheetProps = {
  visible: boolean;
  challenges: LoggableChallenge[];
  busy?: boolean;
  error?: string | null;
  onDone: () => void;
  onShare: () => void;
  onAddToCheckin: (challengeId: string) => void;
};

export function LiftDoneSheet({
  visible,
  challenges,
  busy,
  error,
  onDone,
  onShare,
  onAddToCheckin,
}: LiftDoneSheetProps) {
  return (
    <ChromeOverlay visible={visible} onClose={onDone} align="end" zIndex={140}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 20,
          maxHeight: '80%',
          ...themeShadow('card'),
        }}>
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View style={{ height: 4, width: 40, borderRadius: 999, backgroundColor: THEME.border }} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <AppText style={{ fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>Session complete</AppText>
          {error ? (
            <AppText style={{ marginTop: 8, fontSize: 13, fontWeight: '600', color: THEME.danger }}>{error}</AppText>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          <DoneRow title="Done" onPress={onDone} />
          <DoneRow title="Share" onPress={onShare} />
        </View>
        <AppText
          style={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 6,
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 0.6,
            color: THEME.textMuted,
          }}>
          ADD TO A CHECK-IN
        </AppText>
        <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
          {challenges.length === 0 ? (
            <AppText style={{ paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: THEME.textMuted }}>
              No live check-ins to add this to.
            </AppText>
          ) : (
            challenges.map((challenge) => (
              <Pressable
                key={challenge.id}
                accessibilityRole="button"
                accessibilityLabel={`Add to ${challenge.title}`}
                disabled={busy}
                onPress={() => onAddToCheckin(challenge.id)}
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  backgroundColor: pressed ? THEME.accentSoft : 'transparent',
                  opacity: busy ? 0.5 : 1,
                })}>
                <AppText numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
                  {challenge.title}
                </AppText>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}

function DoneRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
      })}>
      <AppText style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>{title}</AppText>
    </Pressable>
  );
}
