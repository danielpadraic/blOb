import { asCopyTone, copy, type CopyKey, type CopyTone } from '@/lib/copy';
import { useMyProfile } from '@/hooks/useProfile';

export function useCopyTone(): CopyTone {
  const { profile } = useMyProfile();
  return asCopyTone(profile?.motivation_tone);
}

export function useCopy() {
  const tone = useCopyTone();
  return (key: CopyKey, vars?: Record<string, string | number>) => copy(key, tone, vars);
}
