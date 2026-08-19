import type { PostAudience } from '@/lib/postAudience';
import type {
  Conversation,
  ConversationMember,
  FeedEvent,
  Follow,
  Friendship,
  Message,
  Reel,
  ReelTag,
  Story,
  StoryView,
} from '@/types/social';

export type {
  Conversation,
  ConversationMember,
  FeedEvent,
  FeedEventType,
  FeedEventVisibility,
  Follow,
  Friendship,
  FriendshipStatus,
  Message,
  Reel,
  ReelTag,
  Story,
  StoryView,
} from '@/types/social';

export type WeightUnit = 'kg' | 'lb';

export type FitnessExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type FitnessPrimaryGoal = 'strength' | 'endurance' | 'fat_loss' | 'general' | 'competition';
export type FitnessUnitSystem = 'imperial' | 'metric';

export type LastDoneBucket = 'lt_30d' | '3m' | '6m' | '1y' | '2y' | '5y' | 'gt_5y';

export type FitnessSport = {
  name: string;
  last_done: LastDoneBucket;
};

/** Private jsonb on profiles. Used for matching and placement. */
export type FitnessProfile = {
  experience_level: FitnessExperienceLevel;
  primary_goal: FitnessPrimaryGoal;
  primary_goals?: FitnessPrimaryGoal[];
  training_days_per_week: number;
  sports: FitnessSport[];
  last_mile_run: string | 'never';
  limitations: string[];
  limitations_notes: string;
  preferred_units: FitnessUnitSystem;
  equipment_access: string[];
};

export type ChallengeStatus =
  | 'draft'
  | 'upcoming'
  | 'open'
  | 'starting'
  | 'in_progress'
  | 'filling'
  | 'arming'
  | 'live'
  | 'ended'
  | 'judging'
  | 'distributing'
  | 'settled'
  | 'cancelled_underfilled'
  | 'cancelled';

export type ParticipantStatus =
  | 'joined'
  | 'active'
  | 'eliminated'
  | 'completed'
  | 'failed'
  | 'withdrawn'
  | 'refunded_pre_start';

export type SubmissionStatus = 'pending_review' | 'approved' | 'rejected';

export type ProofType =
  | 'pre_selfie'
  | 'post_selfie'
  | 'hr_monitor'
  | 'photo'
  | 'screenshot'
  | 'text_note'
  | 'link'
  | 'video';

export type ChallengeCategory =
  | 'fitness'
  | 'sports'
  | 'productivity'
  | 'education'
  | 'creative'
  | 'reading'
  | 'gaming'
  | 'other';

export type ChallengeKind = 'consistency' | 'points';

export type ChallengeFrequency = 'daily' | 'weekly' | 'monthly' | 'once' | '3x_week' | 'custom';

export type ChallengeVisibility = 'public' | 'unlisted' | 'private' | 'friends' | 'invite';
export type ChallengeDiscoverability = 'invite_only' | 'friends_of_friends';

export type SimpleProofType = 'photo' | 'video' | 'check_in' | 'checkin' | 'honor' | 'hr';

export type ChallengeFormat = 'consistency' | 'points' | 'lms';

export type ProofReview = 'auto' | 'host';

export type PayoutMode = 'even_split_remaining' | 'winner_take_all' | 'top_places';

export type PrizeStructure = 'winner_take_all' | 'equal_split' | 'top_places';

export type TopPlacesMode = 'percent' | 'count';

export type TopPlacesDistribution = 'even' | 'scaled';

export type FundingModel = 'creator' | 'hybrid' | 'participants';

export type WalletCurrency = 'coins' | 'bucks';

export type ChallengeLane = 'coins' | 'private' | 'official';

export type ProfileBadgeTone = 'gold' | 'green' | 'teal' | 'charcoal' | 'mint';

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  tone: string;
  coin_reward: number;
  metric: string;
  threshold: number;
  tier: number;
  sort_order: number;
}

export interface UserBadge {
  user_id: string;
  badge_key: string;
  earned_at: string;
  coin_reward: number;
  title?: string | null;
  awarded_at?: string | null;
}

export interface WalletLedgerEntry {
  id: string;
  user_id: string | null;
  challenge_id?: string | null;
  currency: WalletCurrency | string;
  amount: number;
  entry_type?: string;
  balance_after?: number | null;
  metadata?: Record<string, unknown>;
  reason?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  created_at: string;
}

export type ReactionType = 'like' | 'fire' | 'strong';

export interface ProofRequirement {
  type: ProofType;
  required: boolean;
}

