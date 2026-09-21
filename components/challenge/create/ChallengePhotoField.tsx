import { createElement, useRef, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { ChallengeCoverCrop } from '@/components/challenge/create/ChallengeCoverCrop';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { WebTapButton } from '@/components/ui/WebTapButton';
import { useAuth } from '@/hooks/useAuth';
import { COVER_STICK_FAIL, webCoverFile } from '@/lib/challengeCoverPick';
import { cropLobbyCover } from '@/lib/cropLobbyCover';
import { LOBBY_COVER_ASPECT } from '@/lib/lobbyCover';
import {
  ensureCameraPermission,
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import { coerceImageContentType, uploadChallengeCover } from '@/utils/upload';
import { getCoverPhotoMessage } from '@/utils/errors';
import { localUriFromPickerAsset } from '@/utils/media';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

type ChallengePhotoFieldProps = {
  uri?: string | null;
  error?: string;
  onChange: (url: string) => void;
  onClear: () => void;
};

type PendingCover = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string | null;
  file: Blob | File | null;
};

function isAllowedImage(mimeType?: string | null, uri?: string): boolean {
  const type = coerceImageContentType(mimeType, uri);
  return ALLOWED.has(type) && !type.includes('pdf');
}

function pickerFile(asset: ImagePicker.ImagePickerAsset): Blob | File | null {
  const file = asset.file;
  if (file && file.size > 0) {
    return file;
  }
  const blob = (asset as { blob?: Blob | null }).blob;
  return blob && blob.size > 0 ? blob : null;
}

export function ChallengePhotoField({ uri, error, onChange, onClear }: ChallengePhotoFieldProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCover | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const heldUrlRef = useRef<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const message = error || localError;
  const displayUri = previewUri || uri;

  function releaseHeldUrl() {
    const held = heldUrlRef.current;
    heldUrlRef.current = null;
    if (held && held.startsWith('blob:') && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(held);
      } catch {
        // Already revoked.
      }
    }
  }

  function closeSheet() {
    setPending(null);
    setLocalError(null);
    setBusy(false);
    setPreviewUri(null);
    releaseHeldUrl();
  }

  function takeAsset(asset: ImagePicker.ImagePickerAsset) {
    releaseHeldUrl();
    const file = pickerFile(asset);
    let nextUri = localUriFromPickerAsset(asset) ?? String(asset.uri ?? '').trim();
    if (file) {
      try {
        const held = URL.createObjectURL(file);
        heldUrlRef.current = held;
        nextUri = held;
      } catch {
        // Keep the picker uri for the preview frame.
      }
    }
    if (!nextUri && !file) {
      setLocalError(COVER_STICK_FAIL);
      return;
    }
    if (!isAllowedImage(asset.mimeType ?? file?.type, nextUri || file?.type)) {
      setLocalError('Use a JPEG, PNG, WebP, or HEIC photo.');
      releaseHeldUrl();
      return;
    }
    setLocalError(null);
    setPreviewUri(nextUri);
    setPending({
      uri: nextUri,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType ?? file?.type ?? null,
      file,
    });
  }

  function takeWebFile(file: File | undefined) {
    const checked = webCoverFile(file);
    if (!checked.ok) {
      setLocalError(checked.message);
      return;
    }
    releaseHeldUrl();
    let nextUri = '';
    try {
      nextUri = URL.createObjectURL(checked.file);
      heldUrlRef.current = nextUri;
    } catch {
      setLocalError(COVER_STICK_FAIL);
      return;
    }
    if (!isAllowedImage(checked.file.type, nextUri)) {
      setLocalError('Use a JPEG, PNG, WebP, or HEIC photo.');
      releaseHeldUrl();
      return;
    }
    setLocalError(null);
    setPreviewUri(nextUri);
    setPending({
      uri: nextUri,
      mimeType: checked.file.type || null,
      file: checked.file,
    });
  }

  async function confirmCrop() {
    if (!pending || busy) {
      return;
    }
    if (!user) {
      setLocalError(copy('create.signIn'));
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const cropped = await cropLobbyCover({
        uri: pending.uri,
        blob: pending.file,
        width: pending.width,
        height: pending.height,
      });
      const url = await uploadChallengeCover({
        uri: cropped.uri,
        userId: user.id,
        mimeType: 'image/jpeg',
        blob: cropped.blob,
      });
      onChange(url);
      setPreviewUri(null);
      closeSheet();
    } catch (err) {
      setLocalError(getCoverPhotoMessage(err));
      setBusy(false);
    }
  }

  async function pickGallery() {
    if (Platform.OS === 'web') {
      galleryInputRef.current?.click();
      return;
    }
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      const block = permissionCopy('library');
      Alert.alert(block.title, block.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.92,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) {
      return;
    }
    if (!result.assets[0]?.uri && !result.assets[0]?.file) {
      setLocalError(COVER_STICK_FAIL);
      return;
    }
    takeAsset(result.assets[0]);
  }

  async function pickCamera() {
    if (Platform.OS === 'web') {
      cameraInputRef.current?.click();
      return;
    }
    const permission = await ensureCameraPermission();
    if (!permission.ok) {
      const block = permissionCopy('camera');
      Alert.alert(block.title, block.body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => void openAppSettings() },
        { text: copy('create.photoGallery'), onPress: () => void pickGallery() },
      ]);
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.92,
      });
      if (result.canceled) {
        return;
      }
      if (!result.assets[0]?.uri && !result.assets[0]?.file) {
        setLocalError(COVER_STICK_FAIL);
        return;
      }
      takeAsset(result.assets[0]);
    } catch {
      setLocalError('Couldn’t open the camera. Try the gallery.');
    }
  }

  function onAdd() {
    if (Platform.OS === 'web') {
      galleryInputRef.current?.click();
      return;
    }
    Alert.alert(copy('create.photoLabel'), copy('create.photoHelper'), [
      { text: copy('create.photoCamera'), onPress: () => void pickCamera() },
      { text: copy('create.photoGallery'), onPress: () => void pickGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View className="gap-2">
      <AppText className="text-[13px] font-semibold text-charcoal">{copy('create.photoLabel')}</AppText>
      <WebTapButton
        accessibilityLabel={displayUri ? copy('create.photoReplace') : copy('create.photoAdd')}
        disabled={busy}
        onPress={() => void onAdd()}
        style={{
          width: 128,
          aspectRatio: LOBBY_COVER_ASPECT,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {displayUri ? (
          <Image
            source={{ uri: displayUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessibilityLabel={copy('create.photoLabel')}
          />
        ) : (
          <View className="items-center" style={{ gap: 6, paddingHorizontal: 12 }}>
            <Glyph name={GLYPH.camera} color={THEME.accent} size={22} />
            <AppText className="text-center text-[12px] font-semibold" style={{ color: THEME.accent }}>
              {busy ? 'Uploading…' : copy('create.photoAdd')}
            </AppText>
          </View>
        )}
      </WebTapButton>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        <WebTapButton
          accessibilityLabel={copy('create.photoCamera')}
          disabled={busy}
          onPress={() => void pickCamera()}
          style={{ minHeight: 44, minWidth: 88, justifyContent: 'center' }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
            {copy('create.photoCamera')}
          </AppText>
        </WebTapButton>
        <WebTapButton
          accessibilityLabel={copy('create.photoGallery')}
          disabled={busy}
          onPress={() => void pickGallery()}
          style={{ minHeight: 44, minWidth: 88, justifyContent: 'center' }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
            {copy('create.photoGallery')}
          </AppText>
        </WebTapButton>
        {displayUri ? (
          <WebTapButton
            accessibilityLabel={copy('create.photoRemove')}
            disabled={busy}
            onPress={() => {
              setPreviewUri(null);
              onClear();
            }}
            style={{ minHeight: 44, minWidth: 72, justifyContent: 'center' }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.textMuted }}>
              {copy('create.photoRemove')}
            </AppText>
          </WebTapButton>
        ) : null}
      </View>
      {Platform.OS === 'web'
        ? createElement('input', {
            ref: galleryInputRef,
            type: 'file',
            accept: 'image/*',
            tabIndex: -1,
            'aria-hidden': true,
            style: {
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            },
            onChange: (event: { currentTarget: HTMLInputElement }) => {
              takeWebFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            },
          })
        : null}
      {Platform.OS === 'web'
        ? createElement('input', {
            ref: cameraInputRef,
            type: 'file',
            accept: 'image/*',
            capture: 'environment',
            tabIndex: -1,
            'aria-hidden': true,
            style: {
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            },
            onChange: (event: { currentTarget: HTMLInputElement }) => {
              takeWebFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            },
          })
        : null}
      <AppText className="text-[12px] leading-5 text-muted">{copy('create.photoHelper')}</AppText>
      {!pending && message ? <AppText className="text-sm text-coral-dark">{message}</AppText> : null}
      <ChallengeCoverCrop
        uri={pending?.uri ?? null}
        busy={busy}
        error={pending ? localError : null}
        onCancel={closeSheet}
        onConfirm={() => void confirmCrop()}
      />
    </View>
  );
}
