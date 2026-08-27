import type { MentionDoc } from '@/lib/mentions';

export type ComposerDraftAttachment = {
  id: string;
  uri: string;
  kind: 'photo' | 'video' | 'gif';
  mimeType?: string | null;
  name?: string;
  size?: number | null;
  blob?: Blob | null;
};

export type ComposerDraft = {
  doc: MentionDoc;
  attachments: ComposerDraftAttachment[];
};

const drafts = new Map<string, ComposerDraft>();

export function composerDraftKey(scope: string): string {
  return scope.trim() || 'home';
}

export function readComposerDraft(key: string): ComposerDraft | null {
  return drafts.get(key) ?? null;
}

export function writeComposerDraft(key: string, draft: ComposerDraft) {
  drafts.set(key, draft);
}

export function clearComposerDraft(key: string) {
  drafts.delete(key);
}

export function composerDraftHasContent(draft: ComposerDraft | null | undefined): boolean {
  if (!draft) {
    return false;
  }
  return Boolean(draft.doc.text.trim() || draft.attachments.length > 0);
}
