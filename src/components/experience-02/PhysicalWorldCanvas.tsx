import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { prefersReducedMotion, type ScrollProgressState } from '../../lib/scrollProgress';
import { subscribeSectionProgress } from '../../lib/story/progressSource';
import { computeSceneValues, getCameraProfile } from '../../lib/sceneMaps';
import { computeSignalAnchor, canvasDpr, ambientAmplitude as computeAmbientAmplitude, pointBudgetFor } from '../../lib/worldRuntime';
import PhysicalWorldScene from './PhysicalWorldScene';

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

    const handle = subscribeSectionProgress('e02-canvas', 'e02', sectionEl, setScrollState);
    return () => handle.destroy();
  }, [reducedMotion]);

  useEffect(() => {
    const world = computeSignalAnchor(isMobile);
    if (!world) return;
    setSignalAnchor(world);
  }, [isMobile]);

  const cameraProfile = useMemo(() => getCameraProfile(isMobile), [isMobile]);

  const dpr = useMemo(() => canvasDpr(isMobile), [isMobile]);

  const budget = pointBudgetFor(isMobile);

  const active = scrollState.isNear && tabVisible;
  const scene = computeSceneValues(scrollState.progress, isMobile);
  const ambientAmplitude = computeAmbientAmplitude(scene.settleAmbient, reducedMotion, scrollState.isScrolling);

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
