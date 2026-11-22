/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Read from src/styles/tokens.css so marketing and the app cannot drift. <alpha-value> keeps bg-brand-purple/10 working.
        brand: {
          purple:         'rgb(var(--brand-rgb) / <alpha-value>)',
          'purple-hover': 'var(--brand-hover)',
          dark:           'rgb(var(--text-rgb) / <alpha-value>)',
          light:          'var(--brand-wash)',
        },
        teal: {
          50:  '#E8F4F4',
          600: 'var(--planning)',
          700: '#0A6060',
        },
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
