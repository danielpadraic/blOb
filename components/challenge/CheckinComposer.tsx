import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GifPicker } from '@/components/feed/GifPicker';
import { MentionField, type MentionFieldHandle } from '@/components/feed/MentionField';
import { useMediaLightboxOptional } from '@/components/feed/MediaLightbox';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { CHECKIN_PHOTO_CAP, proofDisplayName, type ChallengeProof } from '@/lib/challengeProofs';
import {
  ensureCameraPermission,
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
import type { MentionDoc } from '@/lib/mentions';
import { tabBarLift, THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { asGalleryMedia } from '@/utils/media';

export type CheckinExtra = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'gif';
  mimeType?: string | null;
  name?: string;
  blob?: Blob | null;
  remoteUrl?: string;
};

export type CheckinSlotDraft = {
  uri?: string;
  mimeType?: string | null;
  text?: string;
  fromLibrary?: boolean;
};

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const STRIP = 56;

type CheckinComposerProps = {
  proofs: ChallengeProof[];
  drafts: Record<string, CheckinSlotDraft>;
  extras: CheckinExtra[];
  initialCaption?: string;
  audienceUserIds?: string[];
  allReady: boolean;
  busy?: boolean;
  canSend: boolean;
  blockedHint?: string;
  stillNeeded?: string;
  onClose: () => void;
  onRetake: () => void;
  onOpenGallery: () => void;
  onAddProof: (proof: ChallengeProof) => void;
  onRemoveProof: (proof: ChallengeProof) => void;
  onExtrasChange: (extras: CheckinExtra[]) => void;
  onCaptionChange: (doc: MentionDoc) => void;
  onSend: () => void;
  accessory?: ReactNode;
};

export function CheckinComposer({
  proofs,
  drafts,
  extras,
  initialCaption,
  audienceUserIds = [],
  allReady,
  busy,
  canSend,
  blockedHint,
  stillNeeded,
  onClose,
  onRetake,
  onOpenGallery,
  onAddProof,
  onRemoveProof,
  onExtrasChange,
  onCaptionChange,
  onSend,
  accessory,
}: CheckinComposerProps) {
  const fieldRef = useRef<MentionFieldHandle>(null);
  const lightbox = useMediaLightboxOptional();
  const insets = useSafeAreaInsets();
  const [gifOpen, setGifOpen] = useState(false);
  const chromePad = tabBarLift(insets.bottom, 'sticky');

  const onDocChange = useCallback(
    (doc: MentionDoc) => {
      onCaptionChange(doc);
    },
    [onCaptionChange],
  );

  const previewItems = [
    ...proofs
      .map((proof) => {
        const uri = drafts[proof.id]?.uri;
        if (!uri || uri.startsWith('health:')) {
          return null;
        }
        return { uri, label: proofDisplayName(proof) };
      })
      .filter((row): row is { uri: string; label: string } => Boolean(row)),
    ...extras.map((item) => ({ uri: item.uri, label: item.name ?? 'Extra' })),
  ];
  const current = previewItems[previewItems.length - 1] ?? null;
  const nextProof = proofs.find((proof) => {
    const draft = drafts[proof.id];
    return !draft?.uri && !draft?.text;
  });

  const photoCount =
    proofs.filter((proof) => {
      const uri = drafts[proof.id]?.uri;
      return Boolean(uri && !uri.startsWith('health:'));
    }).length + extras.filter((item) => item.kind === 'photo' || item.kind === 'gif').length;
  const remainingSlots = Math.max(0, CHECKIN_PHOTO_CAP - photoCount);
  const canAddPhoto = remainingSlots > 0 && !busy;

  function extraPhotoSheet() {
    if (!canAddPhoto) {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
      return;
    }
    Alert.alert('Photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => void pickCamera('photo') },
      { text: 'Gallery', onPress: () => void pickGallery('photo') },
    ]);
  }

  function addExtra(attachment: Omit<CheckinExtra, 'id'>) {
    if (photoCount >= CHECKIN_PHOTO_CAP && attachment.kind !== 'video') {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
      return;
    }
    onExtrasChange([...extras, { ...attachment, id: `${Date.now()}-${extras.length}` }]);
  }

  function addMany(attachments: Omit<CheckinExtra, 'id'>[]) {
    const room = Math.max(0, CHECKIN_PHOTO_CAP - photoCount);
    const photos = attachments.filter((item) => item.kind !== 'video');
    const videos = attachments.filter((item) => item.kind === 'video');
    const accepted = [...photos.slice(0, room), ...videos];
    if (photos.length > room) {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
    }
    if (accepted.length === 0) {
      return;
    }
    onExtrasChange([
      ...extras,
      ...accepted.map((attachment, index) => ({
        ...attachment,
        id: `${Date.now()}-${extras.length + index}`,
      })),
    ]);
  }

  async function pickGallery(requested: 'photo' | 'video' | 'any' = 'photo') {
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('library');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: requested === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        allowsMultipleSelection: requested !== 'video' && remainingSlots > 1,
        selectionLimit: requested === 'video' ? 1 : Math.max(remainingSlots, 1),
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      const next: Omit<CheckinExtra, 'id'>[] = [];
      for (const asset of result.assets) {
        if (!asset.uri) {
          continue;
        }
        const kind = asGalleryMedia({
          mimeType: asset.mimeType ?? asset.file?.type,
          fileName: asset.fileName,
          uri: asset.uri,
          type: asset.type,
        });
        if (!kind) {
          continue;
        }
        if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
          Alert.alert('That file is too large', 'Keep it under 50 MB.');
          continue;
        }
        next.push({
          uri: asset.uri,
          kind,
          mimeType: asset.mimeType ?? asset.file?.type,
          name: 'Extra',
          blob: asset.file ?? null,
        });
      }
      if (next.length === 0) {
        Alert.alert('Use a photo or video.');
        return;
      }
      addMany(next);
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  async function pickCamera(kind: 'photo' | 'video' = 'photo') {
    const permission = await ensureCameraPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('camera');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
        { text: 'Gallery', onPress: () => void pickGallery(kind) },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: kind === 'video' ? ['videos'] : ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      addExtra({
        uri: asset.uri,
        kind,
        mimeType: asset.mimeType ?? asset.file?.type,
        name: 'Extra',
        blob: asset.file ?? null,
      });
    } catch (error) {
      if (Platform.OS === 'web') {
        await pickGallery(kind);
        return;
      }
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  function sendPress() {
    if (busy) {
      return;
    }
    onSend();
  }

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      <View className="flex-1" style={{ minHeight: 0, backgroundColor: THEME.primary }}>
        {current ? (
          <Image
            source={{ uri: current.uri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            accessibilityLabel={current.label}
          />
        ) : (
          <View
            className="flex-1 items-center justify-center px-8"
            style={{ backgroundColor: accessory ? THEME.background : THEME.primary }}>
            {accessory ? null : (
              <AppText className="text-center text-[15px]" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Honor check-in. Caption is optional.
              </AppText>
            )}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: Math.max(insets.top, 8) + 4,
            left: 12,
            minWidth: 44,
            minHeight: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(16,19,18,0.45)',
          }}>
          <AppText className="text-[22px] font-semibold" style={{ color: '#fff' }}>
            ×
          </AppText>
        </Pressable>

        {current ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 12,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}>
            <OverlayChip label="Retake" onPress={onRetake} />
            <OverlayChip label="Gallery" onPress={onOpenGallery} />
          </View>
        ) : null}
      </View>

      {previewItems.length > 1 || nextProof || extras.length > 0 ? (
        <View style={{ paddingTop: 8, paddingHorizontal: 12, backgroundColor: THEME.background }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {proofs.map((proof) => {
              const uri = drafts[proof.id]?.uri;
              const health = uri?.startsWith('health:');
              const filled = Boolean(uri || drafts[proof.id]?.text);
              if (!filled) {
                return null;
              }
              return (
                <Pressable
                  key={proof.id}
                  accessibilityRole="button"
                  accessibilityLabel={proofDisplayName(proof)}
                  onPress={() => {
                    if (uri && !health) {
                      const index = previewItems.findIndex((item) => item.uri === uri);
                      lightbox?.openLightbox(previewItems, Math.max(index, 0));
                    }
                  }}
                  onLongPress={() => onRemoveProof(proof)}
                  style={{
                    width: STRIP,
                    height: STRIP,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: THEME.accent,
                    backgroundColor: THEME.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {uri && !health ? (
                    <Image source={{ uri }} style={{ width: STRIP, height: STRIP }} contentFit="cover" />
                  ) : (
                    <AppText className="px-0.5 text-center text-[9px] font-bold text-muted" numberOfLines={2}>
                      {health ? 'Health' : proofDisplayName(proof)}
                    </AppText>
                  )}
                </Pressable>
              );
            })}
            {extras.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel="Extra"
                onPress={() => {
                  const start = previewItems.findIndex((row) => row.uri === item.uri);
                  lightbox?.openLightbox(previewItems, start >= 0 ? start : index);
                }}
                onLongPress={() => onExtrasChange(extras.filter((row) => row.id !== item.id))}
                style={{
                  width: STRIP,
                  height: STRIP,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.surface,
                }}>
                {item.kind === 'video' ? (
                  <View className="h-full w-full items-center justify-center" style={{ backgroundColor: THEME.primary }}>
                    <Glyph name={GLYPH.play} color="#fff" size={16} />
                  </View>
                ) : (
                  <Image source={{ uri: item.uri }} style={{ width: STRIP, height: STRIP }} contentFit="cover" />
                )}
              </Pressable>
            ))}
            {nextProof ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add proof"
                onPress={() => onAddProof(nextProof)}
                style={{
                  width: STRIP,
                  height: STRIP,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: THEME.border,
                  backgroundColor: THEME.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <AppText className="text-[22px] font-semibold" style={{ color: THEME.accent, lineHeight: 24 }}>
                  +
                </AppText>
              </Pressable>
            ) : null}
          </ScrollView>
          {stillNeeded ? (
            <AppText className="mt-1 text-[12px] leading-4 text-muted" numberOfLines={1}>
              Still needed: {stillNeeded}
            </AppText>
          ) : null}
        </View>
      ) : stillNeeded ? (
        <AppText className="px-4 pt-2 text-[12px] leading-4 text-muted" numberOfLines={1}>
          Still needed: {stillNeeded}
        </AppText>
      ) : null}

      {accessory ? <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>{accessory}</View> : null}

      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: chromePad,
          backgroundColor: THEME.background,
        }}>
        <View
          className="flex-row items-end"
          style={{
            backgroundColor: THEME.background,
            borderWidth: 1,
            borderColor: THEME.border,
            borderRadius: 18,
            paddingLeft: 12,
            paddingRight: 4,
            paddingVertical: 4,
            minHeight: 40,
          }}>
          <View className="min-w-0 flex-1" style={{ minHeight: 32, justifyContent: 'flex-end' }}>
            <MentionField
              ref={fieldRef}
              compact
              initialText={initialCaption}
              placeholder="Say something."
              audience="specific"
              audienceUserIds={audienceUserIds}
              pickerPlacement="above"
              onChange={onDocChange}
              onSubmit={sendPress}
              accessibilityLabel="Say something"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityHint={!canSend && !busy && !allReady && blockedHint ? `Still needed: ${blockedHint}` : undefined}
            accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
            disabled={Boolean(busy)}
            onPress={sendPress}
            className="items-center justify-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: canSend && !busy ? THEME.primary : THEME.border,
            }}>
            <Glyph
              name={GLYPH.send}
              color={canSend && !busy ? THEME.primaryForeground : THEME.textMuted}
              size={18}
            />
          </Pressable>
        </View>

        <View className="mt-1 flex-row items-center" style={{ minHeight: 44, gap: 2 }}>
          <ComposerIcon
            glyph={GLYPH.camera}
            label="Camera"
            dimmed={!canAddPhoto}
            onPress={extraPhotoSheet}
          />
          <ComposerIcon
            glyph={GLYPH.album}
            label="Gallery"
            dimmed={!canAddPhoto}
            onPress={() => void pickGallery('photo')}
          />
          <ComposerIcon mark="GIF" label="GIF" onPress={() => setGifOpen((open) => !open)} />
          <ComposerIcon
            mark="+"
            label="Add proof"
            dimmed={!nextProof || Boolean(busy)}
            onPress={() => {
              if (nextProof) {
                onAddProof(nextProof);
              }
            }}
          />
        </View>

        {gifOpen ? (
          <GifPicker
            visible
            onClose={() => setGifOpen(false)}
            onPick={(url) => {
              addExtra({ uri: url, kind: 'gif', name: 'GIF' });
              setGifOpen(false);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function OverlayChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: 'rgba(16,19,18,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText className="text-[13px] font-semibold" style={{ color: '#fff' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ComposerIcon({
  glyph,
  mark,
  label,
  onPress,
  dimmed,
}: {
  glyph?: (typeof GLYPH)[keyof typeof GLYPH];
  mark?: string;
  label: string;
  onPress: () => void;
  dimmed?: boolean;
}) {
  const color = dimmed ? THEME.textMuted : THEME.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="items-center justify-center"
      style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, opacity: dimmed ? 0.45 : 1 }}>
      {mark ? (
        <AppText className="text-[13px] font-extrabold" style={{ color }}>
          {mark}
        </AppText>
      ) : glyph ? (
        <Glyph name={glyph} color={color} size={18} />
      ) : null}
    </Pressable>
  );
}
