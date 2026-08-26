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
import { buildMkcx } from '../src/mkcx/buildMkcx.js';
import { CXDIM } from '../src/mkcx/dimensions.js';
import { buildHowitzer } from '../src/howitzer/buildHowitzer.js';
import { HDIM, trailLayout } from '../src/howitzer/dimensions.js';
import { applyExplode, collectExplodable } from '../src/lib/parts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failures.push({ name, err }); console.log(`  FAIL ${name}\n       ${err.message}`); }
}

const tank = buildTank();
const mkcx = buildMkcx();
const howitzer = buildHowitzer();
const byName = (n) => tank.getObjectByName(n);

/**
 * The shared asset contract: what every subject must have for this viewer to render it and this
 * pipeline to export it. Any invariant a new subject breaks is a real incompatibility rather
 * than a stylistic difference.
 *
 * `wheels` is a flag rather than an assumption because the MK-CX broke the original version of
 * this list, which required `Wheels_Instanced` of everything. It hovers; it has no wheels. The
 * choice was to make the contract conditional or to bolt decorative running gear onto a
 * hovering vehicle so a checklist stayed green — and a contract that forces geometry to exist
 * for the test's benefit has stopped describing the thing it tests.
 */
const MODELS = [
  {
    name: 'tank', root: tank, rootName: 'Tank_Root', collision: 'Hull_Collision', wheels: true,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot'],
  },
  {
    name: 'mkcx', root: mkcx, rootName: 'MKCX_Root', collision: 'Hull_Collision', wheels: false,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Details_Group', 'Hover_Gear',
               'Nacelle_L', 'Nacelle_R', 'Secondary_Turrets',
               'Secondary_L_Pivot', 'Secondary_R_Pivot',
               'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot',
             'Secondary_L_Pivot', 'Secondary_R_Pivot',
             'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
  },
  {
    name: 'howitzer', root: howitzer, rootName: 'Howitzer_Root', collision: 'Chassis_Collision', wheels: true,
    required: ['Chassis_Mesh', 'Chassis_Collision', 'Traverse_Pivot', 'TopCarriage_Mesh',
               'Elevation_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Traverse_Pivot', 'Elevation_Pivot', 'Trail_Front_L', 'Trail_Rear_R'],
  },
];

console.log('\nscene graph — engine-portable naming');

