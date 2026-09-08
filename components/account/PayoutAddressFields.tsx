import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { KeyboardField } from '@/components/ui/KeyboardFormShell';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  filterPayoutStates,
  parsePayoutState,
  payoutStateLabel,
  type PayoutAddressDraft,
} from '@/lib/payoutAddress';
import { USPS_REGION_LABELS } from '@/lib/geo/regions';
import { THEME } from '@/lib/theme';

type Props = {
  draft: PayoutAddressDraft;
  onChange: (next: PayoutAddressDraft) => void;
  stateError?: string | null;
};

export function PayoutAddressFields({ draft, onChange, stateError }: Props) {
  const [stateOpen, setStateOpen] = useState(false);
  const matches = filterPayoutStates(draft.stateText).slice(0, 8);

  function patch(partial: Partial<PayoutAddressDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <View className="gap-2">
      <AppText className="text-sm font-semibold text-charcoal">{copy('account.addressTitle')}</AppText>
      <AppText className="text-sm leading-5 text-muted">{copy('account.addressHelper')}</AppText>
      <AppText className="text-[12px] leading-5 text-muted">{copy('account.addressPrivate')}</AppText>
      <View className="mt-1 gap-3">
        <KeyboardField>
          <Input
            label={copy('account.addressStreet')}
            value={draft.street}
            onChangeText={(street) => patch({ street })}
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            name="address-line1"
          />
        </KeyboardField>
        <KeyboardField>
          <Input
            label={copy('account.addressApt')}
            value={draft.apt}
            onChangeText={(apt) => patch({ apt })}
            autoComplete="address-line2"
            textContentType="streetAddressLine2"
            name="address-line2"
          />
        </KeyboardField>
        <KeyboardField>
          <Input
            label={copy('account.addressCity')}
            value={draft.city}
            onChangeText={(city) => patch({ city })}
            autoComplete="postal-address-locality"
            textContentType="addressCity"
            name="address-level2"
          />
        </KeyboardField>
        <KeyboardField>
          <View className="gap-2">
            <Input
              label={copy('account.addressState')}
              value={draft.stateText}
              onChangeText={(stateText) => {
                patch({ stateText });
                setStateOpen(true);
              }}
              onFocus={() => setStateOpen(true)}
              onBlur={() => {
                const parsed = parsePayoutState(draft.stateText);
                if (parsed) {
                  patch({ stateText: payoutStateLabel(parsed) });
                }
                setTimeout(() => setStateOpen(false), 180);
              }}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="postal-address-region"
              textContentType="addressState"
              name="address-level1"
              error={stateError ?? undefined}
            />
            {stateOpen && matches.length > 0 ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: THEME.border,
                  borderRadius: THEME.radius,
                  backgroundColor: THEME.surface,
                  overflow: 'hidden',
                }}>
                {matches.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityRole="button"
                    onPressIn={() => {
                      patch({ stateText: USPS_REGION_LABELS[code] });
                      setStateOpen(false);
                    }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 }}>
                    <AppText className="text-sm text-charcoal">
                      {USPS_REGION_LABELS[code]} · {code}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </KeyboardField>
        <KeyboardField>
          <Input
            label={copy('account.addressZip')}
            value={draft.zip}
            onChangeText={(zip) => patch({ zip })}
            keyboardType="number-pad"
            autoComplete="postal-code"
            textContentType="postalCode"
            name="postal-code"
          />
        </KeyboardField>
        <KeyboardField>
          <Input
            label={copy('account.addressCountry')}
            value={draft.country}
            onChangeText={(country) => patch({ country })}
            autoComplete="postal-address-country"
            textContentType="countryName"
            name="country"
          />
        </KeyboardField>
      </View>
    </View>
  );
}
