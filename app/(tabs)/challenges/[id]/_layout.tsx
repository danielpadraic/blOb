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
            title: '',
            headerTitleContainerStyle: { flex: 1, minWidth: 0, maxWidth: '100%' },
            headerRightContainerStyle: { flexGrow: 0, flexShrink: 0 },
            headerLeftContainerStyle: { flexGrow: 0, flexShrink: 0 },
            headerBackVisible: false,
            headerLeft: () => <StackBackButton />,
            headerRight: () => <ChallengeDetailHeaderRight />,
          }}
        />
        <Stack.Screen
          name="submit"
          options={{
            headerShown: false,
            title: 'Check in',
          }}
        />
        <Stack.Screen
          name="official"
          options={{
            headerShown: true,
            title: 'Official tools',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton preferHistory />,
            headerRight: () => <WalletBar />,
          }}
        />
        <Stack.Screen
          name="details"
          options={{
            headerShown: true,
            title: 'Edit details',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton preferHistory />,
            headerRight: () => <WalletBar />,
          }}
        />
        <Stack.Screen
          name="scoring"
          options={{
            headerShown: true,
            title: 'Edit scoring',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton preferHistory />,
            headerRight: () => <WalletBar />,
          }}
        />
      </Stack>
      <ChallengeDetailOverflowHost overflow={overflow} />
    </View>
  );
}
