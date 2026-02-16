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

export function generateHeartTarget({
  count,
  scale = 0.27,
  filled = true,
  jitter = 0.02,
}) {
  const out = new Float32Array(count * 3);
  const rng = createRng(2222 + count);
  const tau = Math.PI * 2;

  for (let i = 0; i < count; i += 1) {
    const t = rng() * tau;
    const [hx, hy] = heartPoint(t);
    const blend = filled ? Math.sqrt(rng()) : 1;
    const x = hx * scale * blend;
    const y = (hy - 2) * scale * blend;
    const j = i * 3;
    out[j] = x + (rng() - 0.5) * jitter;
    out[j + 1] = y + (rng() - 0.5) * jitter;
    out[j + 2] = (rng() - 0.5) * jitter;
  }

  return out;
}
