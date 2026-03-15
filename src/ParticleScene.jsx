import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateTextTarget } from './targets/textTarget';
import {
  generateCircleTarget,
  generateCubeTarget,
  generateHeartTarget,
  generateHelixTarget,
  generateSphereTarget,
  generateTorusTarget,
} from './targets/shapeTarget';
import { generateRasterTarget } from './targets/rasterTarget';

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

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = THREE.MathUtils.clamp(s / 100, 0, 1);
  const light = THREE.MathUtils.clamp(l / 100, 0, 1);

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [r + m, g + m, b + m];
}

function createCloudTarget(count, spreadXY = 12, spreadZ = 4) {
  const out = new Float32Array(count * 3);
  const rng = createRng(3001 + count);

  for (let i = 0; i < count; i += 1) {
    const j = i * 3;
    out[j] = (rng() - 0.5) * spreadXY;
    out[j + 1] = (rng() - 0.5) * spreadXY;
    out[j + 2] = (rng() - 0.5) * spreadZ;
  }

  return out;
}

function createPermutation(count, seed) {
  const perm = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    perm[i] = i;
  }

  const rng = createRng(seed);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }

  return perm;
}

function getCachedTarget(cache, key, factory) {
  if (!cache.has(key)) {
    cache.set(key, factory());
  }
  return cache.get(key);
}

function createTargetDefinition(positions, surfaceKind = 'none', surfaceParams = null) {
  return {
    positions,
    surfaceWeights: createSurfaceWeights(positions, surfaceKind, surfaceParams),
  };
}

function calculateSurfaceWeight(distance, innerThreshold, band) {
  if (band <= 0) {
    return 0;
  }

  return THREE.MathUtils.clamp((distance - innerThreshold) / band, 0, 1);
}

function createSurfaceWeights(positions, surfaceKind, surfaceParams) {
  const count = positions.length / 3;
  const weights = new Float32Array(count);

  if (!surfaceKind || surfaceKind === 'none' || !surfaceParams) {
    return weights;
  }

  for (let i = 0; i < count; i += 1) {
    const j = i * 3;
    const x = positions[j];
    const y = positions[j + 1];
    const z = positions[j + 2];

    if (surfaceKind === 'sphere') {
      const distance = Math.sqrt(x * x + y * y + z * z);
      const band = surfaceParams.band;
      weights[i] = calculateSurfaceWeight(distance, surfaceParams.radius - band, band);
      continue;
    }

    if (surfaceKind === 'cube') {
      const maxAxis = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
      const band = surfaceParams.band;
      weights[i] = calculateSurfaceWeight(maxAxis, surfaceParams.halfSize - band, band);
      continue;
    }

    if (surfaceKind === 'torus') {
      const majorRadius = surfaceParams.majorRadius;
      const tubeRadius = surfaceParams.tubeRadius;
      const band = surfaceParams.band;
      const radial = Math.sqrt(x * x + z * z);
      const tubeDistance = Math.sqrt((radial - majorRadius) ** 2 + y * y);
      weights[i] = calculateSurfaceWeight(tubeDistance, tubeRadius - band, band);
      continue;
    }

    if (surfaceKind === 'helix') {
      const radius = surfaceParams.radius;
      const height = surfaceParams.height;
      const turns = surfaceParams.turns;
      const thickness = surfaceParams.thickness;
      const band = surfaceParams.band;
      const tau = Math.PI * 2;
      const totalAngle = turns * tau;
      const angle = Math.atan2(z, x);
      const normalizedY = THREE.MathUtils.clamp(y / height + 0.5, 0, 1);
      const yAngle = normalizedY * totalAngle;
      let nearestAngle = angle;
      nearestAngle += Math.round((yAngle - nearestAngle) / tau) * tau;

      const centerX = Math.cos(nearestAngle) * radius;
      const centerY = (nearestAngle / totalAngle - 0.5) * height;
      const centerZ = Math.sin(nearestAngle) * radius;
      const dx = x - centerX;
      const dy = y - centerY;
      const dz = z - centerZ;
      const tubeDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      weights[i] = calculateSurfaceWeight(tubeDistance, thickness - band, band);
    }
  }

  return weights;
}

