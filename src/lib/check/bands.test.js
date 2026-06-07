import { describe, it, expect } from 'vitest';
import { deriveBand, BANDS, CRIT_MARGIN, PARTIAL_MARGIN } from './bands.js';

const DC = 12;

describe('deriveBand', () => {
  it('natural 1 is always Fail, regardless of total/DC', () => {
    expect(deriveBand(99, DC, { fail: true }).key).toBe('fail');
  });

  it('natural 15 is always Critical, even below DC', () => {
    expect(deriveBand(3, DC, { crit: true }).key).toBe('crit');
  });

  it('Critical when total >= dc + CRIT_MARGIN', () => {
    expect(deriveBand(DC + CRIT_MARGIN, DC).key).toBe('crit');
    expect(deriveBand(DC + CRIT_MARGIN - 1, DC).key).toBe('success'); // just under crit
  });

  it('Success when total meets or beats the DC (below crit margin)', () => {
    expect(deriveBand(DC, DC).key).toBe('success');
    expect(deriveBand(DC + 1, DC).key).toBe('success');
  });

  it('Partial when within PARTIAL_MARGIN below the DC', () => {
    expect(deriveBand(DC - 1, DC).key).toBe('partial');
    expect(deriveBand(DC - PARTIAL_MARGIN, DC).key).toBe('partial');
  });

  it('Fail when more than PARTIAL_MARGIN below the DC', () => {
    expect(deriveBand(DC - PARTIAL_MARGIN - 1, DC).key).toBe('fail');
  });

  it('returns proper BANDS entries with label + cls', () => {
    const b = deriveBand(DC, DC);
    expect(b).toEqual(BANDS.success);
    expect(b.cls).toBe('band-success');
  });
});
