export function conversationLastMessageAt(row: {
  last_message_at?: string | null;
  last_message?: { created_at?: string | null } | null;
  updated_at?: string | null;
}): string {
  return (
    row.last_message_at?.trim() ||
    row.last_message?.created_at?.trim() ||
    row.updated_at?.trim() ||
    ''
  );
}

/** Newest thread first — same idea as Alerts (created_at DESC). */
export function sortConversationsNewestFirst<T extends {
  last_message_at?: string | null;
  last_message?: { created_at?: string | null } | null;
  updated_at?: string | null;
}>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const newer = Date.parse(conversationLastMessageAt(b)) || 0;
    const older = Date.parse(conversationLastMessageAt(a)) || 0;
    return newer - older;
  });
}
