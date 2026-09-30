/** Small deterministic PRNG. It has no browser dependencies and is suitable for reproducible generation. */
export function createRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 4294967296;
  };
}

/**
 * Pure single-step of the same PRNG as `createRng`, exposed so callers that need to persist and
 * serialize the generator state (for example a deterministic AI whose RNG lives inside its own
 * state) can advance it without a hidden closure. Returns the drawn value and the next state.
 */
export function nextRandom(state: number): { value: number; state: number } {
  let next = (state >>> 0) || 0x6d2b79f5;
  next = Math.imul(next ^ (next >>> 16), 0x21f0aaad);
  next = Math.imul(next ^ (next >>> 15), 0x735a2d97);
  next ^= next >>> 15;
  return { value: (next >>> 0) / 4294967296, state: next >>> 0 };
}

export function seedFromText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