function resolveTargetForMode({ dimension, mode, text, count, cache, rasterSources }) {
  const cloudTarget = getCachedTarget(cache, `cloud:${count}`, () =>
    createTargetDefinition(createCloudTarget(count)),
  );

  if (mode === 'cloud') {
    return cloudTarget;
  }

  if (dimension === '3d') {
    if (mode === 'sphere') {
      return getCachedTarget(cache, `sphere:${count}`, () =>
        createTargetDefinition(generateSphereTarget({ count, radius: 4.2 }), 'sphere', {
          radius: 4.2,
          band: 0.82,
        }),
      );
    }

    if (mode === 'cube') {
      return getCachedTarget(cache, `cube:${count}`, () =>
        createTargetDefinition(generateCubeTarget({ count, size: 7.2 }), 'cube', {
          halfSize: 3.6,
          band: 0.8,
        }),
      );
    }

    if (mode === 'helix') {
      return getCachedTarget(cache, `helix:${count}`, () =>
        createTargetDefinition(
          generateHelixTarget({ count, radius: 2.85, height: 8.8, turns: 4.25, thickness: 0.48 }),
          'helix',
          {
            radius: 2.85,
            height: 8.8,
            turns: 4.25,
            thickness: 0.48,
            band: 0.18,
          },
        ),
      );
    }

    if (mode === 'torus') {
      return getCachedTarget(cache, `torus:${count}`, () =>
        createTargetDefinition(generateTorusTarget({ count, majorRadius: 3.25, tubeRadius: 1.2 }), 'torus', {
          majorRadius: 3.25,
          tubeRadius: 1.2,
          band: 0.34,
        }),
      );
    }

    return cloudTarget;
  }

  if (mode === 'text') {
    return getCachedTarget(cache, `text:${text}:${count}`, () =>
      createTargetDefinition(
        generateTextTarget({
          text,
          count,
          font: '900 230px system-ui, sans-serif',
          stride: 3,
          worldScale: 8,
        }),
      ),
    );
  }

  if (mode === 'circle') {
    return getCachedTarget(cache, `circle:${count}`, () =>
      createTargetDefinition(generateCircleTarget({ count, radius: 4.2, filled: true })),
    );
  }

  if (mode === 'heart') {
    return getCachedTarget(cache, `heart:${count}`, () =>
      createTargetDefinition(generateHeartTarget({ count, scale: 0.3, filled: true })),
    );
  }

  if (mode === 'image' || mode === 'draw') {
    const rasterState = rasterSources[mode];
    if (!rasterState || rasterState.status !== 'ready' || !rasterState.image) {
      return cloudTarget;
    }

    const cacheKey = `${mode}:${rasterState.cacheKey}:${count}`;
    if (!cache.has(cacheKey)) {
      const rasterTarget = generateRasterTarget({
        image: rasterState.image,
        count,
        stride: 3,
        alphaThreshold: 20,
        worldScale: 8,
        seed: mode === 'draw' ? 9101 : 9001,
      });

      if (rasterTarget) {
        cache.set(cacheKey, createTargetDefinition(rasterTarget));
      } else {
        return cloudTarget;
      }
    }

    return cache.get(cacheKey) || cloudTarget;
  }

  return cloudTarget;
}

function morphToTarget({ data, target, count, morphStartRef }) {
  if (!data || !target) {
    return;
  }

  const { home, fromHome, toHome, perm, surfaceWeights, fromSurfaceWeights, toSurfaceWeights } = data;
  fromHome.set(home);
  fromSurfaceWeights.set(surfaceWeights);

  for (let i = 0; i < count; i += 1) {
    const srcIndex = perm[i];
    const src = srcIndex * 3;
    const dst = i * 3;
    toHome[dst] = target.positions[src];
    toHome[dst + 1] = target.positions[src + 1];
    toHome[dst + 2] = target.positions[src + 2];
    toSurfaceWeights[i] = target.surfaceWeights[srcIndex];
  }

  morphStartRef.current = performance.now();
}

