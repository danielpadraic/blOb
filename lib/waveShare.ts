import * as Linking from 'expo-linking';

export function storyShareUrl(storyId: string) {
  return Linking.createURL(`wave/${storyId}`);
}

export function roundShareUrl(reelId: string) {
  return Linking.createURL(`round/${reelId}`);
}

export function storyIdFromShareText(text: string): string | null {
  const match = text.match(/(?:wave|story)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match?.[1] ?? null;
}
