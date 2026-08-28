import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChallengePhotoField } from '@/components/challenge/create/ChallengePhotoField';
import { createStickyFooterPad } from '@/components/challenge/create/wizardUi';
import { CircleInviteSheet } from '@/components/circles/CircleInviteSheet';
import { CircleVisibilityPicker } from '@/components/circles/CircleVisibilityPicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useKeyboardOverlap } from '@/components/ui/KeyboardFormShell';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useCreateCircle } from '@/hooks/useCircles';
import { copy } from '@/lib/copy';
import type { CircleVisibility } from '@/lib/circles';
import { circleDetailHref } from '@/lib/routes';
import { tabBarLift, THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export default function CreateCircleScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const create = useCreateCircle();
  const keyboardOverlap = useKeyboardOverlap();
  const keyboardOpen = keyboardOverlap > 0;
  const [name, setName] = useState('');
  const [focus, setFocus] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [visibility, setVisibility] = useState<CircleVisibility>('friends');
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/friends');
  }

  async function onCreate() {
    const nextName = name.trim();
    const nextFocus = focus.trim();
    if (!nextName) {
      Alert.alert(copy('circles.needName'));
      return;
    }
    if (!nextFocus) {
      Alert.alert(copy('circles.needFocus'));
      return;
    }
    try {
      const row = await create.mutateAsync({
        name: nextName,
        focus: nextFocus,
        description,
        bannerUrl,
        visibility,
      });
      setCreated({ id: row.id, name: row.name });
    } catch (error) {
      Alert.alert('Couldn’t create that Circle', getErrorMessage(error));
    }
  }

  if (!user) {
    return (
      <Screen padded edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppText className="mt-6 text-center text-[15px] text-muted">{copy('circles.signIn')}</AppText>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding={false}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <View
        className="flex-1"
        style={{
          backgroundColor: THEME.background,
          marginBottom: Platform.OS === 'web' ? keyboardOverlap : 0,
        }}>
        <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
          <AppText className="text-[18px] font-extrabold text-charcoal">{copy('circles.createTitle')}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ borderWidth: 1, borderColor: THEME.border }}>
            <AppText className="text-[22px] font-semibold text-muted">×</AppText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Input
            label={copy('circles.name')}
            value={name}
            onChangeText={setName}
            placeholder={copy('circles.namePlaceholder')}
            maxLength={60}
          />
          <Input
            label={copy('circles.focus')}
            value={focus}
            onChangeText={setFocus}
            placeholder={copy('circles.focusPlaceholder')}
            maxLength={80}
          />
          <Input
            label={copy('circles.description')}
            value={description}
            onChangeText={setDescription}
            placeholder={copy('circles.descriptionPlaceholder')}
            grow
            growMaxLines={6}
          />
          <ChallengePhotoField
            uri={bannerUrl}
            onChange={setBannerUrl}
            onClear={() => setBannerUrl('')}
          />
          <CircleVisibilityPicker value={visibility} onChange={setVisibility} />
        </ScrollView>
        <View
          className="gap-2 px-4 pt-2"
          style={{
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: createStickyFooterPad(keyboardOpen, tabBarLift(insets.bottom, 'sticky') + 8),
          }}>
          <Button
            title={copy('circles.create')}
            loading={create.isPending}
            onPress={() => void onCreate()}
          />
        </View>
      </View>
      <CircleInviteSheet
        visible={Boolean(created)}
        circleId={created?.id ?? ''}
        circleName={created?.name ?? ''}
        onClose={() => {
          if (created) {
            router.replace(circleDetailHref(created.id, { tab: 'details' }));
          }
        }}
        onSent={() => {
          if (created) {
            router.replace(circleDetailHref(created.id, { tab: 'details' }));
          }
        }}
      />
    </Screen>
  );
}
