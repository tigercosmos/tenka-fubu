/** Scoped cyan-material cue for the fixed native bank controls, not water recognition.
 * RGB8 chroma 16 rejects near-gray noise; B>=G distinguishes the authored cyan from
 * green terrain. Source dark/shallow colors are (88,120,128)/(115,148,151), but
 * screenshot contrast is not source contrast. Mixed AA pixels may be rejected:
 * callers retain their existing AA tolerance and never clip pixel banks to geometry.
 * Some blue-gray rocks still pass (e.g. 74,83,91 and 43,63,64). Keep all raw RGB and
 * disconnected hits; archived new Shinano has 56 exterior positives with this cue.
 */
export function isFixedBankWaterPixel(rgb: readonly number[]): boolean {
  return (
    rgb.length === 3 &&
    rgb.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) &&
    rgb[2]! >= rgb[1]! &&
    rgb[2]! - rgb[0]! >= 16
  );
}

export function associatedWaterRun(
  samples: readonly { side: number; water: boolean }[],
  center: number,
) {
  if (!Number.isFinite(center) || samples.length < 3) throw new Error('Invalid water station');
  const firstSample = samples[0],
    secondSample = samples[1];
  if (!firstSample || !secondSample) throw new Error('Sparse water samples');
  const step = secondSample.side - firstSample.side;
  if (!Number.isFinite(step) || step <= 0) throw new Error('Invalid water sample spacing');
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (
      !sample ||
      !Number.isFinite(sample.side) ||
      typeof sample.water !== 'boolean' ||
      Math.abs(sample.side - samples[0]!.side - i * step) > 1e-8
    )
      throw new Error('Sparse or unordered water samples');
  }
  if (center < samples[0]!.side || center > samples.at(-1)!.side)
    throw new Error('Center outside samples');
  const nearest = Math.round((center - samples[0]!.side) / step);
  const lower = Math.floor((center - samples[0]!.side) / step);
  if (
    lower + 1 < samples.length &&
    Math.abs(center - (samples[lower]!.side + samples[lower + 1]!.side) / 2) < 1e-8 &&
    samples[lower]!.water !== samples[lower + 1]!.water
  )
    throw new Error('Ambiguous center classification');
  if (!samples[nearest]!.water) throw new Error('Emitted center is not classified water');
  let first = nearest,
    last = nearest;
  while (first > 0 && samples[first - 1]!.water) first--;
  while (last + 1 < samples.length && samples[last + 1]!.water) last++;
  if (first === 0 || last === samples.length - 1)
    throw new Error('Water run touches sampling edge');
  const indices = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const disconnected = samples.flatMap((sample, i) =>
    sample.water && (i < first || i > last) ? [i] : [],
  );
  return { left: samples[first]!.side, right: samples[last]!.side, indices, disconnected, center };
}
