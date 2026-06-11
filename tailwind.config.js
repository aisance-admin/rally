/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b0d11',
          850: '#0e1116',
          800: '#13171e',
          750: '#171c25',
          700: '#1d2430',
          600: '#2a3340',
          500: '#3a4554',
        },
        brand: {
          DEFAULT: '#ff5500',
          400: '#ff7a33',
          500: '#ff5500',
          600: '#e64d00',
        },
        win: '#32d74b',
        loss: '#ff453a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,85,0,0.25), 0 8px 30px rgba(255,85,0,0.12)',
      },
    },
  },
  plugins: [],
}
