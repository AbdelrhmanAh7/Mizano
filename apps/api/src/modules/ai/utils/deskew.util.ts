/** Estimate a small scan tilt using horizontal ink projections on a bounded preview. */
export function estimateDeskew(pixels: Buffer, width: number, height: number): number {
  const points: Array<[number, number]> = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (pixels[y * width + x] < 128) points.push([x, y]);
    }
  }
  // Blank/noisy photographs do not have enough reliable text-line structure.
  if (points.length < 100 || points.length > (width * height) / 8) return 0;
  const score = (angle: number): number => {
    const radians = (angle * Math.PI) / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const rows = new Uint32Array(2 * width + height + 4);
    for (const [x, y] of points) {
      rows[Math.round(y * cos + x * sin) + width] += 1;
    }
    return rows.reduce((sum, count) => sum + count * count, 0);
  };
  const baseline = score(0);
  let best = baseline;
  let angle = 0;
  for (let candidate = -7; candidate <= 7; candidate += 0.5) {
    const value = score(candidate);
    if (value > best) {
      best = value;
      angle = candidate;
    }
  }
  return best > baseline * 1.15 ? angle : 0;
}
