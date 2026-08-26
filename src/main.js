import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

import { BlueprintRenderer } from './render/blueprint.js';
import { createGround, createLighting } from './render/pbr.js';
import { ViewController, VIEWS } from './camera/viewController.js';
import { SchematicChrome } from './chrome/schematic.js';
import { applyExplode, collectExplodable } from './tank/parts.js';
import { TANK_SUBJECT } from './subjects/tank.js';
import { BOX_SUBJECT } from './subjects/box.js';
import { isStandalone, registerServiceWorker, setupInstallPrompt, watchConnectivity } from './pwa/lifecycle.js';

const SUBJECTS = { tank: TANK_SUBJECT, box: BOX_SUBJECT };

const params = new URLSearchParams(location.search);
const subject = SUBJECTS[params.get('subject')] || TANK_SUBJECT;

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

const state = {
  mode: 'blueprint',
  explode: 0,
  azimuth: 0,
  elevation: 0,
  showCollision: false,
};

const nodeToPartId = new Map();
root.traverse((o) => {
  if (o.userData?.partId != null) nodeToPartId.set(o.name, o.userData.partId);
});

const chrome = new SchematicChrome({
  root: app,
  subject,
  views: VIEWS,
  handlers: {
    onView: (key) => { views.setView(key); chrome.setActiveView(key); },
    onMode: (key) => setMode(key),
    onExplode: (v) => {
      state.explode = v;
      applyExplode(root, v);
      views.setFrameScale(1 + v * 0.95);
    },
    onAzimuth: (deg) => { state.azimuth = deg; },
    onElevation: (deg) => { state.elevation = deg; },
    onHighlight: (nodeName) => {
      const id = nodeName ? nodeToPartId.get(nodeName) : undefined;
      blueprint.set('uHighlightId', id == null ? -1 : id);
    },
    onExport: () => exportGLB(),
    onDumpGraph: () => dumpGraph(),
  },
});
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

const turretPivot = root.getObjectByName('Turret_Pivot');
const barrelPivot = root.getObjectByName('Barrel_Pivot');

function applyArticulation() {
  if (turretPivot) turretPivot.rotation.y = THREE.MathUtils.degToRad(state.azimuth);
  if (barrelPivot) barrelPivot.rotation.x = THREE.MathUtils.degToRad(-state.elevation);
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
  chrome.setReadouts({
    azimuth: signed(state.azimuth, 1, '°', 5),
    elevation: signed(state.elevation, 1, '°', 4),
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
    const proxy = root.getObjectByName('Hull_Collision');
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
  const proxy = root.getObjectByName('Hull_Collision');
  const proxyWasVisible = proxy?.visible;
  if (proxy) proxy.visible = true;    // the proxy must survive export; visibility is display state

  new GLTFExporter().parse(root, (result) => {
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${subject.id}_${buildToken}.glb`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (proxy) proxy.visible = proxyWasVisible;
    applyExplode(root, savedExplode);
  }, (err) => {
    console.error('[export] failed', err);
    if (proxy) proxy.visible = proxyWasVisible;
    applyExplode(root, savedExplode);
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
