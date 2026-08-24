import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { GifPicker } from '@/components/feed/GifPicker';
import { MentionField, type MentionFieldHandle } from '@/components/feed/MentionField';
import { useMediaLightboxOptional } from '@/components/feed/MediaLightbox';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { proofDisplayName, type ChallengeProof } from '@/lib/challengeProofs';
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

const MAX_EXTRAS = 4;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const THUMB = 88;

type CheckinComposerProps = {
  proofs: ChallengeProof[];
  drafts: Record<string, CheckinSlotDraft>;
  extras: CheckinExtra[];
  initialCaption?: string;
  allReady: boolean;
  busy?: boolean;
  canSend: boolean;
  onAddProof: (proof: ChallengeProof) => void;
  onRemoveProof: (proof: ChallengeProof) => void;
  onExtrasChange: (extras: CheckinExtra[]) => void;
  onCaptionChange: (doc: MentionDoc) => void;
  onSend: () => void;
};

export function CheckinComposer({
  proofs,
  drafts,
  extras,
  initialCaption,
  allReady,
  busy,
  canSend,
  onAddProof,
  onRemoveProof,
  onExtrasChange,
  onCaptionChange,
  onSend,
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

  function addExtra(attachment: Omit<CheckinExtra, 'id'>) {
    if (extras.length >= MAX_EXTRAS) {
      Alert.alert('That’s a full blob', 'You can attach up to 4 extra things.');
      return;
    }
    onExtrasChange([...extras, { ...attachment, id: `${Date.now()}-${extras.length}` }]);
  }

  async function pickGallery() {
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
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      const kind = asGalleryMedia({
        mimeType: asset.mimeType ?? asset.file?.type,
        fileName: asset.fileName,
        uri: asset.uri,
        type: asset.type,
      });
      if (!kind) {
        Alert.alert('Use a photo or video.');
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
        Alert.alert('That file is too large', 'Keep it under 50 MB.');
        return;
      }
      addExtra({
        uri: asset.uri,
        kind,
        mimeType: asset.mimeType ?? asset.file?.type,
        name: asset.fileName ?? (kind === 'video' ? 'Video' : 'Photo'),
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  async function pickCamera() {
    const permission = await ensureCameraPermission();
    if (!permission.ok) {
      const copyBlock = permissionCopy('camera');
      Alert.alert(copyBlock.title, copyBlock.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
        { text: 'Gallery', onPress: () => void pickGallery() },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      addExtra({
        uri: asset.uri,
        kind: 'photo',
        mimeType: asset.mimeType ?? asset.file?.type,
        name: asset.fileName ?? 'Photo',
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  return (
    <View style={{ gap: 12 }}>
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
      </View>

      <View
        style={{
          backgroundColor: THEME.background,
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
          placeholder="How did it go? Tag a friend…"
          audience="public"
          audienceUserIds={[]}
          onChange={onDocChange}
          onSubmit={() => {
            if (canSend && !busy) {
              onSend();
            }
          }}
          accessibilityLabel="Check-in caption"
        />
      </View>

      <View className="flex-row items-center" style={{ minHeight: 44, gap: 2 }}>
        {allReady ? (
          <>
            <ComposerIcon glyph={GLYPH.camera} label="Camera" onPress={() => void pickCamera()} />
            <ComposerIcon glyph={GLYPH.album} label="Gallery" onPress={() => void pickGallery()} />
            <ComposerIcon mark="GIF" label="GIF" onPress={() => setGifOpen((open) => !open)} />
          </>
        ) : (
          <AppText className="flex-1 text-[13px] text-muted">Add required proof first.</AppText>
        )}
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend || busy}
          onPress={onSend}
          style={{
            minHeight: 44,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: THEME.primary,
            opacity: !canSend || busy ? 0.38 : 1,
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
        <AppText className="mt-1 text-[11px] font-semibold text-muted">Remove</AppText>
      </Pressable>
    </View>
  );
}

function ComposerIcon({
  glyph,
  mark,
  label,
  onPress,
}: {
  glyph?: (typeof GLYPH)[keyof typeof GLYPH];
  mark?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="items-center justify-center"
      style={{ width: 44, height: 44 }}>
      {mark ? (
        <AppText className="text-[11px] font-extrabold" style={{ color: THEME.textMuted }}>
          {mark}
        </AppText>
      ) : glyph ? (
        <Glyph name={glyph} color={THEME.textMuted} size={18} />
      ) : null}
    </Pressable>
  );
}
