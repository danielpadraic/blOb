import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { SimpleCreateForm } from '@/components/challenge/create/SimpleCreateForm';
import { CreateWizard } from '@/components/challenge/create/CreateWizard';
import { MascotState } from '@/components/mascot/MascotState';
import { popToFallback, useDismissTo } from '@/components/navigation/StackBackButton';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { copy } from '@/lib/copy';
import { LOBBY_HREF, TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

function SignedOutCreate({ fallback }: { fallback: typeof TABS_HREF | typeof LOBBY_HREF }) {
  const router = useRouter();
  useDismissTo(fallback);

  return (
    <Screen padded edges={TAB_ROOT_EDGES}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <View className="flex-1 px-1 pt-4">
        <View className="mb-4 flex-row items-center justify-between">
          <AppText className="text-[13px] font-semibold text-muted">{copy('create.screenTitle')}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => popToFallback(router, fallback)}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border }}>
            <AppText className="text-[22px] font-semibold text-muted">×</AppText>
          </Pressable>
        </View>
        <MascotState
          kind="error"
          title={copy('create.signIn')}
          body={copy('create.signInBody')}
        />
        <View className="mt-4">
          <Button title={copy('create.backLobby')} variant="outline" onPress={() => popToFallback(router, fallback)} />
        </View>
      </View>
    </Screen>
  );
}

export default function CreateChallengeScreen() {
  const params = useLocalSearchParams<{ mode?: string | string[]; returnTo?: string | string[] }>();
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const fallback = returnTo === 'feed' ? TABS_HREF : LOBBY_HREF;
  const { user } = useAuth();

  if (!user) {
    return <SignedOutCreate fallback={fallback} />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      {mode === 'advanced' ? (
        <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding={false}>
          <CreateWizard embedded />
        </Screen>
      ) : (
        <SimpleCreateForm />
      )}
    </>
  );
}
