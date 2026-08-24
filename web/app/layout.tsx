import type { Metadata, Viewport } from 'next';

import './globals.css';

export const viewport: Viewport = {
  themeColor: '#2C9B89',
};

export const metadata: Metadata = {
  title: 'blOb',
  description: 'Check in. Show up.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'blOb',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
