import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F7F5',
        surface: '#FFFFFF',
        line: '#E8EBE8',
        teal: '#2C9B89',
        'teal-soft': '#E7F7F3',
        teal2: '#72D9CB',
        ink: '#151716',
        muted: '#7F8581',
        black: '#101312',
      },
      borderRadius: {
        blob: '22px',
      },
      boxShadow: {
        card: '0 8px 24px rgba(25,34,31,.07)',
      },
    },
  },
  plugins: [],
};

export default config;
