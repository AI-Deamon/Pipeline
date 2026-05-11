/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00FF41',
        secondary: '#0D0D0D',
        background: '#000000',
        text: '#E0E0E0',
        surface: '#0D0D0D', // Mapping secondary to surface for cards
        success: '#00FF41', // Matrix green is also success
        error: '#ef4444', // Keep standard error red for now, or maybe a matrix red? Stick to standard for safety.
        warning: '#f59e0b',
        info: '#3b82f6',
      },
      fontFamily: {
        mono: ['"Fira Code"', 'monospace'],
        sans: ['"Fira Sans"', 'sans-serif'],
      },
      backgroundImage: {
        'matrix-gradient': 'linear-gradient(to bottom, #00FF41 0%, transparent 100%)',
      },
      animation: {
        'scan': 'scan 2s linear infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        }
      }
    },
  },
  plugins: [],
}