export type ChallengeProofMethod = 'photo' | 'video' | 'checkin' | 'honor' | 'hr';

export interface ChallengeProof {
  id: string;
  name: string;
  method: ChallengeProofMethod;
}

export interface ChallengeProofPart {
  method: ChallengeProofMethod;
  url?: string | null;
  text?: string | null;
}

export interface ChallengeTask {
  id: string;
  title: string;
  points: number;
  proof_required: boolean;
  proof_types?: string[];
}

/** Extends auth.users. Credits are owner-private. */
export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  height_cm: number | null;
  current_weight: number | null;
  goal_weight: number | null;
  weight_unit: WeightUnit;
  gender?: 'male' | 'female' | null;
  body_fat_pct?: number | null;
  body_metrics_completed_at?: string | null;
  fitness_profile?: FitnessProfile | null;
  typical_weekly_workout_frequency: number | null;
  primary_activities: string[];
  skill_tags: string[];
  show_fitness_stats_publicly: boolean;
  credits: number;
  coins: number;
  bucks: number;
  last_shown_coin_balance?: number | null;
  timezone?: string | null;
  motivation_tone?: 'gentle' | 'neutral' | 'honest' | null;
  is_official?: boolean;
  is_creator?: boolean;
  allow_profile_posts?: boolean;
  profile_visibility?: 'public' | 'friends' | string | null;
  mute_mentions?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  skill_tags: string[];
  primary_activities: string[];
  show_fitness_stats_publicly: boolean;
  is_official?: boolean;
  is_creator?: boolean;
  allow_profile_posts?: boolean;
  profile_visibility?: 'public' | 'friends' | string | null;
  created_at: string;
  height_cm: number | null;
  current_weight: number | null;
  goal_weight: number | null;
  weight_unit: WeightUnit | null;
  typical_weekly_workout_frequency: number | null;
}

export interface Challenge {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  is_official: boolean;
  created_by: string | null;
  buy_in_amount: number;
  days_required: number;
  min_minutes: number;
  proof_requirements: ProofRequirement[];
  proofs?: ChallengeProof[];
  target_count: number;
  frequency: ChallengeFrequency | string | null;
  tasks: ChallengeTask[];
  status: ChallengeStatus;
  starts_at: string;
  ends_at: string | null;
  prize_pool: number;
  prize_structure: PrizeStructure | string | null;
  top_places_mode: TopPlacesMode | string | null;
  top_places_value: number | null;
  top_places_distribution: TopPlacesDistribution | string | null;
  scaled_first_place_pct?: number | null;
  funding_model: FundingModel | string | null;
  creator_contribution: number;
  max_participants: number | null;
  min_participants?: number | null;
  is_unlimited: boolean;
  start_mode?: string | null;
  start_within_value?: number | null;
  start_within_unit?: string | null;
  full_lobby_start_time?: string | null;
  full_lobby_day_offset?: number | null;
  end_mode?: string | null;
  length_value?: number | null;
  length_unit?: string | null;
  creator_participating?: boolean;
  cover_image_url?: string | null;
  rules_video_url?: string | null;
  official_started_at?: string | null;
  judging_started_at?: string | null;
  distribution_mode?: string | null;
  distribution_scheduled_at?: string | null;
  distributed_at?: string | null;
  rules_list?: unknown;
  rules_structured?: unknown;
  category: ChallengeCategory | string | null;
  challenge_type: ChallengeKind | string | null;
  visibility: ChallengeVisibility | string | null;
  discoverability?: ChallengeDiscoverability | string | null;
  allowed_states?: string[] | null;
  challenge_lane?: ChallengeLane | string | null;
  currency: WalletCurrency | string | null;
  host_funded?: boolean;
  host_budget?: number;
  format?: ChallengeFormat | string | null;
  task?: string | null;
  required_checkins?: number | null;
  misses_allowed?: number;
  proof_type?: SimpleProofType | string | null;
  proof_review?: ProofReview | string | null;
  payout_mode?: PayoutMode | string | null;
  timezone?: string | null;
  start_rule?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  series_id?: string | null;
  armed_at?: string | null;
  day_windows?: Array<{ day: number; date: string; starts_at: string; ends_at: string }> | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeWithStats extends Challenge {
  participant_count: number;
  eligible_count?: number;
  eliminated_count?: number;
}

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  status: ParticipantStatus;
  days_completed: number;
  joined_at: string;
  completed_at: string | null;
  eliminated_at: string | null;
  ready_at?: string | null;
  points?: number;
  buy_in_paid?: number;
  currency?: WalletCurrency | string | null;
}

