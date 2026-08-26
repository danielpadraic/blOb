/** Not the consumer site. Vercel serves the Expo Router export from the repo root. */
import { BlobApp } from '~/components/blob-app';
import { PhoneShell } from '~/components/phone-shell';

export function generateStaticParams() {
  return [{ slug: [] as string[] }];
}

export default function Page() {
  return (
    <PhoneShell>
      <BlobApp />
    </PhoneShell>
  );
}
