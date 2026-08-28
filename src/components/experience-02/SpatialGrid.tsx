import { useMemo } from 'react';
import * as THREE from 'three';
import { createSeededRandom } from '../../lib/seededRandom';

const GRID_COLOR = '#3a4046';
const MEASUREMENT_COLOR = '#8a9096';

interface SpatialGridProps {
  gridOpacity: number;
  measurementOpacity: number;
  secondaryTraceOpacity: number;
  isMobile: boolean;
}

// Every depth (z) value in this file must stay safely IN FRONT of the
// camera's closest approach for its device profile (desktop: 9.2,
// mobile: 4.6). A line segment with one end behind the camera plane
// gets catastrophically stretched by the perspective divide — that
// was the real cause of the "long diagonal debug line" artifact, not
// segment length. Keeping a comfortable margin below each camera's
// minimum z avoids it entirely.
const Z_RANGE = { desktop: [2.5, 7.5] as const, mobile: [1, 3.6] as const };

/**
 * Broken, irregular floor traces — deliberately NOT an evenly-spaced
 * grid-helper pattern, and no segment is long enough to read as a
 * coordinate axis or a dominant centre line. 5 short, scattered
 * fragments, each ~1.5–3.5 units, with real gaps between them.
 *
 * Biased strongly toward the X orientation (roughly perpendicular to
 * the camera's view direction): a Z-aligned (depth-running) segment
 * gets perspective-stretched toward the vanishing point and can sweep
 * across most of the frame even at a short world length.
 */
function buildFloorTraces(isMobile: boolean) {
  const rand = createSeededRandom(552);
  const points: number[] = [];
  const count = 5;
  const [zMin, zMax] = isMobile ? Z_RANGE.mobile : Z_RANGE.desktop;
  const xSpan = isMobile ? 6 : 13;
  const xOffset = isMobile ? -3 : -7;
  const maxLength = isMobile ? 0.8 : 1.2;

  for (let i = 0; i < count; i++) {
    const alongX = rand() > 0.22;
    // Z-aligned (depth-running) segments get foreshortened toward the
    // vanishing point under this camera's grazing floor angle — even a
    // "short" one can project across a large fraction of the frame.
    // Keep them much shorter than the X-aligned ones as a result.
    const length = alongX
      ? (isMobile ? 0.8 : 1.5) + rand() * maxLength
      : (isMobile ? 0.3 : 0.5) + rand() * (isMobile ? 0.3 : 0.6);
    const x = xOffset + rand() * xSpan;
    const z = zMin + rand() * (zMax - zMin);

    // Keep segments off the world origin so nothing reads as a crosshair.
    if (Math.abs(x) < 1.2 && z < zMin + (zMax - zMin) * 0.3) continue;

    if (alongX) {
      points.push(x, 0, z, x + length, 0, z);
    } else {
      points.push(x, 0, z, x, 0, z + length);
    }
  }

  return new Float32Array(points);
}

function buildMeasurementFragments(isMobile: boolean) {
  const points: number[] = [];
  if (isMobile) {
    points.push(-1.4, 1.4, 2, -0.5, 1.4, 2.2);
    points.push(1.2, 0.4, 1.4, 1.2, 1.1, 1.5);
    points.push(-2.2, 0.5, 3, -1.9, 1, 3);
  } else {
    // 1 short horizontal + 1 short vertical trace, floating at depth —
    // fragments, not full-length reference lines.
    points.push(-3.2, 1.8, 4, -1.2, 1.8, 4.4);
    points.push(2.5, 0.5, 2, 2.5, 1.7, 2.2);
    // One small fragmented coordinate segment.
    points.push(-5.4, 0.6, 6.5, -4.9, 1.5, 6.5);
  }

  return new Float32Array(points);
}

function buildSecondaryTraces(isMobile: boolean) {
  const rand = createSeededRandom(7734);
  const points: number[] = [];
  const count = 2;
  const [zMin, zMax] = isMobile ? Z_RANGE.mobile : Z_RANGE.desktop;
  const xSpan = isMobile ? 5 : 12;
  const xOffset = isMobile ? -2.5 : -6;
  const maxLength = isMobile ? 0.5 : 1.1;

  for (let i = 0; i < count; i++) {
    const x = xOffset + rand() * xSpan;
    const y = 0.2 + rand() * 1.4;
    const z = zMin + rand() * (zMax - zMin);
    // Bias away from Z-alignment for the same foreshortening reason as
    // buildFloorTraces, and keep any Z-run short when it does occur.
    const alongZ = rand() > 0.75;
    const length = alongZ
      ? (isMobile ? 0.2 : 0.35) + rand() * (isMobile ? 0.2 : 0.3)
      : (isMobile ? 0.4 : 0.8) + rand() * maxLength;
    if (alongZ) {
      points.push(x, y, z, x, y, z + length);
    } else {
      points.push(x, y, z, x + length, y, z);
    }
  }

  return new Float32Array(points);
}

export default function SpatialGrid({
  gridOpacity,
  measurementOpacity,
  secondaryTraceOpacity,
  isMobile,
}: SpatialGridProps) {
  const { floorGeometry, fragmentGeometry, secondaryGeometry } = useMemo(() => {
    const floorGeometry = new THREE.BufferGeometry();
    floorGeometry.setAttribute('position', new THREE.BufferAttribute(buildFloorTraces(isMobile), 3));

    const fragmentGeometry = new THREE.BufferGeometry();
    fragmentGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(buildMeasurementFragments(isMobile), 3),
    );

    const secondaryGeometry = new THREE.BufferGeometry();
    secondaryGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(buildSecondaryTraces(isMobile), 3),
    );

    return { floorGeometry, fragmentGeometry, secondaryGeometry };
  }, [isMobile]);

  return (
    <group>
      <lineSegments geometry={floorGeometry}>
        <lineBasicMaterial
          color={GRID_COLOR}
          transparent
          opacity={gridOpacity}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={fragmentGeometry}>
        <lineBasicMaterial
          color={MEASUREMENT_COLOR}
          transparent
          opacity={measurementOpacity}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={secondaryGeometry}>
        <lineBasicMaterial
          color={MEASUREMENT_COLOR}
          transparent
          opacity={secondaryTraceOpacity}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}
