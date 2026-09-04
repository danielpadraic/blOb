import { type ReactNode, type Ref } from 'react';
import { Pressable, View } from 'react-native';

import { OfficialMark } from '@/components/profile/OfficialMark';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';

export const COMMENT_AVATAR = 30;
const BODY_INSET = COMMENT_AVATAR + 8;

type CommentNameRowProps = {
  author?: PublicProfile | null;
  authorId?: string | null;
  name: string;
  handle?: string | null;
  time?: string | null;
  edited?: boolean;
  moreRef?: Ref<View>;
  onMenu?: () => void;
  nameColor?: string;
  metaColor?: string;
  moreColor?: string;
};

export function commentBodyInsetStyle() {
  return { marginTop: 6, marginLeft: BODY_INSET };
}

export function CommentNameRow({
  author,
  authorId,
  name,
  handle,
  time,
  edited,
  moreRef,
  onMenu,
  nameColor = THEME.textPrimary,
  metaColor = THEME.textMuted,
  moreColor = THEME.textMuted,
}: CommentNameRowProps) {
  const username = author?.username ?? null;
  const tag = handle?.trim().replace(/^@/, '');
  const showHandle = Boolean(tag && tag.toLowerCase() !== name.trim().toLowerCase());
  const meta = [time, edited ? copy('comment.edited') : null].filter(Boolean).join(' · ');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: COMMENT_AVATAR,
        gap: 8,
      }}>
      <ProfileLink username={username} userId={authorId} style={{ flexGrow: 0, flexShrink: 0 }}>
        <Avatar uri={author?.avatar_url} name={name} size={COMMENT_AVATAR} />
      </ProfileLink>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 6,
        }}>
        <ProfileLink
          username={username}
          userId={authorId}
          style={{ flexGrow: 0, flexShrink: 1, minWidth: 0, maxWidth: '58%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <AppText
              className="text-[13px] font-semibold"
              style={{ color: nameColor, flexShrink: 1 }}
              numberOfLines={1}>
              {name}
            </AppText>
            <OfficialMark profile={author} compact />
          </View>
        </ProfileLink>
        {showHandle ? (
          <ProfileLink
            username={username}
            userId={authorId}
            style={{ flexGrow: 0, flexShrink: 1, minWidth: 0 }}>
            <AppText
              className="text-[12px]"
              style={{ color: metaColor }}
              numberOfLines={1}>
              @{tag}
            </AppText>
          </ProfileLink>
        ) : null}
        {meta ? (
          <AppText
            className="text-[11px]"
            style={{ color: metaColor, flexShrink: 0 }}
            numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {onMenu ? (
        <Pressable
          ref={moreRef}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel="Comment menu"
          onPress={onMenu}
          hitSlop={8}
          style={{
            flexShrink: 0,
            zIndex: 2,
            minWidth: 32,
            minHeight: 32,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Glyph name={GLYPH.more} color={moreColor} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function CommentBodyBlock({ children }: { children: ReactNode }) {
  return <View style={commentBodyInsetStyle()}>{children}</View>;
}
