/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: '#151716',
          800: '#151716',
          700: '#151716',
        },
        cream: {
          DEFAULT: '#F7F7F5',
          100: '#E8EBE8',
          200: '#E8EBE8',
        },
        coral: {
          DEFAULT: '#2C9B89',
          dark: '#9A3B3B',
          soft: '#E7F7F3',
        },
        mint: {
          DEFAULT: '#72D9CB',
          dark: '#2C9B89',
        },
        accent: {
          DEFAULT: '#2C9B89',
          soft: '#E7F7F3',
        },
        danger: '#9A3B3B',
        ink: '#151716',
        muted: '#7F8581',
        line: '#E8EBE8',
      },
      borderRadius: {
        blob: '22px',
        'blob-lg': '22px',
      },
    },
  },
  plugins: [],
};
