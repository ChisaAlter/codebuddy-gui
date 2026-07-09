import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom：routes.test.js 需读写 window.location.hash；timeline/git-validate 走 node 也可
    // 故统一 jsdom，代价小（jsdom 已 devDependency）
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{js,jsx}'],
    globals: true,
  },
});
