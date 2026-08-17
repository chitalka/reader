import { beforeEach, describe, expect, it } from 'vitest';
import { OnboardingHints } from './onboarding';

describe('OnboardingHints', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size; },
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      } satisfies Storage,
    });
  });

  it('claims the header hint only once across app instances', () => {
    const firstSession = new OnboardingHints();
    expect(firstSession.claimHeaderHint()).toBe(true);
    expect(firstSession.claimHeaderHint()).toBe(false);

    expect(new OnboardingHints().claimHeaderHint()).toBe(false);
  });
});
