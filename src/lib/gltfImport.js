import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { registerPart, resetPartIds } from './parts.js';

/**
 * Putting a game's reverse export on the bench.
 *
 * Every other subject here is generated: the builder writes the names, the part ids and the
 * explode vectors as it goes. A .glb that came back from the game did none of that — it is the
 * authored subject *after* the game cast it, dressed it and posed it in its world — and the
 * viewer has exactly two ways to show it: pretend it is a builder's output, or say what it is.
 *
 * This does the second. It adds only what the display needs to address the graph — a name on
 * every node, a part id on every mesh — and records what it found rather than hiding it: the
 * world scale the game had the unit at, and the pose the file was exported in. Nothing in the
 * file's geometry, materials or hierarchy is changed. What it deliberately does NOT add:
 *
 *   - explode vectors. Where each part would fly to is a fact the builder knows and the game's
 *     cast does not, and inventing offsets for a merged mesh would be drawing a different
 *     machine. The slider does nothing on an imported subject, and the readout says 0.00.
 *   - a collision proxy. The game drops it on the way in, so there is none to show.
 *
 * Naming: the game keeps the pivots' names (that is what the joints drive) and drops the mesh
 * names, so an unnamed mesh is named for the pivot it hangs from and the material it was cast
 * with — `Turret_Pivot_M_Turret`, `Barrel_Pivot_Dressing` for a mesh the game added with no
 * material name at all. A glTF LINES primitive is `<its parent>_Outline`; an empty the game
 * uses as a label anchor is `<its parent>_Callout`. Those are the
 * names a descriptor's legend and callouts address, and the invariant suite asserts every one
 * of them resolves, so a re-export that changes the cast changes a test rather than a label.
 */

const GENERATED_NAME = /^(mesh_\d+|)$/;   // what GLTFLoader calls a node the file left unnamed
const DRESSING = 'Dressing';              // a material the game added and did not name

/**
 * Take a loaded glTF scene and return the subject root the viewer expects.
 *
 * @param {THREE.Object3D} scene       what GLTFLoader.parse produced (`gltf.scene`)
 * @param {object} opts
 * @param {string} opts.rootName       name for the bench root this returns
 * @param {RegExp} [opts.authoredRoot] how to find the authored subject's own root inside the
 *                                     file; the game wraps it, and the wrapper carries the pose
 * @param {Array}  [opts.joints]       joints to declare, in the shape buildX() would
 * @returns {THREE.Object3D}
 */
export function adoptGameGlb(scene, opts) {
  const { rootName, authoredRoot = /^[A-Z0-9]+_Root$/, joints = [] } = opts;
  scene.updateMatrixWorld(true);

  const gameRoot = scene.children.find((c) => /_Game_Root$/.test(c.name)) || scene.children[0];
  if (!gameRoot) throw new Error('[gltfImport] the file has no scene root');

  let authored = null;
  gameRoot.traverse((o) => { if (!authored && o !== gameRoot && authoredRoot.test(o.name)) authored = o; });
  if (!authored) throw new Error(`[gltfImport] no node matching ${authoredRoot} under ${gameRoot.name}`);

  // The game posed the unit in its world: a scale on its wrapper, a nudge and a heading. The
  // bench shows the authored frame, so the wrapper's world transform is inverted onto our root
  // and the authored root lands back at the identity it was built at. The file's own nodes are
  // untouched — what was undone is recorded, not discarded.
  const wrapperWorld = authored.parent.matrixWorld.clone();
  const pose = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
  wrapperWorld.decompose(pose, quat, scale);
  const heading = new THREE.Euler().setFromQuaternion(quat, 'YXZ');

  const root = new THREE.Object3D();
  root.name = rootName;
  root.matrix.copy(wrapperWorld).invert();
  root.matrix.decompose(root.position, root.quaternion, root.scale);
  scene.remove(gameRoot);
  root.add(gameRoot);

  root.userData.gamePose = {
    scale: scale.x,
    headingDeg: THREE.MathUtils.radToDeg(heading.y),
    offset: pose.toArray(),
  };

  // Names first, parents before children, so an outline can be named for the mesh it belongs to.
  const taken = new Set();
  root.traverse((o) => { if (o.name && !GENERATED_NAME.test(o.name)) taken.add(o.name); });
  root.traverse((o) => {
    if (o === root || !GENERATED_NAME.test(o.name)) return;
    const parent = o.parent.name;
    let base;
    if (o.isLine || o.isLineSegments) base = `${parent}_Outline`;
    else if (o.isMesh) base = `${parent}_${o.material?.name || DRESSING}`;
    else if (o.userData.callout) base = `${parent}_Callout`;   // the game's own label anchor
    else base = `${parent}_Empty`;
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
    taken.add(name);
    o.name = name;
  });

  // Part ids. The G-buffer needs one per mesh or every cast reads as the same object and the
  // id edge between two flush parts never appears. The emissive channel comes from the file
  // where the game kept the attribute (the emitters do), and otherwise from the material: a
  // strongly emissive material is a powered part whatever it is called.
  resetPartIds();
  const counts = { meshes: 0, lines: 0 };
  const geometries = new Set();
  root.traverse((o) => {
    // The authored export wrote every node's rest position and explode vector as glTF extras,
    // and the game kept them on the nodes it kept. Twelve pivots and emitters with explode data
    // and thirty casts without would be a slider that moves the lamps and leaves the hull — a
    // different machine, not this one half shown. Off, on every node, so the answer is one.
    delete o.userData.rest;
    delete o.userData.explode;
    if (o.isLine || o.isLineSegments) { counts.lines++; o.userData.gameOutline = true; return; }
    if (!o.isMesh) return;
    counts.meshes++;
    // GLTFLoader de-duplicates geometry by accessor, so nine shells that share their vertex
    // data arrive as nine meshes on one BufferGeometry — and a part id written into it would
    // be one id for all nine, with no seam between neighbours. Each cast gets its own copy.
    if (geometries.has(o.geometry)) {
      o.geometry = o.geometry.clone();          // carries the first cast's id with it —
      o.geometry.deleteAttribute('partId');     // — so the copy is registered afresh
      o.geometry.deleteAttribute('emissive');
    }
    geometries.add(o.geometry);
    const kept = o.geometry.getAttribute('__emissive');
    const lit = kept ? kept.getX(0) > 0 : isPowered(o.material);
    registerPart(o, { explodable: false, emissive: lit ? 'primary' : false });
  });
  root.userData.imported = counts;

  root.userData.joints = joints
    .map((j) => ({ ...j, targets: j.targets.filter((t) => root.getObjectByName(t.node)) }))
    .filter((j) => j.targets.length);
  return root;
}

function isPowered(material) {
  const e = material?.emissive;
  if (!e) return false;
  return 0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b > 0.4;
}

/** Fetch a .glb and adopt it. What `build()` returns for an imported subject. */
export async function loadGameGlb(url, opts) {
  const gltf = await new GLTFLoader().loadAsync(String(url));
  return adoptGameGlb(gltf.scene, opts);
}

/** The same from bytes already in hand — what the test suite uses, with no server in the way. */
export async function parseGameGlb(arrayBuffer, opts) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  return adoptGameGlb(gltf.scene, opts);
}
