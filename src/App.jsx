import { useEffect, useRef, useState } from 'react';
import ParticleScene from './ParticleScene';

const MODES = ['cloud', 'text', 'circle', 'heart', 'image'];

const MIN_PARTICLES = 5000;
const MAX_PARTICLES = 30000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function App() {
  const [count, setCount] = useState(12000);
  const [mode, setMode] = useState('cloud');
  const [text, setText] = useState('CRAVEAI');
  const [fps, setFps] = useState(0);
  const [swirlEnabled, setSwirlEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  const [sim, setSim] = useState({
    spring: 6,
    damping: 0.92,
    mouseRadius: 1.6,
    mouseForce: 24,
  });

  const [imageAvailable, setImageAvailable] = useState('checking');
  const attractUntilRef = useRef(0);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImageAvailable('ready');
    image.onerror = () => setImageAvailable('missing');
    image.src = '/silhouette.png';
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }

      if (event.key >= '1' && event.key <= '5') {
        const index = Number(event.key) - 1;
        const nextMode = MODES[index];
        if (nextMode === 'image' && imageAvailable === 'missing') {
          return;
        }
        setMode(nextMode);
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
  }, [imageAvailable]);

  const setSimValue = (key) => (event) => {
    const value = Number(event.target.value);
    setSim((current) => ({ ...current, [key]: value }));
  };
  const setCountValue = (event) => {
    setCount(clamp(Number(event.target.value), MIN_PARTICLES, MAX_PARTICLES));
  };

  return (
    <div className="app-shell">
      <ParticleScene
        count={count}
        mode={mode}
        text={text}
        sim={sim}
        swirlEnabled={swirlEnabled}
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

          <div className="hud-buttons">
            <button type="button" onClick={() => setMode('cloud')}>1 Cloud</button>
            <button type="button" onClick={() => setMode('text')}>2 Text</button>
            <button type="button" onClick={() => setMode('circle')}>3 Circle</button>
            <button type="button" onClick={() => setMode('heart')}>4 Heart</button>
            <button
              type="button"
              disabled={imageAvailable === 'missing'}
              onClick={() => setMode('image')}
            >
              5 Image
            </button>
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
            <span>Text</span>
            <input value={text} onChange={(event) => setText(event.target.value.toUpperCase())} maxLength={14} />
          </label>

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

          <p className="hint">Hotkeys: 1-5 modes, +/- count, [ ] radius.</p>
          {imageAvailable === 'missing' && (
            <p className="hint"><code>/public/silhouette.png</code> not found. Image mode falls back to cloud.</p>
          )}
        </div>

        <button
          type="button"
          className="hud-toggle"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? 'Collapse controls menu' : 'Expand controls menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? '◀' : '▶'}
        </button>
      </div>
    </div>
  );
}
