import { View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';

type MascotStateKind = 'loading' | 'empty' | 'error' | 'success';

type MascotStateProps = {
  kind: MascotStateKind;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

const motionFor: Record<MascotStateKind, 'pulse' | 'float' | 'none'> = {
  loading: 'pulse',
  empty: 'float',
  error: 'none',
  success: 'float',
};

export function MascotState({
  kind,
  title,
  body,
  actionLabel,
  onAction,
  compact,
}: MascotStateProps) {
  const mascotSize = compact ? 88 : kind === 'loading' ? 148 : 188;

  return (
    <View
      className={compact ? 'items-center justify-center bg-transparent px-4 py-5' : 'items-center justify-center bg-transparent px-6 py-10'}
      style={{ backgroundColor: 'transparent', overflow: 'visible' }}>
      <BlobMascot size={mascotSize} motion={motionFor[kind]} />
      <AppText
        className={
          compact
            ? 'mt-3 text-center text-[17px] font-bold text-charcoal'
            : 'mt-6 text-center text-2xl font-bold text-charcoal'
        }>
        {title}
      </AppText>
      {body ? (
        <AppText className={compact ? 'mt-1 text-center text-[13px] leading-5 text-muted' : 'mt-2 text-center leading-6 text-muted'}>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          className="mt-6 min-w-[180px]"
          title={actionLabel}
          onPress={onAction}
          variant={kind === 'error' ? 'ghost' : 'primary'}
        />
      ) : null}
    </View>
  );
}
