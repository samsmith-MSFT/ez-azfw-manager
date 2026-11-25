import { describe, expect, it } from 'vitest';
import { canDockLogDetails } from './logLayout';

describe('log details docking', () => {
  it('keeps details in an overlay below the regular tier', () => {
    expect(canDockLogDetails('compact', 1400)).toBe(false);
    expect(canDockLogDetails('narrow', 1400)).toBe(false);
  });

  it('requires 560px of grid space after the 20rem details panel', () => {
    expect(canDockLogDetails('regular', 879)).toBe(false);
    expect(canDockLogDetails('regular', 880)).toBe(true);
    expect(canDockLogDetails('wide', 880)).toBe(true);
  });
});
