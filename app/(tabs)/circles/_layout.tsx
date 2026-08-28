import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export const unstable_settings = {
  initialRouteName: 'create',
};

export default function CirclesStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen
        name="create"
        options={{
          headerShown: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      <Stack.Screen name="[id]" options={HIDDEN_STACK_HEADER} />
    </Stack>
  );
}
