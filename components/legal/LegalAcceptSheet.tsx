import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { LEGAL_DOCS, SKILL_ATTESTATION, type LegalDocId } from '@/copy/legalDocs';
import { THEME } from '@/lib/theme';

export type LegalSheetId = LegalDocId | 'skill';

const TITLES: Record<LegalSheetId, string> = {
  terms: LEGAL_DOCS.terms.title,
  privacy: LEGAL_DOCS.privacy.title,
  skill: 'Skill rule',
};

type LegalAcceptSheetProps = {
  doc: LegalSheetId | null;
  onClose: () => void;
  onAgree: (doc: LegalSheetId) => void;
};

export function LegalAcceptSheet({ doc, onClose, onAgree }: LegalAcceptSheetProps) {
  const insets = useSafeAreaInsets();
  const [read, setRead] = useState(false);

  useEffect(() => {
    setRead(false);
  }, [doc]);

  if (!doc) {
    return null;
  }

  const article = doc === 'skill' ? null : LEGAL_DOCS[doc];

  return (
    <ChromeOverlay visible onClose={onClose}>
      <View
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          maxHeight: '92%',
          paddingBottom: Math.max(insets.bottom, 12),
        }}>
        <View className="items-center pt-2">
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: THEME.border,
            }}
          />
        </View>
        <View className="flex-row items-center px-5 pt-2">
          <AppText className="flex-1 text-[18px] font-extrabold text-charcoal" numberOfLines={2}>
            {TITLES[doc]}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={8}
            style={{
              height: 44,
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 22,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
            }}>
            <AppText className="text-[20px] font-semibold text-muted">×</AppText>
          </Pressable>
        </View>
        {article ? (
          <AppText className="px-5 pt-1 text-[12px] leading-5 text-muted">
            {article.updated} · Version {article.version}
          </AppText>
        ) : null}

        <ScrollView
          className="mt-3"
          style={{ maxHeight: 420 }}
          contentContainerClassName="px-5 pb-4"
          showsVerticalScrollIndicator>
          {article ? (
            <View className="gap-6">
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
          ) : (
            <AppText className="text-[15px] leading-6" style={{ color: THEME.textPrimary }}>
              {SKILL_ATTESTATION}
            </AppText>
          )}
        </ScrollView>

        <View className="gap-3 px-5 pt-3" style={{ borderTopWidth: 1, borderTopColor: THEME.border }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: read }}
            onPress={() => setRead((current) => !current)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: read ? THEME.primary : THEME.border,
                backgroundColor: read ? THEME.primary : THEME.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {read ? (
                <AppText style={{ color: THEME.primaryForeground, fontSize: 12, fontWeight: '700' }}>✓</AppText>
              ) : null}
            </View>
            <AppText className="flex-1 text-[14px] leading-5 text-charcoal">I have read this</AppText>
          </Pressable>
          <Button title="Agree" size="lg" disabled={!read} onPress={() => onAgree(doc)} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
