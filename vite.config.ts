import { defineConfig } from 'vitest/config';
import { backlotServer } from './server/plugin.ts';

export default defineConfig({
  plugins: [backlotServer()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' }, // IPv4 loopback: adb reverse forwards to 127.0.0.1 (Windows resolves localhost to ::1)
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
