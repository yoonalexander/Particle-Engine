function createRng(seed) {
  let state = seed >>> 0;
  return function rand() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCircleTarget({
  count,
  radius = 4,
  filled = true,
  jitter = 0.015,
}) {
  const out = new Float32Array(count * 3);
  const rng = createRng(1111 + count);
  const tau = Math.PI * 2;

  for (let i = 0; i < count; i += 1) {
    const t = rng() * tau;
    const r = filled ? Math.sqrt(rng()) * radius : radius;
    const j = i * 3;
    out[j] = Math.cos(t) * r + (rng() - 0.5) * jitter;
    out[j + 1] = Math.sin(t) * r + (rng() - 0.5) * jitter;
    out[j + 2] = (rng() - 0.5) * jitter;
  }

  return out;
}

function heartPoint(t) {
  const x = 16 * Math.sin(t) ** 3;
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return [x, y];
}

function isInsideHeart(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

export function generateHeartTarget({
  count,
  scale = 0.27,
  filled = true,
  jitter = 0.02,
}) {
  const out = new Float32Array(count * 3);
  const rng = createRng(2222 + count);
  const tau = Math.PI * 2;

  if (filled) {
    const xExtent = 1.25;
    const yExtent = 1.25;
    const xScale = scale * 13;
    const yScale = scale * 10.5;
    const yOffset = -0.35;
    const maxAttempts = count * 80;

    let written = 0;
    let attempts = 0;

    while (written < count && attempts < maxAttempts) {
      attempts += 1;

      const nx = (rng() * 2 - 1) * xExtent;
      const ny = (rng() * 2 - 1) * yExtent;
      if (!isInsideHeart(nx, ny)) {
        continue;
      }

      const j = written * 3;
      out[j] = nx * xScale + (rng() - 0.5) * jitter;
      out[j + 1] = (ny + yOffset) * yScale + (rng() - 0.5) * jitter;
      out[j + 2] = (rng() - 0.5) * jitter;
      written += 1;
    }

    // Fallback is only for pathological low hit-rates; keep deterministic output length.
    for (let i = written; i < count; i += 1) {
      const t = rng() * tau;
      const [hx, hy] = heartPoint(t);
      const blend = Math.sqrt(rng());
      const j = i * 3;
      out[j] = hx * scale * blend + (rng() - 0.5) * jitter;
      out[j + 1] = (hy - 2) * scale * blend + (rng() - 0.5) * jitter;
      out[j + 2] = (rng() - 0.5) * jitter;
    }

    return out;
  }

  for (let i = 0; i < count; i += 1) {
    const t = rng() * tau;
    const [hx, hy] = heartPoint(t);
    const blend = 1;
    const x = hx * scale * blend;
    const y = (hy - 2) * scale * blend;
    const j = i * 3;
    out[j] = x + (rng() - 0.5) * jitter;
    out[j + 1] = y + (rng() - 0.5) * jitter;
    out[j + 2] = (rng() - 0.5) * jitter;
  }

  return out;
}