for (const m of MODELS) {
  test(`[${m.name}] root is ${m.rootName}`, () => {
    assert.equal(m.root.name, m.rootName);
  });

  test(`[${m.name}] every node named in the hierarchy contract exists`, () => {
    for (const n of m.required) assert.ok(m.root.getObjectByName(n), `missing node: ${n}`);
  });

  test(`[${m.name}] no node is unnamed — an unnamed node cannot be rigged after export`, () => {
    const unnamed = [];
    m.root.traverse((o) => { if (!o.name) unnamed.push(o.type); });
    assert.deepEqual(unnamed, [], `unnamed nodes: ${unnamed.join(', ')}`);
  });

  test(`[${m.name}] names are unique — GLTF import collides otherwise`, () => {
    const seen = new Set(), dupes = new Set();
    m.root.traverse((o) => { if (seen.has(o.name)) dupes.add(o.name); seen.add(o.name); });
    assert.deepEqual([...dupes], []);
  });

  test(`[${m.name}] pivots are empty Object3Ds, not meshes`, () => {
    for (const n of m.pivots) {
      const p = m.root.getObjectByName(n);
      assert.ok(p, `missing pivot: ${n}`);
      assert.equal(p.isMesh, undefined, `${n} must carry no geometry of its own`);
    }
  });

  test(`[${m.name}] collision proxy is separate, hidden and carries no partId`, () => {
    const proxy = m.root.getObjectByName(m.collision);
    assert.equal(proxy.visible, false);
    assert.equal(proxy.userData.isCollision, true);
    assert.equal(proxy.geometry.getAttribute('partId'), undefined);
    assert.ok(proxy.geometry.getAttribute('position').count <= 48, 'proxy should be a simple box');
    const renderGeoms = new Set();
    m.root.traverse((o) => { if (o.isMesh && !o.userData.isCollision) renderGeoms.add(o.geometry); });
    assert.ok(!renderGeoms.has(proxy.geometry), 'render geometry must never be reused as a collider');
  });

  test(`[${m.name}] every rendered mesh has uv, uv1, uv2, partId and emissive`, () => {
    const missing = [];
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      for (const key of ['uv', 'uv1', 'uv2', 'partId', 'emissive']) {
        if (!o.geometry.getAttribute(key)) missing.push(`${o.name}:${key}`);
      }
    });
    assert.deepEqual(missing, []);
  });

  test(`[${m.name}] no two rendered meshes share a part id`, () => {
    // A shared id means the outline filter cannot tell the two apart, so the seam between them
    // vanishes. It happened once already, by cloning a geometry that had already been
    // registered — invisible in that case only because the two parts never touch on screen.
    const seen = new Map();
    const clashes = [];
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      const id = o.userData.partId;
      if (seen.has(id)) clashes.push(`${seen.get(id)} + ${o.name} both id ${id}`);
      else seen.set(id, o.name);
    });
    assert.deepEqual(clashes, []);
  });

  test(`[${m.name}] part ids fit the 8-bit channel the G-buffer packs them into`, () => {
    let max = 0;
    m.root.traverse((o) => { if (o.userData.partId) max = Math.max(max, o.userData.partId); });
    assert.ok(max > 0 && max < 255, `part id ${max} would wrap the id channel`);
  });

  test(`[${m.name}] no NaN in any position buffer`, () => {
    const bad = [];
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      const arr = o.geometry.getAttribute('position').array;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad.push(o.name); break; }
    });
    assert.deepEqual(bad, []);
  });

  test(`[${m.name}] running gear matches what the subject claims`, () => {
    const w = m.root.getObjectByName('Wheels_Instanced');
    if (m.wheels) {
      assert.ok(w?.isInstancedMesh, 'Wheels_Instanced must be an InstancedMesh');
      const loose = [];
      m.root.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh && /RoadWheel/i.test(o.name)) loose.push(o.name);
      });
      assert.deepEqual(loose, [], 'road wheels must be instanced, not N loose meshes');
    } else {
      // A hovering vehicle carrying leftover running gear is worse than one carrying none:
      // it looks like the change was abandoned halfway.
      const leftovers = [];
      m.root.traverse((o) => {
        if (/RoadWheel|Sprocket|ReturnRoller|^Track_|Wheels_Instanced/i.test(o.name)) leftovers.push(o.name);
      });
      assert.deepEqual(leftovers, [], 'this subject declares no wheels but still carries some');
    }
  });

  test(`[${m.name}] explode is stored data and is exactly reversible`, () => {
    const parts = collectExplodable(m.root);
    assert.ok(parts.length >= 8, `expected many explodable parts, got ${parts.length}`);
    const before = parts.map((p) => p.position.clone());
    applyExplode(m.root, 1);
    const moved = parts.filter((p, i) => p.position.distanceTo(before[i]) > 0.01).length;
    assert.ok(moved >= parts.length * 0.8, 'most explodable parts should actually move');
    applyExplode(m.root, 0);
    parts.forEach((p, i) => assert.equal(p.position.distanceTo(before[i]), 0, `${p.name} did not return`));
  });

  test(`[${m.name}] every declared joint target resolves and is unique`, () => {
    const joints = m.root.userData.joints;
    const pairs = joints.flatMap((j) => j.targets.map((t) => `${t.node}.${t.axis}`));
    assert.equal(new Set(pairs).size, pairs.length,
      'two joints driving the same node axis fight each other every frame');
  });

  test(`[${m.name}] declares joints the viewer can drive without knowing the subject`, () => {
    const joints = m.root.userData.joints;
    assert.ok(Array.isArray(joints) && joints.length >= 2, 'no joints declared');
    for (const j of joints) {
      for (const key of ['key', 'label', 'min', 'max', 'step', 'value', 'targets']) {
        assert.ok(j[key] !== undefined, `joint ${j.key} missing ${key}`);
      }
      assert.ok(j.max > j.min, `joint ${j.key} has an empty range`);
      assert.ok(j.value >= j.min && j.value <= j.max, `joint ${j.key} default is out of range`);
      assert.ok(j.targets.length > 0, `joint ${j.key} drives nothing`);
      for (const t of j.targets) {
        assert.ok(m.root.getObjectByName(t.node), `joint ${j.key} targets missing node ${t.node}`);
        assert.ok(['x', 'y', 'z'].includes(t.axis), `joint ${j.key} bad axis ${t.axis}`);
        assert.ok(Number.isFinite(t.from) && Number.isFinite(t.to), `joint ${j.key} bad range`);
      }
    }
    const keys = joints.map((j) => j.key);
    assert.equal(new Set(keys).size, keys.length, 'duplicate joint keys');
  });
}

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

