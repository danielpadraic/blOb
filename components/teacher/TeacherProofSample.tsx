import { View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

/** Static sample — not a real user. High-contrast phone-screenshot mock. */
export function TeacherProofSample() {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
        overflow: 'hidden',
        flexDirection: 'row',
        minHeight: 148,
      }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: THEME.accentSoft,
          paddingVertical: 12,
          paddingHorizontal: 8,
        }}>
        <View
          style={{
            width: 88,
            height: 110,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: THEME.primary,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}>
          <BlobMascot size={72} motion="none" />
        </View>
        <AppText className="mt-2 text-[11px] font-extrabold" style={{ color: THEME.primary }}>
          Check-in photo
        </AppText>
      </View>
      <View
        style={{
          flex: 1.15,
          backgroundColor: THEME.primary,
          paddingHorizontal: 10,
          paddingVertical: 12,
          justifyContent: 'center',
          gap: 8,
        }}>
        <MockLabel kicker="DATE" value="Sep 14, 2026" />
        <MockLabel kicker="TIME" value="7:32 AM" />
        <View>
          <AppText className="text-[10px] font-extrabold tracking-widest" style={{ color: THEME.accentBright }}>
            GRAPH or AVG HR
          </AppText>
          <View
            style={{
              marginTop: 6,
              height: 36,
              borderRadius: 8,
              backgroundColor: '#1B2A27',
              overflow: 'hidden',
              justifyContent: 'flex-end',
              paddingHorizontal: 6,
              paddingBottom: 4,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
              {[10, 16, 14, 22, 18, 26, 20, 24, 19].map((h, index) => (
                <View
                  key={index}
                  style={{
                    width: 6,
                    height: h,
                    borderRadius: 2,
                    backgroundColor: THEME.accentBright,
                  }}
                />
              ))}
            </View>
          </View>
          <AppText className="mt-1 text-[13px] font-extrabold" style={{ color: '#F7FFFC' }}>
            Avg 138
          </AppText>
        </View>
      </View>
    </View>
  );
}

function MockLabel({ kicker, value }: { kicker: string; value: string }) {
  return (
    <View>
      <AppText className="text-[10px] font-extrabold tracking-widest" style={{ color: THEME.accentBright }}>
        {kicker}
      </AppText>
      <AppText className="text-[14px] font-extrabold" style={{ color: '#F7FFFC' }}>
        {value}
      </AppText>
    </View>
  );
}
