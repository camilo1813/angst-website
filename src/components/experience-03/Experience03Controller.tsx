import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { prefersReducedMotion, type ScrollProgressState } from '../../lib/scrollProgress';
import { subscribeSectionProgress } from '../../lib/story/progressSource';
import { computeSceneValues, getCameraProfile } from '../../lib/sceneMaps';
import { computeSignalAnchor, canvasDpr, ambientAmplitude as computeAmbientAmplitude, pointBudgetFor } from '../../lib/worldRuntime';
import { buildExperience03Scene } from '../../lib/experience03Maps';
import PhysicalWorldScene from '../experience-02/PhysicalWorldScene';

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

/**
 * Experience 03 never re-poses or rebuilds the physical world. It renders
 * the same PhysicalWorldScene component E02 uses, fed E02's own exact
 * frozen final scene values (computeSceneValues(1, isMobile) — the
 * approved e02-physical-world-approved state) with only per-category
 * opacity/visibility WEIGHTS applied on top (see experience03Maps.ts).
 * The camera position/lookAt inside that frozen scene already equals the
 * approved end-of-E02 framing, so it never moves during Experience 03.
 */
export default function Experience03Controller() {
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
    const sectionEl = rootRef.current?.closest('[data-e03-section]');
    if (!sectionEl) return;

    // Reduced motion still tracks real scroll (no autoplay, no timers) —
    // only the ambient per-frame motion is suppressed below. Scroll still
    // drives straightforward category opacity transitions per spec.
    const handle = subscribeSectionProgress('e03-canvas', 'e03', sectionEl, setScrollState);
    return () => handle.destroy();
  }, []);

  useEffect(() => {
    // Same anchor element and same START camera profile E02 itself uses
    // to place this world-space point — guarantees the signal dot picks
    // up exactly where E02's approved final frame left it, without any
    // cross-component state sharing.
    const world = computeSignalAnchor(isMobile);
    if (!world) return;
    setSignalAnchor(world);
  }, [isMobile]);

  const cameraProfile = useMemo(() => getCameraProfile(isMobile), [isMobile]);

  const dpr = useMemo(() => canvasDpr(isMobile), [isMobile]);

  const budget = pointBudgetFor(isMobile);

  const active = scrollState.isNear && tabVisible;
  const baseScene = useMemo(() => computeSceneValues(1, isMobile), [isMobile]);
  const scene = buildExperience03Scene(baseScene, scrollState.progress);
  const ambientAmplitude = computeAmbientAmplitude(baseScene.settleAmbient, reducedMotion, scrollState.isScrolling);

  if (!webglOk || !signalAnchor) {
    return <div ref={rootRef} className="e03-canvas-root" aria-hidden="true" />;
  }

  return (
    <div ref={rootRef} className="e03-canvas-root" aria-hidden="true">
      <Canvas
        dpr={dpr}
        frameloop={active ? 'always' : 'never'}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: cameraProfile.end, fov: cameraProfile.fov, near: 0.1, far: 100 }}
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
