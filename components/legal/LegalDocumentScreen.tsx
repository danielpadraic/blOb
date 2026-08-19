import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { LEGAL_DOCS, type LegalDocId } from '@/copy/legalDocs';
import { THEME } from '@/lib/theme';

type LegalDocumentScreenProps = {
  doc: LegalDocId;
};

export function LegalDocumentScreen({ doc }: LegalDocumentScreenProps) {
  const router = useRouter();
  const article = LEGAL_DOCS[doc];

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <View className="px-5 pt-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            Back
          </AppText>
        </Pressable>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-12 pt-2"
        showsVerticalScrollIndicator={false}>
        <AppText className="text-[22px] font-extrabold text-charcoal">{article.title}</AppText>
        <AppText className="mt-2 text-[13px] leading-5 text-muted">
          {article.updated} · Version {article.version}
        </AppText>
        <View className="mt-6 gap-6">
          {article.sections.map((section) => (
            <View key={section.heading} className="gap-2">
              <AppText className="text-[15px] font-bold text-charcoal">{section.heading}</AppText>
              {section.body.map((paragraph) => (
                <AppText
                  key={paragraph.slice(0, 48)}
                  className="text-[14px] leading-6"
                  style={{ color: THEME.textPrimary }}>
                  {paragraph}
                </AppText>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
