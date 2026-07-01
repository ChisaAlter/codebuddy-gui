/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: { 100: '#1a1a2e', 200: '#16213e', 300: '#0f3460', 400: '#1a1a2e', 500: '#0d1b2a' },
        accent: { DEFAULT: '#00d4ff', dim: '#0099cc' }
      }
    }
  },
  plugins: []
}
