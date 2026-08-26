export function previewFromStory(story: {
  media_type?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
}): string | null {
  if (story.media_type === 'image') {
    return story.media_url?.trim() || null;
  }
  if (story.media_type === 'video') {
    return story.thumbnail_url?.trim() || null;
  }
  return null;
}
