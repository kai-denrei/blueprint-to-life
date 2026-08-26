/**
 * Procedural geometry helpers.
 *
 * Everything here returns a non-indexed BufferGeometry with position, normal, uv and uv2.
 * Non-indexed + computeVertexNormals gives flat shading for free, which is what both the
 * blueprint fill and a hard-surface PBR pass want.
 *
 * This module knows nothing about materials, rendering or the blueprint viewer. It must stay
 * that way: src/lib + src/tank + src/howitzer are the assets, src/render/** is one way of
 * looking at them. Shared generators live here so a second vehicle is a new folder, not a
 * fork of the first one.
 */
import * as THREE from 'three';

/**
 * Copy uv into the second UV set so lightmap/AO channels exist before anyone needs them.
 *
 * Both `uv1` and `uv2` are written on purpose. three renamed the second UV set from `uv2` to
 * `uv1` in r152: modern materials read `uv1`, and GLTFExporter maps uv1 -> TEXCOORD_1 while
 * uv2 -> TEXCOORD_2. Writing only `uv2` produced a GLB with no TEXCOORD_1 at all — the exact
 * "retrofitting UVs afterwards is the time sink" failure this is supposed to prevent, except
 * silent. `uv2` is kept as well so anything still reading the old name keeps working.
 */
export function finish(geom) {
  geom.computeVertexNormals();
  const uv = geom.getAttribute('uv');
  if (uv) {
    if (!geom.getAttribute('uv1')) geom.setAttribute('uv1', uv.clone());
    if (!geom.getAttribute('uv2')) geom.setAttribute('uv2', uv.clone());
  }
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Extrude a closed convex 2D profile (in the ZY plane) along X.
 *
 * @param {Array<[number,number]>} profile  points as [z, y], convex, either winding
 * @param {number} width                    extent along X, centred on 0
 * @param {object} [opts]
 * @param {number} [opts.frontScale=1]      scale applied to the +X cap (gives sloped sides)
 * @param {number} [opts.backScale=1]       scale applied to the -X cap
 */
export function extrudeProfile(profile, width, opts = {}) {
  const { frontScale = 1, backScale = 1 } = opts;
  const pts = ensureCCW(profile);
  const n = pts.length;
  const hw = width / 2;

  // Profile centroid — cap scaling happens about it so a scaled cap stays concentric.
  let cz = 0, cy = 0;
  for (const [z, y] of pts) { cz += z; cy += y; }
  cz /= n; cy /= n;

  const at = (i, side) => {
    const s = side > 0 ? frontScale : backScale;
    const [z, y] = pts[i];
    return [side * hw, cy + (y - cy) * s, cz + (z - cz) * s];
  };

  const pos = [];
  const uv = [];

  // Perimeter parameterisation, used as the U coordinate of the side band.
  const seg = [];
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(perim);
    perim += d;
  }

  // Side band: one quad per profile edge, spanning -X to +X.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = at(i, -1), a1 = at(i, 1), b0 = at(j, -1), b1 = at(j, 1);
    const u0 = seg[i] / perim;
    const u1 = (i === n - 1 ? perim : seg[i + 1]) / perim;
    tri(pos, uv, a0, a1, b1, [u0, 0], [u0, 1], [u1, 1]);
    tri(pos, uv, a0, b1, b0, [u0, 0], [u1, 1], [u1, 0]);
  }

  // Caps: triangle fan from vertex 0 (safe because the profile is convex).
  const bb = profileBounds(pts);
  const capUV = (p) => [(p[2] - bb.minZ) / bb.dz, (p[1] - bb.minY) / bb.dy];
  for (let i = 1; i < n - 1; i++) {
    const a = at(0, 1), b = at(i, 1), c = at(i + 1, 1);
    tri(pos, uv, a, b, c, capUV(a), capUV(b), capUV(c));
    const d = at(0, -1), e = at(i + 1, -1), f = at(i, -1);
    tri(pos, uv, d, e, f, capUV(d), capUV(e), capUV(f));
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return finish(geom);
}

