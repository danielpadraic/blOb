import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

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
import { THEME } from '@/lib/theme';
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
const THUMB = 104;

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
  onAddProof: (proof: ChallengeProof) => void;
  onRemoveProof: (proof: ChallengeProof) => void;
  onExtrasChange: (extras: CheckinExtra[]) => void;
  onCaptionChange: (doc: MentionDoc) => void;
  onSend: () => void;
  children?: (parts: { media: ReactNode; footer: ReactNode }) => ReactNode;
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
  onAddProof,
  onRemoveProof,
  onExtrasChange,
  onCaptionChange,
  onSend,
  children,
}: CheckinComposerProps) {
  const fieldRef = useRef<MentionFieldHandle>(null);
  const lightbox = useMediaLightboxOptional();
  const [gifOpen, setGifOpen] = useState(false);

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

  const photoCount =
    proofs.filter((proof) => {
      const uri = drafts[proof.id]?.uri;
      return Boolean(uri && !uri.startsWith('health:'));
    }).length + extras.filter((item) => item.kind === 'photo' || item.kind === 'gif').length;
  const remainingSlots = Math.max(0, CHECKIN_PHOTO_CAP - photoCount);
  const canAddPhoto = remainingSlots > 0 && !busy;
  const canAddVideo = !busy;

  function extraPhotoSheet() {
    if (!canAddPhoto) {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
      return;
    }
    Alert.alert('Extra photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => void pickCamera('photo') },
      { text: 'Gallery', onPress: () => void pickGallery('photo') },
    ]);
  }

  function extraVideoSheet() {
    if (!canAddVideo) {
      return;
    }
    Alert.alert('Extra video', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => void pickCamera('video') },
      { text: 'Gallery', onPress: () => void pickGallery('video') },
    ]);
  }

  function addExtra(attachment: Omit<CheckinExtra, 'id'>) {
    if (extras.filter((item) => item.kind !== 'video').length + (attachment.kind === 'video' ? 0 : 1) > CHECKIN_PHOTO_CAP) {
      Alert.alert('That’s the limit', `You can attach up to ${CHECKIN_PHOTO_CAP} photos.`);
      return;
    }
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

  async function pickGallery(requested: 'photo' | 'video' | 'any' = 'any') {
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
        mediaTypes: requested === 'photo' ? ['images'] : requested === 'video' ? ['videos'] : ['images', 'videos'],
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
        if (requested !== 'any' && kind !== requested) {
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

  const media = (
    <View style={{ gap: 12 }}>
      {proofs.some((proof) => proof.method === 'photo' || proof.method === 'video') ? (
        <AppText className="text-[13px] leading-5 text-muted">
          Required photos first. Extra photos or videos are optional.
        </AppText>
      ) : null}
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {proofs.map((proof) => (
          <ProofThumb
            key={proof.id}
            proof={proof}
            draft={drafts[proof.id]}
            locked={busy}
            onPress={() => {
              const uri = drafts[proof.id]?.uri;
              if (uri && !uri.startsWith('health:') && previewItems.length) {
                const index = previewItems.findIndex((item) => item.uri === uri);
                lightbox?.openLightbox(previewItems, Math.max(index, 0));
                return;
              }
              onAddProof(proof);
            }}
            onRemove={() => onRemoveProof(proof)}
            onRetake={() => onAddProof(proof)}
          />
        ))}
        {extras.map((item, index) => (
          <ExtraThumb
            key={item.id}
            extra={item}
            onPress={() => {
              const start = previewItems.findIndex((row) => row.uri === item.uri);
              lightbox?.openLightbox(previewItems, start >= 0 ? start : index);
            }}
            onRemove={() => onExtrasChange(extras.filter((row) => row.id !== item.id))}
          />
        ))}
        {canAddPhoto ? <AddPhotoTile onPress={extraPhotoSheet} /> : null}
      </View>
    </View>
  );

  const footer = (
    <View style={{ gap: 10 }}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          borderRadius: 18,
          paddingHorizontal: 12,
          paddingVertical: 8,
          minHeight: 44,
        }}>
        <MentionField
          ref={fieldRef}
          compact
          initialText={initialCaption}
          placeholder="Say something."
          audience="specific"
          audienceUserIds={audienceUserIds}
          pickerPlacement="above"
          onChange={onDocChange}
          onSubmit={() => {
            if (!busy) {
              onSend();
            }
          }}
          accessibilityLabel="Say something"
        />
      </View>

      <View className="flex-row items-center" style={{ minHeight: 44, gap: 2 }}>
        <CheckinExtrasBar
          canAddPhoto={canAddPhoto}
          canAddVideo={canAddVideo}
          onExtraPhoto={extraPhotoSheet}
          onExtraVideo={extraVideoSheet}
          onTag={() => fieldRef.current?.insertAt()}
          onGif={() => setGifOpen((open) => !open)}
        />
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityHint={
            !canSend && !busy && !allReady && blockedHint ? `Still needed: ${blockedHint}` : undefined
          }
          accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
          disabled={Boolean(busy)}
          onPress={() => {
            if (!busy) {
              onSend();
            }
          }}
          style={{
            minHeight: 44,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: THEME.primary,
            opacity: canSend ? 1 : 0.38,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[15px] font-semibold" style={{ color: THEME.primaryForeground }}>
            Send
          </AppText>
        </Pressable>
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
  );

  if (children) {
    return <>{children({ media, footer })}</>;
  }

  return (
    <View style={{ gap: 12 }}>
      {media}
      {footer}
    </View>
  );
}

function ProofThumb({
  proof,
  draft,
  locked,
  onPress,
  onRemove,
  onRetake,
}: {
  proof: ChallengeProof;
  draft?: CheckinSlotDraft;
  locked?: boolean;
  onPress: () => void;
  onRemove: () => void;
  onRetake: () => void;
}) {
  const filled = Boolean(draft?.uri || draft?.text);
  const health = draft?.uri?.startsWith('health:');
  return (
    <View style={{ width: THUMB }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filled ? proofDisplayName(proof) : `Add ${proofDisplayName(proof)}`}
        disabled={locked}
        onPress={onPress}
        style={{
          width: THUMB,
          height: THUMB,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: filled ? THEME.accent : THEME.border,
          backgroundColor: THEME.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {filled && draft?.uri && !health ? (
          <Image source={{ uri: draft.uri }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
        ) : (
          <AppText className="px-1 text-center text-[11px] font-bold text-muted" numberOfLines={2}>
            {health ? 'Health' : proofDisplayName(proof)}
          </AppText>
        )}
      </Pressable>
      {filled ? (
        <View className="mt-1 flex-row justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retake"
            onPress={onRetake}
            hitSlop={6}
            style={{ minHeight: 28, justifyContent: 'center' }}>
            <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }}>
              Retake
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove"
            onPress={onRemove}
            hitSlop={6}
            style={{ minHeight: 28, justifyContent: 'center' }}>
            <AppText className="text-[11px] font-semibold text-muted">Remove</AppText>
          </Pressable>
        </View>
      ) : (
        <AppText className="mt-1 text-[11px] text-muted" numberOfLines={1}>
          {proofDisplayName(proof)}
        </AppText>
      )}
    </View>
  );
}

function AddPhotoTile({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ width: THUMB }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Extra photo"
        onPress={onPress}
        style={{
          width: THUMB,
          height: THUMB,
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <AppText className="text-[28px] font-semibold" style={{ color: THEME.accent, lineHeight: 32 }}>
          +
        </AppText>
      </Pressable>
      <AppText className="mt-1 text-[11px] text-muted" numberOfLines={1}>
        Extra
      </AppText>
    </View>
  );
}

function CheckinExtrasBar({
  canAddPhoto,
  canAddVideo,
  onExtraPhoto,
  onExtraVideo,
  onTag,
  onGif,
}: {
  canAddPhoto: boolean;
  canAddVideo: boolean;
  onExtraPhoto: () => void;
  onExtraVideo: () => void;
  onTag: () => void;
  onGif: () => void;
}) {
  return (
    <View className="flex-row items-center" style={{ minHeight: 44, gap: 2 }}>
      <ComposerIcon
        glyph={GLYPH.camera}
        label="Extra photo"
        dimmed={!canAddPhoto}
        onPress={onExtraPhoto}
      />
      <ComposerIcon
        glyph={GLYPH.video}
        label="Extra video"
        dimmed={!canAddVideo}
        onPress={onExtraVideo}
      />
      <ComposerIcon mark="@" label="Tag" onPress={onTag} />
      <ComposerIcon mark="GIF" label="GIF" onPress={onGif} />
    </View>
  );
}

function ExtraThumb({
  extra,
  onPress,
  onRemove,
}: {
  extra: CheckinExtra;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={{ width: THUMB }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Extra media"
        onPress={onPress}
        style={{
          width: THUMB,
          height: THUMB,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
        }}>
        {extra.kind === 'video' ? (
          <View className="h-full w-full items-center justify-center" style={{ backgroundColor: THEME.primary }}>
            <Glyph name={GLYPH.play} color="#fff" size={22} />
          </View>
        ) : (
          <Image source={{ uri: extra.uri }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove extra"
        onPress={onRemove}
        hitSlop={6}
        style={{ minHeight: 28, justifyContent: 'center' }}>
        <AppText className="mt-1 text-[11px] font-semibold text-muted">Extra · Remove</AppText>
      </Pressable>
    </View>
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
        <AppText className="text-[11px] font-extrabold" style={{ color }}>
          {mark}
        </AppText>
      ) : glyph ? (
        <Glyph name={glyph} color={color} size={18} />
      ) : null}
    </Pressable>
  );
}
