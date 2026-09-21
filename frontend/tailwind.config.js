/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        board: {
          // Granat planszy familiady — te same wartości na TV i na telefonach
          deep: '#050b2e',
          mid: '#0d1b5c',
          light: '#1e3a8a',
        },
        gold: {
          DEFAULT: '#fbbf24',
          dark: '#d97706',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        flip: {
          '0%': { transform: 'rotateX(90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0)', opacity: '1' },
        },
        'strike-in': {
          '0%': { transform: 'scale(3)', opacity: '0' },
          '60%': { transform: 'scale(0.9)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(251,191,36,0.7)' },
          '100%': { boxShadow: '0 0 0 40px rgba(251,191,36,0)' },
        },
      },
      animation: {
        flip: 'flip 320ms ease-out',
        'strike-in': 'strike-in 380ms cubic-bezier(.2,1.4,.4,1)',
        'pulse-ring': 'pulse-ring 1.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};
