import { describe, expect, it } from 'vitest';
import { tierForWidth } from './tier';

describe('layout tiers', () => {
  it('places viewport edges in the intended tier', () => {
    expect(tierForWidth(719)).toBe('compact');
    expect(tierForWidth(720)).toBe('narrow');
    expect(tierForWidth(1023)).toBe('narrow');
    expect(tierForWidth(1024)).toBe('regular');
    expect(tierForWidth(1679)).toBe('regular');
    expect(tierForWidth(1680)).toBe('wide');
    expect(tierForWidth(2399)).toBe('wide');
    expect(tierForWidth(2400)).toBe('ultrawide');
  });
});
