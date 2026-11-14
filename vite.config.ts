import { defineConfig } from 'vitest/config';
import { backlotServer } from './server/plugin.ts';

export default defineConfig({
  plugins: [backlotServer()],
  server: { port: 5173, strictPort: true, host: 'localhost' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
