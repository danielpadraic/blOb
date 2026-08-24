import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useChallenge, useScoringAudit } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import {
  comparablePointsFromChallenge,
  comparablePointsHeadline,
  currentScoringVersion,
} from '@/lib/comparablePoints';
import {
  canEditOfficialDetails,
  canOpenOfficialTools,
  officialScoringStatusLine,
  scoringChangeEffectiveLine,
} from '@/lib/officialScoring';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

export default function OfficialToolsScreen() {
  const params = useLocalSearchParams<{ id: string; published?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const published = Array.isArray(params.published) ? params.published[0] : params.published;
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const challengeQuery = useChallenge(id);
  const audit = useScoringAudit(id);
  const [toast, setToast] = useState<string | null>(null);

  const challenge = challengeQuery.data;
  const allowed = canOpenOfficialTools({
    challenge,
    viewerId: user?.id,
    profile,
  });
  const canDetails = canEditOfficialDetails({
    challenge,
    viewerId: user?.id,
    profile,
  });
  const config = comparablePointsFromChallenge(challenge);
  const version = challenge ? currentScoringVersion(challenge) : 1;
  const previous = (audit.data ?? []).find((row) => row.version < version);

  useEffect(() => {
    if (!published) {
      return;
    }
    setToast(`Version ${published} is ACTIVE`);
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [published]);

  if (!allowed) {
    return (
      <Screen scroll>
        <AppText className="mt-6 text-sm leading-5 text-muted">
          Official tools are only for the host, a moderator, or Official.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppText className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
        Official tools
      </AppText>
      <AppText className="mt-1 text-[22px] font-bold leading-7 text-charcoal">
        {challenge?.title ?? 'Challenge'}
      </AppText>

      {toast ? (
        <View className="mt-4 items-center">
          <View className="px-4 py-2.5" style={{ backgroundColor: THEME.primary, borderRadius: 16 }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {toast}
            </AppText>
          </View>
        </View>
      ) : null}

      <Card className="mt-4">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Comparable Points
        </AppText>
        <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
          {officialScoringStatusLine(challenge)}
        </AppText>
        {config ? (
          <AppText className="mt-1 text-[13px] leading-5 text-muted">
            {comparablePointsHeadline(config)}
          </AppText>
        ) : (
          <AppText className="mt-1 text-[13px] leading-5 text-muted">
            Compare different kinds of work on one leaderboard.
          </AppText>
        )}
        {previous ? (
          <AppText className="mt-3 text-[13px] leading-5 text-muted">
            Previous: version {previous.version}
            {previous.changed_at
              ? ` · ${new Date(previous.changed_at).toLocaleDateString()}`
              : ''}
          </AppText>
        ) : null}
        <AppText className="mt-2 text-[13px] leading-5 text-muted">
          {scoringChangeEffectiveLine(challenge)}
        </AppText>
        <View className="mt-4">
          <Button
            title={config ? 'Edit scoring' : 'Configure scoring'}
            onPress={() => router.push(`/challenges/${id}/scoring`)}
          />
        </View>
      </Card>

      {canDetails ? (
        <Card className="mt-4">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Details
          </AppText>
          <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
            Title, photo, rules, and proofs
          </AppText>
          <AppText className="mt-1 text-[13px] leading-5 text-muted">
            Scoring and privacy stay as they are.
          </AppText>
          <View className="mt-4">
            <Button
              title={copy('challenge.editDetails')}
              onPress={() => router.push(`/challenges/${id}/details`)}
            />
          </View>
        </Card>
      ) : null}

      {(audit.data ?? []).length > 0 ? (
        <Card className="mt-4">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Scoring history
          </AppText>
          <View className="mt-3 gap-3">
            {(audit.data ?? []).map((row) => (
              <View key={row.id}>
                <AppText className="font-semibold text-charcoal">
                  Version {row.version}
                  {row.version === version ? ' · ACTIVE' : ''}
                </AppText>
                {row.summary ? (
                  <AppText className="mt-0.5 text-[13px] leading-5 text-muted">{row.summary}</AppText>
                ) : null}
                <AppText className="mt-0.5 text-[12px] text-muted">
                  {new Date(row.changed_at).toLocaleString()}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
