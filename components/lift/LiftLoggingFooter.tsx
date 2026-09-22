import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { COMPLETE_LEFTOVER_HINT } from '@/lib/lift/complete';
import { THEME } from '@/lib/theme';

const FOOTER_H = 44;

type FooterBtnProps = {
  title: string;
  variant: 'play' | 'save' | 'share' | 'outline' | 'danger';
  disabled?: boolean;
  dimmed?: boolean;
  loading?: boolean;
  glyph?: boolean;
  onPress: () => void;
};

export function LiftFooterBtn({
  title,
  variant,
  disabled,
  dimmed,
  loading,
  glyph,
  onPress,
}: FooterBtnProps) {
  const isDisabled = Boolean(disabled || loading);
  const grey = Boolean(dimmed && !loading);
  const fill =
    variant === 'play'
      ? THEME.accent
      : variant === 'save' || variant === 'share'
        ? THEME.primary
        : variant === 'danger'
          ? THEME.danger
          : THEME.surface;
  const labelColor =
    variant === 'outline'
      ? title === 'Delete'
        ? THEME.danger
        : THEME.textPrimary
      : THEME.primaryForeground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled || grey, busy: Boolean(loading) }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: FOOTER_H,
        height: FOOTER_H,
        paddingHorizontal: 8,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 4,
        backgroundColor: fill,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: variant === 'outline' ? THEME.border : 'transparent',
        opacity: isDisabled || grey ? 0.38 : pressed ? 0.88 : 1,
      })}>
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : glyph ? (
        <Glyph name={GLYPH.trash} color={THEME.danger} size={16} />
      ) : (
        <AppText
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: labelColor,
            includeFontPadding: false,
          }}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

export function LiftSavedFooter({
  canShare,
  confirmingDelete,
  busy,
  onShare,
  onStartAgain,
  onAskDelete,
  onKeep,
  onDelete,
}: {
  canShare: boolean;
  confirmingDelete: boolean;
  busy: boolean;
  onShare: () => void;
  onStartAgain: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onDelete: () => void;
}) {
  const { width } = useWindowDimensions();
  const trashOnly = width < 360;

  if (confirmingDelete) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LiftFooterBtn title="Keep" variant="outline" onPress={onKeep} />
        <LiftFooterBtn title="Delete" variant="danger" loading={busy} onPress={onDelete} />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LiftFooterBtn title="Share" variant="share" disabled={!canShare} onPress={onShare} />
      <LiftFooterBtn title="Start again" variant="outline" loading={busy} onPress={onStartAgain} />
      <LiftFooterBtn title="Delete" variant="outline" glyph={trashOnly} onPress={onAskDelete} />
    </View>
  );
}

export function LiftDraftFooter({
  canPlay,
  canComplete,
  leftover,
  saving,
  completing,
  statusLine,
  onPlay,
  onSave,
  onComplete,
}: {
  canPlay: boolean;
  canComplete: boolean;
  leftover: boolean;
  saving: boolean;
  completing: boolean;
  statusLine?: string | null;
  onPlay: () => void;
  onSave: () => void;
  onComplete: () => void;
}) {
  const hint = leftover && !canComplete ? COMPLETE_LEFTOVER_HINT : statusLine;

  return (
    <View style={{ gap: 8 }}>
      {hint ? (
        <AppText numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: leftover ? THEME.danger : THEME.textMuted }}>
          {hint}
        </AppText>
      ) : (
        <View style={{ height: 4 }} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LiftFooterBtn title="Play" variant="play" disabled={!canPlay} onPress={onPlay} />
        {canComplete ? (
          <LiftFooterBtn title="Complete" variant="save" loading={completing} onPress={onComplete} />
        ) : (
          <LiftFooterBtn title="Save session" variant="save" loading={saving} onPress={onSave} />
        )}
        {canComplete ? null : leftover ? (
          <LiftFooterBtn title="Complete" variant="save" dimmed onPress={onComplete} />
        ) : null}
      </View>
    </View>
  );
}
