// OBSERVATION ANCHORS — where information about the physical world attaches to that world.
//
// Every anchor belongs to a physical entity or region of the ONE persistent world (never to
// empty screen space) and is defined relative to that entity's own placement (worldLayout.ts,
// mirrored from the frozen scene). Overlays project these world positions through the persistent
// camera (Vector3.project) into canvas pixels, so marks stay attached through resize / DPR /
// breakpoint changes. E05 reuses this registry ("map by place").

import type { Camera } from 'three';
import { Vector3 } from 'three';
import { worldLayout, LIFE_HEIGHT, MACHINE_AXIS_HEIGHT, type Vec3 } from './worldLayout';

export type EntityRef = 'life' | 'machine' | 'environment' | 'structure';
export type AnchorId = 'v.origin' | 'v.reach.upper' | 'v.reach.lower' | 'm.axisTop' | 'e.zone';

export interface ObservationAnchor {
  id: AnchorId;
  entity: EntityRef;
  role: 'source' | 'target' | 'zone';
  /** Off-screen policy: targets/zones hide; a source may be clamped to the frame edge along its true direction. */
  offscreen: 'hide' | 'edge-clamp';
  /** Position in the no-WebGL fallback SVG (Experience02Fallback, viewBox 1600×900, slice). */
  fallback: [number, number];
}

export const ANCHORS: Record<AnchorId, ObservationAnchor> = {
  // The vision-like system looks FROM above the scene (a structural vantage point), not from a person.
  'v.origin': { id: 'v.origin', entity: 'structure', role: 'source', offscreen: 'edge-clamp', fallback: [770, 330] },
  // The two ends of its field's boundary on the living presence: it sees only the upper part.
  'v.reach.upper': { id: 'v.reach.upper', entity: 'life', role: 'target', offscreen: 'hide', fallback: [534, 500] },
  'v.reach.lower': { id: 'v.reach.lower', entity: 'life', role: 'target', offscreen: 'hide', fallback: [600, 600] },
  // The machine reports its own state from its own axis.
  'm.axisTop': { id: 'm.axisTop', entity: 'machine', role: 'source', offscreen: 'hide', fallback: [925, 540] },
  // A zone ON visibly rendered environmental matter (dust of the environment field) — never empty air.
  'e.zone': { id: 'e.zone', entity: 'environment', role: 'zone', offscreen: 'hide', fallback: [1300, 560] },
};

/** World position of an anchor for the current breakpoint (derived from the entity's own layout). */
export function anchorWorld(id: AnchorId, isMobile: boolean): Vec3 {
  const L = worldLayout(isMobile);
  const [lx, , lz] = L.lifeCenter;
  const [mx, , mz] = L.machineCenter;
  const hs = L.heightScale;
  switch (id) {
    case 'v.origin':
      return isMobile ? [1.2, 1.25, 3.3] : [-0.5, 3.2, 4.0];
    case 'v.reach.upper':
      return isMobile ? [lx - 0.12, LIFE_HEIGHT * hs * 1.03, lz] : [lx - 0.25, LIFE_HEIGHT * 1.043, lz];
    case 'v.reach.lower':
      return isMobile ? [lx - 0.09, LIFE_HEIGHT * hs * 0.658, lz] : [lx + 0.2, LIFE_HEIGHT * 0.574, lz];
    case 'm.axisTop':
      return [mx, MACHINE_AXIS_HEIGHT * hs, mz];
    case 'e.zone':
      // ON visibly rendered environmental matter (EnvironmentField dust, seed 6410), never empty air.
      // The boundary perimeter (#3a4046 at 0.13 opacity) does not render visibly at E03's final frame,
      // so the zone is centred on dust that does:
      //  · desktop — centroid of the compact upper dust cluster above/behind the machine (grains 43, 98, 102, 164);
      //  · mobile  — the framed environment matter is grain 57 (the only dust grain inside the
      //              portrait frame at E03's final camera), so the zone is centred on it.
      // QA (e04-gate §0) recomputes the dust field and asserts both positions.
      return isMobile ? ENV_ZONE_MOBILE : ENV_ZONE_DESKTOP;
  }
}

/** Environment dust grains the E zone is built on (see e.zone above). */
export const ENV_ZONE_DUST = { seed: 6410, desktop: [43, 98, 102, 164], mobile: [57] } as const;
const ENV_ZONE_DESKTOP: Vec3 = [1.85, 3.069, 4.257];
const ENV_ZONE_MOBILE: Vec3 = [1.694, 0.465, 2.246];
/** Environment layout re-export kept for the region-membership contract. */
export function environmentRegion(isMobile: boolean) {
  return worldLayout(isMobile).environment;
}

export interface ProjectedAnchor {
  id: AnchorId;
  /** Canvas-local CSS px. */
  x: number;
  y: number;
  /** Raw NDC (QA). */
  ndc: [number, number, number];
  /** Inside the safe area (or clamped to it, for edge-clamp sources). */
  visible: boolean;
  clamped: boolean;
}

/** Safe area (fraction of the canvas) inside which observation marks may be drawn. */
export const SAFE_AREA = { x: [0.04, 0.96] as [number, number], y: [0.08, 0.92] as [number, number] };

const v3 = new Vector3();
export function projectAnchor(id: AnchorId, isMobile: boolean, camera: Camera, width: number, height: number): ProjectedAnchor {
  const [x, y, z] = anchorWorld(id, isMobile);
  v3.set(x, y, z).project(camera);
  const ndc: [number, number, number] = [v3.x, v3.y, v3.z];
  let sx = ((v3.x + 1) / 2) * width;
  let sy = ((1 - v3.y) / 2) * height;
  const behind = v3.z > 1 || v3.z < -1;
  const [x0, x1] = [SAFE_AREA.x[0] * width, SAFE_AREA.x[1] * width];
  const [y0, y1] = [SAFE_AREA.y[0] * height, SAFE_AREA.y[1] * height];
  const inside = !behind && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
  if (inside) return { id, x: sx, y: sy, ndc, visible: true, clamped: false };
  if (ANCHORS[id].offscreen === 'edge-clamp' && !behind) {
    sx = Math.min(x1, Math.max(x0, sx));
    sy = Math.min(y1, Math.max(y0, sy));
    return { id, x: sx, y: sy, ndc, visible: true, clamped: true };
  }
  return { id, x: sx, y: sy, ndc, visible: false, clamped: false };
}

export const ANCHOR_IDS = Object.keys(ANCHORS) as AnchorId[];
