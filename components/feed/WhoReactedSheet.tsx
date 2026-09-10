import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { ReactionMark } from '@/components/feed/ReactionMark';
import { reactionNoSelectProps, reactionNoSelectStyle } from '@/components/feed/ReactionPicker';
import { profileHref } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { useWhoReacted } from '@/hooks/useWhoReacted';
import {
  cornerReactionChips,
  REACTION_MARK_CORNER,
  reactionPickerLabel,
} from '@/lib/reactions';
import { THEME, themeShadow } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

export type WhoReactedTarget = {
  postId: string;
  commentId?: string | null;
  type: ReactionType;
  reactions?: Reaction[];
};

export function WhoReactedSheet({
  target,
  onClose,
}: {
  target: WhoReactedTarget | null;
  onClose: () => void;
}) {
  const [type, setType] = useState<ReactionType>(target?.type ?? 'like');

  useEffect(() => {
    if (target?.type) {
      setType(target.type);
    }
  }, [target?.postId, target?.commentId, target?.type]);

  const chips = useMemo(() => {
    const shown = cornerReactionChips(target?.reactions, undefined);
    if (!shown.some((row) => row.type === type)) {
      return [{ type, count: 0, mine: false }, ...shown];
    }
    return shown;
  }, [target?.reactions, type]);

  const list = useWhoReacted(Boolean(target), target?.postId, target?.commentId, type);
  const router = useRouter();
  const pathname = usePathname();
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 56 || gesture.vy > 0.85) {
            onClose();
          }
        },
      }),
    [onClose],
  );

  const title = reactionPickerLabel(type);
  const people = list.data ?? [];

  return (
    <ChromeOverlay visible={Boolean(target)} onClose={onClose} dim={false} zIndex={70}>
      <View
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          maxHeight: '56%',
          paddingBottom: 16,
          ...themeShadow(),
        }}
        {...swipe.panHandlers}>
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ height: 4, width: 40, borderRadius: 999, backgroundColor: THEME.border }} />
        </View>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={title}
          style={{ alignItems: 'center', paddingBottom: 8 }}>
          <ReactionMark type={type} size={32} />
        </View>
        {chips.length > 1 ? (
          <View
            style={[
              {
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 16,
                paddingBottom: 10,
              },
              reactionNoSelectStyle,
            ]}>
            {chips.map((row) => {
              const selected = row.type === type;
              return (
                <Pressable
                  key={row.type}
                  accessibilityRole="button"
                  accessibilityLabel={reactionPickerLabel(row.type)}
                  accessibilityState={{ selected }}
                  onPress={() => setType(row.type as ReactionType)}
                  {...reactionNoSelectProps()}
                  style={{
                    minHeight: 40,
                    minWidth: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 999,
                    backgroundColor: selected ? THEME.accentSoft : 'transparent',
                    borderWidth: selected ? 1 : 0,
                    borderColor: THEME.accent,
                  }}>
                  <ReactionMark type={row.type} size={REACTION_MARK_CORNER} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <ScrollView
          style={{ maxHeight: 280 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled">
          {list.isLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={THEME.accent} />
            </View>
          ) : people.length === 0 ? (
            <AppText
              className="py-6 text-center text-[14px]"
              style={{ color: THEME.textMuted }}>
              No one yet.
            </AppText>
          ) : (
            people.map((person) => {
              const handle = person.username?.trim() || person.userId;
              return (
                <Pressable
                  key={`${person.userId}-${person.createdAt}`}
                  accessibilityRole="link"
                  accessibilityLabel={person.displayName}
                  onPress={() => {
                    onClose();
                    if (handle) {
                      router.push(profileHref(pathname, handle));
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 52,
                    paddingVertical: 6,
                  }}>
                  <Avatar uri={person.avatarUrl} name={person.displayName} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText
                      className="text-[15px] font-semibold"
                      numberOfLines={1}
                      style={{ color: THEME.textPrimary }}>
                      {person.displayName}
                    </AppText>
                    {person.username ? (
                      <AppText
                        className="text-[13px]"
                        numberOfLines={1}
                        style={{ color: THEME.textMuted }}>
                        @{person.username}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
