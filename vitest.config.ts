import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // Exclude git worktrees created by Claude agents — they have separate node_modules
    // that cause "multiple copies of React" hook errors when Vitest scans them.
    exclude: ['node_modules/**', '.claude/**'],
  },
});
