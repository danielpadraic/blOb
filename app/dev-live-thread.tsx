import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { LiveThread } from '@/components/challenge/LiveThread';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import type { PostWithMeta } from '@/lib/types';

/**
 * Harness for the Live thread scroll rules.
 *
 * The reported bug only shows up with a thread taller than the viewport plus a message arriving while
 * someone is reading older rows, which is awkward to reproduce by hand with two accounts. This route
 * reproduces it deterministically: scroll up, tap "Someone posts", and watch whether the viewport
 * moves. Dev only — not linked from any screen.
 */

const OTHER = { id: 'them-1', username: 'silas', display_name: 'Silas', avatar_url: null };
const ME = { id: 'me-1', username: 'daniel', display_name: 'Daniel', avatar_url: null };

function makePost(index: number, mine: boolean): PostWithMeta {
  const author = mine ? ME : OTHER;
  return {
    id: `p-${index}`,
    author_id: author.id,
    author,
    challenge_id: 'c-dev',
    content: `${mine ? 'Mine' : 'Theirs'} #${index} — ${'lobby chatter '.repeat(1 + (index % 3))}`,
    media_urls: [],
    created_at: new Date(Date.parse('2026-09-05T14:00:00.000Z') + index * 60_000).toISOString(),
    comments: [],
    reactions: [],
    source: 'challenge',
  } as unknown as PostWithMeta;
}

/** Mirrors [blob:live] lines onto the screen so a screenshot shows the pin decisions. */
function useLiveLogMirror(onLine: (line: string) => void) {
  const sink = useRef(onLine);
  sink.current = onLine;
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const original = console.log;
    console.log = (...args: unknown[]) => {
      if (args[0] === '[blob:live]') {
        const detail = args[1] as { why?: string; atEnd?: boolean; userDragging?: boolean } | undefined;
        sink.current(`${detail?.why ?? '?'} atEnd=${detail?.atEnd} drag=${detail?.userDragging}`);
      }
      original(...args);
    };
    return () => {
      console.log = original;
    };
  }, []);
}

export default function DevLiveThread() {
  const [count, setCount] = useState(40);
  const posts = useMemo(
    () => Array.from({ length: count }, (_, index) => makePost(index, index % 5 === 0)),
    [count],
  );
  const [log, setLog] = useState<string[]>([]);
  const noteRef = useRef(0);

  const note = useCallback((line: string) => {
    noteRef.current += 1;
    setLog((current) => [`${noteRef.current}. ${line}`, ...current].slice(0, 14));
  }, []);

  useLiveLogMirror(note);

  return (
    <View style={{ flex: 1, backgroundColor: THEME.background }}>
      <View style={{ padding: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: THEME.border }}>
        <AppText className="text-[13px] font-bold">Live thread scroll harness</AppText>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable
            testID="dev-incoming"
            onPress={() => {
              setCount((current) => current + 1);
              note('someone else posted');
            }}
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: 10,
              backgroundColor: THEME.accent,
            }}>
            <AppText className="text-[12px] font-bold" style={{ color: '#fff' }}>
              Someone posts
            </AppText>
          </Pressable>
          <Pressable
            testID="dev-burst"
            onPress={() => {
              setCount((current) => current + 5);
              note('five arrived at once');
            }}
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: THEME.border,
            }}>
            <AppText className="text-[12px] font-bold">Burst of 5</AppText>
          </Pressable>
        </View>
        <AppText className="text-[11px]" style={{ color: THEME.textMuted }}>
          {`rows: ${posts.length}`}
        </AppText>
        <ScrollView style={{ maxHeight: 90 }}>
          {log.map((line) => (
            <AppText key={line} className="text-[10px]" style={{ color: THEME.textMuted }}>
              {line}
            </AppText>
          ))}
        </ScrollView>
      </View>

      <LiveThread
        posts={posts}
        currentUserId={ME.id}
        emptyTitle="Quiet"
        emptyBody="Nothing yet"
        onCompose={() => {
          setCount((current) => current + 1);
          note('I sent one');
        }}
        onReact={() => undefined}
      />
    </View>
  );
}
