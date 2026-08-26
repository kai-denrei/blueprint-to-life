import * as THREE from 'three';

/**
 * Part registry.
 *
 * Two jobs, both of which have to happen at generation time or not at all:
 *
 * 1. Every mesh gets a per-vertex `partId` attribute. The blueprint pass needs to answer
 *    "are these two pixels the same object?" and normals alone cannot tell it — two bolted
 *    plates meeting at a shallow angle share a normal and would produce no edge. This is the
 *    only concession the asset makes to the renderer, and it is a plain attribute, not a
 *    material: a PBR pass simply ignores it.
 *
 * 2. Every explodable node records its rest position and an explode offset vector. The explode
 *    view is `rest + t * offset` — no keyframes anywhere, so adding a part later cannot break
 *    the animation.
 */

let nextId = 1;

export function resetPartIds() {
  nextId = 1;
}

/**
 * @param {THREE.Object3D} object
 * @param {object} [opts]
 * @param {[number,number,number]} [opts.explode]  offset applied at full explode, in parent space
 * @param {boolean} [opts.explodable=true]
 */
export function registerPart(object, opts = {}) {
  const { explode = [0, 0, 0], explodable = true } = opts;

  if (object.isMesh && object.geometry && !object.geometry.getAttribute('partId')) {
    const id = nextId++;
    const count = object.geometry.getAttribute('position').count;
    const arr = new Float32Array(count).fill(id);
    object.geometry.setAttribute('partId', new THREE.BufferAttribute(arr, 1));
    object.userData.partId = id;
  }

  if (explodable) {
    object.userData.rest = object.position.clone();
    object.userData.explode = new THREE.Vector3(...explode);
  }
  return object;
}

/** Every node carrying an explode vector, in traversal order. */
export function collectExplodable(root) {
  const out = [];
  root.traverse((o) => {
    if (o.userData && o.userData.rest && o.userData.explode) out.push(o);
  });
  return out;
}

/**
 * Apply an explode amount to a whole hierarchy.
 * @param {THREE.Object3D} root
 * @param {number} t  0 = assembled, 1 = fully exploded
 */
export function applyExplode(root, t) {
  for (const o of collectExplodable(root)) {
    o.position.copy(o.userData.rest).addScaledVector(o.userData.explode, t);
  }
}
