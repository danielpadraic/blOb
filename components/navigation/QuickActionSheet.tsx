import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { THEME } from '@/lib/theme';

export type QuickActionId =
  | 'log'
  | 'create'
  | 'join'
  | 'post'
  | 'story'
  | 'reel'
  | 'coins'
  | 'callout';

type QuickActionSheetProps = {
  visible: boolean;
  loggable?: LoggableChallenge | null;
  onClose: () => void;
  onAction: (id: QuickActionId) => void;
};

type ActionRow = {
  id: QuickActionId;
  glyph: string;
  label: string;
  hint?: string;
};

export function QuickActionSheet({
  visible,
  loggable,
  onClose,
  onAction,
}: QuickActionSheetProps) {
  const rows: ActionRow[] = [
    ...(loggable
      ? [
          {
            id: 'log' as const,
            glyph: '✅',
            label: 'Log today’s activity',
            hint: loggable.title,
          },
        ]
      : []),
    { id: 'create', glyph: '🏁', label: 'Create a Challenge' },
    { id: 'callout', glyph: '⚔️', label: 'Call someone out' },
    { id: 'join', glyph: '🤝', label: 'Join a Challenge' },
    { id: 'post', glyph: '✍️', label: 'New Post' },
    { id: 'story', glyph: '📷', label: 'Story' },
    { id: 'reel', glyph: '🎬', label: 'Reel' },
    { id: 'coins', glyph: '🪙', label: 'Send Coins or Bucks' },
  ];

  return (
    <ChromeOverlay visible={visible} onClose={onClose}>
      <View
        className="px-5 pt-4"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: 16,
          maxHeight: '100%',
        }}>
        <View className="mb-4 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
          <AppText className="mt-3 text-lg font-bold text-charcoal">Quick actions</AppText>
        </View>

        <View
          className="overflow-hidden"
          style={{
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
          }}>
          {rows.map((row, index) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              onPress={() => onAction(row.id)}
              className="flex-row items-center px-4 py-3.5"
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: THEME.border,
              }}>
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: THEME.surface2 }}>
                <AppText className="text-[18px]">{row.glyph}</AppText>
              </View>
              <View className="ml-3 flex-1">
                <AppText className="font-semibold text-charcoal">{row.label}</AppText>
                {row.hint ? (
                  <AppText className="mt-0.5 text-sm text-muted" numberOfLines={1}>
                    {row.hint}
                  </AppText>
                ) : null}
              </View>
              <AppText className="text-muted">›</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </ChromeOverlay>
  );
}
