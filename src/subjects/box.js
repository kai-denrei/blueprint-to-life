import * as THREE from 'three';
import { registerPart, resetPartIds } from '../tank/parts.js';
import { finish } from '../tank/geometry.js';

/**
 * Shader isolation subject — reachable at /?subject=box.
 *
 * The spec calls for prototyping the blueprint pass against a single primitive before pointing
 * it at the tank. This is that rig, kept rather than deleted: the next time the outline pass
 * regresses, it is diagnosable with one URL change instead of a bisect.
 *
 * It deliberately includes the three cases that break naive edge detection:
 *   - a box            : clean silhouette + hard normal breaks (the easy case)
 *   - a sphere         : smooth normals, no interior edges should appear
 *   - two flush plates : coplanar faces, identical normals, near-identical depth.
 *                        Only the part-id channel produces the seam. If that seam is missing,
 *                        the G-buffer id attribute is not reaching the composite.
 */
export const BOX_SUBJECT = {
  id: 'box',
  title: 'SHADER TEST RIG',
  subtitle: 'BLUEPRINT PASS ISOLATION · PRIMITIVES ONLY',
  frame: { target: [0, 0.9, 0], radius: 3.2 },

  build() {
    resetPartIds();
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7f72, flatShading: true });
    const root = new THREE.Object3D();
    root.name = 'Tank_Root';   // same root name so the app path is identical

    const box = new THREE.Mesh(finish(new THREE.BoxGeometry(1.6, 1.6, 1.6).toNonIndexed()), mat);
    box.name = 'Test_Box';
    box.position.set(-2.7, 0.9, 0);
    root.add(registerPart(box, { explode: [-1.2, 0.4, 0] }));

    const sphere = new THREE.Mesh(finish(new THREE.SphereGeometry(0.85, 32, 20).toNonIndexed()), mat);
    sphere.name = 'Test_Sphere';
    sphere.position.set(2.7, 0.9, 0);
    root.add(registerPart(sphere, { explode: [1.2, 0.4, 0] }));

    // Two plates sharing a face. Same normals, same depth, different parts.
    for (const [i, x] of [-0.44, 0.44].entries()) {
      const plate = new THREE.Mesh(finish(new THREE.BoxGeometry(0.84, 1.5, 1.1).toNonIndexed()), mat);
      plate.name = `Test_Plate_${i + 1}`;
      plate.position.set(x, 0.9, 0);
      root.add(registerPart(plate, { explode: [x * 2.6, 0, 0] }));
    }

    root.userData.articulation = {};
    return root;
  },

  drawing: { 'DWG': 'BTL-0000', 'REV': 'A', 'UNITS': 'METRES', 'SHEET': '1 OF 1' },

  legend: [
    { n: 1, node: 'Test_Box', label: 'BOX — SILHOUETTE + NORMAL BREAKS' },
    { n: 2, node: 'Test_Sphere', label: 'SPHERE — MUST SHOW NO INTERIOR LINES' },
    { n: 3, node: 'Test_Plate_1', label: 'FLUSH PLATE PAIR — ID CHANNEL ONLY', qty: 2 },
  ],

  callouts: [
    { n: 1, node: 'Test_Box', label: 'BOX', offset: [0, 1.0, 0], dir: 'nw' },
    { n: 2, node: 'Test_Sphere', label: 'SPHERE', offset: [0, 1.0, 0], dir: 'ne' },
    { n: 3, node: 'Test_Plate_1', label: 'FLUSH SEAM', offset: [0, -1.0, 0], dir: 'sw' },
  ],

  instrumentation: [
    { label: 'PRIMITIVES', value: '4' },
    { label: 'EXPLODE', key: 'explode', value: '0.00' },
    { label: 'VIEW', key: 'view', value: 'ISO' },
    { label: 'DISPLAY', key: 'mode', value: 'BLUEPRINT' },
    { label: 'NODES', key: 'nodes', value: '—' },
    { label: 'TRIANGLES', key: 'tris', value: '—' },
    { label: 'DRAW CALLS', key: 'calls', value: '—' },
    { label: 'FRAME', key: 'fps', value: '— fps' },
    { label: 'BUILD', key: 'build', value: '—' },
    { label: 'LINK', key: 'link', value: '—' },
  ],
};
