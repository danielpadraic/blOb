import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge } from '@/hooks/useChallenge';
import { useEditPost, useHidePostMedia } from '@/hooks/usePostEdit';
import { requiredChallengeProofs } from '@/lib/challenges';
import { saveCapturedProofLocally } from '@/lib/checkin';
import { isCheckinPost } from '@/lib/checkinPost';
import { proofDisplayName, uniqueProofUrls, type ChallengeProofPart } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import {
  hiddenUrlsFromParts,
  isHiddenMedia,
  isPersistedMediaUrl,
  postEditUnchanged,
  requiredProofUrls,
} from '@/lib/postEdit';
import { THEME, themeShadow } from '@/lib/theme';
import type { PostWithMeta } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { uploadPostAttachment } from '@/utils/upload';
import { supabase } from '@/lib/supabase';

type DraftAsset = {
  uri: string;
  mimeType?: string | null;
  captured?: boolean;
  proofId?: string;
};

export function PostEditor({
  post,
  onClose,
  onSaved,
  onToast,
}: {
  post: PostWithMeta;
  onClose: () => void;
  onSaved?: () => void;
  onToast?: (message: string) => void;
}) {
  const { user } = useAuth();
  const edit = useEditPost();
  const hideMedia = useHidePostMedia();
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
  const mergedHidden = useRef(false);

  useEffect(() => {
    if (!checkinRow.data || mergedHidden.current) {
      return;
    }
    mergedHidden.current = true;
    setHidden((current) => uniqueProofUrls([...current, ...hiddenUrlsFromParts(checkinRow.data)]));
  }, [checkinRow.data]);

  const extras = mediaUrls.filter((url) => !Object.values(required).some((urls) => urls.includes(url)));

  async function persistHidden(nextHidden: string[], previous: string[]) {
    setHidden(nextHidden);
    try {
      await hideMedia.mutateAsync({
        postId: post.id,
        hiddenMediaUrls: nextHidden,
        checkinId: post.checkin_id,
      });
    } catch {
      setHidden(previous);
      onToast?.(copy('post.hideFailed'));
    }
  }

  function hideUrl(url: string) {
    if (!isPersistedMediaUrl(url)) {
      onToast?.(copy('post.savePhotoFirst'));
      return;
    }
    const previous = hidden;
    void persistHidden(uniqueProofUrls([...hidden, url]), previous);
  }

  function unhideUrl(url: string) {
    const previous = hidden;
    void persistHidden(
      hidden.filter((item) => item !== url),
      previous,
    );
  }

  function removeRegular(url: string) {
    setMediaUrls((current) => current.filter((item) => item !== url));
    setHidden((current) => current.filter((item) => item !== url));
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
      onToast?.(getErrorMessage(error));
    }
  }

  async function onSave() {
    if (!user?.id || busy || edit.isPending) {
      return;
    }
    const unchanged =
      drafts.length === 0 &&
      postEditUnchanged({
        caption,
        originalCaption: post.content ?? '',
        mediaUrls,
        originalMediaUrls: post.media_urls ?? [],
        hidden,
        originalHidden: uniqueProofUrls([
          ...(post.hidden_media_urls ?? []),
          ...hiddenUrlsFromParts(checkinRow.data),
        ]),
      });
    if (unchanged) {
      onToast?.(copy('post.noChanges'));
      onClose();
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
        checkinId: post.checkin_id,
      });
      onSaved?.();
      onClose();
    } catch (error) {
      onToast?.(getErrorMessage(error));
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 16 }}>
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
                const shown = draft ? [draft.uri] : urls;
                return (
                  <View key={proof.id} style={{ gap: 8 }}>
                    <AppText className="text-[13px] font-semibold text-charcoal">
                      {proofDisplayName(proof)}
                    </AppText>
                    {shown.map((url) => (
                      <EditorFrame
                        key={url}
                        uri={url}
                        hidden={!draft && isHiddenMedia(url, hidden)}
                      />
                    ))}
                    <View className="flex-row" style={{ gap: 8 }}>
                      <Button
                        title="Replace"
                        variant="outline"
                        size="sm"
                        onPress={() => void pickMedia(proof.id)}
                      />
                      {draft ? (
                        <HideControl
                          blocked={copy('post.savePhotoFirst')}
                          onPress={() => onToast?.(copy('post.savePhotoFirst'))}
                        />
                      ) : urls[0] ? (
                        <HideControl
                          hidden={isHiddenMedia(urls[0], hidden)}
                          blocked={!isPersistedMediaUrl(urls[0]) ? copy('post.replaceFirst') : null}
                          onPress={() => {
                            if (!isPersistedMediaUrl(urls[0])) {
                              onToast?.(copy('post.replaceFirst'));
                              return;
                            }
                            if (isHiddenMedia(urls[0], hidden)) {
                              unhideUrl(urls[0]);
                              return;
                            }
                            hideUrl(urls[0]);
                          }}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
            : null}
          {(checkin ? extras : mediaUrls).map((url) => (
            <View key={url} style={{ gap: 8 }}>
              <EditorFrame uri={url} hidden={isHiddenMedia(url, hidden)} />
              <View className="flex-row" style={{ gap: 8 }}>
                {checkin ? (
                  <HideControl
                    hidden={isHiddenMedia(url, hidden)}
                    blocked={!isPersistedMediaUrl(url) ? copy('post.savePhotoFirst') : null}
                    onPress={() =>
                      isHiddenMedia(url, hidden) ? unhideUrl(url) : hideUrl(url)
                    }
                  />
                ) : (
                  <Button title="Remove" variant="ghost" size="sm" onPress={() => removeRegular(url)} />
                )}
              </View>
            </View>
          ))}
          {drafts
            .filter((row) => !row.proofId)
            .map((row) => (
              <View key={row.uri} style={{ gap: 8 }}>
                <EditorFrame uri={row.uri} />
                <HideControl
                  blocked={copy('post.savePhotoFirst')}
                  onPress={() => onToast?.(copy('post.savePhotoFirst'))}
                />
              </View>
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

function HideControl({
  hidden,
  blocked,
  onPress,
}: {
  hidden?: boolean;
  blocked?: string | null;
  onPress: () => void;
}) {
  const title = hidden ? copy('post.unhide') : 'Hide';
  if (blocked && !hidden) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={blocked}
        onPress={onPress}
        hitSlop={8}
        style={{
          height: 40,
          paddingHorizontal: 12,
          borderRadius: THEME.radiusSm,
          borderWidth: 1,
          borderColor: THEME.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.38,
        }}>
        <AppText className="text-[14px] font-semibold" style={{ color: THEME.textMuted }}>
          {title}
        </AppText>
      </Pressable>
    );
  }
  return <Button title={title} variant="ghost" size="sm" onPress={onPress} />;
}

function EditorFrame({
  uri,
  hidden,
}: {
  uri: string;
  hidden?: boolean;
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
        blurRadius={hidden ? 36 : 0}
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
