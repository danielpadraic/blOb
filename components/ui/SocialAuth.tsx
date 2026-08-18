import { Platform, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';

function isAuthCancelled(error: unknown): boolean {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String(error.code).toLowerCase();
    if (code.includes('cancel')) {
      return true;
    }
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('cancel');
  }
  return false;
}

type SocialAuthProps = {
  onError: (message: string) => void;
  busy?: boolean;
};

export function SocialAuth({ onError, busy }: SocialAuthProps) {
  const { signInWithApple, signInWithGoogle } = useAuth();

  async function run(action: () => Promise<void>) {
    try {
      await action();
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
        onPress={() => void run(signInWithGoogle)}
      />
      {Platform.OS === 'ios' ? (
        <Button
          title="Continue with Apple"
          variant="secondary"
          size="lg"
          disabled={busy}
          onPress={() => void run(signInWithApple)}
        />
      ) : (
        <Button
          title="Continue with Apple"
          variant="ghost"
          size="lg"
          disabled={busy}
          onPress={() => void run(signInWithApple)}
        />
      )}
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
