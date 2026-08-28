// Projects a screen-space point (the CSS signal-hint's on-screen position)
// into a Three.js world-space position at a chosen depth, using the same
// camera transform the scene starts at. This is how the WebGL spatial
// anchor visually inherits the CSS signal's screen position without any
// coupling to Experience 01's actual DOM — "visual continuity, not
// mathematical identity," per spec.

import * as THREE from 'three';

export function projectScreenPointToWorld(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  cameraPosition: [number, number, number],
  cameraLookAt: [number, number, number],
  fovDeg: number,
  targetDistance: number,
): [number, number, number] {
  const camera = new THREE.PerspectiveCamera(
    fovDeg,
    viewportWidth / viewportHeight,
    0.1,
    100,
  );
  camera.position.set(...cameraPosition);
  camera.lookAt(...cameraLookAt);
  camera.updateMatrixWorld(true);

  const ndcX = (screenX / viewportWidth) * 2 - 1;
  const ndcY = -((screenY / viewportHeight) * 2 - 1);

  const direction = new THREE.Vector3(ndcX, ndcY, 0.5)
    .unproject(camera)
    .sub(camera.position)
    .normalize();

  const world = camera.position
    .clone()
    .add(direction.multiplyScalar(targetDistance));

  return [world.x, world.y, world.z];
}
