/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF0FA',
          100: '#DCE0F5',
          200: '#B8C0E8',
          300: '#949FD8',
          400: '#6B7CE8',
          500: '#4A5BD8',
          600: '#3A4ACC',
          700: '#2D3BB8',
          800: '#242E9A',
          900: '#1A1F7C',
        },
        surface: '#FAFAFA',
        'surface-alt': '#F0F0F5',
        'surface-dark': '#1A1A2E',
        text: {
          primary: '#1A1A2E',
          secondary: '#3D3D5C',
          muted: '#6B6B8A',
          inverse: '#FAFAFA',
        },
        green: {
          500: '#10B981',
        },
        red: {
          500: '#EF4444',
        },
        amber: {
          500: '#F59E0B',
        },
      },
      textColor: {
        primary: {
          DEFAULT: '#1A1A2E',
          50: '#EEF0FA',
          100: '#DCE0F5',
          200: '#B8C0E8',
          300: '#949FD8',
          400: '#6B7CE8',
          500: '#4A5BD8',
          600: '#3A4ACC',
          700: '#2D3BB8',
          800: '#242E9A',
          900: '#1A1F7C',
        },
        secondary: '#3D3D5C',
        muted: '#6B6B8A',
        inverse: '#FAFAFA',
      },
      fontSize: {
        'display': ['3.5rem', { lineHeight: '1.1' }],
        'h1': ['2.5rem', { lineHeight: '1.2' }],
        'h2': ['2rem', { lineHeight: '1.3' }],
        'h3': ['1.5rem', { lineHeight: '1.4' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'sm': ['0.875rem', { lineHeight: '1.5' }],
        'xs': ['0.75rem', { lineHeight: '1.5' }],
      },
      animation: {
        'orb-pulse': 'orb-pulse 1.5s ease-in-out infinite',
        'orb-rotate': 'orb-rotate 4s linear infinite',
        'orb-spin': 'orb-spin 1s linear infinite',
        'orb-pop': 'orb-pop 300ms ease-out forwards',
        'orb-shake': 'orb-shake 400ms ease-in-out',
      },
      keyframes: {
        'orb-pulse': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'orb-rotate': {
          'from': { transform: 'rotate(0deg)' },
          'to': { transform: 'rotate(360deg)' },
        },
        'orb-spin': {
          'from': { transform: 'rotate(0deg)' },
          'to': { transform: 'rotate(360deg)' },
        },
        'orb-pop': {
          '0%': { transform: 'scale(0)' },
          '60%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        'orb-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
      },
    },
  },
  plugins: [],
}