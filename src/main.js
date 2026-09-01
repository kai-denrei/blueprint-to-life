import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

import { BlueprintRenderer } from './render/blueprint.js';
import { createGround, createLighting } from './render/pbr.js';
import { ViewController, VIEWS } from './camera/viewController.js';
import { SchematicChrome } from './chrome/schematic.js';
import { applyExplode, collectExplodable } from './lib/parts.js';
import { resolveSubject, subjectList } from './subjects/index.js';
import { isStandalone, registerServiceWorker, setupInstallPrompt, watchConnectivity } from './pwa/lifecycle.js';

const params = new URLSearchParams(location.search);
const subject = resolveSubject(params.get('subject')).subject;

const app = document.getElementById('app');
const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
if (!renderer.capabilities.isWebGL2) {
  fail('WebGL2 required — the blueprint pass uses multiple render targets and a depth texture.');
}
// The blueprint pass renders the scene into a two-attachment float target and then reads it
// back nine times per pixel in the composite. That cost scales with the square of the pixel
// ratio, and a phone at DPR 3 is ~4x the fill of a laptop at DPR 2 on a fraction of the GPU.
// Capping at 1.75 on coarse pointers is the difference between 60fps and a slideshow, and the
// outline is a hard edge either way so the visible loss is small.
const COARSE = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// renderer.info resets on every render() call, and the last call each frame is the fullscreen
// composite quad — leaving autoReset on made the triangle/draw-call readout report "2 / 1".
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.name = 'Scene';

// The asset. Everything below this line is display.
const root = subject.build();
scene.add(root);

const lighting = createLighting();
const ground = createGround();
scene.add(lighting, ground);

const blueprint = new BlueprintRenderer(renderer);
const views = new ViewController(canvas, {
  target: subject.frame.target,
  radius: subject.frame.radius,
  onCrossfade: () => chrome.crossfade(),
});

/**
 * Joints are whatever the subject declared. main.js knows the *shape* of a joint — a slider
 * range remapped onto node rotations — and nothing about what any particular one means.
 */
const joints = root.userData.joints || [];
const jointValues = Object.fromEntries(joints.map((j) => [j.key, j.value]));

/**
 * Toggles are whatever the subject declared, in the same spirit as joints: main.js knows the
 * SHAPE of a toggle — a named node that is shown or hidden — and nothing about what any one of
 * them means. Resolved once, for the reason the joint targets are.
 */
const toggles = (root.userData.toggles || [])
  .map((t) => ({ ...t, object: root.getObjectByName(t.node), on: t.value !== false }))
  .filter((t) => {
    if (!t.object) console.warn(`[toggles] ${t.key}: no node named ${t.node}`);
    return t.object;
  });

function setToggle(key, on) {
  const t = toggles.find((x) => x.key === key);
  if (!t) return;
  t.on = on;
  t.object.visible = on;
}

const state = {
  mode: 'blueprint',
  explode: 0,
  showCollision: false,
};

const nodeToPartId = new Map();
root.traverse((o) => {
  if (o.userData?.partId != null) nodeToPartId.set(o.name, o.userData.partId);
});

const chrome = new SchematicChrome({
  root: app,
  subject,
  subjects: subjectList(),
  views: VIEWS,
  joints,
  toggles,
  handlers: {
    onView: (key) => { views.setView(key); chrome.setActiveView(key); },
    onMode: (key) => setMode(key),
    onExplode: (v) => {
      state.explode = v;
      applyExplode(root, v);
      views.setFrameScale(1 + v * 0.95);
    },
    onJoint: (key, value) => { jointValues[key] = value; },
    onToggle: (key, on) => setToggle(key, on),
    onSubject: (key) => {
      const next = new URL(location.href);
      next.searchParams.set('subject', key);
      location.assign(next);
    },
    onHighlight: (nodeName) => {
      const id = nodeName ? nodeToPartId.get(nodeName) : undefined;
      blueprint.set('uHighlightId', id == null ? -1 : id);
    },
    onExport: () => exportGLB(),
    onDumpGraph: () => dumpGraph(),
  },
});
for (const t of toggles) setToggle(t.key, t.on);
chrome.buildCallouts(root);
chrome.setActiveView(views.viewKey);
chrome.setActiveMode(state.mode);

// Callouts are leader lines pinned to 3D points. On a phone there is not enough screen for six
// of them without overlap, so they start off there and stay one tap away.
if (COARSE || innerWidth < 820) app.classList.add('no-callouts');

// A deep link from the manifest shortcut, e.g. /?src=pwa&view=side.
const initialView = params.get('view');
if (initialView && VIEWS[initialView]) {
  views.setView(initialView, { immediate: true });
  chrome.setActiveView(initialView);
}

