import { usePathname, useRouter } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { splitMentionedText, type MentionRecord } from '@/lib/mentions';
import { challengeHref, circleDetailHref } from '@/lib/routes';
import { pushChallengeHref } from '@/lib/challengeNav';
import { THEME } from '@/lib/theme';

type MentionTextProps = {
  content: string;
  mentions?: MentionRecord[];
  numberOfLines?: number;
  className?: string;
  color?: string;
};

export function MentionText({ content, mentions = [], numberOfLines, className, color }: MentionTextProps) {
  const router = useRouter();
  const pathname = usePathname();
  const parts = splitMentionedText(content, mentions);
  const ink = color ?? THEME.ink;
  return (
    <AppText
      className={className ?? 'text-[14px] leading-[20px]'}
      style={{ color: ink }}
      numberOfLines={numberOfLines}>
      {parts.map((part, index) => {
        const mention = part.mention;
        if (part.type !== 'mention' || !mention) {
          return (
            <AppText key={`${index}-${part.value}`} style={{ color: ink }}>
              {part.value}
            </AppText>
          );
        }
        const kind = mention.kind ?? 'user';
        if (kind === 'user' && !mention.available) {
          return (
            <AppText key={`${index}-${part.value}`} style={{ color: ink }}>
              {part.value}
            </AppText>
          );
        }
        const mentionColor = kind === 'circle' ? THEME.circle : THEME.accent;
        return (
          <AppText
            key={`${index}-${mention.userId}`}
            accessibilityRole="link"
            onPress={() => {
              if (kind === 'circle') {
                router.push(circleDetailHref(mention.userId, { tab: 'details' }));
                return;
              }
              if (kind === 'challenge') {
                pushChallengeHref(router, String(challengeHref(mention.userId)), 'mention', mention.userId, pathname);
                return;
              }
              router.push(profileHref(pathname, mention.username));
            }}
            style={{ color: mentionColor, fontWeight: '700' }}>
            {part.value}
          </AppText>
        );
      })}
    </AppText>
  );
}

function profileHref(pathname: string, handle: string) {
  if (pathname.startsWith('/challenges')) {
    return { pathname: '/challenges/u/[username]' as const, params: { username: handle } };
  }
  if (pathname.startsWith('/profile')) {
    return { pathname: '/profile/u/[username]' as const, params: { username: handle } };
  }
  if (pathname.startsWith('/friends') || pathname.startsWith('/messages')) {
    return { pathname: '/friends/u/[username]' as const, params: { username: handle } };
  }
  return { pathname: '/feed/u/[username]' as const, params: { username: handle } };
}
