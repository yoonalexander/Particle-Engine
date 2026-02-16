import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateTextTarget } from './targets/textTarget';
import { generateCircleTarget, generateHeartTarget } from './targets/shapeTarget';
import { generateImageTarget } from './targets/imageTarget';

const BASE_COLOR = [0.2, 0.78, 1.0];
const FAST_COLOR = [1.0, 0.48, 0.3];

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

function ParticleSystem({ count, mode, text, sim, swirlEnabled, onFps, attractUntilRef }) {
  const pointsRef = useRef(null);
  const geometryRef = useRef(null);

  const dataRef = useRef(null);
  const targetCacheRef = useRef(new Map());
  const imageRef = useRef(null);
  const imageStatusRef = useRef('idle');

  const morphStartRef = useRef(0);
  const morphDurationRef = useRef(0.8);

  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const hitRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseWorldRef = useRef({ x: 0, y: 0, valid: false });

  const fpsBucketRef = useRef(new Float32Array(30));
  const fpsIndexRef = useRef(0);
  const fpsCountRef = useRef(0);
  const fpsTickRef = useRef(0);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.045,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    [],
  );

  const geometry = useMemo(() => new THREE.BufferGeometry(), []);

  useEffect(() => {
    geometryRef.current = geometry;
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const home = new Float32Array(count * 3);
    const fromHome = new Float32Array(count * 3);
    const toHome = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const perm = createPermutation(count, 1337 + count);

    const cloud = createCloudTarget(count);
    positions.set(cloud);
    home.set(cloud);
    fromHome.set(cloud);
    toHome.set(cloud);

    for (let i = 0; i < count; i += 1) {
      const j = i * 3;
      colors[j] = BASE_COLOR[0];
      colors[j + 1] = BASE_COLOR[1];
      colors[j + 2] = BASE_COLOR[2];

      positions[j] += (Math.random() - 0.5) * 0.02;
      positions[j + 1] += (Math.random() - 0.5) * 0.02;
      positions[j + 2] += (Math.random() - 0.5) * 0.02;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    dataRef.current = { positions, velocities, home, fromHome, toHome, colors, perm };
    targetCacheRef.current = new Map([['cloud', cloud]]);
    morphStartRef.current = performance.now();
  }, [count, geometry]);

  const resolveTarget = () => {
    const cache = targetCacheRef.current;

    if (mode === 'cloud') {
      const key = 'cloud';
      if (!cache.has(key)) {
        cache.set(key, createCloudTarget(count));
      }
      return cache.get(key);
    }

    if (mode === 'text') {
      const key = `text:${text}`;
      if (!cache.has(key)) {
        cache.set(
          key,
          generateTextTarget({
            text,
            count,
            font: '900 230px system-ui, sans-serif',
            stride: 3,
            worldScale: 8,
          }),
        );
      }
      return cache.get(key);
    }

    if (mode === 'circle') {
      const key = 'circle';
      if (!cache.has(key)) {
        cache.set(key, generateCircleTarget({ count, radius: 4.2, filled: true }));
      }
      return cache.get(key);
    }

    if (mode === 'heart') {
      const key = 'heart';
      if (!cache.has(key)) {
        cache.set(key, generateHeartTarget({ count, scale: 0.3, filled: true }));
      }
      return cache.get(key);
    }

    if (mode === 'image') {
      if (!imageRef.current) {
        return createCloudTarget(count);
      }

      const key = 'image';
      if (!cache.has(key)) {
        const imageTarget = generateImageTarget({
          image: imageRef.current,
          count,
          stride: 3,
          alphaThreshold: 20,
          worldScale: 8,
        });

        if (imageTarget) {
          cache.set(key, imageTarget);
        } else {
          return createCloudTarget(count);
        }
      }
      return cache.get(key);
    }

    return createCloudTarget(count);
  };

  const applyMorphTarget = () => {
    const data = dataRef.current;
    if (!data) {
      return;
    }

    const target = resolveTarget();
    if (!target) {
      return;
    }

    const { home, fromHome, toHome, perm } = data;
    fromHome.set(home);

    for (let i = 0; i < count; i += 1) {
      const src = perm[i] * 3;
      const dst = i * 3;
      toHome[dst] = target[src];
      toHome[dst + 1] = target[src + 1];
      toHome[dst + 2] = target[src + 2];
    }

    morphStartRef.current = performance.now();
  };

  useEffect(() => {
    if (mode !== 'image') {
      applyMorphTarget();
      return;
    }

    if (imageStatusRef.current === 'ready') {
      applyMorphTarget();
      return;
    }

    if (imageStatusRef.current === 'loading') {
      return;
    }

    imageStatusRef.current = 'loading';
    const image = new Image();

    image.onload = () => {
      imageRef.current = image;
      imageStatusRef.current = 'ready';
      targetCacheRef.current.delete('image');
      applyMorphTarget();
    };

    image.onerror = () => {
      imageStatusRef.current = 'failed';
      applyMorphTarget();
    };

    image.src = '/silhouette.png';
  }, [mode, text, count]);


  useFrame((state, delta) => {
    const data = dataRef.current;
    const geometryCurrent = geometryRef.current;
    if (!data || !geometryCurrent) {
      return;
    }

    const { positions, velocities, home, fromHome, toHome, colors } = data;
    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();

    // pointer -> world plane (z=0) intersection without allocating frame objects
    raycasterRef.current.setFromCamera(state.pointer, state.camera);
    const hit = raycasterRef.current.ray.intersectPlane(planeRef.current, hitRef.current);

    if (hit) {
      mouseWorldRef.current.x = hit.x;
      mouseWorldRef.current.y = hit.y;
      mouseWorldRef.current.valid = true;
    } else {
      mouseWorldRef.current.valid = false;
    }

    const damping = Math.pow(sim.damping, dt * 60);
    const radius = sim.mouseRadius;
    const radiusSq = radius * radius;
    const attract = attractUntilRef.current > now;

    const elapsed = state.clock.elapsedTime;
    // Ease home targets so morphs stay smooth while physics and mouse forces keep running.
    const morphProgress = Math.min(Math.max((now - morphStartRef.current) / (morphDurationRef.current * 1000), 0), 1);
    const morphEase = 1 - (1 - morphProgress) ** 3;

    const mx = mouseWorldRef.current.x;
    const my = mouseWorldRef.current.y;
    const hasMouse = mouseWorldRef.current.valid;

    for (let i = 0; i < count; i += 1) {
      const j = i * 3;

      const hx = fromHome[j] + (toHome[j] - fromHome[j]) * morphEase;
      const hy = fromHome[j + 1] + (toHome[j + 1] - fromHome[j + 1]) * morphEase;
      const hz = fromHome[j + 2] + (toHome[j + 2] - fromHome[j + 2]) * morphEase;
      home[j] = hx;
      home[j + 1] = hy;
      home[j + 2] = hz;

      const px = positions[j];
      const py = positions[j + 1];
      const pz = positions[j + 2];

      let ax = (hx - px) * sim.spring;
      let ay = (hy - py) * sim.spring;
      let az = (hz - pz) * sim.spring;

      if (hasMouse) {
        const dx = px - mx;
        const dy = py - my;
        const d2 = dx * dx + dy * dy;

        if (d2 < radiusSq) {
          // Quadratic falloff keeps force soft at the edge and strong near the cursor.
          const d = Math.sqrt(d2) + 1e-6;
          const falloff = 1 - d / radius;
          const weight = falloff * falloff;
          const dir = attract ? -1 : 1;
          const invD = 1 / d;

          ax += dx * invD * sim.mouseForce * weight * dir;
          ay += dy * invD * sim.mouseForce * weight * dir;
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
      colors[j] = BASE_COLOR[0] + (FAST_COLOR[0] - BASE_COLOR[0]) * speed;
      colors[j + 1] = BASE_COLOR[1] + (FAST_COLOR[1] - BASE_COLOR[1]) * speed;
      colors[j + 2] = BASE_COLOR[2] + (FAST_COLOR[2] - BASE_COLOR[2]) * speed;
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
        attractUntilRef.current = performance.now() + 1000;
      }}
    />
  );
}

export default function ParticleScene(props) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 14], fov: 50, near: 0.1, far: 100 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#05070c']} />
      <ParticleSystem {...props} />
    </Canvas>
  );
}

