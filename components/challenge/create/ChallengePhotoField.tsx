import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { ChallengeCoverCrop } from '@/components/challenge/create/ChallengeCoverCrop';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useAuth } from '@/hooks/useAuth';
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
import { getErrorMessage } from '@/utils/errors';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

type ChallengePhotoFieldProps = {
  uri?: string | null;
  error?: string;
  onChange: (url: string) => void;
  onClear: () => void;
};

function isAllowedImage(mimeType?: string | null, uri?: string): boolean {
  const type = coerceImageContentType(mimeType, uri);
  return ALLOWED.has(type) && !type.includes('pdf');
}

export function ChallengePhotoField({ uri, error, onChange, onClear }: ChallengePhotoFieldProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const message = error || localError;

  function takeAsset(asset: ImagePicker.ImagePickerAsset) {
    if (!isAllowedImage(asset.mimeType ?? asset.file?.type, asset.uri)) {
      setLocalError('Use a JPEG, PNG, WebP, or HEIC photo.');
      return;
    }
    setLocalError(null);
    setPending(asset);
  }

  async function confirmCrop() {
    if (!pending) {
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
      setPending(null);
    } catch (err) {
      setLocalError(getErrorMessage(err) || 'Couldn’t upload that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function pickGallery() {
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
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }
    takeAsset(result.assets[0]);
  }

  async function pickCamera() {
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
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      takeAsset(result.assets[0]);
    } catch {
      if (Platform.OS === 'web') {
        await pickGallery();
        return;
      }
      setLocalError('Couldn’t open the camera. Try the gallery.');
    }
  }

  function onAdd() {
    Alert.alert(copy('create.photoLabel'), copy('create.photoHelper'), [
      { text: copy('create.photoCamera'), onPress: () => void pickCamera() },
      { text: copy('create.photoGallery'), onPress: () => void pickGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View className="gap-2">
      <AppText className="text-[13px] font-semibold text-charcoal">{copy('create.photoLabel')}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={uri ? copy('create.photoReplace') : copy('create.photoAdd')}
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
        {uri ? (
          <Image
            source={{ uri }}
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
      </Pressable>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('create.photoCamera')}
          disabled={busy}
          onPress={() => void pickCamera()}
          style={{ minHeight: 44, minWidth: 88, justifyContent: 'center' }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
            {copy('create.photoCamera')}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('create.photoGallery')}
          disabled={busy}
          onPress={() => void pickGallery()}
          style={{ minHeight: 44, minWidth: 88, justifyContent: 'center' }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
            {copy('create.photoGallery')}
          </AppText>
        </Pressable>
        {uri ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('create.photoRemove')}
            disabled={busy}
            onPress={onClear}
            style={{ minHeight: 44, minWidth: 72, justifyContent: 'center' }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.textMuted }}>
              {copy('create.photoRemove')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <AppText className="text-[12px] leading-5 text-muted">{copy('create.photoHelper')}</AppText>
      {message ? <AppText className="text-sm text-coral-dark">{message}</AppText> : null}
      <ChallengeCoverCrop
        uri={pending?.uri ?? null}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmCrop()}
      />
    </View>
  );
}