// --- articulation ----------------------------------------------------------

// Resolve node references once. Doing it per frame would be a getObjectByName tree walk on
// every joint target, every frame, for no benefit — the graph does not gain nodes at runtime.
const resolvedJoints = joints.map((j) => ({
  ...j,
  targets: j.targets
    .map((t) => ({ ...t, object: root.getObjectByName(t.node) }))
    .filter((t) => {
      if (!t.object) console.warn(`[joints] ${j.key}: no node named ${t.node}`);
      return t.object;
    }),
}));

function applyArticulation() {
  for (const j of resolvedJoints) {
    const span = j.max - j.min;
    const t = span === 0 ? 0 : (jointValues[j.key] - j.min) / span;
    for (const target of j.targets) {
      const v = target.from + t * (target.to - target.from);
      // A target drives a rotation unless it says otherwise. `prop: 'position'` is the whole
      // extension the server rack's sliding sled needed: every joint before it was a hinge, so
      // "a joint is a rotation in degrees" had never had to be anything else. A target that
      // omits `prop` behaves exactly as it always did.
      if (target.prop === 'position') target.object.position[target.axis] = v;
      else target.object.rotation[target.axis] = THREE.MathUtils.degToRad(v);
    }
  }
  // Some subjects need a fix-up after their joints move — the howitzer's road wheels are one
  // InstancedMesh but are mounted on two independently hinging trails, so their instance
  // matrices cannot simply be inherited from a parent transform.
  subject.afterArticulate?.(root);
}

// --- modes -----------------------------------------------------------------

function setMode(mode) {
  state.mode = mode;
  chrome.setActiveMode(mode);
  chrome.crossfade();
  ground.visible = mode === 'pbr';
  scene.background = mode === 'pbr' ? new THREE.Color(0x1b2026) : null;
}
setMode('blueprint');

// --- resize ----------------------------------------------------------------

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h, false);
  views.setSize(w, h);
  blueprint.setSize(w, h, renderer.getPixelRatio());
  chrome.setSize(w, h);
}
addEventListener('resize', resize);
resize();

// --- readouts --------------------------------------------------------------

const nodeCount = countNodes(root);
const buildToken = document.querySelector('meta[name="cb"]')?.content || 'dev';
let frames = 0, fpsAcc = 0, fps = 0;

function updateReadouts(dt) {
  frames++; fpsAcc += dt;
  if (fpsAcc >= 0.5) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; }
  const jointReadouts = {};
  for (const j of joints) {
    jointReadouts[j.key] = j.unit === '°'
      ? signed(jointValues[j.key], 1, '°', 5)
      : jointValues[j.key].toFixed(2);
  }

  chrome.setReadouts({
    ...jointReadouts,
    /**
     * Readouts a subject computes rather than reads off a slider.
     *
     * The same shape of hook as `afterArticulate`, on the display side: that one exists for a
     * fact about the machine a tree of rotations cannot carry, this one for a fact about it a
     * slider value cannot carry. The FD-4 needed it because its most interesting figures —
     * metres of bead on the bed, courses finished — are derived from CHARGE and have no control
     * of their own, and a panel that quoted a build-time constant for them would be lying by
     * the second frame. main.js still knows nothing about any subject: it merges a map of
     * strings, and a subject that declares no hook loses nothing.
     */
    ...(subject.derived?.(jointValues) || {}),
    explode: state.explode.toFixed(2),
    view: VIEWS[views.viewKey].label,
    mode: state.mode === 'pbr' ? 'GAME / PBR' : 'BLUEPRINT',
    nodes: String(nodeCount),
    tris: renderer.info.render.triangles.toLocaleString('en-US'),
    calls: String(renderer.info.render.calls),
    fps: `${fps.toFixed(0)} fps`,
    build: buildToken,
  });
}

// --- loop ------------------------------------------------------------------

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  renderer.info.reset();
  views.update(dt);
  applyArticulation();

  const camera = views.camera;
  if (state.mode === 'blueprint') {
    blueprint.render(scene, camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
  chrome.renderLabels(scene, camera);
  updateReadouts(dt);
});

// --- keyboard --------------------------------------------------------------

const VIEW_KEYS = { '1': 'iso', '2': 'front', '3': 'rear', '4': 'side', '5': 'plan', '6': 'free' };
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (VIEW_KEYS[e.key]) {
    views.setView(VIEW_KEYS[e.key]);
    chrome.setActiveView(views.viewKey);
  } else if (e.key === 'b') {
    setMode(state.mode === 'blueprint' ? 'pbr' : 'blueprint');
  } else if (e.key === 'c') {
    state.showCollision = !state.showCollision;
    const proxy = findCollisionProxy(root);
    if (proxy) proxy.visible = state.showCollision;
  } else if (e.key === 'h') {
    app.classList.toggle('hide-chrome');
  }
});

