import { Stack, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { WizardModalShell } from '@/components/challenge/create/wizardUi';
import { CreateWizard } from '@/components/challenge/create/CreateWizard';
import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { THEME } from '@/lib/theme';

export default function CreateChallengeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return (
      <WizardModalShell onClose={() => router.back()}>
        <Stack.Screen
          options={{
            title: 'Create a Challenge',
            headerShown: false,
            presentation: 'containedTransparentModal',
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <View className="flex-1 px-5 pt-5">
          <View className="mb-4 flex-row items-start justify-between">
            <AppText className="text-[13px] font-semibold text-muted">Create a Challenge</AppText>
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
            body="Challenges are published under your account so competitors know who set the stakes."
          />
          <View className="mt-4">
            <Button title="Back to Lobby" variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      </WizardModalShell>
    );
  }

  return <CreateWizard />;
}
