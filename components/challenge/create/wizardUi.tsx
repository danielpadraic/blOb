import { createContext, useContext, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { BobPose, type BobPoseName } from '@/components/mascot/BobPose';
import { CREATE_WIZARD_STEPS } from '@/lib/challengeTemplates';
import { draftPreviewLabel, type ChallengeDraft } from '@/lib/challengeDraft';
import { bobExampleLine } from '@/lib/createBobCopy';
import { THEME } from '@/lib/theme';
import { cn } from '@/utils/cn';

const BOB_SIZE = 88;
const BOB_SIZE_NARROW = 72;

const bubbleShadow: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0px 6px 16px rgba(19, 21, 21, 0.16)' }
    : {
        boxShadow: [
          {
            color: 'rgba(19, 21, 21, 0.16)',
            offsetX: 0,
            offsetY: 4,
            blurRadius: 12,
          },
        ],
      };

const modalShadow: ViewStyle =
  Platform.OS === 'web'
    ? { boxShadow: '0px 12px 40px rgba(19, 21, 21, 0.18)' }
    : {
        boxShadow: [
          {
            color: 'rgba(19, 21, 21, 0.18)',
            offsetX: 0,
            offsetY: 8,
            blurRadius: 28,
          },
        ],
      };

export type BobGuideState = {
  pose: BobPoseName;
  tagline: string;
  example?: string;
  kind?: 'tip' | 'error';
  tipIndex?: number;
  tipCount?: number;
  onDismissBubble: () => void;
  onNextTip?: () => void;
  onPrevTip?: () => void;
};

export type WizardFocusApi = {
  registerAnchor: (name: string, node: View | null) => void;
  onAnchorLayout: (name: string) => void;
  onFieldFocus: (name: string) => void;
};

export const WizardFocusContext = createContext<WizardFocusApi | null>(null);

export function useWizardFieldFocus(name: string) {
  const focus = useContext(WizardFocusContext);
  return () => focus?.onFieldFocus(name);
}

export function FieldAnchor({ name, children }: { name: string; children: ReactNode }) {
  const focus = useContext(WizardFocusContext);
  return (
    <TourAnchor id={`create-${name}`}>
      <View
        collapsable={false}
        ref={(node) => focus?.registerAnchor(name, node)}
        onLayout={() => focus?.onAnchorLayout(name)}>
        {children}
      </View>
    </TourAnchor>
  );
}

export function WizardModalShell({
  children,
  onClose,
  bob,
}: {
  children: ReactNode;
  onClose: () => void;
  bob?: BobGuideState | null;
}) {
  const { height, width } = useWindowDimensions();
  const cardWidth = Math.min(width - 24, 560);
  const bobSize = width < 400 ? BOB_SIZE_NARROW : BOB_SIZE;
  const bubbleMaxHeight = Math.min(132, Math.max(72, Math.round(height * 0.22)));
  return (
    <View className="flex-1" style={{ backgroundColor: 'transparent' }}>
        <View className="flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close challenge creator"
            onPress={onClose}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 0,
              backgroundColor: 'rgba(19, 21, 21, 0.55)',
            }}
          />
          <View
            pointerEvents="box-none"
            className="flex-1 items-center px-3"
            style={{
              zIndex: 1,
              paddingTop: 8,
              paddingBottom: 16,
              overflow: 'visible',
            }}>
            <View
              pointerEvents="box-none"
              className="flex-1"
              style={{ width: cardWidth, maxWidth: '100%', overflow: 'visible' }}>
              {bob ? (
                <View
                  pointerEvents="box-none"
                  style={{
                    zIndex: 20,
                    elevation: 24,
                    marginBottom: 8,
                    overflow: 'visible',
                    backgroundColor: 'transparent',
                  }}>
                  <BobGuide bob={bob} bobSize={bobSize} bubbleMaxHeight={bubbleMaxHeight} />
                </View>
              ) : null}
              <View
                pointerEvents="auto"
                className="overflow-hidden"
                style={{
                  flex: 1,
                  zIndex: 2,
                  elevation: 8,
                  backgroundColor: THEME.surface,
                  borderColor: THEME.border,
                  borderWidth: 1,
                  borderRadius: 24,
                  ...modalShadow,
                }}>
                {children}
              </View>
            </View>
          </View>
        </View>
    </View>
  );
}

