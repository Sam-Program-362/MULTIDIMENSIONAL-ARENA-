/** Default non-zero state used when a caller supplies seed 0. */
export const DEFAULT_RNG_STATE = 0x6d2b79f5;

/** Convert any numeric seed to the serializable state used by the shared PRNG. */
export function createRngState(seed: number): number {
  return (seed >>> 0) || DEFAULT_RNG_STATE;
}

export interface RngStep {
  value: number;
  state: number;
}

/**
 * Advance the project's deterministic PRNG once.
 *
 * Unlike `createRng`, this form returns its next state explicitly, which lets simulations keep
 * randomness in plain data that can be cloned, replayed, and compared in tests.
 */
export function stepRng(rngState: number): RngStep {
  let state = rngState >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
  state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
  state ^= state >>> 15;
  const unsignedState = state >>> 0;
  return { value: unsignedState / 4294967296, state: unsignedState };
}

/** Small deterministic PRNG. It has no browser dependencies and is suitable for reproducible generation. */
export function createRng(seed: number): () => number {
  let state = createRngState(seed);
  return () => {
    const next = stepRng(state);
    state = next.state;
    return next.value;
  };
}

export function seedFromText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
