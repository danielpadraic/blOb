import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: false,
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'utils/**/*.test.ts', 'api/**/*.test.ts', 'hooks/**/*.test.ts'],
    setupFiles: [path.resolve(__dirname, 'lib/testStubs/setup.ts')],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'react-native': path.resolve(__dirname, 'lib/testStubs/reactNative.ts'),
      'expo-secure-store': path.resolve(__dirname, 'lib/testStubs/expoSecureStore.ts'),
      [path.resolve(__dirname, 'lib/supabase.ts')]: path.resolve(__dirname, 'lib/testStubs/supabase.ts'),
      [path.resolve(__dirname, 'lib/supabase')]: path.resolve(__dirname, 'lib/testStubs/supabase.ts'),
    },
  },
});
