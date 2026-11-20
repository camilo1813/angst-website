// WORLD LAYOUT — the physical entities' placement constants, MIRRORED (not moved) from the frozen
// PhysicalWorldScene.tsx / LifeField.tsx / MachineField.tsx so that information layers (E04+) can
// anchor to the same physical places without importing — or editing — the frozen scene.
// QA (e04-gate.mjs) asserts these values are identical to the scene source.

export type Vec3 = [number, number, number];

export interface EnvironmentRegionLayout { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }

export interface WorldLayout {
  /** Life centre at Experience 03's final frame (desktop: after the E02 handoff, lifeHandoffT = 1). */
  lifeCenter: Vec3;
  machineCenter: Vec3;
  environment: EnvironmentRegionLayout;
  /** LifeField / MachineField heightScale (mobile compresses the vertical extent). */
  heightScale: number;
}

/** LifeField: y = (heightT · 2.3 + 0.05) · heightScale. MachineField: AXIS_HEIGHT = 2.3 (× heightScale). */
export const LIFE_HEIGHT = 2.35;
export const MACHINE_AXIS_HEIGHT = 2.3;
/** EnvironmentField boundary sits at y = 0.02 on the region's open perimeter. */
export const ENVIRONMENT_BOUNDARY_Y = 0.02;

export const DESKTOP_LAYOUT: WorldLayout = {
  lifeCenter: [-2.2, 0, 3.2], // DESKTOP_LIFE_FINAL
  machineCenter: [1.8, 0, 4.4], // DESKTOP_MACHINE_CENTER
  environment: { xMin: -1.5, xMax: 8.5, yMin: 0.1, yMax: 3.4, zMin: 1, zMax: 8 },
  heightScale: 1,
};

export const MOBILE_LAYOUT: WorldLayout = {
  lifeCenter: [1.07, 0, 3.6], // MOBILE_LIFE_CENTER
  machineCenter: [1.35, 0, 4], // MOBILE_MACHINE_CENTER
  environment: { xMin: -1.8, xMax: 4.2, yMin: 0.05, yMax: 3, zMin: 1, zMax: 4 },
  heightScale: 0.55,
};

export function worldLayout(isMobile: boolean): WorldLayout {
  return isMobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT;
}
