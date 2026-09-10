import { WavePlayerScreen } from '@/components/clips/WavePlayerScreen';
import { AppErrorBoundary } from '@/components/ui/AppErrorBoundary';
import type { ErrorBoundaryProps } from 'expo-router';

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorBoundary {...props} />;
}

export default function WaveRoute() {
  return <WavePlayerScreen />;
}