// --- Phase 5 stub ----------------------------------------------------------

/**
 * GLTF export. Deliberately shipped as an unverified convenience, not a deliverable:
 * nothing has yet imported the result into a second engine, so "game-engine-portable naming"
 * is a claim about this hierarchy, not a tested property of the pipeline.
 * See .deban/roles/qa.md — this is the open item.
 */
function exportGLB() {
  // Reset articulation and explode so the exported rest pose is the authored one.
  const savedExplode = state.explode;
  applyExplode(root, 0);
  const proxy = findCollisionProxy(root);
  const proxyWasVisible = proxy?.visible;
  if (proxy) proxy.visible = true;    // the proxy must survive export; visibility is display state

  /**
   * A toggle that is OFF is detached for the duration of the export, not merely hidden.
   *
   * `onlyVisible: false` is load-bearing above — the collision proxy is always hidden and has to
   * ship — so hiding a toggled-off group would export it anyway and the button would mean two
   * different things in the viewer and in the file. Detaching makes "off" mean off in both.
   * Generic over whatever the subject declared; a subject with no toggles detaches nothing.
   */
  const detached = toggles.filter((t) => !t.on).map((t) => ({ node: t.object, parent: t.object.parent }));
  for (const d of detached) d.parent.remove(d.node);
  const restore = () => {
    for (const d of detached) d.parent.add(d.node);
    if (proxy) proxy.visible = proxyWasVisible;
    applyExplode(root, savedExplode);
  };

  new GLTFExporter().parse(root, (result) => {
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${subject.id}_${buildToken}.glb`;
    a.click();
    URL.revokeObjectURL(a.href);
    restore();
  }, (err) => {
    console.error('[export] failed', err);
    restore();
  }, {
    binary: true,
    onlyVisible: false,
    // trs:true is load-bearing. The default collapses each node into a flat `matrix`, so
    // Turret_Pivot/Barrel_Pivot arrive with no readable `translation` and a rigger on the
    // other side has to decompose a matrix to find the trunnion point.
    trs: true,
  });
}

function dumpGraph() {
  const lines = [];
  root.traverse((o) => {
    let depth = 0;
    for (let p = o.parent; p && p !== root.parent; p = p.parent) depth++;
    const kind = o.isInstancedMesh ? `InstancedMesh×${o.count}` : o.isMesh ? 'Mesh' : 'Object3D';
    const tris = o.isMesh ? triangleCount(o) : 0;
    lines.push(`${'  '.repeat(depth - 1)}${o.name || '(unnamed)'}  [${kind}]${tris ? `  ${tris} tris` : ''}`);
  });
  console.log(lines.join('\n'));
  console.log(`\n${lines.length} nodes · ${collectExplodable(root).length} explodable`);
}

// --- helpers ---------------------------------------------------------------

/**
 * The collision proxy, found by the flag the asset already sets.
 *
 * This used to be `getObjectByName('Hull_Collision') || getObjectByName('Chassis_Collision')`,
 * which is display code holding a list of asset node names — and the list was one name short
 * every time a subject named its proxy something else. `userData.isCollision` is the actual
 * contract (the invariant suite asserts it on every model), so reading that instead means a new
 * subject can call its proxy whatever its geometry deserves. Same argument as the subject
 * registry replacing a hardcoded list of ids.
 */
function findCollisionProxy(root) {
  let found = null;
  root.traverse((o) => { if (!found && o.userData?.isCollision) found = o; });
  return found;
}

function countNodes(o) {
  let n = 0;
  o.traverse(() => n++);
  return n;
}

function triangleCount(mesh) {
  const g = mesh.geometry;
  const verts = g.index ? g.index.count : g.getAttribute('position').count;
  return (verts / 3) * (mesh.isInstancedMesh ? mesh.count : 1);
}

function signed(v, digits, unit, pad) {
  const s = Math.abs(v).toFixed(digits).padStart(pad, '0');
  return `${v < 0 ? '-' : '+'}${s}${unit}`;
}

function fail(message) {
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = message;
  document.body.appendChild(box);
  throw new Error(message);
}

// --- PWA -------------------------------------------------------------------

registerServiceWorker((applyUpdate) => {
  chrome.toast('New build available.', {
    actionLabel: 'REFRESH',
    onAction: applyUpdate,
    persist: true,
  });
});

const installer = setupInstallPrompt((mode) => chrome.showInstall(mode, installer));
watchConnectivity((online) => chrome.setOnline(online));
if (isStandalone()) app.classList.add('standalone');

// Handy from the console.
Object.assign(globalThis, { THREE, GLTFExporter, scene, root, views, blueprint, state, dumpGraph, exportGLB });