function BobGuide({
  bob,
  bobSize,
  bubbleMaxHeight,
}: {
  bob: BobGuideState;
  bobSize: number;
  bubbleMaxHeight: number;
}) {
  const paged = bob.kind !== 'error' && (bob.tipCount ?? 1) > 1;
  const isError = bob.kind === 'error';
  const bubbleFill = isError ? '#FEF2F2' : THEME.surface;
  const bubbleBorder = isError ? '#E11D48' : THEME.border;
  const bubbleBorderWidth = isError ? 2 : 1;
  const bubbleText = isError ? THEME.textPrimary : THEME.textPrimary;
  return (
    <View
      pointerEvents="box-none"
      style={{ backgroundColor: 'transparent', overflow: 'visible', opacity: 1, zIndex: 20, elevation: 24 }}>
      <View
        pointerEvents="box-none"
        className="flex-row items-start px-2"
        style={{ backgroundColor: 'transparent' }}>
        <View
          style={{
            marginLeft: 2,
            zIndex: 5,
            backgroundColor: 'transparent',
            overflow: 'visible',
            opacity: 1,
          }}>
          <BobPose pose={bob.pose} size={bobSize} />
        </View>
        <View
          className="min-w-0 flex-1"
          style={{
            marginLeft: 2,
            marginTop: 8,
            maxWidth: '100%',
            backgroundColor: 'transparent',
          }}>
          <View style={{ position: 'relative', backgroundColor: 'transparent' }}>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: isError ? -9 : -8,
                top: 14,
                zIndex: 3,
                width: isError ? 11 : 9,
                height: 16,
              }}>
              <View
                style={{
                  width: 0,
                  height: 0,
                  borderTopWidth: 8,
                  borderBottomWidth: 8,
                  borderRightWidth: isError ? 11 : 9,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderRightColor: bubbleBorder,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: bubbleBorderWidth,
                  top: bubbleBorderWidth,
                  width: 0,
                  height: 0,
                  borderTopWidth: 8 - bubbleBorderWidth,
                  borderBottomWidth: 8 - bubbleBorderWidth,
                  borderRightWidth: isError ? 9 : 8,
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                  borderRightColor: bubbleFill,
                }}
              />
            </View>
            <View
              style={{
                backgroundColor: bubbleFill,
                borderColor: bubbleBorder,
                borderWidth: bubbleBorderWidth,
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 8,
                maxWidth: '100%',
                opacity: 1,
                ...bubbleShadow,
              }}>
              <View className="flex-row items-start gap-2">
                <View style={{ flex: 1, minWidth: 0, maxHeight: bubbleMaxHeight }}>
                  <ScrollView
                    style={{ maxHeight: bubbleMaxHeight }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
                    <Pressable
                      accessibilityRole={paged ? 'button' : undefined}
                      accessibilityLabel={paged ? 'Next tip' : undefined}
                      onPress={paged ? bob.onNextTip : undefined}
                      disabled={!paged}>
                        <AppText
                          className="font-medium leading-5 text-charcoal"
                          style={{ color: bubbleText, fontSize: 15, lineHeight: 20, opacity: 1 }}>
                        {bob.tagline}
                      </AppText>
                      {bob.example ? (
                        <AppText
                          className="leading-5 text-muted"
                          style={{
                            marginTop: 5,
                            color: THEME.textMuted,
                            fontSize: 13,
                            lineHeight: 18,
                          }}>
                          {bobExampleLine(bob.example)}
                        </AppText>
                      ) : null}
                    </Pressable>
                  </ScrollView>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={bob.kind === 'error' ? 'Dismiss error' : 'Dismiss tip'}
                  hitSlop={8}
                  onPress={bob.onDismissBubble}
                  className="h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: THEME.background,
                    borderWidth: 1,
                    borderColor: THEME.border,
                  }}>
                  <AppText className="text-[13px] font-semibold text-muted">×</AppText>
                </Pressable>
              </View>
              {paged ? (
                <View className="mt-1.5 flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous tip"
                    hitSlop={8}
                    onPress={bob.onPrevTip}
                    className="h-6 w-6 items-center justify-center">
                    <AppText className="text-[13px] font-semibold text-muted">‹</AppText>
                  </Pressable>
                  <AppText className="text-[11px] font-semibold text-muted">
                    {bob.tipIndex}/{bob.tipCount}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next tip"
                    hitSlop={8}
                    onPress={bob.onNextTip}
                    className="h-6 w-6 items-center justify-center">
                    <AppText className="text-[13px] font-semibold text-muted">›</AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function WizardProgress({
  step,
  onStepPress,
  trailing,
  status,
}: {
  step: number;
  onStepPress: (index: number) => void;
  trailing?: ReactNode;
  status?: string | null;
}) {
  const current = CREATE_WIZARD_STEPS[step];
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <AppText className="min-w-0 flex-1 text-[13px] font-semibold text-muted">
          Step {step + 1} of {CREATE_WIZARD_STEPS.length}
          {current ? ` · ${current.label}` : ''}
        </AppText>
        {status ? (
          <AppText className="text-[11px] font-semibold text-muted">{status}</AppText>
        ) : null}
        {trailing}
      </View>
      <View className="flex-row items-center gap-1">
        {CREATE_WIZARD_STEPS.map((item, index) => {
          const active = index === step;
          const done = index < step;
          return (
            <Pressable
              key={item.key}
              onPress={() => onStepPress(index)}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}, step ${index + 1} of ${CREATE_WIZARD_STEPS.length}`}
              accessibilityState={{ selected: active }}
              hitSlop={6}
              className="flex-1 justify-center py-1">
              <View
                className="rounded-full"
                style={{
                  height: active ? 6 : 3,
                  backgroundColor: active ? THEME.accent : done ? THEME.primary : THEME.border,
                  opacity: active ? 1 : done ? 0.45 : 1,
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ContinueDraftCard({
  draft,
  onContinue,
  onDiscard,
}: {
  draft: ChallengeDraft;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <View
      className="rounded-blob border px-4 py-3"
      style={{
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1.5,
        borderRadius: THEME.radius,
      }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Continue draft" onPress={onContinue}>
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Draft
        </AppText>
        <AppText className="mt-1 font-semibold text-charcoal">Continue draft</AppText>
        <AppText className="mt-1 text-sm leading-5 text-muted">{draftPreviewLabel(draft)}</AppText>
      </Pressable>
      <View className="mt-3 flex-row gap-2">
        <View style={{ flex: 1 }}>
          <Button title="Continue" accessibilityLabel="Continue draft" onPress={onContinue} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Discard"
            variant="outline"
            accessibilityLabel="Discard draft"
            onPress={onDiscard}
          />
        </View>
      </View>
    </View>
  );
}

export function FieldLabel({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <AppText className="text-sm font-semibold text-charcoal">{label}</AppText>
      {children}
      {error ? (
        <AppText className="text-xs text-coral-dark">{error}</AppText>
      ) : hint ? (
        <AppText className="text-xs leading-5 text-muted">{hint}</AppText>
      ) : null}
    </View>
  );
}

export function ChoiceCard({
  selected,
  title,
  body,
  kicker,
  bullets,
  footer,
  onPress,
  disabled,
}: {
  selected: boolean;
  title: string;
  body?: string;
  kicker?: string;
  bullets?: string[];
  footer?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      className="rounded-blob border px-4 py-3"
      style={{
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
        borderColor: selected ? THEME.accent : THEME.border,
        borderWidth: 1.5,
        borderRadius: THEME.radius,
        opacity: disabled ? 0.45 : 1,
      }}>
      {kicker ? (
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          {kicker}
        </AppText>
      ) : null}
      <AppText className={cn('font-semibold text-charcoal', kicker && 'mt-1')}>{title}</AppText>
      {body ? <AppText className="mt-1 text-sm leading-5 text-muted">{body}</AppText> : null}
      {bullets && bullets.length > 0 ? (
        <View className="mt-2 gap-1">
          {bullets.map((line) => (
            <AppText key={line} className="text-sm leading-5 text-charcoal">
              · {line}
            </AppText>
          ))}
        </View>
      ) : null}
      {footer ? (
        <AppText className="mt-2 text-[12px] font-semibold leading-4 text-muted">{footer}</AppText>
      ) : null}
    </Pressable>
  );
}
