/** After a partial send. Names only the slots that are still open. */
export function postedStillNeed(labels: readonly string[]): string {
  const bits = labels
    .map((label) => {
      const lower = label.trim().toLowerCase();
      if (!lower) {
        return '';
      }
      if (lower.includes('post') && lower.includes('selfie')) {
        return 'the post selfie';
      }
      if (lower.includes('pre') && lower.includes('selfie')) {
        return 'the pre selfie';
      }
      if (lower.includes('workout') || lower.includes('heart')) {
        return 'the workout';
      }
      return label.trim();
    })
    .filter(Boolean);
  if (bits.length === 0) {
    return '';
  }
  if (bits.length === 1) {
    return `Posted. Still need ${bits[0]}.`;
  }
  const last = bits[bits.length - 1];
  return `Posted. Still need ${bits.slice(0, -1).join(', ')} and ${last}.`;
}
