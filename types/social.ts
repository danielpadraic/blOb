export type Follow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type Friendship = {
  user_a_id: string;
  user_b_id: string;
  status: FriendshipStatus;
  requested_by: string;
  created_at: string;
  accepted_at: string | null;
};

export type FeedEventType =
  | 'challenge_created'
  | 'challenge_joined'
  | 'result_submitted'
  | 'challenge_won'
  | 'story_posted'
  | 'reel_posted'
  | 'friend_accepted'
  | 'reaction_added'
  | 'comment_added';

export type FeedEventVisibility = 'public' | 'friends' | 'private';

export type FeedEvent = {
  id: string;
  actor_id: string;
  event_type: FeedEventType | string;
  target_type: string | null;
  target_id: string | null;
  challenge_id: string | null;
  metadata: Record<string, any>;
  visibility: FeedEventVisibility;
  created_at: string;
};

export type Story = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  challenge_id: string | null;
  caption: string | null;
  expires_at: string;
  created_at: string;
  sequence_id?: string | null;
  sequence_index?: number | null;
  clip_start_ms?: number | null;
  clip_duration_ms?: number | null;
  thumbnail_url?: string | null;
};

export type StoryReactionType = 'like' | 'love' | 'fire' | 'strong';

export type StoryReaction = {
  id: string;
  story_id: string;
  user_id: string;
  reaction_type: StoryReactionType;
  created_at: string;
};

export type StoryComment = {
  id: string;
  story_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type StoryView = {
  story_id: string;
  viewer_id: string;
  viewed_at: string;
};

export type Reel = {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  challenge_id: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type ReelTag = {
  reel_id: string;
  tagged_user_id: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  is_group: boolean;
  challenge_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  created_at: string;
};
