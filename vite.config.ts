import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '0.0.0.0', allowedHosts: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
