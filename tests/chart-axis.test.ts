import { describe, expect, it } from 'vitest';

import { outwardIntegerAxisDomain, outwardNiceAxisDomain } from '@/lib/chart-axis';

describe('outwardIntegerAxisDomain', () => {
  it('rounds positive and negative stock movement independently', () => {
    expect(outwardIntegerAxisDomain([175, -2, 173])).toEqual([-5, 180]);
    expect(outwardIntegerAxisDomain([2, -15])).toEqual([-20, 5]);
  });

  it('adds one step when an extreme is already on a step boundary', () => {
    expect(outwardIntegerAxisDomain([175, -15])).toEqual([-20, 180]);
  });

  it('does not add an unused negative range', () => {
    expect(outwardIntegerAxisDomain([0, 12])).toEqual([0, 15]);
    expect(outwardIntegerAxisDomain([0])).toEqual([0, 5]);
  });

  it('rejects an invalid step', () => {
    expect(() => outwardIntegerAxisDomain([1], 0)).toThrow(RangeError);
  });
});

describe('outwardNiceAxisDomain', () => {
  it('uses a proportional step instead of a fixed money offset', () => {
    expect(outwardNiceAxisDomain([50, 40, -5])).toEqual([-10, 60]);
    expect(outwardNiceAxisDomain([16_000, 8_000, 0])).toEqual([0, 20_000]);
  });

  it('keeps an empty chart usable', () => {
    expect(outwardNiceAxisDomain([0])).toEqual([0, 1]);
  });
});
