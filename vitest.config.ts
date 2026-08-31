import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    // Ticket 01 ships before any tests exist. Don't fail the scaffold
    // verification just because there is nothing to run yet.
    passWithNoTests: true,
  },
});
