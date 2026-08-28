import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  createScrollProgress,
  prefersReducedMotion,
  type ScrollProgressState,
} from '../../lib/scrollProgress';
import { computeSceneValues, getCameraProfile } from '../../lib/sceneMaps';
import { projectScreenPointToWorld } from '../../lib/signalAlignment';
import PhysicalWorldScene from './PhysicalWorldScene';

const DESKTOP_BUDGET = { life: 180, machine: 60, environment: 220, structural: 140, bridge: 35 };
const MOBILE_BUDGET = { life: 70, machine: 25, environment: 70, structural: 40, bridge: 15 };

const MOBILE_BREAKPOINT = '(max-width: 640px)';

function detectIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_BREAKPOINT).matches;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

export default function PhysicalWorldCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(detectIsMobile);
  const [signalAnchor, setSignalAnchor] = useState<[number, number, number] | null>(null);
  const [scrollState, setScrollState] = useState<ScrollProgressState>({
    progress: 0,
    isNear: false,
    isScrolling: false,
  });
  const [tabVisible, setTabVisible] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setWebglOk(supportsWebGL());
    setReducedMotion(prefersReducedMotion());

    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => setReducedMotion(motionMedia.matches);
    motionMedia.addEventListener('change', onMotionChange);

    const mobileMedia = window.matchMedia(MOBILE_BREAKPOINT);
    const onMobileChange = () => setIsMobile(mobileMedia.matches);
    onMobileChange();
    mobileMedia.addEventListener('change', onMobileChange);

    const onVisibility = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      motionMedia.removeEventListener('change', onMotionChange);
      mobileMedia.removeEventListener('change', onMobileChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const sectionEl = rootRef.current?.closest('[data-e02-section]');
    if (!sectionEl) return;

    if (reducedMotion) {
      // No scroll-scrubbed reconstruction: present the final settled state
      // with a single gentle reveal once the section is roughly in view.
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) setRevealed(true);
        },
        { threshold: 0.2 },
      );
      observer.observe(sectionEl);
      setScrollState({ progress: 1, isNear: true, isScrolling: false });
      return () => observer.disconnect();
    }

    const handle = createScrollProgress(sectionEl, setScrollState);
    return () => handle.destroy();
  }, [reducedMotion]);

  useEffect(() => {
    const anchorEl = document.querySelector('[data-e02-signal-anchor]');
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const profile = getCameraProfile(isMobile);
    const world = projectScreenPointToWorld(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      window.innerWidth,
      window.innerHeight,
      profile.start,
      profile.lookAtStart,
      profile.fov,
      9,
    );
    setSignalAnchor(world);
  }, [isMobile]);

  const cameraProfile = useMemo(() => getCameraProfile(isMobile), [isMobile]);

  const dpr = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    const cap = isMobile ? 1.25 : 1.5;
    return Math.min(window.devicePixelRatio || 1, cap);
  }, [isMobile]);

  const budget = isMobile ? MOBILE_BUDGET : DESKTOP_BUDGET;

  const active = scrollState.isNear && tabVisible;
  const scene = computeSceneValues(scrollState.progress, isMobile);
  const ambientAmplitude = reducedMotion
    ? 0
    : scene.settleAmbient * (scrollState.isScrolling ? 1 : 0.15);

  // The reveal-gate class only ever applies on the reduced-motion path —
  // normal scroll-driven mode relies entirely on the scene's own
  // progress-derived opacities and should never be independently faded.
  const revealClass = reducedMotion && !revealed ? ' rm-pending' : '';

  if (!webglOk || !signalAnchor) {
    return <div ref={rootRef} className="e02-canvas-root" aria-hidden="true" />;
  }

  return (
    <div ref={rootRef} className={`e02-canvas-root${revealClass}`} aria-hidden="true">
      <Canvas
        dpr={dpr}
        frameloop={active ? 'always' : 'never'}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: cameraProfile.start, fov: cameraProfile.fov, near: 0.1, far: 100 }}
      >
        <PhysicalWorldScene
          scene={scene}
          signalAnchor={signalAnchor}
          ambientAmplitude={ambientAmplitude}
          isMobile={isMobile}
          pointBudget={budget}
        />
      </Canvas>
    </div>
  );
}
