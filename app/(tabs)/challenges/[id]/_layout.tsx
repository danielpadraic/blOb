import { Stack } from 'expo-router';
import { View } from 'react-native';

import {
  ChallengeDetailHeaderRight,
  ChallengeDetailOverflowHost,
  useChallengeDetailOverflow,
} from '@/components/challenge/ChallengeDetailOverflow';
import { StackBackButton } from '@/components/navigation/StackBackButton';
import { WalletBar } from '@/components/wallet/WalletBar';
import { THEME } from '@/lib/theme';

export default function ChallengeIdLayout() {
  const overflow = useChallengeDetailOverflow();

  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      <Stack
        screenOptions={{
          headerTintColor: THEME.textPrimary,
          headerStyle: { backgroundColor: THEME.background },
          headerShadowVisible: false,
          headerBackTitle: 'Lobby',
          headerTitleStyle: { fontWeight: '700', color: THEME.textPrimary },
          contentStyle: { backgroundColor: THEME.background },
          headerShown: false,
        }}>
        <Stack.Screen
          name="index"
          options={{
            headerShown: true,
            title: 'Challenge',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton />,
            headerRight: () => <ChallengeDetailHeaderRight />,
          }}
        />
        <Stack.Screen
          name="submit"
          options={{
            headerShown: true,
            title: 'Log workout',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton />,
            headerRight: () => <WalletBar />,
          }}
        />
      </Stack>
      <ChallengeDetailOverflowHost overflow={overflow} />
    </View>
  );
}
