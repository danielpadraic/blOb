import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'blOb',
    short_name: 'blOb',
    description: 'Check in. Show up.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F7F5',
    theme_color: '#2C9B89',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
