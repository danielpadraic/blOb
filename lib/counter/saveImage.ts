import { Platform } from 'react-native';

/**
 * Save image: Camera Roll on iOS/Android (add-only). Web downloads the file.
 */
export async function saveCounterImage(uri: string): Promise<void> {
  const source = String(uri ?? '').trim();
  if (!source) {
    throw new Error('That card is not ready yet.');
  }
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = source;
    link.download = source.split('/').pop()?.split('?')[0] || 'blob-counter.png';
    link.rel = 'noreferrer';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  const MediaLibrary = await import('expo-media-library');
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Allow Photos to save this card.');
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const { cacheDirectory, documentDirectory, downloadAsync } = await import('expo-file-system/legacy');
    const dest = `${cacheDirectory ?? documentDirectory}blob-counter-${Date.now()}.png`;
    const result = await downloadAsync(source, dest);
    await MediaLibrary.saveToLibraryAsync(result.uri);
    return;
  }
  await MediaLibrary.saveToLibraryAsync(source);
}
