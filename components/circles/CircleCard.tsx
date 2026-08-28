import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import type { CircleCardModel } from '@/lib/circles';
import { circleDetailHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { THEME, flexChildMin, themeShadow } from '@/lib/theme';

export function CircleCard({ circle }: { circle: CircleCardModel }) {
  const router = useRouter();
  const countLabel =
    circle.member_count === 1 ? '1 member' : `${circle.member_count} members`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={circle.name}
      onPress={() => router.push(circleDetailHref(circle.id))}
      style={{ minHeight: 44 }}>
      <Card padded={false} style={{ overflow: 'hidden', ...themeShadow('card') }}>
        <View style={{ height: 88, backgroundColor: THEME.circleSoft }}>
          {circle.banner_url ? (
            <Image
              source={{ uri: circle.banner_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <BlobMascot variant="wave" size={56} />
            </View>
          )}
        </View>
        <View className="px-4 py-3">
          <View style={flexChildMin()}>
            <AppText
              className="text-[16px] font-extrabold text-charcoal"
              numberOfLines={1}
              ellipsizeMode="tail">
              {circle.name}
            </AppText>
          </View>
          {circle.focus ? (
            <AppText className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
              {circle.focus}
            </AppText>
          ) : null}
          <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
            <View className="flex-row">
              {circle.preview_members.map((person, index) => (
                <View
                  key={person.id}
                  style={{
                    marginLeft: index === 0 ? 0 : -8,
                    borderWidth: 2,
                    borderColor: THEME.surface,
                    borderRadius: 999,
                  }}>
                  <Avatar uri={person.avatar_url} name={personDisplayName(person)} size={24} />
                </View>
              ))}
            </View>
            <AppText className="text-[12px] text-muted">{countLabel}</AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
