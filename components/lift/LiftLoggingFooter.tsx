import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { THEME } from '@/lib/theme';

const FOOTER_H = 44;

type FooterBtnProps = {
  title: string;
  variant: 'play' | 'save' | 'share' | 'outline' | 'danger';
  disabled?: boolean;
  dimmed?: boolean;
  loading?: boolean;
  glyph?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
};

export function LiftFooterBtn({
  title,
  variant,
  disabled,
  dimmed,
  loading,
  glyph,
  accessibilityLabel,
  onPress,
}: FooterBtnProps) {
  const isDisabled = Boolean(loading || (disabled && !dimmed));
  const quiet = Boolean((dimmed || disabled) && !loading);
  const fill = quiet
    ? '#D7DBD8'
    : variant === 'play'
      ? THEME.accent
      : variant === 'save' || variant === 'share'
        ? THEME.primary
        : variant === 'danger'
          ? THEME.danger
          : THEME.surface;
  const labelColor = quiet
    ? THEME.ink
    : variant === 'outline'
      ? title === 'Delete'
        ? THEME.danger
        : THEME.textPrimary
      : THEME.primaryForeground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
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
        opacity: pressed && !isDisabled ? 0.88 : 1,
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
  leftoverLine,
  saving,
  completing,
  statusLine,
  onPlay,
  onSave,
  onComplete,
  onLeftover,
}: {
  canPlay: boolean;
  canComplete: boolean;
  /** Names the set that still blocks Complete. Null when nothing is in the way. */
  leftoverLine?: string | null;
  saving: boolean;
  completing: boolean;
  statusLine?: string | null;
  onPlay: () => void;
  onSave: () => void;
  onComplete: () => void;
  onLeftover?: () => void;
}) {
  return (
    <View style={{ gap: statusLine ? 6 : 0 }}>
      {statusLine ? (
        <AppText numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: THEME.danger }}>
          {statusLine}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LiftFooterBtn title="Play" variant="play" disabled={!canPlay} onPress={onPlay} />
        <LiftFooterBtn title="Save session" variant="save" loading={saving} onPress={onSave} />
        <LiftFooterBtn
          title="Complete"
          variant="save"
          dimmed={!canComplete}
          loading={completing}
          accessibilityLabel={!canComplete && leftoverLine ? leftoverLine : 'Complete'}
          onPress={canComplete ? onComplete : (onLeftover ?? onComplete)}
        />
      </View>
    </View>
  );
}
