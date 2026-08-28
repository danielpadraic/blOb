import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useFriends } from '@/hooks/useSocial';
import { audienceLabel, type PostAudience } from '@/lib/postAudience';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';

export function AudienceIconButton({
  audience,
  onPress,
  size = 16,
}: {
  audience: PostAudience;
  onPress?: () => void;
  size?: number;
}) {
  const glyph = audience === 'public' ? GLYPH.globe : audience === 'only_me' ? GLYPH.lock : GLYPH.people;
  const inner = <Glyph name={glyph} color={THEME.textMuted} size={size} />;
  if (!onPress) {
    return (
      <View
        accessibilityLabel={audienceLabel(audience)}
        className="items-center justify-center"
        style={{ width: 32, height: 32 }}>
        {inner}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={audienceLabel(audience)}
      onPress={onPress}
      hitSlop={8}
      className="items-center justify-center"
      style={{ width: 32, height: 32 }}>
      {inner}
    </Pressable>
  );
}

export type AudienceDraft = {
  audience: PostAudience;
  audienceUserIds: string[];
  allowPublic?: boolean;
  allowFriends?: boolean;
  allowedUserIds?: string[];
  profileOnly?: boolean;
  onSave: (audience: PostAudience, audienceUserIds: string[]) => void | Promise<void>;
};

export function AudienceSheet({
  draft,
  onClose,
}: {
  draft: AudienceDraft;
  onClose: () => void;
}) {
  const friends = useFriends();
  const allowPublic = draft.allowPublic !== false;
  const allowFriends = draft.allowFriends !== false;
  const [audience, setAudience] = useState<PostAudience>(draft.audience);
  const [ids, setIds] = useState<string[]>(draft.audienceUserIds);

  function apply(next: PostAudience, nextIds: string[] = ids) {
    setAudience(next);
    setIds(next === 'specific' ? nextIds : []);
    if (next !== 'specific') {
      void draft.onSave(next, []);
      onClose();
    }
  }

  function saveSpecific() {
    void draft.onSave('specific', ids);
    onClose();
  }

  return (
    <ChromeOverlay visible onClose={onClose} align="end">
      <View
        className="px-5 pt-3"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 28,
        }}>
        <View className="items-center pb-3">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-[17px] font-extrabold text-charcoal">Who can see this</AppText>
        {allowPublic ? (
          <Row
            label="Public"
            selected={audience === 'public'}
            glyph={GLYPH.globe}
            onPress={() => apply('public')}
          />
        ) : null}
        {allowFriends ? (
          <Row
            label="Friends"
            selected={audience === 'friends'}
            glyph={GLYPH.people}
            onPress={() => apply('friends')}
          />
        ) : null}
        {draft.profileOnly ? (
          <Row
            label="Only me"
            selected={audience === 'only_me'}
            glyph={GLYPH.lock}
            onPress={() => apply('only_me')}
          />
        ) : (
          <Row
            label="Specific people"
            selected={audience === 'specific'}
            glyph={GLYPH.people}
            onPress={() => apply('specific', ids)}
          />
        )}
        {audience === 'specific' ? (
          <View className="mt-3 gap-2">
            {(friends.data ?? []).length === 0 ? (
              <AppText className="text-[13px] text-muted">Add friends first.</AppText>
            ) : (
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                <ChipRow>
                  {(friends.data ?? []).map((row) => {
                    const id = row.profile?.id;
                    if (!id) {
                      return null;
                    }
                    if (draft.allowedUserIds && !draft.allowedUserIds.includes(id)) {
                      return null;
                    }
                    const selected = ids.includes(id);
                    return (
                      <Chip
                        key={id}
                        label={personDisplayName(row.profile)}
                        selected={selected}
                        onPress={() =>
                          setIds((current) =>
                            selected ? current.filter((item) => item !== id) : [...current, id],
                          )
                        }
                      />
                    );
                  })}
                </ChipRow>
              </ScrollView>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={saveSpecific}
              disabled={ids.length === 0}
              className="mt-2 items-center justify-center rounded-full"
              style={{
                minHeight: 44,
                backgroundColor: ids.length === 0 ? THEME.border : THEME.primary,
              }}>
              <AppText
                className="text-[14px] font-bold"
                style={{ color: ids.length === 0 ? THEME.textMuted : THEME.primaryForeground }}>
                Save
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ChromeOverlay>
  );
}

function Row({
  label,
  selected,
  glyph,
  onPress,
}: {
  label: string;
  selected: boolean;
  glyph: (typeof GLYPH)[keyof typeof GLYPH];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="mt-2 flex-row items-center"
      style={{ minHeight: 44, gap: 10 }}>
      <Glyph name={glyph} color={selected ? THEME.accent : THEME.textMuted} size={18} />
      <AppText
        className="flex-1 text-[15px] font-semibold"
        style={{ color: selected ? THEME.accent : THEME.textPrimary }}>
        {label}
      </AppText>
    </Pressable>
  );
}
