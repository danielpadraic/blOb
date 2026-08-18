import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { SimpleCreateForm } from '@/components/challenge/create/SimpleCreateForm';
import { CreateWizard } from '@/components/challenge/create/CreateWizard';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { THEME } from '@/lib/theme';

export default function CreateChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const { user } = useAuth();

  if (!user) {
    return (
      <Screen padded edges={TAB_ROOT_EDGES}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 px-1 pt-4">
          <View className="mb-4 flex-row items-start justify-between">
            <AppText className="text-[13px] font-semibold text-muted">New Challenge</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: THEME.background, borderWidth: 1, borderColor: THEME.border }}>
              <AppText className="text-[16px] font-semibold text-muted">×</AppText>
            </Pressable>
          </View>
          <MascotState
            kind="error"
            title="Sign in to create"
            body="Challenges are published under your account."
          />
          <View className="mt-4">
            <Button title="Back to Lobby" variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {mode === 'advanced' ? (
        <Screen padded={false} edges={TAB_ROOT_EDGES}>
          <CreateWizard embedded />
        </Screen>
      ) : (
        <SimpleCreateForm />
      )}
    </>
  );
}
