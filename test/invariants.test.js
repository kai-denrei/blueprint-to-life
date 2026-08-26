/**
 * Scene-graph invariants.
 *
 * These assert the properties the spec calls the deliverable — node names, pivot origins,
 * instancing, a separate collider, UV channels, explode data — not pixels. A screenshot test
 * would assert the display mode, which the spec explicitly says is not the asset.
 *
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTank } from '../src/tank/buildTank.js';
import { DIM, wheelLayout } from '../src/tank/dimensions.js';
import { applyExplode, collectExplodable } from '../src/tank/parts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failures.push({ name, err }); console.log(`  FAIL ${name}\n       ${err.message}`); }
}

const tank = buildTank();
const byName = (n) => tank.getObjectByName(n);

console.log('\nscene graph — engine-portable naming');

test('root is Tank_Root', () => {
  assert.equal(tank.name, 'Tank_Root');
});

test('every node named in the spec hierarchy exists', () => {
  for (const n of ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
                   'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group']) {
    assert.ok(byName(n), `missing node: ${n}`);
  }
});

test('no node is unnamed — an unnamed node cannot be rigged after export', () => {
  const unnamed = [];
  tank.traverse((o) => { if (!o.name) unnamed.push(o.type); });
  assert.deepEqual(unnamed, [], `unnamed nodes: ${unnamed.join(', ')}`);
});

test('names are unique — GLTF import collides otherwise', () => {
  const seen = new Set(), dupes = new Set();
  tank.traverse((o) => { if (seen.has(o.name)) dupes.add(o.name); seen.add(o.name); });
  assert.deepEqual([...dupes], []);
});

console.log('\narticulation — pivots at true mechanical origins');

test('Turret_Pivot sits at the turret ring centre', () => {
  const p = byName('Turret_Pivot');
  assert.equal(p.position.y, DIM.turret.ringY);
  assert.equal(p.position.z, DIM.turret.ringZ);
  assert.equal(p.position.x, 0);
});

test('Barrel_Pivot is a child of Turret_Pivot, at the trunnion', () => {
  const b = byName('Barrel_Pivot');
  assert.equal(b.parent.name, 'Turret_Pivot');
  assert.equal(b.position.y, DIM.barrel.trunnionY);
  assert.equal(b.position.z, DIM.barrel.trunnionZ);
});

test('pivots are empty Object3Ds, not meshes', () => {
  for (const n of ['Turret_Pivot', 'Barrel_Pivot']) {
    assert.equal(byName(n).isMesh, undefined, `${n} must carry no geometry of its own`);
  }
});

test('azimuth on Turret_Pivot carries the barrel with it', () => {
  const turret = byName('Turret_Pivot');
  const barrel = byName('Barrel_Mesh');
  turret.rotation.y = 0;
  tank.updateMatrixWorld(true);
  const before = barrel.getWorldPosition({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy() { return this; }, applyMatrix4(m) { const e = m.elements; this.x = e[12]; this.y = e[13]; this.z = e[14]; return this; }, setFromMatrixPosition(m) { return this.applyMatrix4(m); } });
  turret.rotation.y = Math.PI / 2;
  tank.updateMatrixWorld(true);
  const after = barrel.matrixWorld.elements;
  assert.ok(Math.abs(after[12] - before.x) > 0.5, 'rotating the turret must move the barrel');
  turret.rotation.y = 0;
  tank.updateMatrixWorld(true);
});

test('articulation contract is declared on the root', () => {
  const a = tank.userData.articulation;
  assert.equal(a.azimuth.node, 'Turret_Pivot');
  assert.equal(a.azimuth.axis, 'y');
  assert.equal(a.elevation.node, 'Barrel_Pivot');
  assert.equal(a.elevation.axis, 'x');
});

console.log('\ninstancing and collision');

test('road wheels are one InstancedMesh, not N meshes', () => {
  const w = byName('Wheels_Instanced');
  assert.ok(w.isInstancedMesh, 'Wheels_Instanced must be an InstancedMesh');
  assert.equal(w.count, DIM.roadWheel.count * 2);
});

test('no loose per-wheel meshes leaked into the graph', () => {
  const loose = [];
  tank.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && /RoadWheel/i.test(o.name)) loose.push(o.name); });
  assert.deepEqual(loose, []);
});

test('collision proxy is separate geometry, not the render hull', () => {
  const proxy = byName('Hull_Collision');
  const hull = byName('Hull_Mesh');
  assert.notEqual(proxy.geometry, hull.geometry);
  assert.equal(proxy.visible, false);
  assert.equal(proxy.userData.isCollision, true);
  const verts = proxy.geometry.getAttribute('position').count;
  assert.ok(verts <= 48, `proxy should be a simple box, got ${verts} verts`);
});

test('collision proxy carries no partId — the blueprint pass cannot draw it', () => {
  assert.equal(byName('Hull_Collision').geometry.getAttribute('partId'), undefined);
});

test('running gear layout is shared, not duplicated', () => {
  const layout = wheelLayout();
  assert.equal(layout.filter((c) => c.kind === 'road').length, DIM.roadWheel.count);
  assert.equal(layout.filter((c) => c.kind !== 'road').length, 2);
});

console.log('\nUVs and part data');

test('every rendered mesh has uv, uv1 and uv2', () => {
  // uv1 is the one GLTFExporter turns into TEXCOORD_1. Dropping it exports a GLB with no
  // second UV set at all, silently, which is why this asserts the name and not just "a second set".
  const missing = [];
  tank.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    for (const key of ['uv', 'uv1', 'uv2']) {
      if (!o.geometry.getAttribute(key)) missing.push(`${o.name}:${key}`);
    }
  });
  assert.deepEqual(missing, []);
});

test('every rendered mesh has a partId attribute', () => {
  const missing = [];
  tank.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    if (!o.geometry.getAttribute('partId')) missing.push(o.name);
  });
  assert.deepEqual(missing, []);
});

test('part ids fit the 8-bit channel the G-buffer packs them into', () => {
  let max = 0;
  tank.traverse((o) => { if (o.userData.partId) max = Math.max(max, o.userData.partId); });
  assert.ok(max > 0 && max < 255, `part id ${max} would wrap the id channel`);
});

test('no NaN in any position buffer', () => {
  const bad = [];
  tank.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.getAttribute('position').array;
    for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { bad.push(o.name); break; }
  });
  assert.deepEqual(bad, []);
});

console.log('\nexplode');

test('explode data is stored, not keyframed', () => {
  const parts = collectExplodable(tank);
  assert.ok(parts.length >= 10, `expected many explodable parts, got ${parts.length}`);
  for (const p of parts) {
    assert.ok(p.userData.rest, `${p.name} has no rest position`);
    assert.ok(p.userData.explode, `${p.name} has no explode vector`);
  }
});

test('explode is reversible — t=1 then t=0 restores rest exactly', () => {
  const turret = byName('Turret_Pivot');
  const rest = turret.position.clone();
  applyExplode(tank, 1);
  assert.ok(turret.position.distanceTo(rest) > 1, 'turret did not move on explode');
  applyExplode(tank, 0);
  assert.equal(turret.position.distanceTo(rest), 0);
});

test('anchor parts do not move — the hull stays put', () => {
  const hull = byName('Hull_Mesh');
  applyExplode(tank, 1);
  assert.equal(hull.position.length(), 0);
  applyExplode(tank, 0);
});

console.log('\nasset / display boundary');

test('src/tank/** never imports from src/render/, src/chrome/ or src/camera/', () => {
  const offenders = [];
  for (const file of walk(join(ROOT, 'src', 'tank'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (/(^|\/)(render|chrome|camera|subjects)\//.test(m[1])) {
        offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `the asset must not depend on how it is drawn:\n${offenders.join('\n')}`);
});

test('src/render/** never imports from src/tank/ — it renders any scene', () => {
  const offenders = [];
  for (const file of walk(join(ROOT, 'src', 'render'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (/(^|\/)tank\//.test(m[1])) offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('cache-bust token is present in index.html and stamped on every local asset URL', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // The pattern is assembled rather than written as a literal on purpose: scripts/bust.sh
  // rewrites `<meta name="cb" content="f48f4e75">` in EVERY source file it walks, not just HTML,
  // so a literal here gets clobbered by the next bust and the suite stops parsing.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const token = html.match(metaPattern)?.[1];
  assert.ok(token, 'no cache-bust meta tag — the build has no identity');
  const unstamped = [...html.matchAll(/(?:src|href)="(\/[^"?]+)"/g)].map((m) => m[1]);
  assert.deepEqual(unstamped, [], `asset URLs missing ?v=: ${unstamped.join(', ')}`);
});

console.log('\nPWA');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'));

test('service worker cache key matches the build token in index.html', () => {
  // This is the load-bearing one. scripts/bust.sh stamps the SW token, but that step is a
  // project addition to a file the cache-busting installer owns — re-running the installer
  // silently drops it. A drifted SW token means every installed user is pinned to whatever
  // build they first cached, forever, and nothing else in the system notices.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const htmlToken = html.match(metaPattern)?.[1];
  const swToken = readFileSync(join(ROOT, 'sw.js'), 'utf8').match(/const CB_TOKEN = '([^']+)'/)?.[1];
  assert.ok(swToken, 'sw.js has no CB_TOKEN constant');
  assert.notEqual(swToken, '__CB_TOKEN__', 'sw.js still holds the unstamped placeholder');
  assert.equal(swToken, htmlToken, 'service worker and HTML disagree about which build this is');
});

test('service worker never calls skipWaiting outside a message handler', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!/self\.skipWaiting\(\)/.test(install),
    'unconditional skipWaiting() in install reloads the app out from under a live session');
  assert.ok(/type === 'SKIP_WAITING'/.test(sw), 'no consent-gated skipWaiting path');
});

test('manifest has the fields installability actually requires', () => {
  for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    assert.ok(manifest[key], `manifest missing ${key}`);
  }
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  assert.ok(manifest.start_url.includes('src=pwa'), 'start_url needs an analytics marker');
});

test('manifest has 192, 512 and a maskable icon, and every file exists', () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'no 192 icon');
  assert.ok(sizes.includes('512x512'), 'no 512 icon');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'),
    'no maskable icon — Android will letterbox the mark inside its mask');
  for (const icon of manifest.icons) {
    assert.ok(statSync(join(ROOT, 'public', icon.src)).size > 0, `missing icon file: ${icon.src}`);
  }
});

test('iOS head tags are present — iOS ignores the manifest for most of this', () => {
  for (const needle of [
    'rel="manifest"',
    'name="theme-color"',
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-status-bar-style"',
    'name="apple-mobile-web-app-title"',
    'rel="apple-touch-icon"',
    'viewport-fit=cover',
  ]) {
    assert.ok(html.includes(needle), `index.html missing ${needle}`);
  }
  assert.ok(statSync(join(ROOT, 'public', 'icons', 'apple-touch-icon-180.png')).size > 0);
});

test('every precached URL in the service worker resolves to a real file', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('self.addEventListener'));
  const urls = [...list.matchAll(/'(\/[^']*)'|`(\/[^`]*)`/g)]
    .map((m) => (m[1] || m[2]).split('?')[0])
    .filter((u) => u !== '/' && !u.endsWith('/'));
  const missing = urls.filter((u) => {
    for (const base of [ROOT, join(ROOT, 'public')]) {
      try { if (statSync(join(base, u)).isFile()) return false; } catch { /* next */ }
    }
    return true;
  });
  // A missing precache entry does not throw at install time (they are added individually on
  // purpose) — it just quietly leaves a hole in the offline app. This is the only thing that
  // catches it.
  assert.deepEqual(missing, [], `precache references files that do not exist: ${missing.join(', ')}`);
});

test('offline fallback exists and is precached', () => {
  assert.ok(statSync(join(ROOT, 'offline.html')).size > 0);
  assert.ok(readFileSync(join(ROOT, 'sw.js'), 'utf8').includes('OFFLINE_URL'));
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

console.log(`\n${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