console.log('\ninstancing and collision');

test('[mkcx] emissive parts are flagged in the geometry, not just the material', () => {
  // The blueprint pass has no materials — it renders with an overrideMaterial — so a glow
  // expressed only as MeshStandardMaterial.emissive would show in the PBR mode and silently
  // vanish in the schematic. The attribute is what makes both modes agree.
  const lit = [];
  mkcx.traverse((o) => {
    if (o.isMesh && o.userData.emissive) lit.push(o.name);
  });
  assert.ok(lit.length >= 8, `expected several emissive parts, got ${lit.length}`);
  for (const name of lit) {
    const attr = mkcx.getObjectByName(name).geometry.getAttribute('emissive');
    assert.ok(attr, `${name} is flagged emissive but has no emissive attribute`);
    assert.equal(attr.array[0], 1, `${name} emissive attribute is not set`);
  }
});

test('[mkcx] deviates from the MK-VI it projects forward from', () => {
  // It is supposed to be a different vehicle, not a retexture. If these ever converge, the
  // silhouette claim in the README stopped being true.
  assert.ok(CXDIM.hull.length > DIM.hull.length, 'MK-CX should be the longer hull');
  assert.ok(CXDIM.hull.deckY < DIM.hull.deckY, 'MK-CX should be the lower hull');
  assert.equal(CXDIM.roadWheel, undefined, 'MK-CX has no running gear at all');
  assert.ok(CXDIM.hover.gap > 0, 'MK-CX should sit off the ground');
});

test('[mkcx] hovers: the lowest geometry clears the ground', () => {
  mkcx.updateMatrixWorld(true);
  let lowest = Infinity;
  mkcx.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    lowest = Math.min(lowest, bb.min.y);
  });
  assert.ok(lowest > 0.01, `lowest geometry sits at y=${lowest.toFixed(3)} — it is resting, not hovering`);
});

test('[mkcx] the secondary turrets clear the main gun bore line', () => {
  // The design constraint the user set: small enough to sit under the main cannon. If a later
  // tweak grows them past the bore, the silhouette reads as a collision.
  const c = CXDIM.secondary;
  const secTop = c.y + Math.max(...c.profile.map(([, y]) => y)) + 0.10;
  const boreY = CXDIM.turret.ringY + CXDIM.barrel.trunnionY;
  assert.ok(secTop < boreY,
    `secondary tops out at ${secTop.toFixed(2)} but the bore is at ${boreY.toFixed(2)}`);
});

test('[tank] road wheel count matches the declared layout', () => {
  assert.equal(byName('Wheels_Instanced').count, DIM.roadWheel.count * 2);
});

test('[howitzer] trail hinges sit at their declared origins', () => {
  for (const t of trailLayout()) {
    const pivot = howitzer.getObjectByName(t.name);
    assert.ok(pivot, `missing ${t.name}`);
    assert.equal(Number(pivot.position.x.toFixed(4)), Number(t.x.toFixed(4)));
    assert.equal(Number(pivot.position.z.toFixed(4)), Number(t.z.toFixed(4)));
  }
});

test('[howitzer] barrel length matches calibre × calibres', () => {
  assert.equal(Number(HDIM.barrel.length.toFixed(3)), Number((0.155 * 39).toFixed(3)));
});

test('[howitzer] Elevation_Pivot is a child of Traverse_Pivot', () => {
  assert.equal(howitzer.getObjectByName('Elevation_Pivot').parent.name, 'Traverse_Pivot');
});

test('running gear layout is shared, not duplicated', () => {
  const layout = wheelLayout();
  assert.equal(layout.filter((c) => c.kind === 'road').length, DIM.roadWheel.count);
  assert.equal(layout.filter((c) => c.kind !== 'road').length, 2);
});

console.log('\nUVs and part data');

console.log('\nexplode');

test('anchor parts do not move — the hull stays put', () => {
  const hull = byName('Hull_Mesh');
  applyExplode(tank, 1);
  assert.equal(hull.position.length(), 0);
  applyExplode(tank, 0);
});

console.log('\nasset / display boundary');