export interface ChallengeParticipantWithProfile extends ChallengeParticipant {
  profile?: PublicProfile | null;
}

export interface ChallengeSettlement {
  id: string;
  challenge_id: string;
  settled_by: string | null;
  prize_pool: number;
  distributed: number;
  prize_structure: PrizeStructure | string;
  winner_count: number;
  settled_at: string;
  slices?: ChallengePayout[];
}

export interface ChallengePayout {
  id?: string;
  settlement_id?: string;
  challenge_id?: string;
  user_id: string;
  place: number;
  score: number;
  amount: number;
  reason: string;
  created_at?: string;
}

export interface ChallengePayoutWithProfile extends ChallengePayout {
  profile?: PublicProfile | null;
}

export interface ChallengeSettlementView {
  already_settled: boolean;
  settlement: ChallengeSettlement;
  payouts: ChallengePayoutWithProfile[];
}

export type WorkoutProofKind = 'camera' | 'health_workout' | string;

export interface WorkoutSubmission {
  id: string;
  challenge_id: string;
  user_id: string;
  submission_date: string;
  pre_selfie_url: string | null;
  post_selfie_url: string | null;
  hr_monitor_url: string | null;
  notes: string | null;
  status: SubmissionStatus;
  task_ids?: string[];
  proof_parts?: Record<string, ChallengeProofPart> | null;
  proof_kind?: WorkoutProofKind | null;
  health_workout_id?: string | null;
  created_at: string;
}

export interface HealthConnection {
  id: string;
  user_id: string;
  provider: 'apple_health' | 'health_connect' | string;
  status: 'connected' | 'disconnected' | string;
  last_synced_at: string | null;
  hk_workout_anchor?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthWorkoutRecord {
  id: string;
  user_id: string;
  provider: 'apple_health' | 'health_connect' | string;
  provider_workout_id: string;
  activity_type: string;
  activity_label: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  calories_kcal: number | null;
  distance_m: number | null;
  hr_avg: number | null;
  hr_max: number | null;
  source_bundle: string | null;
  confidence: string;
  raw_summary: Record<string, unknown>;
  dismissed_at?: string | null;
  created_at: string;
}

export interface HealthWorkoutStart {
  id: string;
  user_id: string;
  challenge_id: string;
  started_at: string;
  activity_type: string | null;
  goal_seconds: number | null;
  created_at: string;
}

export type { PostAudience };

export type QuoteSnapshot = {
  author_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  body: string;
  media_preview_url: string | null;
  created_at: string;
  audience?: string | null;
};

export interface Post {
  id: string;
  author_id: string;
  challenge_id: string | null;
  content: string | null;
  media_urls: string[];
  audience?: PostAudience;
  audience_user_ids?: string[];
  moderation_status?: 'visible' | 'under_review' | 'removed' | string | null;
  quoted_post_id?: string | null;
  quote_snapshot?: QuoteSnapshot | null;
  deleted_at?: string | null;
  wall_host_id?: string | null;
  wall_removed_at?: string | null;
  created_at: string;
}

export type ComposeInput = {
  content: string;
  mediaUrls?: string[];
  audience?: PostAudience;
  audienceUserIds?: string[];
  mentionedUserIds?: string[];
  wallHostId?: string | null;
  quotedPostId?: string | null;
  quoteSnapshot?: QuoteSnapshot | null;
};

export type PostMention = {
  userId: string;
  username: string;
  displayName?: string | null;
  available: boolean;
};

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  created_at: string;
  mentions?: PostMention[];
}

export interface CommentWithAuthor extends Comment {
  author?: PublicProfile | null;
  replies?: CommentWithAuthor[];
  reactions?: Reaction[];
}

export interface PostWithMeta extends Post {
  author?: PublicProfile | null;
  wall_host?: PublicProfile | null;
  comments?: CommentWithAuthor[];
  reactions?: Reaction[];
  mentions?: PostMention[];
}

export interface Reaction {
  id: string;
  user_id: string;
  post_id: string | null;
  comment_id?: string | null;
  reaction_type: ReactionType;
  created_at: string;
}

export interface CoinTransfer {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  currency?: WalletCurrency | string | null;
  note?: string | null;
  created_at: string;
}

export type CalloutStatus =
  | 'pending'
  | 'active'
  | 'resolving'
  | 'settled'
  | 'disputed'
  | 'cancelled';

