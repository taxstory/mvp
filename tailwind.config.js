/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#6B5CE7',
          dark:   '#1A1230',
          light:  '#F4F2FF',
        },
        teal: {
          50:  '#E8F4F4',
          600: '#0D7A7A',
          700: '#0A6060',
        },
        navy: '#1B2A4A',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      borderRadius: { xl: '10px' },
    },
  },
  plugins: [],
};