test('asset code never imports from display code', () => {
  const offenders = [];
  const assetDirs = ['lib', 'tank', 'howitzer'].map((d) => join(ROOT, 'src', d));
  for (const file of assetDirs.flatMap(walk)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (/(^|\/)(render|chrome|camera|subjects)\//.test(m[1])) {
        offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `the asset must not depend on how it is drawn:\n${offenders.join('\n')}`);
});

test('display code never imports from a specific asset — it renders any scene', () => {
  const offenders = [];
  for (const dir of ['render', 'camera', 'chrome']) {
    for (const file of walk(join(ROOT, 'src', dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        if (/(^|\/)(tank|howitzer|subjects)\//.test(m[1])) {
          offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    `the viewer must not know what it is drawing:\n${offenders.join('\n')}`);
});

test('cache-bust token is present in index.html and stamped on every local asset URL', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // The pattern is assembled rather than written as a literal on purpose: scripts/bust.sh
  // rewrites `<meta name="cb" content="38ff0326">` in EVERY source file it walks, not just HTML,
  // so a literal here gets clobbered by the next bust and the suite stops parsing.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const token = html.match(metaPattern)?.[1];
  assert.ok(token, 'no cache-bust meta tag — the build has no identity');
  const unstamped = [...html.matchAll(/(?:src|href)="(\.\/[^"?]+)"/g)].map((m) => m[1]);
  assert.deepEqual(unstamped, [], `asset URLs missing ?v=: ${unstamped.join(', ')}`);
});

console.log('\nPWA');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));

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
    assert.ok(statSync(join(ROOT, icon.src)).size > 0, `missing icon file: ${icon.src}`);
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
  assert.ok(statSync(join(ROOT, 'icons', 'apple-touch-icon-180.png')).size > 0);
});

test('every precached URL in the service worker resolves to a real file', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('self.addEventListener'));
  const urls = [...list.matchAll(/'(\/[^']*)'|`(\/[^`]*)`/g)]
    .map((m) => (m[1] || m[2]).split('?')[0])
    .filter((u) => u !== '/' && !u.endsWith('/'));
  // vendor/ is gitignored and produced by `npm run vendor`, so on a fresh clone those paths
  // legitimately do not exist yet. Skipping them keeps `npm install && npm test` green without
  // weakening the check that matters: that OUR files have not moved out from under the list.
  const hasVendor = (() => {
    try { return statSync(join(ROOT, 'vendor')).isDirectory(); } catch { return false; }
  })();
  if (!hasVendor) console.log('       (vendor/ absent — run `npm run vendor`; skipping those entries)');

  const missing = urls.filter((u) => {
    if (!hasVendor && u.startsWith('/vendor/')) return false;
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

test('no root-absolute URLs anywhere the site is addressed from', () => {
  // The site is served from a project path on GitHub Pages (/blueprint-to-life/), so every
  // root-absolute reference 404s there while working perfectly on localhost — the worst kind
  // of bug, invisible until deploy. Import-map values, the SW registration and its scope, and
  // the manifest's start_url/scope/icons all resolve against a base URL, so relative is
  // correct in every one of them.
  const offenders = [];

  for (const m of html.matchAll(/(?:src|href)="(\/[^\/][^"]*)"/g)) offenders.push(`index.html: ${m[1]}`);
  for (const m of html.matchAll(/"three(?:\/addons\/)?":\s*"(\/[^"]*)"/g)) offenders.push(`importmap: ${m[1]}`);

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('<precache:begin>'), sw.indexOf('<precache:end>'));
  for (const m of list.matchAll(/['`](\/[^'`]*)['`]/g)) offenders.push(`sw precache: ${m[1]}`);

  const life = readFileSync(join(ROOT, 'src', 'pwa', 'lifecycle.js'), 'utf8');
  for (const m of life.matchAll(/register\(\s*'(\/[^']*)'/g)) offenders.push(`sw register: ${m[1]}`);
  for (const m of life.matchAll(/scope:\s*'(\/[^']*)'/g)) offenders.push(`sw scope: ${m[1]}`);

  for (const key of ['start_url', 'scope', 'id']) {
    if (typeof manifest[key] === 'string' && manifest[key].startsWith('/')) {
      offenders.push(`manifest.${key}: ${manifest[key]}`);
    }
  }
  for (const icon of manifest.icons) {
    if (icon.src.startsWith('/')) offenders.push(`manifest icon: ${icon.src}`);
  }

  assert.deepEqual(offenders, [],
    `root-absolute URLs break a subpath deploy:\n${offenders.join('\n')}`);
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
