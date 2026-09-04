import {
  defaultSentenceForMethod,
  ensureProofSentence,
  makeProof,
  namedProofsFromLegacyTypes,
  proofHeartRateMinutes,
  proofRequirementsFrom,
  methodFromProofType,
  proofTypeFromMethod,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import { extraHasMinMinutes } from '@/lib/consistencyRules';
import { DEFAULT_MIN_MINUTES } from '@/lib/constants';
import type { ChallengeTask } from '@/lib/types';
import type { CreateChallengeValues, ExtraCreateTask } from '@/utils/validators';
import { emptyExtraCreateTask } from '@/utils/validators';

function extraTaskProofType(method: ExtraCreateTask['proof_method']): string | undefined {
  if (!method || method === 'honor') {
    return undefined;
  }
  if (method === 'hr') {
    return 'hr_monitor';
  }
  if (method === 'checkin') {
    return 'text_note';
  }
  if (method === 'distance') {
    return 'distance';
  }
  if (method === 'location') {
    return 'location';
  }
  return method;
}

export function filledExtraTasks(values: Pick<CreateChallengeValues, 'extra_tasks'>): ExtraCreateTask[] {
  return (values.extra_tasks ?? [])
    .map((item) => ({
      ...item,
      title: item.title.trim(),
      hr_minutes: Math.max(Math.round(Number(item.hr_minutes) || DEFAULT_MIN_MINUTES), 1),
    }))
    .filter((item) => item.title.length > 0);
}

export function extraTaskNamedProofs(tasks: ExtraCreateTask[]): ChallengeProof[] {
  return tasks.flatMap((task) => {
    if (task.once || !task.proof_method || task.proof_method === 'honor') {
      return [];
    }
    const minutes = Math.max(Math.round(Number(task.hr_minutes) || DEFAULT_MIN_MINUTES), 1);
    return [
      ensureProofSentence(
        makeProof(
          defaultSentenceForMethod(task.proof_method, minutes, { distanceMeters: task.distance_meters }),
          task.proof_method,
          minutes,
          task.distance_meters,
        ),
        minutes,
      ),
    ];
  });
}

export function namedProofsForPublish(values: CreateChallengeValues): ChallengeProof[] {
  const requiredMeters = Math.max(Number(values.distance_meters_required) || 0, 0);
  const base =
    values.challenge_proofs && values.challenge_proofs.length > 0
      ? values.challenge_proofs.map((proof) =>
          ensureProofSentence(
            {
              ...proof,
              distance_meters:
                proof.method === 'distance'
                  ? proof.distance_meters || requiredMeters || undefined
                  : proof.distance_meters,
            },
            proofHeartRateMinutes(proof, Number(values.min_minutes) || DEFAULT_MIN_MINUTES),
          ),
        )
      : namedProofsFromLegacyTypes(values.proofs).map((proof) =>
          proof.method === 'distance' && requiredMeters
            ? { ...proof, distance_meters: requiredMeters }
            : proof,
        );
  const place = values.location_place ?? base.find((proof) => proof.method === 'location')?.place ?? null;
  const withPlace = (proof: ChallengeProof) =>
    proof.method === 'location' ? { ...proof, place: proof.place ?? place } : proof;
  return [...base.map(withPlace), ...extraTaskNamedProofs(filledExtraTasks(values)).map(withPlace)];
}

/**
 * Points keeps the host's proof on each task, so the legacy proof_type column must echo that.
 * Writing the wizard default made Overview promise a camera the check-in never asked for.
 */
export function pointsProofTypeForPublish(tasks: ChallengeTask[]): string {
  const picked = tasks
    .filter((task) => task.proof_required)
    .flatMap((task) => task.proof_types ?? [])
    .map((type) => String(type ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (picked.length === 0) {
    return 'honor';
  }
  const strongestFirst = [
    'photo',
    'pre_selfie',
    'post_selfie',
    'screenshot',
    'video',
    'hr_monitor',
    'hr',
    'distance',
    'location',
    'text_note',
    'link',
    'honor',
  ];
  const winner = strongestFirst.find((type) => picked.includes(type)) ?? picked[0];
  return proofTypeFromMethod(methodFromProofType(winner));
}

export function persistTasksForPublish(values: CreateChallengeValues, isPoints: boolean): ChallengeTask[] {
  if (isPoints) {
    return values.tasks.map((task) => {
      const proofs = task.proofs?.length ? task.proofs : task.proof_required ? ['photo'] : [];
      return {
        id: task.id,
        title: task.title.trim(),
        points: Number(task.points),
        proof_required: proofs.length > 0,
        proof_types: proofs.length > 0 ? proofs : undefined,
        once: Boolean(task.once),
      };
    });
  }
  const extra = filledExtraTasks(values);
  const primary = values.task?.trim() || '';
  const rows: ChallengeTask[] = [];
  if (primary) {
    const types = proofRequirementsFrom(
      values.challenge_proofs && values.challenge_proofs.length > 0
        ? values.challenge_proofs
        : namedProofsFromLegacyTypes(values.proofs),
    ).map((item) => item.type);
    rows.push({
      id: 'primary',
      title: primary,
      points: 0,
      proof_required: types.length > 0,
      proof_types: types.length > 0 ? types : undefined,
      once: false,
    });
  }
  for (const task of extra) {
    const type = extraTaskProofType(task.proof_method);
    rows.push({
      id: task.id,
      title: task.title,
      points: 0,
      proof_required: Boolean(type),
      proof_types: type ? [type] : undefined,
      once: task.once,
    });
  }
  return rows;
}

export function minMinutesForPublish(values: CreateChallengeValues): number {
  const named = namedProofsForPublish(values);
  const fromProofs = named.filter((proof) => proof.method === 'hr').map((proof) => proofHeartRateMinutes(proof, DEFAULT_MIN_MINUTES));
  const fromExtra = filledExtraTasks(values)
    .filter((task) => task.proof_method === 'hr')
    .map((task) => Math.max(Math.round(Number(task.hr_minutes) || DEFAULT_MIN_MINUTES), 1));
  const stepper = Number(values.min_minutes);
  const hasHr =
    fromProofs.length > 0 ||
    fromExtra.length > 0 ||
    (values.proofs ?? []).includes('hr_monitor') ||
    extraHasMinMinutes(values);
  if (hasHr) {
    const candidates = [...fromProofs, ...fromExtra, Number.isFinite(stepper) && stepper >= 1 ? stepper : DEFAULT_MIN_MINUTES];
    return Math.max(...candidates, 1);
  }
  if (Number.isFinite(stepper) && stepper >= 1) {
    return stepper;
  }
  return values.category === 'fitness' ? DEFAULT_MIN_MINUTES : 1;
}

export function extraTasksFromStored(tasks: ChallengeTask[], primaryTask: string | null | undefined): ExtraCreateTask[] {
  const primary = (primaryTask ?? '').trim().toLowerCase();
  return tasks.flatMap((task) => {
    const title = task.title.trim();
    if (!title) {
      return [];
    }
    if (primary && title.toLowerCase() === primary) {
      return [];
    }
    const type = String(task.proof_types?.[0] ?? '');
    const method = type ? methodFromProofType(type) : task.proof_required ? 'photo' : 'honor';
    const proof_method: ExtraCreateTask['proof_method'] =
      method === 'honor' || !task.proof_required ? 'honor' : method;
    const row = emptyExtraCreateTask();
    return [
      {
        ...row,
        id: task.id || row.id,
        title,
        once: Boolean(task.once),
        proof_method,
        hr_minutes: DEFAULT_MIN_MINUTES,
      },
    ];
  });
}
