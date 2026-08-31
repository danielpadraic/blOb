import { Pressable, View } from 'react-native';

import { FieldLabel } from '@/components/challenge/create/wizardUi';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  PRIVATE_CORPORATE_HELPER,
  PRIVATE_CORPORATE_LABEL,
  applyPrivacyModeSelection,
  canChangePrivacyMode,
  type PrivacyMode,
} from '@/lib/privacyMode';
import { THEME } from '@/lib/theme';

type Visibility = 'public' | 'private' | 'friends' | 'invite';

export function PrivacyModePicker({
  privacyMode,
  visibility,
  challengeLane,
  participantCount = 0,
  error,
  showFieldLabel = true,
  onChange,
  onLockedAttempt,
}: {
  privacyMode: PrivacyMode;
  visibility: Visibility;
  challengeLane: 'coins' | 'private';
  participantCount?: number;
  error?: string;
  showFieldLabel?: boolean;
  onChange: (next: {
    privacy_mode: PrivacyMode;
    visibility: Visibility;
    discoverability: 'invite_only' | 'friends_of_friends' | null;
  }) => void;
  onLockedAttempt?: (message: string) => void;
}) {
  const isPrivateLane = challengeLane === 'private';
  const corporate = privacyMode === 'private_corporate';
  const joinedLock = participantCount >= 1;

  function select(next: PrivacyMode, nextVisibility?: Visibility) {
    const gate = canChangePrivacyMode({
      current: privacyMode,
      next,
      participantCount,
    });
    if (!gate.ok) {
      onLockedAttempt?.(gate.message);
      return;
    }
    onChange(
      applyPrivacyModeSelection(next, {
        challenge_lane: challengeLane,
        visibility: nextVisibility ?? visibility,
      }),
    );
  }

  function selectVisibility(next: Visibility) {
    if (next === 'invite' || next === 'private') {
      select('private', next);
      return;
    }
    select('public', next);
  }

  const selector = (
    <View style={{ opacity: joinedLock ? 0.55 : 1 }}>
      {isPrivateLane ? (
        <View className="gap-2">
          <PrivateChoiceCard
            selected={!corporate}
            title={copy('create.private')}
            body={copy('create.privateHelp')}
            onPress={() => select('private')}
          />
        </View>
      ) : (
        <SegmentedControl
          accessibilityLabel={copy('create.visibility')}
          value={corporate ? null : visibility === 'private' ? 'invite' : visibility}
          options={[
            { value: 'public', label: copy('create.public') },
            { value: 'friends', label: copy('create.friends') },
            { value: 'invite', label: copy('create.invite') },
          ]}
          onChange={selectVisibility}
        />
      )}
    </View>
  );

  return (
    <View className="gap-3">
      {showFieldLabel ? (
        <FieldLabel label={copy('create.visibility')} error={error}>
          {selector}
        </FieldLabel>
      ) : (
        selector
      )}
      <PrivateCorporateCard
        selected={corporate}
        locked={joinedLock}
        onPress={() => select('private_corporate')}
      />
    </View>
  );
}

function PrivateChoiceCard({
  selected,
  title,
  body,
  onPress,
}: {
  selected: boolean;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="rounded-blob border px-4 py-3"
      style={{
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
        borderColor: selected ? THEME.accent : THEME.border,
        borderWidth: 1.5,
        borderRadius: THEME.radius,
      }}>
      <AppText className="font-semibold text-charcoal">{title}</AppText>
      <AppText className="mt-1 text-sm leading-5 text-muted">{body}</AppText>
    </Pressable>
  );
}

function PrivateCorporateCard({
  selected,
  locked = false,
  onPress,
}: {
  selected: boolean;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: locked }}
      accessibilityLabel={PRIVATE_CORPORATE_LABEL}
      className="rounded-blob border px-4 py-3"
      style={{
        backgroundColor: selected ? '#EEF1F0' : THEME.surface,
        borderColor: selected ? THEME.primary : THEME.textPrimary,
        borderWidth: selected ? 2 : 1.75,
        borderRadius: THEME.radius,
        opacity: locked && !selected ? 0.55 : 1,
      }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Glyph name={GLYPH.lock} color={THEME.primary} size={16} />
        <AppText className="font-extrabold text-charcoal">{PRIVATE_CORPORATE_LABEL}</AppText>
      </View>
      <AppText className="mt-1 text-sm leading-5 text-muted">{PRIVATE_CORPORATE_HELPER}</AppText>
    </Pressable>
  );
}