function CameraRig({ dimension }) {
  const keysRef = useRef(new Set());
  const orbitRef = useRef({ yaw: 0, pitch: 0.24, distance: 15.5 });
  const targetPositionRef = useRef(new THREE.Vector3(0, 0, 14));

  useEffect(() => {
    const trackedKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

    const handleKeyDown = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (!trackedKeys.has(key)) {
        return;
      }

      event.preventDefault();
      keysRef.current.add(key);
    };

    const handleKeyUp = (event) => {
      const key = event.key.toLowerCase();
      keysRef.current.delete(key);
    };

    const handleBlur = () => {
      keysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useFrame((state, delta) => {
    const orbit = orbitRef.current;
    const targetPosition = targetPositionRef.current;

    if (dimension === '3d') {
      const keys = keysRef.current;
      const yawInput = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
      const pitchInput = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);

      orbit.yaw += yawInput * delta * 1.85;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + pitchInput * delta * 1.35, -1.1, 1.1);

      const elapsed = state.clock.elapsedTime;
      const displayYaw = orbit.yaw + Math.sin(elapsed * 0.2) * 0.18;
      const displayPitch = THREE.MathUtils.clamp(orbit.pitch + Math.sin(elapsed * 0.13) * 0.04, -1.1, 1.1);
      const displayDistance = orbit.distance + Math.cos(elapsed * 0.2) * 0.25;
      const cosPitch = Math.cos(displayPitch);
      targetPosition.set(
        Math.sin(displayYaw) * cosPitch * displayDistance,
        Math.sin(displayPitch) * displayDistance,
        Math.cos(displayYaw) * cosPitch * displayDistance,
      );

      state.camera.position.lerp(targetPosition, 1 - Math.exp(-delta * 6));
    } else {
      orbit.yaw = THREE.MathUtils.damp(orbit.yaw, 0, 5, delta);
      orbit.pitch = THREE.MathUtils.damp(orbit.pitch, 0.24, 5, delta);
      orbit.distance = THREE.MathUtils.damp(orbit.distance, 15.5, 5, delta);
      targetPosition.set(0, 0, 14);
      state.camera.position.lerp(targetPosition, 1 - Math.exp(-delta * 5));
    }

    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

function ParticleSystem({
  count,
  dimension,
  mode,
  text,
  theme,
  sim,
  swirlEnabled,
  particleHue,
  imageSourceUrl,
  imageTargetRevision,
  drawSourceUrl,
  drawRevision,
  pointerForcesEnabled,
  onFps,
  attractUntilRef,
}) {
  const pointsRef = useRef(null);
  const geometryRef = useRef(null);

  const dataRef = useRef(null);
  const targetCacheRef = useRef(new Map());
  const rasterSourcesRef = useRef({
    image: { image: null, status: 'idle', cacheKey: 'image:empty' },
    draw: { image: null, status: 'idle', cacheKey: 'draw:empty' },
  });
  const baseColorRef = useRef([1, 1, 1]);
  const countRef = useRef(count);
  const targetParamsRef = useRef({ dimension, mode, text, imageTargetRevision, drawRevision });

  const morphStartRef = useRef(0);
  const morphDurationRef = useRef(0.8);

  const originRef = useRef(new THREE.Vector3(0, 0, 0));
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const hitRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const cameraForwardRef = useRef(new THREE.Vector3(0, 0, -1));
  const cameraRightRef = useRef(new THREE.Vector3(1, 0, 0));
  const cameraUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const mouseWorldRef = useRef({ x: 0, y: 0, z: 0, valid: false });

  const fpsBucketRef = useRef(new Float32Array(30));
  const fpsIndexRef = useRef(0);
  const fpsCountRef = useRef(0);
  const fpsTickRef = useRef(0);

  const isLightTheme = theme === 'light';
  const baseColor = useMemo(
    () => (isLightTheme ? hslToRgb(particleHue, 95, 35) : hslToRgb(particleHue, 98, 52)),
    [isLightTheme, particleHue],
  );
  const fastColor = useMemo(
    () => (isLightTheme ? hslToRgb((particleHue + 20) % 360, 95, 48) : hslToRgb((particleHue + 12) % 360, 98, 62)),
    [isLightTheme, particleHue],
  );
  const surfaceColor = useMemo(
    () => (isLightTheme ? hslToRgb((particleHue + 165) % 360, 88, 44) : hslToRgb((particleHue + 165) % 360, 90, 68)),
    [isLightTheme, particleHue],
  );

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.05,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.NormalBlending,
        vertexColors: true,
      }),
    [],
  );

  const geometry = useMemo(() => new THREE.BufferGeometry(), []);

  useEffect(() => {
    baseColorRef.current = baseColor;
  }, [baseColor]);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    targetParamsRef.current = { dimension, mode, text, imageTargetRevision, drawRevision };
  }, [dimension, mode, text, imageTargetRevision, drawRevision]);

  useEffect(() => {
    geometryRef.current = geometry;
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    const previous = dataRef.current;
    const previousCount = previous ? previous.positions.length / 3 : 0;
    const carryCount = Math.min(previousCount, count);

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const home = new Float32Array(count * 3);
    const fromHome = new Float32Array(count * 3);
    const toHome = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const surfaceWeights = new Float32Array(count);
    const fromSurfaceWeights = new Float32Array(count);
    const toSurfaceWeights = new Float32Array(count);
    const perm = createPermutation(count, 1337 + count);

    targetCacheRef.current = new Map();
    const initialTarget = resolveTargetForMode({
      dimension: targetParamsRef.current.dimension,
      mode: targetParamsRef.current.mode,
      text: targetParamsRef.current.text,
      count,
      cache: targetCacheRef.current,
      rasterSources: rasterSourcesRef.current,
    });

    if (previous && carryCount > 0) {
      const carryLen = carryCount * 3;
      positions.set(previous.positions.subarray(0, carryLen), 0);
      velocities.set(previous.velocities.subarray(0, carryLen), 0);
      colors.set(previous.colors.subarray(0, carryLen), 0);
      if (previous.surfaceWeights) {
        surfaceWeights.set(previous.surfaceWeights.subarray(0, carryCount), 0);
        fromSurfaceWeights.set(previous.surfaceWeights.subarray(0, carryCount), 0);
        toSurfaceWeights.set(previous.surfaceWeights.subarray(0, carryCount), 0);
      }

      for (let i = 0; i < carryCount; i += 1) {
        const j = i * 3;
        const px = positions[j];
        const py = positions[j + 1];
        const pz = positions[j + 2];
        home[j] = px;
        home[j + 1] = py;
        home[j + 2] = pz;
        fromHome[j] = px;
        fromHome[j + 1] = py;
        fromHome[j + 2] = pz;
        toHome[j] = px;
        toHome[j + 1] = py;
        toHome[j + 2] = pz;
      }

      const prevPermCount = Math.min(previous.perm.length, carryCount);
      if (prevPermCount > 0) {
        const used = new Uint8Array(count);
        for (let i = 0; i < prevPermCount; i += 1) {
          let p = previous.perm[i];
          if (p < 0 || p >= count || used[p]) {
            p = i;
          }
          perm[i] = p;
          used[p] = 1;
        }

        let next = 0;
        for (let i = prevPermCount; i < count; i += 1) {
          while (next < count && used[next]) {
            next += 1;
          }
          const p = next < count ? next : i;
          perm[i] = p;
          if (p < count) {
            used[p] = 1;
          }
        }
      }
    }

    for (let i = carryCount; i < count; i += 1) {
      const j = i * 3;
      const srcIndex = perm[i];
      const src = srcIndex * 3;
      const tx = initialTarget.positions[src];
      const ty = initialTarget.positions[src + 1];
      const tz = initialTarget.positions[src + 2];
      const surfaceWeight = initialTarget.surfaceWeights[srcIndex];

      positions[j] = tx + (Math.random() - 0.5) * 0.02;
      positions[j + 1] = ty + (Math.random() - 0.5) * 0.02;
      positions[j + 2] = tz + (Math.random() - 0.5) * 0.02;

      home[j] = tx;
      home[j + 1] = ty;
      home[j + 2] = tz;
      fromHome[j] = tx;
      fromHome[j + 1] = ty;
      fromHome[j + 2] = tz;
      toHome[j] = tx;
      toHome[j + 1] = ty;
      toHome[j + 2] = tz;

      surfaceWeights[i] = surfaceWeight;
      fromSurfaceWeights[i] = surfaceWeight;
      toSurfaceWeights[i] = surfaceWeight;

      colors[j] = baseColorRef.current[0];
      colors[j + 1] = baseColorRef.current[1];
      colors[j + 2] = baseColorRef.current[2];
    }

    if (!previous) {
      for (let i = 0; i < count; i += 1) {
        const j = i * 3;
        colors[j] = baseColorRef.current[0];
        colors[j + 1] = baseColorRef.current[1];
        colors[j + 2] = baseColorRef.current[2];
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    dataRef.current = {
      positions,
      velocities,
      home,
      fromHome,
      toHome,
      colors,
      surfaceWeights,
      fromSurfaceWeights,
      toSurfaceWeights,
      perm,
    };
    morphStartRef.current = performance.now();
  }, [count, geometry]);

  useEffect(() => {
    const data = dataRef.current;
    if (!data) {
      return;
    }

    const target = resolveTargetForMode({
      dimension,
      mode,
      text,
      count,
      cache: targetCacheRef.current,
      rasterSources: rasterSourcesRef.current,
    });
    morphToTarget({ data, target, count, morphStartRef });
  }, [dimension, mode, text, count, imageTargetRevision, drawRevision]);

  useEffect(() => {
    const rasterState = rasterSourcesRef.current.image;
    rasterState.cacheKey = `${imageSourceUrl || 'empty'}:${imageTargetRevision}`;
    rasterState.image = null;

    if (!imageSourceUrl) {
      rasterState.status = 'missing';
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    rasterState.status = 'loading';

    image.onload = () => {
      if (cancelled) {
        return;
      }

      rasterState.image = image;
      rasterState.status = 'ready';

      if (
        targetParamsRef.current.dimension === '2d' &&
        targetParamsRef.current.mode === 'image' &&
        dataRef.current
      ) {
        const target = resolveTargetForMode({
          dimension: '2d',
          mode: 'image',
          text: targetParamsRef.current.text,
          count: countRef.current,
          cache: targetCacheRef.current,
          rasterSources: rasterSourcesRef.current,
        });
        morphToTarget({ data: dataRef.current, target, count: countRef.current, morphStartRef });
      }
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }

      rasterState.image = null;
      rasterState.status = 'failed';

      if (
        targetParamsRef.current.dimension === '2d' &&
        targetParamsRef.current.mode === 'image' &&
        dataRef.current
      ) {
        const target = resolveTargetForMode({
          dimension: '2d',
          mode: 'image',
          text: targetParamsRef.current.text,
          count: countRef.current,
          cache: targetCacheRef.current,
          rasterSources: rasterSourcesRef.current,
        });
        morphToTarget({ data: dataRef.current, target, count: countRef.current, morphStartRef });
      }
    };

    image.src = imageSourceUrl;

    return () => {
      cancelled = true;
    };
  }, [imageSourceUrl, imageTargetRevision]);

  useEffect(() => {
    const rasterState = rasterSourcesRef.current.draw;
    rasterState.cacheKey = `${drawSourceUrl || 'empty'}:${drawRevision}`;
    rasterState.image = null;

    if (!drawSourceUrl) {
      rasterState.status = 'missing';
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    rasterState.status = 'loading';

    image.onload = () => {
      if (cancelled) {
        return;
      }

      rasterState.image = image;
      rasterState.status = 'ready';

      if (
        targetParamsRef.current.dimension === '2d' &&
        targetParamsRef.current.mode === 'draw' &&
        dataRef.current
      ) {
        const target = resolveTargetForMode({
          dimension: '2d',
          mode: 'draw',
          text: targetParamsRef.current.text,
          count: countRef.current,
          cache: targetCacheRef.current,
          rasterSources: rasterSourcesRef.current,
        });
        morphToTarget({ data: dataRef.current, target, count: countRef.current, morphStartRef });
      }
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }

      rasterState.image = null;
      rasterState.status = 'failed';

      if (
        targetParamsRef.current.dimension === '2d' &&
        targetParamsRef.current.mode === 'draw' &&
        dataRef.current
      ) {
        const target = resolveTargetForMode({
          dimension: '2d',
          mode: 'draw',
          text: targetParamsRef.current.text,
          count: countRef.current,
          cache: targetCacheRef.current,
          rasterSources: rasterSourcesRef.current,
        });
        morphToTarget({ data: dataRef.current, target, count: countRef.current, morphStartRef });
      }
    };

    image.src = drawSourceUrl;

    return () => {
      cancelled = true;
    };
  }, [drawSourceUrl, drawRevision]);

  useFrame((state, delta) => {
    const data = dataRef.current;
    const geometryCurrent = geometryRef.current;
    if (!data || !geometryCurrent) {
      return;
    }

    const {
      positions,
      velocities,
      home,
      fromHome,
      toHome,
      colors,
      surfaceWeights,
      fromSurfaceWeights,
      toSurfaceWeights,
    } = data;
    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();

    const planeNormal = cameraForwardRef.current;
    const planeRight = cameraRightRef.current;
    const planeUp = cameraUpRef.current;

    if (dimension === '3d') {
      state.camera.getWorldDirection(planeNormal).normalize();
      planeRight.set(1, 0, 0).applyQuaternion(state.camera.quaternion).normalize();
      planeUp.set(0, 1, 0).applyQuaternion(state.camera.quaternion).normalize();
    } else {
      planeNormal.set(0, 0, 1);
      planeRight.set(1, 0, 0);
      planeUp.set(0, 1, 0);
    }

    planeRef.current.setFromNormalAndCoplanarPoint(planeNormal, originRef.current);
    raycasterRef.current.setFromCamera(state.pointer, state.camera);
    const hit = raycasterRef.current.ray.intersectPlane(planeRef.current, hitRef.current);

    if (hit) {
      mouseWorldRef.current.x = hit.x;
      mouseWorldRef.current.y = hit.y;
      mouseWorldRef.current.z = hit.z;
      mouseWorldRef.current.valid = true;
    } else {
      mouseWorldRef.current.valid = false;
    }

    const damping = Math.pow(sim.damping, dt * 60);
    const radius = sim.mouseRadius;
    const radiusSq = radius * radius;
    const attract = attractUntilRef.current > now;

    const elapsed = state.clock.elapsedTime;
    const morphProgress = Math.min(Math.max((now - morphStartRef.current) / (morphDurationRef.current * 1000), 0), 1);
    const morphEase = 1 - (1 - morphProgress) ** 3;

    const mx = mouseWorldRef.current.x;
    const my = mouseWorldRef.current.y;
    const mz = mouseWorldRef.current.z;
    const hasMouse = pointerForcesEnabled && mouseWorldRef.current.valid;

    for (let i = 0; i < count; i += 1) {
      const j = i * 3;

      const hx = fromHome[j] + (toHome[j] - fromHome[j]) * morphEase;
      const hy = fromHome[j + 1] + (toHome[j + 1] - fromHome[j + 1]) * morphEase;
      const hz = fromHome[j + 2] + (toHome[j + 2] - fromHome[j + 2]) * morphEase;
      home[j] = hx;
      home[j + 1] = hy;
      home[j + 2] = hz;

      const surfaceWeight = fromSurfaceWeights[i] + (toSurfaceWeights[i] - fromSurfaceWeights[i]) * morphEase;
      surfaceWeights[i] = surfaceWeight;

      const px = positions[j];
      const py = positions[j + 1];
      const pz = positions[j + 2];

      let ax = (hx - px) * sim.spring;
      let ay = (hy - py) * sim.spring;
      let az = (hz - pz) * sim.spring;

      if (hasMouse) {
        const dx = px - mx;
        const dy = py - my;
        const dz = pz - mz;
        const planeDx = dx * planeRight.x + dy * planeRight.y + dz * planeRight.z;
        const planeDy = dx * planeUp.x + dy * planeUp.y + dz * planeUp.z;
        const d2 = planeDx * planeDx + planeDy * planeDy;

        if (d2 < radiusSq) {
          const d = Math.sqrt(d2) + 1e-6;
          const falloff = 1 - d / radius;
          const weight = falloff * falloff;
          const dir = attract ? -1 : 1;
          const planeForce = (sim.mouseForce * weight * dir) / d;

          ax += (planeRight.x * planeDx + planeUp.x * planeDy) * planeForce;
          ay += (planeRight.y * planeDx + planeUp.y * planeDy) * planeForce;
          az += (planeRight.z * planeDx + planeUp.z * planeDy) * planeForce;
        }
      }

      if (swirlEnabled) {
        az += Math.sin((px + py) * 0.45 + elapsed * 1.8) * 0.45;
      }

      const vx = (velocities[j] + ax * dt) * damping;
      const vy = (velocities[j + 1] + ay * dt) * damping;
      const vz = (velocities[j + 2] + az * dt) * damping;

      const nx = px + vx * dt;
      const ny = py + vy * dt;
      const nz = pz + vz * dt;

      velocities[j] = vx;
      velocities[j + 1] = vy;
      velocities[j + 2] = vz;

      positions[j] = nx;
      positions[j + 1] = ny;
      positions[j + 2] = nz;

      const speed = Math.min(Math.sqrt(vx * vx + vy * vy + vz * vz) * 0.35, 1);
      const motionR = baseColor[0] + (fastColor[0] - baseColor[0]) * speed;
      const motionG = baseColor[1] + (fastColor[1] - baseColor[1]) * speed;
      const motionB = baseColor[2] + (fastColor[2] - baseColor[2]) * speed;
      const surfaceMix = dimension === '3d' ? surfaceWeight * 0.92 : 0;

      colors[j] = motionR + (surfaceColor[0] - motionR) * surfaceMix;
      colors[j + 1] = motionG + (surfaceColor[1] - motionG) * surfaceMix;
      colors[j + 2] = motionB + (surfaceColor[2] - motionB) * surfaceMix;
    }

    geometryCurrent.attributes.position.needsUpdate = true;
    geometryCurrent.attributes.color.needsUpdate = true;

    fpsBucketRef.current[fpsIndexRef.current] = 1 / Math.max(delta, 1e-4);
    fpsIndexRef.current = (fpsIndexRef.current + 1) % fpsBucketRef.current.length;
    fpsCountRef.current = Math.min(fpsCountRef.current + 1, fpsBucketRef.current.length);

    fpsTickRef.current += 1;
    if (fpsTickRef.current % 5 === 0 && onFps) {
      let sum = 0;
      for (let i = 0; i < fpsCountRef.current; i += 1) {
        sum += fpsBucketRef.current[i];
      }
      onFps(sum / Math.max(fpsCountRef.current, 1));
    }
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      onPointerDown={() => {
        if (pointerForcesEnabled) {
          attractUntilRef.current = performance.now() + 1000;
        }
      }}
    />
  );
}

export default function ParticleScene({ sceneBackground, dimension, ...props }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 14], fov: 50, near: 0.1, far: 100 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[sceneBackground]} />
      <CameraRig dimension={dimension} />
      <ParticleSystem dimension={dimension} {...props} />
    </Canvas>
  );
}
