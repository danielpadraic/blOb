import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  outputFileTracingRoot: path.resolve(__dirname),
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '..'),
      '~': path.resolve(__dirname),
    };
    return config;
  },
};

export default nextConfig;
