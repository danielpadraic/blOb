import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  ensureCameraPermission,
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { uploadPostAttachment } from '@/utils/upload';

export type MessageSendPayload = {
  body: string;
  media_url?: string | null;
};

type MessageInputProps = {
  sending?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  draft?: string;
  onSend: (payload: MessageSendPayload) => void;
};

export function MessageInput({
  sending,
  autoFocus = false,
  disabled = false,
  draft,
  onSend,
}: MessageInputProps) {
  const { user } = useAuth();
  const [value, setValue] = useState(() => draft?.trim() ?? '');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const trimmed = value.trim();
  const blocked = disabled || Boolean(sending) || uploading;
  const canSendText = trimmed.length > 0 && !blocked;

  useEffect(() => {
    setValue(draft?.trim() ?? '');
  }, [draft]);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }
    const handle = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(handle);
  }, [autoFocus, disabled]);

  function submit() {
    if (!canSendText) {
      return;
    }
    onSend({ body: trimmed });
    setValue('');
  }

  async function sendPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (!user?.id) {
      Alert.alert('Sign in first', 'You need to be signed in to send a photo.');
      return;
    }
    setUploading(true);
    try {
      const mediaUrl = await uploadPostAttachment({
        uri: asset.uri,
        userId: user.id,
        fileStem: `dm-${Date.now()}`,
        mimeType: asset.mimeType ?? asset.file?.type,
        blob: asset.file ?? null,
        originalName: asset.fileName ?? 'Photo',
      });
      onSend({ body: trimmed, media_url: mediaUrl });
      setValue('');
    } catch (error) {
      Alert.alert('Couldn’t send that photo', getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function pickGallery() {
    if (blocked) {
      return;
    }
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
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      await sendPhoto(result.assets[0]);
    } catch (error) {
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  async function pickCamera() {
    if (blocked) {
      return;
    }
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
      await sendPhoto(result.assets[0]);
    } catch (error) {
      if (Platform.OS === 'web') {
        await pickGallery();
        return;
      }
      Alert.alert('Couldn’t attach that', getErrorMessage(error));
    }
  }

  return (
    <View
      className="flex-row items-end gap-2 px-4 py-3"
      style={{ backgroundColor: THEME.background, borderTopWidth: 1, borderTopColor: THEME.border }}>
      {disabled ? null : (
        <View className="flex-row items-center" style={{ gap: 2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Camera"
            disabled={blocked}
            onPress={() => void pickCamera()}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.camera} color={THEME.textPrimary} size={20} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gallery"
            disabled={blocked}
            onPress={() => void pickGallery()}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.album} color={THEME.textPrimary} size={20} />
          </Pressable>
        </View>
      )}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={setValue}
        placeholder="Message"
        placeholderTextColor={THEME.textMuted}
        keyboardAppearance="light"
        selectionColor={THEME.accent}
        multiline
        maxLength={2000}
        editable={!blocked}
        autoFocus={autoFocus}
        onSubmitEditing={submit}
        blurOnSubmit={false}
        className="max-h-[120px] min-h-[44px] flex-1 px-4 py-2.5 text-[15px]"
        style={{
          color: THEME.textPrimary,
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          borderRadius: 18,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ busy: Boolean(sending || uploading), disabled: !canSendText }}
        disabled={!canSendText}
        onPress={submit}
        className="h-11 items-center justify-center px-4"
        style={{
          backgroundColor: THEME.primary,
          borderRadius: 18,
          opacity: canSendText ? 1 : 0.38,
        }}>
        <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
          Send
        </AppText>
      </Pressable>
    </View>
  );
}