/**
 * Track band around a set of running-gear circles.
 *
 * Traced from the support function of the union of disks: for each sampled direction d,
 * the supporting point is c_i + r_i*d for whichever circle maximises c_i·d + r_i. Walking d
 * around the circle traces the convex hull of the union — i.e. exactly where a taut track sits.
 * Sampling the same support function at r_i + thickness gives the outer surface.
 *
 * @param {Array<{z:number, y:number, r:number}>} circles
 * @param {object} opts  { thickness, width, segments }
 */
export function trackBand(circles, opts = {}) {
  const { thickness = 0.09, width = 0.55, segments = 220 } = opts;
  const hw = width / 2;

  const support = (dz, dy, pad) => {
    let best = -Infinity, bz = 0, by = 0;
    for (const c of circles) {
      const v = c.z * dz + c.y * dy + c.r + pad;
      if (v > best) { best = v; bz = c.z + (c.r + pad) * dz; by = c.y + (c.r + pad) * dy; }
    }
    return [bz, by];
  };

  const inner = [], outer = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const dz = Math.cos(a), dy = Math.sin(a);
    inner.push(support(dz, dy, 0));
    outer.push(support(dz, dy, thickness));
  }

  const pos = [], uv = [];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const u0 = i / segments, u1 = (i + 1) / segments;
    const iA = inner[i], iB = inner[j], oA = outer[i], oB = outer[j];

    const P = (x, p) => [x, p[1], p[0]];
    // outer surface
    tri(pos, uv, P(-hw, oA), P(hw, oA), P(hw, oB), [u0, 0], [u0, 1], [u1, 1]);
    tri(pos, uv, P(-hw, oA), P(hw, oB), P(-hw, oB), [u0, 0], [u1, 1], [u1, 0]);
    // inner surface (reversed winding)
    tri(pos, uv, P(-hw, iA), P(hw, iB), P(hw, iA), [u0, 0], [u1, 1], [u0, 1]);
    tri(pos, uv, P(-hw, iA), P(-hw, iB), P(hw, iB), [u0, 0], [u1, 0], [u1, 1]);
    // side walls
    tri(pos, uv, P(hw, iA), P(hw, oB), P(hw, oA), [u0, 0], [u1, 1], [u0, 1]);
    tri(pos, uv, P(hw, iA), P(hw, iB), P(hw, oB), [u0, 0], [u1, 0], [u1, 1]);
    tri(pos, uv, P(-hw, iA), P(-hw, oA), P(-hw, oB), [u0, 0], [u0, 1], [u1, 1]);
    tri(pos, uv, P(-hw, iA), P(-hw, oB), P(-hw, iB), [u0, 0], [u1, 1], [u1, 0]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return finish(geom);
}

/** Lathe a 2D profile ([radius, z]) about the Z axis — used for the barrel/muzzle silhouette. */
export function latheZ(profile, segments = 24) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
  const geom = new THREE.LatheGeometry(pts, segments).toNonIndexed();
  geom.rotateX(Math.PI / 2); // LatheGeometry spins about Y; we want the bore along Z
  return finish(geom);
}

// ---------------------------------------------------------------------------

function tri(pos, uv, a, b, c, ua, ub, uc) {
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
}

function ensureCCW(profile) {
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...profile].reverse() : profile;
}

function profileBounds(pts) {
  let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [z, y] of pts) {
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minZ, minY, dz: (maxZ - minZ) || 1, dy: (maxY - minY) || 1 };
}

/**
 * Merge non-indexed geometries that share the same attribute set.
 * Used where one logical part (a hull with sponsons) is easier to author as two extrusions
 * but must ship as a single mesh, because the mesh boundary is what a game engine sees.
 */
export function mergeNonIndexed(geoms) {
  const keys = ['position', 'normal', 'uv', 'uv1', 'uv2'];
  const out = new THREE.BufferGeometry();
  for (const key of keys) {
    const parts = geoms.map((g) => g.getAttribute(key)).filter(Boolean);
    if (parts.length !== geoms.length) continue;
    const itemSize = parts[0].itemSize;
    const total = parts.reduce((n, a) => n + a.count, 0);
    const arr = new Float32Array(total * itemSize);
    let offset = 0;
    for (const a of parts) {
      arr.set(a.array.subarray(0, a.count * itemSize), offset);
      offset += a.count * itemSize;
    }
    out.setAttribute(key, new THREE.BufferAttribute(arr, itemSize));
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
