import { useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { THEME } from '@/lib/theme';
import type { ComposeInput } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { handleEnterToSubmit } from '@/utils/keyboard';
import { isHttpUrl, mediaKind } from '@/utils/media';
import { uploadPostMedia } from '@/utils/upload';

type Attachment = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'file' | 'link';
  mimeType?: string | null;
  name?: string;
  blob?: Blob | null;
};

type ComposerProps = {
  placeholder?: string;
  submitting?: boolean;
  autoFocus?: boolean;
  onSubmit: (input: ComposeInput) => Promise<unknown> | void;
};

export function Composer({
  placeholder = 'What’s the play today?',
  submitting,
  autoFocus,
  onSubmit,
}: ComposerProps) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');

  const busy = Boolean(submitting || uploading);
  const canPost = Boolean(content.trim() || attachments.length > 0);

  function addAttachment(attachment: Omit<Attachment, 'id'>) {
    setAttachments((current) => {
      if (current.length >= 4) {
        Alert.alert('That’s a full blob', 'You can attach up to 4 things per post.');
        return current;
      }
      return [...current, { ...attachment, id: `${Date.now()}-${current.length}` }];
    });
  }

  async function pickMedia(mediaTypes: Array<'images' | 'videos'>) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Turn on library access in Settings to attach media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
      allowsEditing: false,
      videoMaxDuration: 60,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }
    const asset = result.assets[0];
    addAttachment({
      uri: asset.uri,
      kind: mediaTypes.includes('videos') ? 'video' : 'photo',
      mimeType: asset.mimeType ?? asset.file?.type,
      name: asset.fileName ?? asset.file?.name,
      blob: asset.file ?? null,
    });
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) {
        return;
      }
      const asset = result.assets[0];
      addAttachment({
        uri: asset.uri,
        kind: 'file',
        mimeType: asset.mimeType ?? asset.file?.type,
        name: asset.name,
        blob: asset.file ?? null,
      });
    } catch (error) {
      Alert.alert('Couldn’t attach that file', getErrorMessage(error));
    }
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!isHttpUrl(url)) {
      Alert.alert('Needs a real link', 'Paste a full http(s) URL.');
      return;
    }
    addAttachment({ uri: url, kind: 'link', name: url });
    setLinkDraft('');
    setLinkOpen(false);
  }

  function onOther() {
    Alert.alert('Add something', 'A file or a link — your call.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Link', onPress: () => setLinkOpen(true) },
      { text: 'File', onPress: () => void pickFile() },
    ]);
  }

  async function handleSubmit() {
    if (busy || !canPost) {
      return;
    }
    if (!user) {
      Alert.alert('Sign in first', 'You need to be signed in to post.');
      return;
    }
    setUploading(true);
    try {
      const mediaUrls: string[] = [];
      for (const [index, attachment] of attachments.entries()) {
        if (attachment.kind === 'link') {
          mediaUrls.push(attachment.uri);
          continue;
        }
        const url = await uploadPostMedia({
          uri: attachment.uri,
          userId: user.id,
          fileStem: `${Date.now()}-${index}`,
          mimeType: attachment.mimeType ?? attachment.blob?.type,
          blob: attachment.blob,
        });
        mediaUrls.push(url);
      }
      await onSubmit({ content: content.trim(), mediaUrls });
      setContent('');
      setAttachments([]);
    } catch (error) {
      Alert.alert('Couldn’t post that', getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20 }}>
      <View className="flex-row items-center gap-2.5">
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.display_name ?? profile?.username ?? user?.email}
          size={36}
          radius={14}
        />
        <View className="min-w-0 flex-1">
          <Input
            value={content}
            onChangeText={setContent}
            placeholder={placeholder}
            multiline
            autoFocus={autoFocus}
            blurOnSubmit={false}
            className="px-0 py-1 text-[14px]"
            style={{
              minHeight: 36,
              paddingVertical: 6,
              paddingHorizontal: 0,
              borderWidth: 0,
              backgroundColor: 'transparent',
            }}
            onKeyPress={(event) => handleEnterToSubmit(event, () => void handleSubmit())}
            accessibilityLabel="Write a post"
          />
        </View>
        <Button
          title="Post"
          size="sm"
          onPress={() => void handleSubmit()}
          loading={busy}
          disabled={!canPost}
          style={{ height: 36, minWidth: 64, borderRadius: 10 }}
        />
      </View>

      {attachments.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
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

      <View
        className="mt-2 flex-row items-center"
        style={{ borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 8 }}>
        <AttachButton glyph="📷" label="Photo" onPress={() => void pickMedia(['images'])} />
        <View style={{ width: 1, height: 16, backgroundColor: THEME.border }} />
        <AttachButton glyph="🎥" label="Video" onPress={() => void pickMedia(['videos'])} />
        <View style={{ width: 1, height: 16, backgroundColor: THEME.border }} />
        <AttachButton glyph="📎" label="Other" onPress={onOther} />
      </View>

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <Pressable className="flex-1 justify-end bg-charcoal/70" onPress={() => setLinkOpen(false)}>
          <Pressable
            className="px-4 pb-10 pt-3"
            style={{
              backgroundColor: THEME.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
            onPress={(event) => event.stopPropagation()}>
            <AppText className="mb-3 text-[16px] font-bold text-charcoal">Paste a link</AppText>
            <Input
              value={linkDraft}
              onChangeText={setLinkDraft}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onKeyPress={(event) => handleEnterToSubmit(event, addLink)}
            />
            <View className="mt-3 flex-row gap-2">
              <View className="flex-1">
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => setLinkOpen(false)} />
              </View>
              <View className="flex-1">
                <Button title="Add link" size="sm" onPress={addLink} disabled={!linkDraft.trim()} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

function AttachButton({
  glyph,
  label,
  onPress,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="h-8 flex-1 flex-row items-center justify-center rounded-full px-1.5">
      <AppText className="text-[13px]">{glyph}</AppText>
      <AppText className="ml-1 text-[12px] font-semibold text-muted">{label}</AppText>
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
  const kind = attachment.kind === 'link' ? 'link' : mediaKind(attachment.uri);
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 10,
        backgroundColor: THEME.background,
      }}>
      {kind === 'image' || attachment.kind === 'photo' ? (
        <Image source={{ uri: attachment.uri }} style={{ width: 36, height: 36 }} contentFit="cover" />
      ) : (
        <View className="h-9 items-center justify-center px-2">
          <AppText className="text-[11px] font-semibold text-charcoal">
            {attachment.kind === 'video' ? 'Video' : attachment.kind === 'link' ? 'Link' : 'File'}
          </AppText>
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={onRemove} className="px-2">
        <AppText className="text-[12px] font-semibold text-muted">×</AppText>
      </Pressable>
    </View>
  );
}
