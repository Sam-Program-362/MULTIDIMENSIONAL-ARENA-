import { describe, expect, it } from 'vitest';

const modules = import.meta.glob('../src/sim/**/*.ts', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

describe('simulation boundary', () => {
  it('contains no DOM or browser references', () => {
    for (const source of Object.values(modules)) {
      expect(source).not.toMatch(/\b(document|window|localStorage|HTMLElement)\b/);
    }
  });
});
