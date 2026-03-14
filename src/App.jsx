import { useEffect, useRef, useState } from 'react';
import ParticleScene from './ParticleScene';

const MODES = ['cloud', 'text', 'circle', 'heart', 'image', 'draw'];
const SAMPLE_IMAGE_URL = '/silhouette.svg';
const MIN_PARTICLES = 5000;
const MAX_PARTICLES = 30000;
const DRAW_PAD_WIDTH = 296;
const DRAW_PAD_HEIGHT = 168;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hueToHex(hue) {
  return `hsl(${Math.round(hue)} 95% 62%)`;
}

function getDrawPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * DRAW_PAD_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * DRAW_PAD_HEIGHT,
  };
}

function setupDrawCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(DRAW_PAD_WIDTH * dpr);
  canvas.height = Math.round(DRAW_PAD_HEIGHT * dpr);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, DRAW_PAD_WIDTH, DRAW_PAD_HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
}

function canvasHasInk(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return false;
  }

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) {
      return true;
    }
  }

  return false;
}

function DrawPad({ brushSize, isErasing, clearSignal, onCommit, onInteractionChange }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef({ active: false, pointerId: null, x: 0, y: 0 });
  const clearInitializedRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const interactionChangeRef = useRef(onInteractionChange);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    interactionChangeRef.current = onInteractionChange;
  }, [onInteractionChange]);

  const commitSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    onCommitRef.current(canvas.toDataURL('image/png'), canvasHasInk(canvas));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const ctx = setupDrawCanvas(canvas);
    if (!ctx) {
      return undefined;
    }

    commitSnapshot();

    const handleWindowPointerUp = () => {
      if (!pointerRef.current.active) {
        return;
      }
      pointerRef.current.active = false;
      pointerRef.current.pointerId = null;
      interactionChangeRef.current(false);
      commitSnapshot();
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
      interactionChangeRef.current(false);
    };
  }, []);

  useEffect(() => {
    if (!clearInitializedRef.current) {
      clearInitializedRef.current = true;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, DRAW_PAD_WIDTH, DRAW_PAD_HEIGHT);
    commitSnapshot();
  }, [clearSignal]);

  const drawSegment = (from, to) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getDrawPoint(event, canvas);
    pointerRef.current = {
      active: true,
      pointerId: event.pointerId,
      x: point.x,
      y: point.y,
    };
    interactionChangeRef.current(true);
    canvas.setPointerCapture(event.pointerId);
    drawSegment(point, point);
  };

  const handlePointerMove = (event) => {
    if (!pointerRef.current.active || pointerRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const nextPoint = getDrawPoint(event, canvas);
    drawSegment(pointerRef.current, nextPoint);
    pointerRef.current.x = nextPoint.x;
    pointerRef.current.y = nextPoint.y;
  };

  const handlePointerEnd = (event) => {
    if (!pointerRef.current.active || pointerRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    pointerRef.current.active = false;
    pointerRef.current.pointerId = null;
    interactionChangeRef.current(false);
    commitSnapshot();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`draw-canvas ${isErasing ? 'erasing' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      aria-label="Drawing pad"
    />
  );
}

export default function App() {
  const [count, setCount] = useState(12000);
  const [mode, setMode] = useState('cloud');
  const [text, setText] = useState('CRAVEAI');
  const [fps, setFps] = useState(0);
  const [swirlEnabled, setSwirlEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [particleHue, setParticleHue] = useState(195);
  const [theme, setTheme] = useState('dark');
  const [imageSourceUrl, setImageSourceUrl] = useState(SAMPLE_IMAGE_URL);
  const [imageSourceKind, setImageSourceKind] = useState('sample');
  const [imageRevision, setImageRevision] = useState(0);
  const [sampleImageStatus, setSampleImageStatus] = useState('checking');
  const [drawSourceUrl, setDrawSourceUrl] = useState('');
  const [drawRevision, setDrawRevision] = useState(0);
  const [hasDrawContent, setHasDrawContent] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [isErasing, setIsErasing] = useState(false);
  const [drawPointerActive, setDrawPointerActive] = useState(false);
  const [drawClearSignal, setDrawClearSignal] = useState(0);

  const [sim, setSim] = useState({
    spring: 6,
    damping: 0.92,
    mouseRadius: 1.6,
    mouseForce: 24,
  });

  const attractUntilRef = useRef(0);
  const uploadUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setSampleImageStatus('ready');
    image.onerror = () => setSampleImageStatus('missing');
    image.src = SAMPLE_IMAGE_URL;
  }, []);

  useEffect(() => {
    return () => {
      if (uploadUrlRef.current) {
        URL.revokeObjectURL(uploadUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }

      if (event.key >= '1' && event.key <= '6') {
        const index = Number(event.key) - 1;
        const nextMode = MODES[index];
        if (nextMode) {
          setMode(nextMode);
        }
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setCount((value) => clamp(value + 1000, MIN_PARTICLES, MAX_PARTICLES));
        return;
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setCount((value) => clamp(value - 1000, MIN_PARTICLES, MAX_PARTICLES));
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        setSim((current) => ({
          ...current,
          mouseRadius: clamp(current.mouseRadius - 0.15, 0.3, 4),
        }));
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        setSim((current) => ({
          ...current,
          mouseRadius: clamp(current.mouseRadius + 0.15, 0.3, 4),
        }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const setSimValue = (key) => (event) => {
    const value = Number(event.target.value);
    setSim((current) => ({ ...current, [key]: value }));
  };

  const setCountValue = (event) => {
    setCount(clamp(Number(event.target.value), MIN_PARTICLES, MAX_PARTICLES));
  };

  const replaceUploadUrl = (nextUrl) => {
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current);
    }
    uploadUrlRef.current = nextUrl;
  };

  const handleUseSampleImage = () => {
    replaceUploadUrl(null);
    setImageSourceKind('sample');
    setImageSourceUrl(SAMPLE_IMAGE_URL);
    setImageRevision((value) => value + 1);
    setMode('image');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearUploadedImage = () => {
    handleUseSampleImage();
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    replaceUploadUrl(nextUrl);
    setImageSourceKind('upload');
    setImageSourceUrl(nextUrl);
    setImageRevision((value) => value + 1);
    setMode('image');
  };

  const handleDrawCommit = (nextUrl, hasInk) => {
    setDrawSourceUrl(nextUrl);
    setHasDrawContent(hasInk);
    setDrawRevision((value) => value + 1);
  };

  const sceneBackground = theme === 'light' ? '#eef3ff' : '#05070c';
  const imageSourceLabel = imageSourceKind === 'upload' ? 'Uploaded image' : 'Sample silhouette';

  let imageStatusText = imageSourceKind === 'upload'
    ? 'Upload active. Particles will follow the uploaded alpha mask.'
    : 'Bundled sample active. Particles will use the built-in silhouette.';

  if (imageSourceKind === 'sample' && sampleImageStatus === 'missing') {
    imageStatusText = 'Sample missing. Image mode will fall back to cloud until you upload a file.';
  } else if (imageSourceKind === 'sample' && sampleImageStatus === 'checking') {
    imageStatusText = 'Checking bundled sample availability.';
  }

  const drawStatusText = hasDrawContent
    ? 'Sketch ready. Particles will use the latest drawing.'
    : 'Blank sketch. Draw mode falls back to cloud until you add strokes.';

  return (
    <div className="app-shell">
      <ParticleScene
        count={count}
        mode={mode}
        text={text}
        theme={theme}
        sim={sim}
        swirlEnabled={swirlEnabled}
        particleHue={particleHue}
        sceneBackground={sceneBackground}
        imageSourceUrl={imageSourceUrl}
        imageTargetRevision={imageRevision}
        drawSourceUrl={drawSourceUrl}
        drawRevision={drawRevision}
        pointerForcesEnabled={!drawPointerActive}
        onFps={(value) => setFps(value)}
        attractUntilRef={attractUntilRef}
      />

      <div className={`hud-shell ${menuOpen ? 'open' : 'collapsed'}`}>
        <div className="hud">
          <div className="hud-row">
            <span>FPS</span>
            <strong>{fps.toFixed(1)}</strong>
          </div>
          <div className="hud-row">
            <span>Mode</span>
            <strong>{mode}</strong>
          </div>

          <div className="hud-row split">
            <button type="button" onClick={() => setTheme('dark')} disabled={theme === 'dark'}>
              Dark
            </button>
            <button type="button" onClick={() => setTheme('light')} disabled={theme === 'light'}>
              Light
            </button>
          </div>

          <div className="hud-buttons">
            <button type="button" onClick={() => setMode('cloud')}>1 Cloud</button>
            <button type="button" onClick={() => setMode('text')}>2 Text</button>
            <button type="button" onClick={() => setMode('circle')}>3 Circle</button>
            <button type="button" onClick={() => setMode('heart')}>4 Heart</button>
            <button type="button" onClick={() => setMode('image')}>5 Image</button>
            <button type="button" onClick={() => setMode('draw')}>6 Draw</button>
          </div>

          <label className="hud-field">
            <span>Particle Count: {count}</span>
            <input
              type="range"
              min={MIN_PARTICLES}
              max={MAX_PARTICLES}
              step="500"
              value={count}
              onChange={setCountValue}
            />
          </label>

          <label className="hud-field">
            <span className="hue-label">
              Particle Color: {Math.round(particleHue)}deg
              <span
                className="hue-swatch"
                style={{ backgroundColor: hueToHex(particleHue) }}
                aria-hidden="true"
              />
            </span>
            <input
              className="hue-slider"
              type="range"
              min="0"
              max="360"
              step="1"
              value={particleHue}
              onChange={(event) => setParticleHue(Number(event.target.value))}
            />
          </label>

          <label className="hud-field">
            <span>Text</span>
            <input value={text} onChange={(event) => setText(event.target.value.toUpperCase())} maxLength={14} />
          </label>

          <div className="hud-panel">
            <div className="hud-row compact">
              <span>Image Source</span>
              <strong>{imageSourceLabel}</strong>
            </div>
            <label className="hud-field file-field">
              <span>Upload PNG, JPG, or WebP</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleImageUpload}
              />
            </label>
            <div className="hud-row split">
              <button type="button" onClick={handleUseSampleImage}>Use Sample</button>
              <button type="button" onClick={clearUploadedImage} disabled={imageSourceKind !== 'upload'}>
                Clear Upload
              </button>
            </div>
            <p className="hint source-status">{imageStatusText}</p>
          </div>

          <label className="hud-field">
            <span>Spring: {sim.spring.toFixed(2)}</span>
            <input type="range" min="0.5" max="12" step="0.1" value={sim.spring} onChange={setSimValue('spring')} />
          </label>

          <label className="hud-field">
            <span>Damping: {sim.damping.toFixed(3)}</span>
            <input type="range" min="0.85" max="0.995" step="0.001" value={sim.damping} onChange={setSimValue('damping')} />
          </label>

          <label className="hud-field">
            <span>Radius: {sim.mouseRadius.toFixed(2)} ([ ])</span>
            <input type="range" min="0.3" max="4" step="0.05" value={sim.mouseRadius} onChange={setSimValue('mouseRadius')} />
          </label>

          <label className="hud-field">
            <span>Mouse Force: {sim.mouseForce.toFixed(1)}</span>
            <input type="range" min="1" max="60" step="0.5" value={sim.mouseForce} onChange={setSimValue('mouseForce')} />
          </label>

          {mode === 'draw' && (
            <div className="hud-panel draw-pad-shell">
              <div className="hud-row compact">
                <span>Draw Target</span>
                <strong>{hasDrawContent ? 'Ready' : 'Blank'}</strong>
              </div>
              <DrawPad
                brushSize={brushSize}
                isErasing={isErasing}
                clearSignal={drawClearSignal}
                onCommit={handleDrawCommit}
                onInteractionChange={setDrawPointerActive}
              />
              <label className="hud-field">
                <span>Brush Size: {brushSize}px</span>
                <input
                  type="range"
                  min="4"
                  max="44"
                  step="1"
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
              </label>
              <div className="hud-row split">
                <button type="button" className={!isErasing ? 'active' : ''} onClick={() => setIsErasing(false)}>
                  Draw Ink
                </button>
                <button type="button" className={isErasing ? 'active' : ''} onClick={() => setIsErasing(true)}>
                  Erase
                </button>
              </div>
              <button type="button" onClick={() => setDrawClearSignal((value) => value + 1)}>
                Clear Sketch
              </button>
              <p className="hint source-status">{drawStatusText}</p>
            </div>
          )}

          <div className="hud-row split">
            <button
              type="button"
              onClick={() => {
                attractUntilRef.current = performance.now() + 1000;
              }}
            >
              Click Attract (1s)
            </button>
            <button type="button" onClick={() => setSwirlEnabled((value) => !value)}>
              Swirl: {swirlEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <p className="hint">Hotkeys: 1-6 modes, +/- count, [ ] radius.</p>
          <div className="hint">
            <strong>TODO</strong>
            <br />
            1. Maybe use AI to recreate a shape/figure from text description.
            <br />
            2. Explore making this a portfolio background app.
          </div>
          {sampleImageStatus === 'missing' && (
            <p className="hint"><code>/public/silhouette.svg</code> missing. Upload an image to use image mode.</p>
          )}
        </div>

        <button
          type="button"
          className="hud-toggle"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? 'Collapse controls menu' : 'Expand controls menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? '\u25c0' : '\u25b6'}
        </button>
      </div>
    </div>
  );
}

