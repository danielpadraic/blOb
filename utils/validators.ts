import { z } from 'zod';

import {
  MAX_CHALLENGE_DURATION_DAYS,
  MAX_DURATION_MESSAGE,
  asDurationUnit,
  challengeLengthDays,
  parseScheduleDate,
} from '@/lib/challengeSchedule';
import { EXTRA_RULE_KINDS } from '@/lib/consistencyRules';
import { ACTIVITY_OPTIONS, CHALLENGE_CATEGORIES, CREATE_PROOF_TYPES, isImageProof } from '@/lib/constants';
import type { Profile } from '@/lib/types';

const email = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email');

export const loginSchema = z.object({
  email,
  password: z.string().min(8, 'Use at least 8 characters'),
});

export const registerSchema = loginSchema
  .extend({
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those passwords don’t match',
    path: ['confirmPassword'],
  });

export const profileSetupSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'At least 3 characters')
    .max(24, 'Keep it under 24 characters')
    .regex(
      /^[a-z0-9_]+$/,
      'Use lowercase letters, numbers, and underscores',
    )
    .refine((value) => !value.startsWith('blob_'), {
      message: 'That prefix is reserved',
    }),
  display_name: z.string().trim().min(2, 'Enter a display name').max(48),
  bio: z.string().max(160, 'Keep it to 160 characters').optional(),
  gender: z.enum(['male', 'female'], { message: 'Pick Male or Female' }),
  height_cm: z.string().optional(),
  height_ft: z.string().optional(),
  height_in: z.string().optional(),
  current_weight: z.string().min(1, 'Add your current weight'),
  goal_weight: z.string().optional(),
  weight_unit: z.enum(['kg', 'lb']),
  body_fat_pct: z.number(),
  typical_weekly_workout_frequency: z
    .string()
    .min(1, 'Pick workouts per week'),
  primary_activities: z
    .array(z.enum(ACTIVITY_OPTIONS))
    .min(1, 'Pick at least one activity'),
  show_fitness_stats_publicly: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.weight_unit === 'lb') {
    if (!values.height_ft?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['height_ft'],
        message: 'Add your height',
      });
    } else {
      const feet = Number(values.height_ft);
      const inches = Number(values.height_in || '0');
      if (!Number.isFinite(feet) || feet < 4 || feet > 7) {
        ctx.addIssue({
          code: 'custom',
          path: ['height_ft'],
          message: 'Height is usually between 4 and 7 feet',
        });
      }
      if (!Number.isFinite(inches) || inches < 0 || inches >= 12) {
        ctx.addIssue({
          code: 'custom',
          path: ['height_in'],
          message: 'Inches should be 0–11',
        });
      }
    }
    const pounds = Number(values.current_weight);
    if (!Number.isFinite(pounds) || pounds < 70 || pounds > 500) {
      ctx.addIssue({
        code: 'custom',
        path: ['current_weight'],
        message: 'That weight looks off',
      });
    }
    if (values.goal_weight?.trim()) {
      const goal = Number(values.goal_weight);
      if (!Number.isFinite(goal) || goal < 70 || goal > 500) {
        ctx.addIssue({
          code: 'custom',
          path: ['goal_weight'],
          message: 'That goal looks off',
        });
      }
    }
    return;
  }

  const cm = Number(values.height_cm);
  if (!values.height_cm?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['height_cm'],
      message: 'Add your height',
    });
  } else if (!Number.isFinite(cm) || cm < 100 || cm > 250) {
    ctx.addIssue({
      code: 'custom',
      path: ['height_cm'],
      message: 'Height should be between 100 and 250 cm',
    });
  }
  const kilos = Number(values.current_weight);
  if (!Number.isFinite(kilos) || kilos < 30 || kilos > 250) {
    ctx.addIssue({
      code: 'custom',
      path: ['current_weight'],
      message: 'That weight looks off',
    });
  }
  if (values.goal_weight?.trim()) {
    const goal = Number(values.goal_weight);
    if (!Number.isFinite(goal) || goal < 30 || goal > 250) {
      ctx.addIssue({
        code: 'custom',
        path: ['goal_weight'],
        message: 'That goal looks off',
      });
    }
  }
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ProfileSetupValues = z.infer<typeof profileSetupSchema>;

