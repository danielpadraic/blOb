import { Stack, type ErrorBoundaryProps } from 'expo-router';

import { MessagesRouteErrorBoundary } from '@/components/messages/MessagesSafeBoundary';
import { THEME } from '@/lib/theme';

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <MessagesRouteErrorBoundary {...props} />;
}

export default function MessagesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: THEME.textPrimary,
        headerStyle: { backgroundColor: THEME.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: THEME.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
