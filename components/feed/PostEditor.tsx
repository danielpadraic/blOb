import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge } from '@/hooks/useChallenge';
import { useEditPost } from '@/hooks/usePostEdit';
import { requiredChallengeProofs } from '@/lib/challenges';
import { saveCapturedProofLocally } from '@/lib/checkin';
import { isCheckinPost } from '@/lib/checkinPost';
import { proofDisplayName, type ChallengeProofPart } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import { uniqueProofUrls } from '@/lib/challengeProofs';
import {
  canHideCheckinUrl,
  isHiddenMedia,
  requiredProofUrls,
} from '@/lib/postEdit';
import { THEME, themeShadow } from '@/lib/theme';
import type { PostWithMeta } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { uploadPostAttachment } from '@/utils/upload';

import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

type DraftAsset = {
  uri: string;
  mimeType?: string | null;
  captured?: boolean;
  proofId?: string;
};

function uniqueHidden(urls: string[]): string[] {
  return uniqueProofUrls(urls);
}

export function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const edit = useEditPost();
  const checkin = isCheckinPost(post);
  const challenge = useChallenge(checkin && post.challenge_id ? post.challenge_id : undefined);
  const checkinRow = useQuery({
    queryKey: ['edit-checkin', post.checkin_id],
    enabled: Boolean(post.checkin_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_checkins')
        .select('proof_parts')
        .eq('id', post.checkin_id as string)
        .maybeSingle();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return (data?.proof_parts ?? {}) as Record<string, ChallengeProofPart>;
    },
  });
  const proofs = requiredChallengeProofs(challenge.data);
  const required = useMemo(
    () => requiredProofUrls(proofs, checkinRow.data),
    [checkinRow.data, proofs],
  );
  const [caption, setCaption] = useState(post.content ?? '');
  const [mediaUrls, setMediaUrls] = useState(uniqueProofUrls(post.media_urls ?? []));
  const [hidden, setHidden] = useState(uniqueProofUrls(post.hidden_media_urls ?? []));
  const [drafts, setDrafts] = useState<DraftAsset[]>([]);
  const [busy, setBusy] = useState(false);

  const extras = mediaUrls.filter((url) => !Object.values(required).some((urls) => urls.includes(url)));

  function proofIdForUrl(url: string): string | undefined {
    return Object.entries(required).find(([, urls]) => urls.includes(url))?.[0];
  }

  async function pickMedia(proofId?: string) {
    try {
      const camera = proofId
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.9,
          });
      if (camera.canceled || !camera.assets[0]?.uri) {
        return;
      }
      const asset = camera.assets[0];
      if (proofId) {
        void saveCapturedProofLocally({ uri: asset.uri });
      }
      setDrafts((current) => [
        ...current.filter((row) => row.proofId !== proofId),
        {
          uri: asset.uri,
          mimeType: asset.mimeType,
          captured: Boolean(proofId),
          proofId,
        },
      ]);
    } catch (error) {
      Alert.alert('Couldn’t add that', getErrorMessage(error));
    }
  }

  function hideUrl(url: string) {
    const proofId = proofIdForUrl(url);
    const replacements = Object.fromEntries(
      drafts.filter((row) => row.proofId).map((row) => [row.proofId as string, row.uri]),
    );
    if (
      checkin &&
      proofId &&
      !canHideCheckinUrl({
        url,
        hidden,
        required,
        replacements,
      })
    ) {
      Alert.alert(copy('post.replaceFirst'), copy('post.replaceFirstBody'));
      return;
    }
    Alert.alert(copy('post.hidePhoto'), copy('post.hidePhotoBody'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Hide',
        onPress: () => setHidden((current) => uniqueHidden([...current, url])),
      },
    ]);
  }

  function removeRegular(url: string) {
    setMediaUrls((current) => current.filter((item) => item !== url));
    setHidden((current) => current.filter((item) => item !== url));
  }

  async function onSave() {
    if (!user?.id || busy || edit.isPending) {
      return;
    }
    setBusy(true);
    try {
      const replacements: Record<string, string> = {};
      const uploaded: string[] = [];
      for (const draft of drafts) {
        const remote = await uploadPostAttachment({
          uri: draft.uri,
          userId: user.id,
          fileStem: draft.proofId ? `proof-${draft.proofId}` : 'post',
          mimeType: draft.mimeType,
        });
        uploaded.push(remote);
        if (draft.proofId) {
          replacements[draft.proofId] = remote;
        }
      }
      await edit.mutateAsync({
        postId: post.id,
        caption,
        mediaUrls: uniqueProofUrls([...mediaUrls, ...uploaded]),
        hiddenMediaUrls: hidden,
        proofReplacements: replacements,
      });
      onSaved?.();
      onClose();
    } catch (error) {
      Alert.alert('Couldn’t save', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChromeOverlay visible onClose={onClose} align="end" zIndex={70}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '92%',
          paddingBottom: 20,
          ...themeShadow('card'),
        }}>
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <AppText className="text-[15px] font-semibold" style={{ color: THEME.textMuted }}>
              Cancel
            </AppText>
          </Pressable>
          <AppText className="text-[16px] font-extrabold text-charcoal">{copy('post.edit')}</AppText>
          <View style={{ width: 56 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 16 }}>
          <Input
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            multiline
            placeholder="Write a caption…"
          />
          {checkin
            ? proofs.map((proof) => {
                const urls = required[proof.id] ?? [];
                const draft = drafts.find((row) => row.proofId === proof.id);
                if (urls.length === 0 && !draft) {
                  return null;
                }
                return (
                  <View key={proof.id} style={{ gap: 8 }}>
                    <AppText className="text-[13px] font-semibold text-charcoal">
                      {proofDisplayName(proof)}
                    </AppText>
                    {(draft ? [draft.uri] : urls).map((url) => (
                      <EditorFrame
                        key={url}
                        uri={url}
                        hidden={!draft && isHiddenMedia(url, hidden)}
                        owner
                      />
                    ))}
                    <View className="flex-row" style={{ gap: 8 }}>
                      <Button title="Replace" variant="outline" size="sm" onPress={() => void pickMedia(proof.id)} />
                      {urls[0] && !draft ? (
                        <Button title="Hide" variant="ghost" size="sm" onPress={() => hideUrl(urls[0])} />
                      ) : null}
                    </View>
                  </View>
                );
              })
            : null}
          {(checkin ? extras : mediaUrls).map((url) => (
            <View key={url} style={{ gap: 8 }}>
              <EditorFrame uri={url} hidden={isHiddenMedia(url, hidden)} owner />
              <View className="flex-row" style={{ gap: 8 }}>
                {checkin ? (
                  <Button title="Hide" variant="ghost" size="sm" onPress={() => hideUrl(url)} />
                ) : (
                  <Button title="Remove" variant="ghost" size="sm" onPress={() => removeRegular(url)} />
                )}
              </View>
            </View>
          ))}
          {drafts
            .filter((row) => !row.proofId)
            .map((row) => (
              <EditorFrame key={row.uri} uri={row.uri} owner />
            ))}
          <Button
            title={checkin ? 'Add extra photo' : 'Add photo'}
            variant="outline"
            onPress={() => void pickMedia()}
          />
          <Button title="Save" loading={busy || edit.isPending} onPress={() => void onSave()} />
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}