export interface Callout {
  id: string;
  challenger_id: string;
  opponent_id: string;
  currency: WalletCurrency;
  stake_amount: number;
  win_condition: string;
  deadline: string;
  status: CalloutStatus;
  held: boolean;
  challenger_pick: string | null;
  opponent_pick: string | null;
  winner_id: string | null;
  challenger_cancel_at: string | null;
  opponent_cancel_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationType =
  | 'challenge_invite'
  | 'challenge_new'
  | 'challenge_starting'
  | 'challenge_join_confirmed'
  | 'challenge_checkin_reminder'
  | 'challenge_checkin'
  | 'competitor_dropped'
  | 'challenge_won'
  | 'challenge_lost'
  | 'payout_received'
  | 'profile_incomplete'
  | 'friend_request'
  | 'friend_accepted'
  | 'post_comment'
  | 'post_reaction'
  | 'post_reposted'
  | 'tagged'
  | 'mentioned'
  | 'profile_wall'
  | 'challenge_joined'
  | 'follow'
  | 'coins_received'
  | 'challenge_settled'
  | 'challenge_placed'
  | 'challenge_eliminated'
  | 'callout_received'
  | 'callout_accepted'
  | 'callout_resolved'
  | 'callout_disputed'
  | 'callout_cancelled'
  | 'badge_unlocked'
  | 'challenge_cancelled';

export type NotificationData = {
  challenge_id?: string;
  post_id?: string;
  comment_id?: string;
  story_id?: string;
  username?: string;
  amount?: number;
  transfer_id?: string;
  place?: number;
  callout_id?: string;
  currency?: string;
  badge_key?: string;
  coin_reward?: number;
  href?: string;
  dedupe_key?: string;
};

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType | string;
  title: string;
  body: string | null;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
}

export interface ChallengeInvite {
  id: string;
  challenge_id: string;
  inviter_id: string;
  invitee_id: string | null;
  token?: string;
  status?: 'pending' | 'accepted' | 'revoked' | string;
  accepted_at?: string | null;
  created_at: string;
}

export type ChallengeInviteWithInvitee = ChallengeInvite & {
  invitee?: Pick<PublicProfile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
};

export type CreateChallengeInviteResult = {
  ok: boolean;
  invite_id: string;
  challenge_id: string;
  token: string;
};

export type AcceptChallengeInviteResult = {
  ok: boolean;
  challenge_id: string;
  already_host?: boolean;
  already_accepted?: boolean;
};

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'username'
    | 'display_name'
    | 'avatar_url'
    | 'bio'
    | 'height_cm'
    | 'current_weight'
    | 'goal_weight'
    | 'weight_unit'
    | 'gender'
    | 'body_fat_pct'
    | 'body_metrics_completed_at'
    | 'fitness_profile'
    | 'typical_weekly_workout_frequency'
    | 'primary_activities'
    | 'skill_tags'
    | 'show_fitness_stats_publicly'
    | 'motivation_tone'
    | 'allow_profile_posts'
    | 'profile_visibility'
    | 'mute_mentions'
  >
>;

type Relationship<
  ForeignKeyName extends string,
  Columns extends string,
  ReferencedRelation extends string,
  ReferencedColumns extends string,
  IsOneToOne extends boolean = false,
> = {
  foreignKeyName: ForeignKeyName;
  columns: Columns[];
  isOneToOne: IsOneToOne;
  referencedRelation: ReferencedRelation;
  referencedColumns: ReferencedColumns[];
};

type AsRecord<T> = {
  [K in keyof T]: T[K];
};

type TableDef<
  Row,
  Insert = Partial<Row>,
  Update = Partial<Row>,
  Relationships extends unknown[] = [],
