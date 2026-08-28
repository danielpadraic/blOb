import { Stack } from 'expo-router';

export default function RoundStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#101312' },
      }}>
      <Stack.Screen
        name="[id]"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
          contentStyle: { backgroundColor: '#101312' },
        }}
      />
    </Stack>
  );
}