function EditorFrame({
  uri,
  hidden,
  owner,
}: {
  uri: string;
  hidden?: boolean;
  owner?: boolean;
}) {
  return (
    <View
      style={{
        height: 180,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: THEME.background,
      }}>
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        blurRadius={hidden && !owner ? 32 : 0}
      />
      {hidden ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            backgroundColor: 'rgba(16,19,18,0.72)',
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
          <AppText className="text-[12px] font-semibold" style={{ color: THEME.surface }}>
            {copy('post.hiddenByAuthor')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export function PostEditHistory({
  rows,
  onClose,
}: {
  rows: { caption: string; created_at: string }[];
  onClose: () => void;
}) {
  return (
    <ChromeOverlay visible onClose={onClose} align="end" zIndex={70}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '70%',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
          ...themeShadow('card'),
        }}>
        <AppText className="mb-3 text-[16px] font-extrabold text-charcoal">{copy('post.editHistory')}</AppText>
        <ScrollView>
          {rows.length === 0 ? (
            <AppText className="text-[14px]" style={{ color: THEME.textMuted }}>
              No earlier captions.
            </AppText>
          ) : (
            rows.map((row) => (
              <View
                key={row.created_at}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: THEME.border,
                  paddingVertical: 12,
                }}>
                <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
                  {new Date(row.created_at).toLocaleString()}
                </AppText>
                <AppText className="mt-1 text-[15px] text-charcoal">
                  {row.caption.trim() || '(no caption)'}
                </AppText>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
