import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { AccountSpineFields } from '@/components/profile/AccountSpineFields';
import { TeacherProofSample } from '@/components/teacher/TeacherProofSample';
import { useTeacherBeginOptional } from '@/components/teacher/TeacherBeginHost';
import { Button } from '@/components/ui/Button';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useBeginTeacher3Day, useSetTeacherPrep } from '@/hooks/useTeacher3Day';
import { stopAllLiveMedia } from '@/lib/cameraSession';
import {
  TEACHER_SAMPLE_BODY,
  teacherAccountGaps,
  teacherCanBegin,
  teacherPhoneOk,
} from '@/lib/teacher3day';
import { officialDobStatus } from '@/lib/officialDob';
import { parseUspsRegion } from '@/lib/geo/regions';
import { ensureCameraPermission } from '@/lib/mediaPermissions';
import { getHealthProvider, healthProviderAvailable } from '@/services/health';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function TeacherBeginSheet() {
  const host = useTeacherBeginOptional();
  const { profile } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const prep = useSetTeacherPrep();
  const begin = useBeginTeacher3Day();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = host?.sheet === 'begin';
  const gaps = teacherAccountGaps(profile);
  const canBegin = teacherCanBegin(profile);
  const cameraReady = Boolean(profile?.teacher_camera_ready_at);
  const hrSource = profile?.teacher_hr_source === 'health' || profile?.teacher_hr_source === 'upload'
    ? profile.teacher_hr_source
    : null;

  if (!host || !visible) {
    return null;
  }

  async function markCameraReady() {
    try {
      await prep.mutateAsync({ cameraReady: true });
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  async function pickHr(next: 'health' | 'upload') {
    setError(null);
    if (next === 'health') {
      try {
        const provider = getHealthProvider();
        if (!healthProviderAvailable() || !provider) {
          await prep.mutateAsync({ hrSource: 'upload' });
          return;
        }
        const result = await provider.requestAccess();
        if (result !== 'connected') {
          await prep.mutateAsync({ hrSource: 'upload' });
          return;
        }
        await prep.mutateAsync({ hrSource: 'health' });
      } catch {
        await prep.mutateAsync({ hrSource: 'upload' });
      }
      return;
    }
    await prep.mutateAsync({ hrSource: 'upload' });
  }

  return (
    <>
      <ChromeOverlay visible onClose={begin.isPending ? undefined : host.close} align="end">
        <View
          className="px-5 pt-4 pb-5"
          style={{
            maxHeight: '92%',
            backgroundColor: THEME.surface,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
            borderWidth: 1,
            borderColor: THEME.border,
            ...themeShadow(),
          }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AppText className="text-center text-[22px] font-extrabold text-charcoal">
              What you post each day
            </AppText>
            <AppText className="mt-2 text-center text-[13px] leading-5 text-muted">
              {TEACHER_SAMPLE_BODY}
            </AppText>
            <View className="mt-4">
              <TeacherProofSample />
            </View>

            {gaps.dob || gaps.region || gaps.phone || gaps.underage ? (
              <View className="mt-5">
                <AccountSpineFields
                  dateOfBirth={profile?.date_of_birth}
                  region={profile?.declared_region ?? profile?.home_state}
                  phone={profile?.phone}
                  onDob={(value) => void updateProfile.mutateAsync({ date_of_birth: value })}
                  onRegion={(value) =>
                    void updateProfile.mutateAsync({ declared_region: value, home_state: value })
                  }
                  onPhone={(value) => void updateProfile.mutateAsync({ phone: value })}
                  dobError={
                    gaps.underage
                      ? 'Official Challenges are for 18 and up.'
                      : gaps.dob
                        ? 'Add your birth date.'
                        : undefined
                  }
                  regionError={gaps.region ? 'Add your home state.' : undefined}
                  phoneError={gaps.phone ? 'Add a phone number.' : undefined}
                />
              </View>
            ) : null}

            <View className="mt-5 gap-3">
              <Button
                title="Open camera"
                variant={cameraReady ? 'mint' : 'outline'}
                size="lg"
                onPress={() => {
                  setError(null);
                  void (async () => {
                    const granted = await ensureCameraPermission();
                    if (!granted.ok) {
                      setError('Camera is off. I can’t take the proof without it.');
                      return;
                    }
                    await markCameraReady();
                    setCameraOpen(true);
                  })();
                }}
              />
              <View className="gap-2">
                <ChipRow>
                  <Chip
                    label="Watch / Health"
                    selected={hrSource === 'health'}
                    onPress={() => void pickHr('health')}
                  />
                  <Chip
                    label="I’ll attach from my app"
                    selected={hrSource === 'upload'}
                    onPress={() => void pickHr('upload')}
                  />
                </ChipRow>
              </View>
            </View>

            {error ? (
              <AppText className="mt-3 text-center text-[13px]" style={{ color: THEME.danger }}>
                {error}
              </AppText>
            ) : null}

            <View className="mt-5 gap-2">
              <Button
                title="Begin 3-Day"
                size="lg"
                disabled={!canBegin || officialDobStatus(profile?.date_of_birth) !== 'ok' || !teacherPhoneOk(profile?.phone) || !parseUspsRegion(profile?.declared_region ?? profile?.home_state)}
                loading={begin.isPending}
                onPress={() => {
                  setError(null);
                  void begin
                    .mutateAsync(false)
                    .then(() => host.close())
                    .catch((caught) => setError(getErrorMessage(caught)));
                }}
              />
              <Button title="Not now" variant="ghost" size="lg" onPress={host.close} disabled={begin.isPending} />
            </View>
          </ScrollView>
        </View>
      </ChromeOverlay>

      {cameraOpen ? (
        <ChromeOverlay visible fill align="start" dim={false} zIndex={80} onClose={() => setCameraOpen(false)}>
          <View style={{ flex: 1, backgroundColor: THEME.primary }}>
            <InAppCamera
              capture="photo"
              checkin
              facingKind="checkin"
              maxDuration={15}
              chromeInset={false}
              title="Check-in photo"
              instruction="Front still. No filters."
              onCaptured={() => {
                stopAllLiveMedia();
                setCameraOpen(false);
                void markCameraReady();
              }}
              onOpenGallery={() => undefined}
              onCancel={() => {
                stopAllLiveMedia();
                setCameraOpen(false);
              }}
              onUnavailable={() => {
                setCameraOpen(false);
                setError('Camera is off. I can’t take the proof without it.');
              }}
            />
          </View>
        </ChromeOverlay>
      ) : null}
    </>
  );
}
