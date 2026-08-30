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
 *
 * 3. Parts may declare an emissive *channel*, written as a per-vertex `emissive` attribute.
 *    The blueprint pass reads it out of a spare G-buffer channel; the PBR path reads the
 *    equivalent off the material. A renderer that ignores it draws the part normally.
 *
 *    It is a channel rather than a boolean because the second vehicle with glowing parts wanted
 *    a different colour. "Which accent channel is this part on" is a fact about the vehicle;
 *    what channel 2 looks like is a decision for whoever is drawing it. Putting the colour
 *    itself in the asset would have moved display state back into the geometry.
 */

/**
 * Emissive channels. The value is what lands in the vertex attribute.
 *
 * Four, and four is a ceiling rather than a round number: the blueprint pass carries the
 * channel as `emissive * 0.25` in an 8-bit alpha, so 1..4 come back exactly and a fifth would
 * clamp into the fourth. `EMISSIVE_MAX` exists so that limit is asserted rather than
 * rediscovered by someone whose new accent silently renders as red.
 *
 * The growth is worth noting: this started as a boolean on the MK-CX, became a channel on the
 * Hepta-T because a second vehicle wanted a different colour, and the server rack's green and
 * red cost exactly two palette entries and two shader branches. Nothing on the asset side
 * changed at all — `registerPart(mesh, { emissive: 'tertiary' })` is the same call it always
 * was. That is what the Hepta-T bought by making it a channel instead of a flag.
 */
export const EMISSIVE = { none: 0, primary: 1, secondary: 2, tertiary: 3, quaternary: 4 };

/** The highest channel the G-buffer encoding can carry. See the note above. */
export const EMISSIVE_MAX = 4;

let nextId = 1;

export function resetPartIds() {
  nextId = 1;
}

/**
 * @param {THREE.Object3D} object
 * @param {object} [opts]
 * @param {[number,number,number]} [opts.explode]  offset applied at full explode, in parent space
 * @param {boolean} [opts.explodable=true]
 * @param {boolean|'primary'|'secondary'|'tertiary'|'quaternary'} [opts.emissive=false]
 *        powered element, and on which channel
 */
export function registerPart(object, opts = {}) {
  const { explode = [0, 0, 0], explodable = true, emissive = false } = opts;
  const channel = emissive === true ? EMISSIVE.primary : (EMISSIVE[emissive] ?? EMISSIVE.none);

  if (object.isMesh && object.geometry && !object.geometry.getAttribute('partId')) {
    const count = object.geometry.getAttribute('position').count;

    const id = nextId++;
    object.geometry.setAttribute('partId',
      new THREE.BufferAttribute(new Float32Array(count).fill(id), 1));
    object.userData.partId = id;

    // Written on every part, not only the glowing ones. A vertex attribute that exists on some
    // meshes and not others is the same trap the discharger tubes fell into: WebGL substitutes
    // a default and the render looks almost right.
    object.geometry.setAttribute('emissive',
      new THREE.BufferAttribute(new Float32Array(count).fill(channel), 1));
    object.userData.emissive = channel;
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
