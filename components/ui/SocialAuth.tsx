import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { isAuthCancelled } from '@/components/auth/AuthShell';

type SocialAuthProps = {
  onError: (message: string) => void;
  busy?: boolean;
};

/** Google only. Apple is not offered on unauthenticated entry. */
export function SocialAuth({ onError, busy }: SocialAuthProps) {
  const { signInWithGoogle } = useAuth();

  async function run() {
    try {
      await signInWithGoogle();
    } catch (error) {
      if (isAuthCancelled(error)) {
        return;
      }
      onError(
        error instanceof Error
          ? error.message
          : 'That sign-in didn’t finish. Please try again.',
      );
    }
  }

  return (
    <View className="gap-3">
      <Button
        title="Continue with Google"
        variant="ghost"
        size="lg"
        disabled={busy}
        onPress={() => void run()}
      />
    </View>
  );
}

export function AuthDivider() {
  return (
    <View className="my-6 flex-row items-center gap-3">
      <View className="h-px flex-1 bg-line" />
      <AppText className="text-xs uppercase tracking-widest text-muted">or</AppText>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}
