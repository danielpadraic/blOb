export type ChallengeStartMode = 'fixed' | 'full_lobby' | 'all_ready';

export type ChallengeEndMode = 'end_date' | 'length' | 'indefinite_lms';

export type ChallengeLengthUnit = 'days' | 'weeks' | 'months' | 'years';

export type ChallengeStartWithinUnit = 'minutes' | 'hours' | 'days';

export type ChallengeDistributionMode = 'auto' | 'scheduled' | 'manual';

export type ChallengeEscrowStatus =
  | 'draft'
  | 'upcoming'
  | 'open'
  | 'starting'
  | 'in_progress'
  | 'ended'
  | 'judging'
  | 'distributing'
  | 'settled'
  | 'cancelled';

export type ParticipantEscrowStatus =
  | 'joined'
  | 'active'
  | 'eliminated'
  | 'completed'
  | 'failed'
  | 'withdrawn'
  | 'refunded_pre_start';

export type WalletLedgerEntryType =
  | 'top_up'
  | 'join_escrow'
  | 'creator_fund_escrow'
  | 'refund_pre_start'
  | 'distribute_win'
  | 'eliminate_forfeit'
  | 'adjustment';

export type PublishChallengePayload = {
  title?: string;
  description?: string | null;
  rules?: string | null;
  category?: string | null;
  visibility?: string;
  challenge_type?: string;
  start_mode?: ChallengeStartMode | string;
  starts_at?: string | null;
  start_within_value?: number | null;
  start_within_unit?: ChallengeStartWithinUnit | string | null;
  full_lobby_start_time?: string | null;
  full_lobby_day_offset?: number | null;
  end_mode?: ChallengeEndMode | string;
  ends_at?: string | null;
  length_value?: number | null;
  length_unit?: ChallengeLengthUnit | string | null;
  is_unlimited?: boolean;
  max_participants?: number | null;
  min_participants?: number | null;
  buy_in_amount?: number;
  currency?: 'coins' | 'bucks' | string;
  challenge_lane?: string;
  creator_participating?: boolean;
  creator_participates?: boolean;
  cover_image_url?: string | null;
  rules_video_url?: string | null;
  days_required?: number | null;
  min_minutes?: number | null;
  proof_requirements?: unknown;
  tasks?: unknown;
  rules_list?: unknown;
  rules_structured?: unknown;
  prize_structure?: string;
  top_places_mode?: string | null;
  top_places_value?: number | null;
  top_places_distribution?: string | null;
  scaled_first_place_pct?: number | null;
  funding_model?: string;
  creator_contribution?: number;
  distribution_mode?: ChallengeDistributionMode | string;
  distribution_scheduled_at?: string | null;
  is_official?: boolean;
  frequency?: string | null;
  target_count?: number | null;
};

export type PublishChallengeResult = {
  ok: true;
  challenge_id: string;
  prize_pool: number;
};

export type JoinChallengeResult = {
  ok: true;
  challenge_id: string;
  prize_pool: number;
};

export type RefundPreStartResult = {
  ok: true;
  already_refunded?: boolean;
  refunded?: number;
};

export type MarkChallengeStartedResult = {
  ok: true;
  already_started?: boolean;
  official_started_at: string;
};

export type EliminateParticipantResult = {
  ok: true;
  already_eliminated?: boolean;
  prize_pool_unchanged?: boolean;
};

export type CloseChallengeForJudgingResult = {
  ok?: true;
  challenge_id?: string;
  status?: string;
  judging_started_at?: string;
  distributable_at?: string;
};

export type DistributeChallengeResult = {
  ok: true;
  paid?: number;
  winner_count?: number;
  solo_forfeit?: boolean;
  distributed_at?: string;
  distributed?: Array<{
    user_id?: string;
    amount?: number;
    place?: number;
  }>;
};

export type ChallengeDraft = {
  user_id: string;
  payload: Record<string, unknown>;
  step: number;
  start_path: string | null;
  template_id: string | null;
  source_challenge_id: string | null;
  updated_at: string;
};

export type ChallengeParticipant = {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: string;
  ready_at: string | null;
  eliminated_at: string | null;
  days_completed: number;
  points: number;
  status: ParticipantEscrowStatus | string;
  buy_in_paid: number;
  currency: 'coins' | 'bucks' | string;
};

export type WalletLedgerEntry = {
  id: string;
  user_id: string | null;
  challenge_id: string | null;
  currency: 'coins' | 'bucks' | string;
  amount: number;
  entry_type: WalletLedgerEntryType | string;
  balance_after: number | null;
  metadata: Record<string, unknown>;
  reason?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  created_at: string;
};

export type Challenge = {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  is_official: boolean;
  created_by: string | null;
  category: string | null;
  visibility: string | null;
  challenge_type: string | null;
  start_mode: ChallengeStartMode | string | null;
  starts_at: string | null;
  start_within_value: number | null;
  start_within_unit: string | null;
  full_lobby_start_time: string | null;
  full_lobby_day_offset: number;
  end_mode: ChallengeEndMode | string | null;
  ends_at: string | null;
  length_value: number | null;
  length_unit: string | null;
  is_unlimited: boolean;
  max_participants: number | null;
  min_participants: number;
  buy_in_amount: number;
  currency: 'coins' | 'bucks' | string | null;
  creator_participating: boolean;
  cover_image_url?: string | null;
  rules_video_url?: string | null;
  days_required: number | null;
  min_minutes: number | null;
  proof_requirements: unknown;
  tasks: unknown;
  rules_list: unknown;
  rules_structured?: unknown;
  status: ChallengeEscrowStatus | string;
  official_started_at: string | null;
  judging_started_at?: string | null;
  prize_pool: number;
  prize_structure: string | null;
  top_places_mode: string | null;
  top_places_value: number | null;
  top_places_distribution: string | null;
  scaled_first_place_pct: number | null;
  funding_model: string | null;
  creator_contribution: number;
  distribution_mode: ChallengeDistributionMode | string | null;
  distribution_scheduled_at: string | null;
  distributed_at: string | null;
  frequency: string | null;
  target_count: number | null;
  created_at: string;
  updated_at: string;
};