> = {
  Row: AsRecord<Row>;
  Insert: AsRecord<Insert>;
  Update: AsRecord<Update>;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        Omit<Profile, 'created_at' | 'updated_at' | 'credits' | 'coins' | 'bucks'> & {
          credits?: number;
          coins?: number;
          bucks?: number;
          created_at?: string;
          updated_at?: string;
        }
      >;
      challenges: TableDef<
        Challenge,
        Partial<Challenge>,
        Partial<Challenge>,
        [Relationship<'challenges_created_by_fkey', 'created_by', 'profiles', 'id'>]
      >;
      challenge_drafts: TableDef<
        {
          id?: string;
          owner_id?: string;
          user_id?: string;
          title?: string | null;
          step?: number;
          start_path?: string | null;
          template_id?: string | null;
          source_challenge_id?: string | null;
          payload: Record<string, unknown>;
          updated_at?: string;
        },
        Partial<{
          id: string;
          owner_id: string;
          user_id: string;
          title: string | null;
          step: number;
          start_path: string | null;
          template_id: string | null;
          source_challenge_id: string | null;
          payload: Record<string, unknown>;
          updated_at: string;
        }>
      >;
      challenge_participants: TableDef<
        ChallengeParticipant,
        Partial<ChallengeParticipant>,
        Partial<ChallengeParticipant>,
        [
          Relationship<
            'challenge_participants_challenge_id_fkey',
            'challenge_id',
            'challenges',
            'id'
          >,
          Relationship<'challenge_participants_user_id_fkey', 'user_id', 'profiles', 'id'>,
        ]
      >;
      challenge_settlements: TableDef<
        ChallengeSettlement,
        Partial<ChallengeSettlement>,
        Partial<ChallengeSettlement>,
        [
          Relationship<
            'challenge_settlements_challenge_id_fkey',
            'challenge_id',
            'challenges',
            'id'
          >,
        ]
      >;
      challenge_payouts: TableDef<
        ChallengePayout,
        Partial<ChallengePayout>,
        Partial<ChallengePayout>,
        [
          Relationship<'challenge_payouts_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
          Relationship<'challenge_payouts_user_id_fkey', 'user_id', 'profiles', 'id'>,
        ]
      >;
      coin_transfers: TableDef<
        CoinTransfer,
        Partial<CoinTransfer>,
        Partial<CoinTransfer>,
        [
          Relationship<'coin_transfers_sender_id_fkey', 'sender_id', 'profiles', 'id'>,
          Relationship<'coin_transfers_recipient_id_fkey', 'recipient_id', 'profiles', 'id'>,
        ]
      >;
      callouts: TableDef<
        Callout,
        Partial<Callout>,
        Partial<Callout>,
        [
          Relationship<'callouts_challenger_id_fkey', 'challenger_id', 'profiles', 'id'>,
          Relationship<'callouts_opponent_id_fkey', 'opponent_id', 'profiles', 'id'>,
        ]
      >;
      challenge_invites: TableDef<
        ChallengeInvite,
        Partial<ChallengeInvite>,
        Partial<ChallengeInvite>,
        [
          Relationship<'challenge_invites_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
          Relationship<'challenge_invites_inviter_id_fkey', 'inviter_id', 'profiles', 'id'>,
          Relationship<'challenge_invites_invitee_id_fkey', 'invitee_id', 'profiles', 'id'>,
        ]
      >;
      notifications: TableDef<
        AppNotification,
        Partial<AppNotification>,
        Partial<AppNotification>,
        [
          Relationship<'notifications_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'notifications_actor_id_fkey', 'actor_id', 'profiles', 'id'>,
        ]
      >;
      workout_submissions: TableDef<
        WorkoutSubmission,
        Partial<WorkoutSubmission>,
        Partial<WorkoutSubmission>,
        [
          Relationship<
            'workout_submissions_challenge_id_fkey',
            'challenge_id',
            'challenges',
            'id'
          >,
          Relationship<'workout_submissions_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<
            'workout_submissions_health_workout_id_fkey',
            'health_workout_id',
            'health_workouts',
            'id'
          >,
        ]
      >;
      health_connections: TableDef<
        HealthConnection,
        Partial<HealthConnection>,
        Partial<HealthConnection>,
        [Relationship<'health_connections_user_id_fkey', 'user_id', 'profiles', 'id'>]
      >;
      health_workouts: TableDef<
        HealthWorkoutRecord,
        Partial<HealthWorkoutRecord>,
        Partial<HealthWorkoutRecord>,
        [Relationship<'health_workouts_user_id_fkey', 'user_id', 'profiles', 'id'>]
      >;
      health_workout_starts: TableDef<
        HealthWorkoutStart,
        Partial<HealthWorkoutStart>,
        Partial<HealthWorkoutStart>,
        [
          Relationship<'health_workout_starts_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'health_workout_starts_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
        ]
      >;
      follows: TableDef<
        Follow,
        Partial<Follow>,
        Partial<Follow>,
        [
          Relationship<'follows_follower_id_fkey', 'follower_id', 'profiles', 'id'>,
          Relationship<'follows_following_id_fkey', 'following_id', 'profiles', 'id'>,
        ]
      >;
      friendships: TableDef<
        Friendship,
        Partial<Friendship>,
        Partial<Friendship>,
        [
          Relationship<'friendships_user_a_id_fkey', 'user_a_id', 'profiles', 'id'>,
          Relationship<'friendships_user_b_id_fkey', 'user_b_id', 'profiles', 'id'>,
          Relationship<'friendships_requested_by_fkey', 'requested_by', 'profiles', 'id'>,
        ]
      >;
      feed_events: TableDef<
        FeedEvent,
        Partial<FeedEvent>,
        Partial<FeedEvent>,
        [
          Relationship<'feed_events_actor_id_fkey', 'actor_id', 'profiles', 'id'>,
          Relationship<'feed_events_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
        ]
      >;
      stories: TableDef<
        Story,
        Partial<Story>,
        Partial<Story>,
        [
          Relationship<'stories_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'stories_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
        ]
      >;
      story_views: TableDef<
        StoryView,
        Partial<StoryView>,
        Partial<StoryView>,
        [
          Relationship<'story_views_story_id_fkey', 'story_id', 'stories', 'id'>,
          Relationship<'story_views_viewer_id_fkey', 'viewer_id', 'profiles', 'id'>,
        ]
      >;
      reels: TableDef<
        Reel,
        Partial<Reel>,
        Partial<Reel>,
        [
          Relationship<'reels_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'reels_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
        ]
      >;
      reel_tags: TableDef<
        ReelTag,
        Partial<ReelTag>,
        Partial<ReelTag>,
        [
          Relationship<'reel_tags_reel_id_fkey', 'reel_id', 'reels', 'id'>,
          Relationship<'reel_tags_tagged_user_id_fkey', 'tagged_user_id', 'profiles', 'id'>,
        ]
      >;
      conversations: TableDef<
        Conversation,
        Partial<Conversation>,
        Partial<Conversation>,
        [Relationship<'conversations_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>]
      >;
      conversation_members: TableDef<
        ConversationMember,
        Partial<ConversationMember>,
        Partial<ConversationMember>,
        [
          Relationship<
            'conversation_members_conversation_id_fkey',
            'conversation_id',
            'conversations',
            'id'
          >,
          Relationship<'conversation_members_user_id_fkey', 'user_id', 'profiles', 'id'>,
        ]
      >;
      messages: TableDef<
        Message,
        Partial<Message>,
        Partial<Message>,
        [
          Relationship<'messages_conversation_id_fkey', 'conversation_id', 'conversations', 'id'>,
          Relationship<'messages_sender_id_fkey', 'sender_id', 'profiles', 'id'>,
        ]
      >;
      badges: TableDef<BadgeDefinition, Partial<BadgeDefinition>, Partial<BadgeDefinition>>;
      user_badges: TableDef<
        UserBadge,
        Partial<UserBadge>,
        Partial<UserBadge>,
        [
          Relationship<'user_badges_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'user_badges_badge_key_fkey', 'badge_key', 'badges', 'key'>,
        ]
      >;
      wallet_ledger: TableDef<
        WalletLedgerEntry,
        Partial<WalletLedgerEntry>,
        Partial<WalletLedgerEntry>,
        [Relationship<'wallet_ledger_user_id_fkey', 'user_id', 'profiles', 'id'>]
      >;
      posts: TableDef<
        Post,
        Partial<Post>,
        Partial<Post>,
        [
          Relationship<'posts_author_id_fkey', 'author_id', 'profiles', 'id'>,
          Relationship<'posts_challenge_id_fkey', 'challenge_id', 'challenges', 'id'>,
          Relationship<'posts_quoted_post_id_fkey', 'quoted_post_id', 'posts', 'id'>,
        ]
      >;
      post_hides: TableDef<
        { user_id: string; post_id: string; created_at: string },
        Partial<{ user_id: string; post_id: string; created_at: string }>,
        Partial<{ user_id: string; post_id: string; created_at: string }>,
        [
          Relationship<'post_hides_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'post_hides_post_id_fkey', 'post_id', 'posts', 'id'>,
        ]
      >;
      post_reports: TableDef<
        {
          id: string;
          post_id: string;
          reporter_id: string;
          reason: string;
          created_at: string;
        },
        Partial<{
          id: string;
          post_id: string;
          reporter_id: string;
          reason: string;
          created_at: string;
        }>,
        Partial<{
          id: string;
          post_id: string;
          reporter_id: string;
          reason: string;
          created_at: string;
        }>,
        [
          Relationship<'post_reports_post_id_fkey', 'post_id', 'posts', 'id'>,
          Relationship<'post_reports_reporter_id_fkey', 'reporter_id', 'profiles', 'id'>,
        ]
      >;
      mutes: TableDef<
        { user_id: string; muted_user_id: string; created_at: string },
        Partial<{ user_id: string; muted_user_id: string; created_at: string }>,
        Partial<{ user_id: string; muted_user_id: string; created_at: string }>,
        [
          Relationship<'mutes_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'mutes_muted_user_id_fkey', 'muted_user_id', 'profiles', 'id'>,
        ]
      >;
      comments: TableDef<
        Comment,
        Partial<Comment>,
        Partial<Comment>,
        [
          Relationship<'comments_post_id_fkey', 'post_id', 'posts', 'id'>,
          Relationship<'comments_author_id_fkey', 'author_id', 'profiles', 'id'>,
          Relationship<'comments_parent_id_fkey', 'parent_id', 'comments', 'id'>,
        ]
      >;
      post_mentions: TableDef<
        {
          id: string;
          post_id: string;
          mentioned_user_id: string;
          author_id: string;
          created_at: string;
        },
        Partial<{
          id: string;
          post_id: string;
          mentioned_user_id: string;
          author_id: string;
          created_at: string;
        }>,
        Partial<{
          id: string;
          post_id: string;
          mentioned_user_id: string;
          author_id: string;
          created_at: string;
        }>,
        [
          Relationship<'post_mentions_post_id_fkey', 'post_id', 'posts', 'id'>,
          Relationship<'post_mentions_mentioned_user_id_fkey', 'mentioned_user_id', 'profiles', 'id'>,
          Relationship<'post_mentions_author_id_fkey', 'author_id', 'profiles', 'id'>,
        ]
      >;
      comment_mentions: TableDef<
        {
          id: string;
          comment_id: string;
          mentioned_user_id: string;
          author_id: string;
          created_at: string;
        },
        Partial<{
          id: string;
          comment_id: string;
          mentioned_user_id: string;
          author_id: string;
          created_at: string;
        }>,
        Partial<{
          id: string;
          comment_id: string;
          mentioned_user_id: string;
          author_id: string;
          created_at: string;
        }>,
        [
          Relationship<'comment_mentions_comment_id_fkey', 'comment_id', 'comments', 'id'>,
          Relationship<'comment_mentions_mentioned_user_id_fkey', 'mentioned_user_id', 'profiles', 'id'>,
          Relationship<'comment_mentions_author_id_fkey', 'author_id', 'profiles', 'id'>,
        ]
      >;
      reactions: TableDef<
        Reaction,
        Partial<Reaction>,
        Partial<Reaction>,
        [
          Relationship<'reactions_user_id_fkey', 'user_id', 'profiles', 'id'>,
          Relationship<'reactions_post_id_fkey', 'post_id', 'posts', 'id'>,
          Relationship<'reactions_comment_id_fkey', 'comment_id', 'comments', 'id'>,
        ]
      >;
    };
    Views: {
      profiles_public: {
        Row: AsRecord<PublicProfile>;
        Relationships: [];
      };
    };
    Functions: {
      get_my_profile: {
        Args: Record<string, never>;
        Returns: Profile | null;
      };
      mark_coin_balance_shown: {
        Args: Record<string, never>;
        Returns: number;
      };
      flag_challenge_proof: {
        Args: { p_post_id: string; p_reason?: string | null };
        Returns: { ok: boolean; hidden?: boolean; flag_count?: number };
      };
      join_challenge: {
        Args: { p_challenge_id: string };
        Returns: { ok: boolean; challenge_id: string; prize_pool: number };
      };
      tick_official_series: {
        Args: Record<string, never>;
        Returns: { ok: boolean };
      };
      list_official_joinable: {
        Args: Record<string, never>;
        Returns: Challenge[];
      };
      publish_challenge: {
        Args: { p_payload: Record<string, unknown> };
        Returns: { ok: boolean; challenge_id: string; prize_pool: number };
      };
      refund_pre_start: {
        Args: { p_challenge_id: string; p_user_id?: string };
        Returns: { ok: boolean; already_refunded?: boolean; refunded?: number };
      };
      mark_challenge_started: {
        Args: { p_challenge_id: string };
        Returns: { ok: boolean; already_started?: boolean; official_started_at: string };
      };
      eliminate_participant: {
        Args: { p_challenge_id: string; p_user_id: string };
        Returns: { ok: boolean; already_eliminated?: boolean; prize_pool_unchanged?: boolean };
      };
      close_challenge_for_judging: {
        Args: { p_challenge_id: string };
        Returns: {
          ok?: boolean;
          challenge_id?: string;
          status?: string;
          judging_started_at?: string;
          distributable_at?: string;
        };
      };
      ensure_challenge_judging: {
        Args: { p_challenge_id: string };
        Returns: {
          ok?: boolean;
          challenge_id?: string;
          status?: string;
          judging_started_at?: string;
          distributable_at?: string;
        };
      };
      distribute_challenge: {
        Args: { p_challenge_id: string };
        Returns: { ok: boolean; paid?: number; solo_forfeit?: boolean; distributed_at?: string };
      };
      sync_challenge_statuses: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      get_challenge_settlement: {
        Args: { p_challenge_id: string };
        Returns: ChallengeSettlementView | null;
      };
      settle_challenge: {
        Args: { p_challenge_id: string };
        Returns: ChallengeSettlementView;
      };
      log_workout: {
        Args: {
          p_challenge_id: string;
          p_submission_date?: string;
          p_pre_selfie_url?: string;
          p_post_selfie_url?: string;
          p_hr_monitor_url?: string;
          p_notes?: string | null;
          p_task_ids?: unknown;
          p_proof_parts?: unknown;
          p_health_workout_id?: string | null;
        };
        Returns: WorkoutSubmission & { days_completed: number };
      };
      log_health_workout: {
        Args: {
          p_challenge_id: string;
          p_health_workout_id: string;
          p_submission_date?: string;
          p_notes?: string | null;
        };
        Returns: WorkoutSubmission & { days_completed: number };
      };
      cancel_challenge: {
        Args: { p_challenge_id: string };
        Returns: { ok: boolean };
      };
      mark_challenge_judging: {
        Args: { p_challenge_id: string };
        Returns: Challenge;
      };
      refresh_participant_progress: {
        Args: { p_challenge_id: string; p_user_id: string };
        Returns: number;
      };
      transfer_coins: {
        Args: { p_recipient_id: string; p_amount: number };
        Returns: CoinTransfer;
      };
      send_coins: {
        Args: { p_to_user_id: string; p_amount: number; p_note?: string | null };
        Returns: CoinTransfer;
      };
      transfer_funds: {
        Args: { p_recipient_id: string; p_amount: number; p_currency?: string };
        Returns: CoinTransfer;
      };
      create_callout: {
        Args: {
          p_opponent_id: string;
          p_amount: number;
          p_currency: string;
          p_win_condition: string;
          p_deadline: string;
        };
        Returns: Callout;
      };
      accept_callout: {
        Args: { p_callout_id: string };
        Returns: Callout;
      };
      decline_callout: {
        Args: { p_callout_id: string };
        Returns: Callout;
      };
      submit_callout_result: {
        Args: { p_callout_id: string; p_winner_id: string };
        Returns: Callout;
      };
      cancel_callout: {
        Args: { p_callout_id: string };
        Returns: Callout;
      };
      mark_notifications_read: {
        Args: { p_ids?: string[] | null };
        Returns: number;
      };
      mark_notification_read: {
        Args: { p_id: string };
        Returns: number;
      };
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: number;
      };
      invite_to_challenge: {
        Args: { p_challenge_id: string; p_invitee_id: string };
        Returns: ChallengeInvite;
      };
      create_challenge_invite: {
        Args: { p_challenge_id: string };
        Returns: CreateChallengeInviteResult;
      };
      accept_challenge_invite: {
        Args: { p_token: string };
        Returns: AcceptChallengeInviteResult;
      };
      user_can_access_challenge: {
        Args: { p_challenge_id: string; p_user_id?: string };
        Returns: boolean;
      };
      challenge_available_in_jurisdiction: {
        Args: { p_challenge_id: string; p_user_id?: string };
        Returns: boolean;
      };
      challenge_access_reason: {
        Args: { p_challenge_id: string };
        Returns: string;
      };
      lifetime_earnings: {
        Args: { p_user_id: string };
        Returns: { coins: number; bucks: number; callout_wins: number }[];
      };
      evaluate_badges: {
        Args: Record<string, never>;
        Returns: {
          newly_awarded: { key: string; title: string; coin_reward: number }[];
        };
      };
      search_people: {
        Args: { p_query: string };
        Returns: PublicProfile[];
      };
      register_push_token: {
        Args: { p_token: string; p_platform?: string | null };
        Returns: undefined;
      };
      clear_push_token: {
        Args: { p_token: string };
        Returns: undefined;
      };
      notify_my_profile_gate: {
        Args: { p_missing?: string | null };
        Returns: string | null;
      };
      report_post: {
        Args: { p_post_id: string; p_reason: string };
        Returns: undefined;
      };
      can_post_on_profile: {
        Args: { p_host_id: string };
        Returns: boolean;
      };
      remove_post_from_wall: {
        Args: { p_post_id: string };
        Returns: undefined;
      };
      block_user: {
        Args: { p_target: string };
        Returns: undefined;
      };
      soft_delete_post: {
        Args: { p_post_id: string };
        Returns: undefined;
      };
      enqueue_checkin_reminders: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      enqueue_profile_reminders: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
