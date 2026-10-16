import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#172338',
        steel: '#64748B',
        azure: '#0866B1',
        mint: '#15803D',
        amber: { ...colors.amber, DEFAULT: '#B45309' },
        rose: { ...colors.rose, DEFAULT: '#B91C1C' },
        cloud: '#F5F7FA',
        brand: {
          DEFAULT: '#0866B1',
          hover: '#07528E',
          light: '#EAF3FC',
        },
        surface: '#FFFFFF',
        'text-primary': '#172338',
        'text-secondary': '#64748B',
        'border-default': '#E2E8F0',
        success: '#15803D',
        warning: '#B45309',
        error: '#B91C1C',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        'section-title': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'card-title': ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        supporting: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        kpi: ['1.875rem', { lineHeight: '2.25rem', fontWeight: '700' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(23, 35, 56, 0.05), 0 8px 24px rgba(23, 35, 56, 0.05)',
        floating: '0 16px 40px rgba(23, 35, 56, 0.14)',
      },
    },
  },
  plugins: [],
};
