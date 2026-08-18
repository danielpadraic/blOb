import { SymbolView, type SymbolViewProps } from 'expo-symbols';

export type GlyphName = NonNullable<SymbolViewProps['name']>;

type GlyphProps = {
  name: GlyphName;
  color: string;
  size?: number;
};

export function Glyph({ name, color, size = 18 }: GlyphProps) {
  return <SymbolView name={name} tintColor={color} size={size} weight="semibold" />;
}

export const GLYPH = {
  like: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  likeOutline: { ios: 'heart', android: 'favorite_border', web: 'favorite_border' },
  fire: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
  reply: { ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  check: { ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' },
  flag: { ios: 'flag.fill', android: 'flag', web: 'flag' },
  streak: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  star: { ios: 'star.fill', android: 'star', web: 'star' },
  crown: { ios: 'crown.fill', android: 'workspace_premium', web: 'workspace_premium' },
  swords: { ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' },
  person: { ios: 'person.fill', android: 'person', web: 'person' },
  people: { ios: 'person.2.fill', android: 'group', web: 'group' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  leaf: { ios: 'leaf.fill', android: 'eco', web: 'eco' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  play: { ios: 'play.circle.fill', android: 'play_circle', web: 'play_circle' },
  attach: { ios: 'paperclip', android: 'attach_file', web: 'attach_file' },
  link: { ios: 'link', android: 'link', web: 'link' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  shield: { ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' },
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  album: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
  heartbeat: { ios: 'heart.fill', android: 'monitor_heart', web: 'monitor_heart' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  send: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  hide: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  mute: { ios: 'speaker.slash.fill', android: 'volume_off', web: 'volume_off' },
  unmute: { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' },
} as const satisfies Record<string, GlyphName>;

export type GlyphId = (typeof GLYPH)[keyof typeof GLYPH];
