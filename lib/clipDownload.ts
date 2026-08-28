export async function downloadClipMedia(url: string): Promise<void> {
  const source = String(url ?? '').trim();
  if (!source) {
    throw new Error('This clip has no file to save.');
  }
  const link = document.createElement('a');
  link.href = source;
  link.download = source.split('/').pop()?.split('?')[0] || 'blob-clip';
  link.rel = 'noreferrer';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