export const createChallengeTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  points: z.string(),
  proof_required: z.boolean(),
  proofs: z.array(z.enum(CREATE_PROOF_TYPES)),
  once: z.boolean().optional(),
});

export function emptyChallengeTask(): z.infer<typeof createChallengeTaskSchema> {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    points: '10',
    proof_required: true,
    proofs: ['photo'],
    once: false,
  };
}

export const extraCreateTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  once: z.boolean(),
  proof_method: z.enum(['photo', 'video', 'checkin', 'honor', 'hr']).nullable(),
  hr_minutes: z.number().int().min(1).max(600),
});

export type ExtraCreateTask = z.infer<typeof extraCreateTaskSchema>;

export function emptyExtraCreateTask(): ExtraCreateTask {
  return {
    id: `xtask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    once: false,
    proof_method: 'photo',
    hr_minutes: 30,
  };
}

export const extraRuleSchema = z.object({
  id: z.string(),
  kind: z.enum(EXTRA_RULE_KINDS),
  text: z.string(),
  proofs: z.array(z.enum(CREATE_PROOF_TYPES)),
});

export const createChallengeSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Give it a name with at least 3 characters')
      .max(80, 'Keep the title under 80 characters'),
    description: z
      .string()
      .trim()
      .max(500, 'Keep the description under 500 characters')
      .optional()
      .or(z.literal('')),
    category: z.enum(CHALLENGE_CATEGORIES),
    challenge_type: z.enum(['consistency', 'points']),
    visibility: z.enum(['public', 'private', 'friends', 'invite']),
    duration_days: z.string(),
    duration_type: z.enum(['fixed', 'unlimited']),
    starts_at: z.string(),
    ends_at: z.string(),
    end_mode: z.enum(['date', 'length']),
    duration_value: z.string(),
    duration_unit: z.enum(['days', 'weeks', 'months']),
    target_count: z.string(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'once', '3x_week', 'custom']),
    proofs: z.array(z.enum(CREATE_PROOF_TYPES)),
    tasks: z.array(createChallengeTaskSchema),
    prize_structure: z.enum(['winner_take_all', 'equal_split', 'top_places']),
    top_places_mode: z.enum(['percent', 'count']),
    top_places_value: z.string(),
    top_places_distribution: z.enum(['even', 'scaled']),
    funding_model: z.enum(['creator', 'hybrid', 'participants']),
    creator_contribution: z.string(),
    participant_cap: z.enum(['unlimited', 'limited']),
    max_participants: z.string(),
    buy_in: z.string(),
    currency: z.enum(['coins', 'bucks']),
    challenge_lane: z.enum(['coins', 'private']),
    creator_participating: z.boolean(),
    min_minutes: z.string(),
    cover_image_url: z.string().trim().optional().or(z.literal('')),
    rules_video_url: z.string().trim().optional().or(z.literal('')),
    rule_activity: z.string().trim().max(40, 'Keep the activity name under 40 characters'),
    extra_rules: z.array(extraRuleSchema),
    extra_tasks: z.array(extraCreateTaskSchema).optional(),
    task: z.string().trim().max(80).optional().or(z.literal('')),
    min_participants: z.string().optional(),
    misses_allowed: z.string().optional(),
    proof_type: z.enum(['photo', 'video', 'check_in', 'checkin', 'honor', 'hr']).optional(),
    challenge_proofs: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          method: z.enum(['photo', 'video', 'checkin', 'honor', 'hr']),
          minutes: z.number().int().min(1).max(600).optional(),
        }),
      )
      .optional(),
    proof_review: z.enum(['auto', 'host']).optional(),
    host_funded: z.boolean().optional(),
    host_budget: z.string().optional(),
    required_checkins: z.string().optional(),
    payout_mode: z.enum(['even_split_remaining', 'winner_take_all', 'top_places']).optional(),
    format: z.enum(['consistency', 'points', 'lms']).optional(),
    discoverability: z.enum(['invite_only', 'friends_of_friends']).nullable().optional(),
    rules: z
      .string()
      .trim()
      .max(2000, 'Keep the rules under 2,000 characters')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    const buyIn = Number(values.buy_in);
    const contribution = Number(values.creator_contribution);
    const funding = values.funding_model;

    if (!Number.isFinite(buyIn) || buyIn < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['buy_in'],
        message: 'Entry fee can’t be negative',
      });
    } else if (buyIn > 10_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['buy_in'],
        message: `Keep the entry fee at 10,000 ${values.currency === 'bucks' ? 'Bucks' : 'Coins'} or less`,
      });
    }

    if (values.challenge_lane === 'coins' && values.currency === 'bucks' && values.host_funded !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Coin Challenges use Coins, not Bucks.',
      });
    }

    if (values.challenge_lane === 'private' && buyIn > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['buy_in'],
        message: 'Private challenges can’t charge competitors a buy-in for the prize.',
      });
    }

    if (values.challenge_lane === 'private' && values.funding_model === 'participants') {
      ctx.addIssue({
        code: 'custom',
        path: ['funding_model'],
        message: 'Private challenges need you to fund the prize.',
      });
    }

    if (funding !== 'participants') {
      if (!Number.isFinite(contribution) || contribution < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['creator_contribution'],
          message: `Put in at least 1 ${values.currency === 'bucks' ? 'Buck' : 'Coin'} to fund the pool`,
        });
      } else if (contribution > 10_000) {
        ctx.addIssue({
          code: 'custom',
          path: ['creator_contribution'],
          message: `Keep your contribution at 10,000 ${values.currency === 'bucks' ? 'Bucks' : 'Coins'} or less`,
        });
      }
    }

    if (values.participant_cap === 'limited') {
      const cap = Number(values.max_participants);
      if (!Number.isFinite(cap) || cap < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['max_participants'],
          message: 'Set a limit of at least 1 competitor, or choose Unlimited',
        });
      } else if (cap > 10_000) {
        ctx.addIssue({
          code: 'custom',
          path: ['max_participants'],
          message: 'Keep the cap at 10,000 competitors or fewer',
        });
      }
    }

    const minutes = Number(values.min_minutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['min_minutes'],
        message: 'Minimum minutes must be at least 1',
      });
    } else if (minutes > 600) {
      ctx.addIssue({
        code: 'custom',
        path: ['min_minutes'],
        message: 'Keep session length at 600 minutes or less',
      });
    }

    values.extra_rules?.forEach((rule, index) => {
      if (!rule.text.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['extra_rules', index, 'text'],
          message: 'Add a line of text, or remove this rule',
        });
      }
    });

    const cover = values.cover_image_url?.trim();
    if (cover && !/^https?:\/\//i.test(cover)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cover_image_url'],
        message: 'Cover needs a full http(s) URL',
      });
    }
    const video = values.rules_video_url?.trim();
    if (video && !/^https?:\/\//i.test(video)) {
      ctx.addIssue({
        code: 'custom',
        path: ['rules_video_url'],
        message: 'Rules video needs a full http(s) URL',
      });
    }

    const start = Date.parse(values.starts_at);
    const end = Date.parse(values.ends_at);
    if (!Number.isFinite(start)) {
      ctx.addIssue({
        code: 'custom',
        path: ['starts_at'],
        message: 'Set when this challenge starts and ends.',
      });
    }
    if (!Number.isFinite(end)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'End is the start plus the duration in days.',
      });
    } else if (Number.isFinite(start) && end <= start) {
      ctx.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'Duration must put the end after the start.',
      });
    }

    if (values.duration_type === 'unlimited') {
      if (values.challenge_type !== 'consistency') {
        ctx.addIssue({
          code: 'custom',
          path: ['challenge_type'],
          message: 'Last-man-standing needs a Consistency challenge',
        });
      }
      if (values.frequency !== 'daily' && values.frequency !== 'weekly') {
        ctx.addIssue({
          code: 'custom',
          path: ['frequency'],
          message: 'Use daily or weekly so people know what they must keep doing',
        });
      }
      if (values.prize_structure !== 'winner_take_all') {
        ctx.addIssue({
          code: 'custom',
          path: ['prize_structure'],
          message: 'The last person standing wins the entire prize pool',
        });
      }
    } else {
      const duration = Number(values.duration_days);
      if (!Number.isFinite(duration) || duration < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['duration_days'],
          message: 'Duration must be at least 1 day',
        });
      } else if (duration > MAX_CHALLENGE_DURATION_DAYS) {
        ctx.addIssue({
          code: 'custom',
          path: ['duration_days'],
          message: MAX_DURATION_MESSAGE,
        });
      }
      if (values.end_mode === 'length') {
        const amount = Number(values.duration_value);
        if (!Number.isFinite(amount) || amount < 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['duration_value'],
            message: 'Length must be at least 1',
          });
        } else {
          const start = parseScheduleDate(values.starts_at);
          if (start) {
            const requestedDays = challengeLengthDays(start, amount, asDurationUnit(values.duration_unit));
            if (requestedDays > MAX_CHALLENGE_DURATION_DAYS) {
              ctx.addIssue({
                code: 'custom',
                path: ['duration_value'],
                message: MAX_DURATION_MESSAGE,
              });
            }
          } else if (values.duration_unit === 'days' && amount > MAX_CHALLENGE_DURATION_DAYS) {
            ctx.addIssue({
              code: 'custom',
              path: ['duration_value'],
              message: MAX_DURATION_MESSAGE,
            });
          }
        }
      }
    }

    if (values.prize_structure === 'top_places') {
      const places = Number(values.top_places_value);
      if (!Number.isFinite(places) || places < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['top_places_value'],
          message: 'Top places must be greater than 0',
        });
      } else if (values.top_places_mode === 'percent' && places > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['top_places_value'],
          message: 'Percent can’t be more than 100',
        });
      } else if (values.top_places_mode === 'count' && places > 1_000) {
        ctx.addIssue({
          code: 'custom',
          path: ['top_places_value'],
          message: 'Keep top places at 1,000 people or fewer',
        });
      }
    }

    if (values.challenge_type === 'points') {
      if (values.tasks.length < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks'],
          message: 'Add at least one task before you publish',
        });
      }
      values.tasks.forEach((task, index) => {
        if (task.title.trim().length < 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks', index, 'title'],
            message: 'Give this task a short name',
          });
        }
        const points = Number(task.points);
        if (!Number.isFinite(points) || points < 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks', index, 'points'],
            message: 'Point value must be at least 1',
          });
        } else if (points > 10_000) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks', index, 'points'],
            message: 'Keep a task at 10,000 points or less',
          });
        }
      });
      return;
    }

    if (!(values.task ?? '').trim() && values.rule_activity.trim().length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['task'],
        message: 'Add a task',
      });
    }

    const target = Number(values.target_count);
    if (!Number.isFinite(target) || target < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_count'],
        message: 'Say how many times they must log',
      });
    } else if (target > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_count'],
        message: 'Keep the count at 100 or less',
      });
    } else if (values.duration_type === 'unlimited' && values.frequency === 'daily' && target > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_count'],
        message: 'Daily last-man-standing is one log per day',
      });
    } else if (values.duration_type === 'unlimited' && values.frequency === 'weekly' && target > 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_count'],
        message: 'Weekly last-man-standing can’t ask for more than 7 logs a week',
      });
    }

    if (
      !(values.challenge_proofs && values.challenge_proofs.length > 0) &&
      values.proof_type !== 'honor' &&
      values.proofs.length < 1
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['proofs'],
        message: 'Pick at least one proof type',
      });
    } else if (values.proofs.filter(isImageProof).length > 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['proofs'],
        message: 'Pick up to 3 photo or screenshot proofs for now',
      });
    }
  });

export type CreateChallengeValues = z.infer<typeof createChallengeSchema>;

export const PROFILE_STEP_FIELDS = {
  0: ['username', 'display_name', 'bio'] as const,
  1: ['primary_activities', 'typical_weekly_workout_frequency'] as const,
  2: [
    'gender',
    'height_cm',
    'height_ft',
    'height_in',
    'current_weight',
    'goal_weight',
    'weight_unit',
    'body_fat_pct',
  ] as const,
};

export function parseOptionalNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isGeneratedUsername(username: string | null | undefined): boolean {
  return Boolean(username?.startsWith('blob_'));
}

export function isProfileNamed(profile: Profile | null | undefined): boolean {
  if (!profile?.display_name?.trim()) {
    return false;
  }
  return !isGeneratedUsername(profile.username);
}

export function hasAcceptedLegal(profile: Profile | null | undefined): boolean {
  return Boolean(
    profile?.tos_accepted_at &&
      profile?.privacy_accepted_at &&
      profile?.skill_attestation_at,
  );
}

export function isProfileComplete(profile: Profile | null | undefined): boolean {
  return isProfileNamed(profile) && hasAcceptedLegal(profile);
}
