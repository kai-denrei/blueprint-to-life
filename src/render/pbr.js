import * as THREE from 'three';

/**
 * Game display mode: the same scene graph with its real PBR materials, lit normally.
 *
 * This exists to keep the central claim honest — that the blueprint look is a display mode and
 * not the asset. If toggling to this mode ever requires touching src/tank/**, the separation
 * has already been lost.
 */
export function createLighting() {
  const rig = new THREE.Object3D();
  rig.name = 'Lighting_Rig';

  const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
  key.position.set(6, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  const s = 8;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  key.shadow.camera.updateProjectionMatrix();
  rig.add(key);

  const fill = new THREE.DirectionalLight(0x9fc0e8, 0.7);
  fill.position.set(-7, 4, -6);
  rig.add(fill);

  rig.add(new THREE.HemisphereLight(0xbdd6f5, 0x3d3a33, 0.85));
  return rig;
}

export function createGround() {
  const geom = new THREE.CircleGeometry(22, 48).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f4238, roughness: 1.0, metalness: 0.0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'Ground_Plane';
  mesh.receiveShadow = true;
  mesh.userData.displayOnly = true;   // never part of the exported asset
  return mesh;
}
