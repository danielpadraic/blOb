import { Platform } from 'react-native';
import { cacheDirectory, documentDirectory, downloadAsync } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

export async function downloadClipMedia(url: string): Promise<void> {
  const source = String(url ?? '').trim();
  if (!source) {
    throw new Error('This clip has no file to save.');
  }
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = source;
    link.download = source.split('/').pop()?.split('?')[0] || 'blob-clip';
    link.rel = 'noreferrer';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Allow Photos to save this clip.');
  }
  const dest = `${cacheDirectory ?? documentDirectory}blob-clip-${Date.now()}`;
  const result = await downloadAsync(source, dest);
  await MediaLibrary.saveToLibraryAsync(result.uri);
}
