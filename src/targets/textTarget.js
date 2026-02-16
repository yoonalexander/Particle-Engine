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

function resampleToCount(points, count, seed = 1, jitter = 0.02) {
  const rng = createRng(seed);
  const out = new Float32Array(count * 3);

  if (points.length === 0) {
    return out;
  }

  if (points.length >= count) {
    const step = points.length / count;
    for (let i = 0; i < count; i += 1) {
      const idx = Math.floor(i * step);
      const src = points[idx];
      const dst = i * 3;
      out[dst] = src[0];
      out[dst + 1] = src[1];
      out[dst + 2] = src[2];
    }
    return out;
  }

  for (let i = 0; i < count; i += 1) {
    const src = points[i % points.length];
    const dst = i * 3;
    out[dst] = src[0] + (rng() - 0.5) * jitter;
    out[dst + 1] = src[1] + (rng() - 0.5) * jitter;
    out[dst + 2] = src[2] + (rng() - 0.5) * jitter;
  }

  return out;
}

export function generateTextTarget({
  text,
  count,
  width = 1024,
  height = 512,
  font = '900 220px system-ui, sans-serif',
  threshold = 10,
  stride = 4,
  worldScale = 8,
}) {
  // Rasterize text offscreen, then convert opaque pixels into world-space points.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    return new Float32Array(count * 3);
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillText(text || 'CRAVEAI', width * 0.5, height * 0.5);

  const imageData = ctx.getImageData(0, 0, width, height).data;
  const points = [];
  const aspect = width / height;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 4;
      const alpha = imageData[idx + 3];
      if (alpha > threshold) {
        // Canvas coordinates are remapped so text is centered around (0,0,0).
        const px = (x / width - 0.5) * worldScale * aspect;
        const py = (0.5 - y / height) * worldScale;
        points.push([px, py, 0]);
      }
    }
  }

  return resampleToCount(points, count, 7001 + count);
}
