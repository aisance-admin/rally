/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#06080f',
          850: '#0b0e17',
          800: '#121624',
          750: '#171c2c',
          700: '#202637',
          600: '#2c3346',
          500: '#3a4357',
        },
        brand: {
          DEFAULT: '#ff6a3d',
          400: '#ff8a5e',
          500: '#ff6a3d',
          600: '#ed5526',
        },
        brand2: '#ff3d77',
        win: '#34d399',
        loss: '#fb6f7d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
      boxShadow: {
        glow: '0 8px 30px -8px rgba(255,106,61,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
      },
    },
  },
  plugins: [],
}
