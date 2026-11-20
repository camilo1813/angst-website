// RESPONSIVE PHYSICAL-WORLD FRAMING — one rule for E02, E03 and E04.
//
// The approved camera poses (sceneMaps camera profiles) were composed for a wide 16:9 desktop
// frame. In a narrower desktop window (e.g. a 960×900 half-screen window) the same vertical field
// of view gives a much narrower horizontal field, so Life, the Machine's record and the
// Environment zone fall outside the frame.
//
// The rule: the camera keeps its approved POSITION and LOOK-AT (same world, same viewpoint, same
// perspective, same entity relationships); only its vertical FOV is widened — the minimum amount —
// until every FRAMING SUBJECT of the world sits inside the useful frame with its required pixel
// clearance. At 16:9 (1920×1080, 1366×768) every subject already fits, so the approved base FOV is
// returned unchanged. Nothing is repositioned to make a frame pass; the window shape decides only
// how much of the same world is visible around the subjects.
//
// Pure and deterministic: a function of camera pose, viewport aspect / size and breakpoint.

import { Matrix4, Vector3 } from 'three';

type V3 = [number, number, number];

export interface FramingSubject {
  id: string;
  /** World position (the frozen scene's own entity geometry; see worldLayout.ts). */
  p: V3;
  /** Required clearance in CSS px from the frame edges this subject can approach (left/right/top/bottom). */
  l?: number;
  r?: number;
  t?: number;
  b?: number;
}

// Desktop subjects — E02 final / E03 / E04 entity geometry (Life final silhouette: radius ≤ 0.64,
// height ≈ 2.4; Machine envelope ≈ ±0.6 around its axis, axis 2.3 high; Environment zone = the
// E04-approved dust cluster). Right clearance at the Machine axis covers its E04 step record
// (≈ 175 px to the right of the axis); top clearance covers the header and E04 marks.
const DESKTOP_SUBJECTS: FramingSubject[] = [
  { id: 'life.left', p: [-2.84, 1.0, 3.2], l: 0.05 },
  { id: 'life.head', p: [-2.45, 2.45, 3.2], l: 0.05, t: 0.12 },
  { id: 'life.feet', p: [-2.2, 0.05, 3.2], b: 0.06 },
  { id: 'machine.right', p: [2.4, 1.0, 4.4], r: 0.05 },
  { id: 'machine.axisTop', p: [1.8, 2.3, 4.4], r: 205, t: 0.12 },
  { id: 'environment.zone', p: [1.85, 3.069, 4.257], r: 90, t: 0.14 },
  { id: 'vision.origin', p: [-0.5, 3.2, 4.0], t: 0.1 },
];

// Mobile (≤ 640 px) has its own approved portrait camera profile and composition (sceneMaps
// MOBILE_PROFILE, wider 48° FOV, closer camera) built for that shape, so the rule fits nothing there:
// mobile framing is unchanged by this pass.
const MOBILE_SUBJECTS: FramingSubject[] = [];

export function framingSubjects(isMobile: boolean): FramingSubject[] {
  return isMobile ? MOBILE_SUBJECTS : DESKTOP_SUBJECTS;
}

const m = new Matrix4();
const v = new Vector3();
const eye = new Vector3();
const target = new Vector3();
const up = new Vector3(0, 1, 0);

/** clearance: values ≤ 1 are a fraction of the frame dimension, larger values are CSS px. */
function clear(c: number | undefined, dim: number): number {
  if (!c) return 0;
  return c <= 1 ? c * dim : c;
}

/**
 * The vertical FOV (degrees) for this camera pose and viewport: the approved base FOV, widened only
 * as far as needed for every framing subject to keep its clearance. Never narrower than the base.
 */
export function framingFov(position: V3, lookAt: V3, width: number, height: number, isMobile: boolean, baseFovDeg: number): number {
  if (!(width > 0 && height > 0)) return baseFovDeg;
  const aspect = width / height;
  eye.set(position[0], position[1], position[2]);
  target.set(lookAt[0], lookAt[1], lookAt[2]);
  m.lookAt(eye, target, up); // rotation of a camera at eye looking at target
  m.setPosition(eye);
  const view = m.clone().invert();
  let t = Math.tan(((baseFovDeg * Math.PI) / 180) / 2);
  const t0 = t;
  for (const s of framingSubjects(isMobile)) {
    v.set(s.p[0], s.p[1], s.p[2]).applyMatrix4(view); // camera space: looking down −z
    const depth = -v.z;
    if (depth <= 0.1) continue;
    const u = v.x / (depth * aspect); // ndc.x = u / t
    const w = v.y / depth; // ndc.y = w / t
    if (u < 0 && s.l) t = Math.max(t, -u / Math.max(0.05, 1 - (2 * clear(s.l, width)) / width));
    if (u > 0 && s.r) t = Math.max(t, u / Math.max(0.05, 1 - (2 * clear(s.r, width)) / width));
    if (w > 0 && s.t) t = Math.max(t, w / Math.max(0.05, 1 - (2 * clear(s.t, height)) / height));
    if (w < 0 && s.b) t = Math.max(t, -w / Math.max(0.05, 1 - (2 * clear(s.b, height)) / height));
  }
  return t === t0 ? baseFovDeg : (2 * Math.atan(t) * 180) / Math.PI;
}

/** Apply an E03 focus zoom (> 1 = closer) to a framed FOV: narrows the field around the same look-at. */
export function zoomedFov(fovDeg: number, zoom: number): number {
  if (zoom === 1) return fovDeg;
  return (2 * Math.atan(Math.tan(((fovDeg * Math.PI) / 180) / 2) / zoom) * 180) / Math.PI;
}
