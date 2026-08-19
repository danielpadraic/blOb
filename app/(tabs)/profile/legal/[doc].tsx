import { Redirect, useLocalSearchParams } from 'expo-router';

import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import type { LegalDocId } from '@/copy/legalDocs';

export default function ProfileLegalScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  if (doc !== 'terms' && doc !== 'privacy') {
    return <Redirect href="/profile/account" />;
  }
  return <LegalDocumentScreen doc={doc as LegalDocId} />;
}
