/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  // theme.extend.colors：dark/accent 扩展已删——组件统一用 var(--color-*) CSS 变量（见 src/index.css :root）
  // 若将来要引 Tailwind 颜色类，应映射到 var(--color-*) 而非硬编码 #hex
  plugins: []
}
