import { useRef, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { GifPicker } from '@/components/feed/GifPicker';
import { MentionField, type MentionFieldHandle } from '@/components/feed/MentionField';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { copy } from '@/lib/copy';
import type { MentionChip, MentionDoc } from '@/lib/mentions';
import {
  ensureCameraPermission,
  ensureLibraryPermission,
  openAppSettings,
  permissionCopy,
} from '@/lib/mediaPermissions';
import type { PostAudience } from '@/lib/postAudience';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { asGalleryMedia } from '@/utils/media';
import { uploadPostAttachment } from '@/utils/upload';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

type Attachment = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'gif';
  mimeType?: string | null;
  name?: string;
  blob?: Blob | null;
};

type InlineComposerProps = {
  placeholder?: string;
  submitting?: boolean;
  submitLabel?: string;
  audience?: PostAudience | string;
  audienceUserIds?: string[];
  replyTo?: MentionChip | null;
  onSubmit: (content: string, mentionedUserIds: string[]) => Promise<unknown> | void;
};

export function InlineComposer({
  placeholder = 'Write a reply…',
  submitting,
  submitLabel = 'Reply',
  audience = 'public',
  audienceUserIds = [],
  replyTo,
  onSubmit,
}: InlineComposerProps) {
  const { user } = useAuth();
  const fieldRef = useRef<MentionFieldHandle>(null);
  const docRef = useRef<MentionDoc>({ text: '', chips: [] });
  const [hasText, setHasText] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [gifOpen, setGifOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = Boolean(submitting || uploading);
  const canSend = hasText || attachments.length > 0;

  function onDocChange(doc: MentionDoc) {
    docRef.current = doc;
    const next = doc.text.trim().length > 0;
    setHasText((current) => (current === next ? current : next));
  }

  function addAttachment(attachment: Omit<Attachment, 'id'>) {
    setAttachments((current) => {
      if (current.length >= 1) {
        return [{ ...attachment, id: `${Date.now()}` }];
      }
      return [...current, { ...attachment, id: `${Date.now()}` }];
    });
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
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
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
        Alert.alert(copy('error.usePhotoOrVideo'));
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
        Alert.alert('That file is too large', 'Keep it under 50 MB.');
        return;
      }
      addAttachment({
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
      addAttachment({
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

  async function submit() {
    const latest = fieldRef.current?.getDoc() ?? docRef.current;
    const trimmed = latest.text.trim();
    if ((!trimmed && attachments.length === 0) || busy) {
      return;
    }
    if (!user) {
      Alert.alert('Sign in first', 'You need to be signed in to reply.');
      return;
    }
    setUploading(true);
    try {
      const mediaUrls: string[] = [];
      for (const [index, attachment] of attachments.entries()) {
        if (attachment.kind === 'gif') {
          mediaUrls.push(attachment.uri);
          continue;
        }
        try {
          const url = await uploadPostAttachment({
            uri: attachment.uri,
            userId: user.id,
            fileStem: `${Date.now()}-${index}`,
            mimeType: attachment.mimeType ?? attachment.blob?.type,
            blob: attachment.blob,
            originalName: attachment.name,
          });
          mediaUrls.push(url);
        } catch {
          throw new Error(copy('error.composerUpload'));
        }
      }
      const content = [trimmed, ...mediaUrls].filter(Boolean).join('\n');
      if (!content) {
        return;
      }
      await onSubmit(
        content,
        latest.chips.map((chip) => chip.userId),
      );
      docRef.current = { text: '', chips: [] };
      setHasText(false);
      setAttachments([]);
      setGifOpen(false);
      setFieldKey((value) => value + 1);
    } catch (error) {
      Alert.alert('Couldn’t post that reply', getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={{ gap: 6 }}>
      <MentionField
        key={fieldKey}
        ref={fieldRef}
        compact
        pickerPlacement="above"
        autoFocus
        placeholder={placeholder}
        initialMention={replyTo}
        audience={audience}
        audienceUserIds={audienceUserIds}
        onChange={onDocChange}
        onSubmit={() => void submit()}
        accessibilityLabel={placeholder}
      />
      {attachments.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() =>
                setAttachments((current) => current.filter((item) => item.id !== attachment.id))
              }
            />
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center" style={{ gap: 2, minHeight: 36 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mention someone"
          hitSlop={8}
          onPress={() => fieldRef.current?.insertAt()}
          {...(Platform.OS === 'web'
            ? {
                onMouseDown: (event: { preventDefault: () => void }) => {
                  event.preventDefault();
                },
              }
            : null)}
          style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[16px] font-extrabold" style={{ color: THEME.accent }}>
            @
          </AppText>
        </Pressable>
        <ReplyIcon
          glyph={GLYPH.camera}
          label="Camera"
          onPress={() => void pickCamera()}
        />
        <ReplyIcon glyph={GLYPH.album} label="Gallery" onPress={() => void pickGallery()} />
        <ReplyIcon mark="GIF" label="GIF" onPress={() => setGifOpen((open) => !open)} />
        <View className="flex-1" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          disabled={!canSend || busy}
          onPress={() => void submit()}
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: THEME.primary,
            opacity: !canSend || busy ? 0.38 : 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.primaryForeground }}>
            {submitLabel}
          </AppText>
        </Pressable>
      </View>
      {gifOpen ? (
        <GifPicker
          visible
          onClose={() => setGifOpen(false)}
          onPick={(url) => {
            addAttachment({ uri: url, kind: 'gif', name: 'GIF' });
            setGifOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

function ReplyIcon({
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
      style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' }}>
      {mark ? (
        <AppText className="text-[11px] font-extrabold" style={{ color: THEME.textMuted }}>
          {mark}
        </AppText>
      ) : glyph ? (
        <Glyph name={glyph} color={THEME.textMuted} size={16} />
      ) : null}
    </Pressable>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const visual = attachment.kind !== 'video';
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 12,
        backgroundColor: THEME.background,
        maxWidth: '100%',
      }}>
      {visual ? (
        <Image source={{ uri: attachment.uri }} style={{ width: 72, height: 54 }} contentFit="cover" />
      ) : (
        <View
          className="items-center justify-center"
          style={{ width: 72, height: 54, backgroundColor: THEME.primary }}>
          <Glyph name={GLYPH.play} color="#fff" size={18} />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        onPress={onRemove}
        style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
        <AppText className="text-[14px] font-semibold text-muted">×</AppText>
      </Pressable>
    </View>
  );
}
