import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { isAuthCancelled } from '@/components/auth/AuthShell';
import { getAuthFormMessage } from '@/utils/errors';

type SocialAuthProps = {
  onError: (message: string) => void;
  busy?: boolean;
};

/** Google only. Apple is not offered on unauthenticated entry. */
export function SocialAuth({ onError, busy }: SocialAuthProps) {
  const { signInWithGoogle, oauthLoading } = useAuth();

  async function run() {
    try {
      await signInWithGoogle();
    } catch (error) {
      if (isAuthCancelled(error)) {
        return;
      }
      onError(getAuthFormMessage(error));
    }
  }

  return (
    <View className="gap-3">
      <Button
        title="Continue with Google"
        variant="ghost"
        size="lg"
        disabled={busy || oauthLoading}
        loading={oauthLoading}
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
