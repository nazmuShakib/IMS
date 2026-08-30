/**
 * Adds one small, fixed step beyond each populated side of a signed integer
 * chart. Positive and negative bounds are calculated independently so a large
 * inbound value cannot create an unnecessarily deep outbound axis.
 */
export function outwardIntegerAxisDomain(values: number[], step = 5): [number, number] {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('Axis step must be a positive finite number.');
  }

  const finiteValues = values.filter(Number.isFinite);
  const maximum = Math.max(0, ...finiteValues);
  const minimum = Math.min(0, ...finiteValues);
  const maximumDomain = maximum > 0
    ? (Math.floor(maximum / step) + 1) * step
    : minimum < 0 ? 0 : step;
  const minimumDomain = minimum < 0
    ? -(Math.floor(Math.abs(minimum) / step) + 1) * step
    : 0;

  return [minimumDomain, maximumDomain];
}

/**
 * Chooses a proportional 1/2/5 step for money charts, then leaves one step of
 * breathing room beyond the populated range. This avoids a fixed large offset
 * flattening charts with small values.
 */
export function outwardNiceAxisDomain(values: number[], targetSteps = 5): [number, number] {
  if (!Number.isFinite(targetSteps) || targetSteps <= 0) {
    throw new RangeError('Target step count must be a positive finite number.');
  }

  const finiteValues = values.filter(Number.isFinite);
  const magnitude = Math.max(0, ...finiteValues.map((value) => Math.abs(value)));
  if (magnitude === 0) return [0, 1];

  const roughStep = magnitude / targetSteps;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * power;

  return outwardIntegerAxisDomain(finiteValues, step);
}
