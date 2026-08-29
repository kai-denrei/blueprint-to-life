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

/**
 * Tapered beam along +Z, from z = 0 to z = length.
 *
 * The legged subject needed this and nothing here could make it: `extrudeProfile` extrudes
 * along X, so a limb segment authored with it would have had to be rotated into place, which
 * puts the segment's rest orientation in a transform instead of in its geometry. A limb is a
 * box whose two ends are different sizes and whose far end may be cranked off-axis — six quads,
 * no more — so it is its own generator rather than a special case of the extruder.
 *
 * @param {object} opts
 * @param {number} opts.length
 * @param {number} opts.w0  width at the near end   @param {number} opts.h0  height at the near end
 * @param {number} opts.w1  width at the far end    @param {number} opts.h1  height at the far end
 * @param {number} [opts.dx=0]  lateral offset of the far end (a cranked segment)
 * @param {number} [opts.dy=0]  vertical offset of the far end
 */
export function taperedBeam({ length, w0, h0, w1 = w0, h1 = h0, dx = 0, dy = 0 }) {
  const near = [
    [-w0 / 2, -h0 / 2, 0], [w0 / 2, -h0 / 2, 0], [w0 / 2, h0 / 2, 0], [-w0 / 2, h0 / 2, 0],
  ];
  const far = [
    [dx - w1 / 2, dy - h1 / 2, length], [dx + w1 / 2, dy - h1 / 2, length],
    [dx + w1 / 2, dy + h1 / 2, length], [dx - w1 / 2, dy + h1 / 2, length],
  ];

  const pos = [], uv = [];
  const quad = (a, b, c, d) => {
    tri(pos, uv, a, b, c, [0, 0], [1, 0], [1, 1]);
    tri(pos, uv, a, c, d, [0, 0], [1, 1], [0, 1]);
  };

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(near[i], near[j], far[j], far[i]);   // one side per profile edge
  }
  quad(near[3], near[2], near[1], near[0]);   // near cap
  quad(far[0], far[1], far[2], far[3]);       // far cap

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

/**
 * A hose swept along a curve, from control points.
 *
 * The headless exoframe's reference sheet is covered in loom — bundles over both shoulders,
 * conduits down the spine, a run down each calf — and nothing above could make one. A cable is
 * the one shape in this project that is neither an extrusion nor a lathe nor a box.
 *
 * Unlike `taperedBeam` this is mostly a wrapper, and it is worth being honest about that. What
 * it adds over calling TubeGeometry directly is the contract the rest of this module keeps:
 * non-indexed so `finish()` gives flat facets rather than a smooth plastic tube, uv/uv1/uv2
 * written, and a low radial count chosen for a hard-surface hose rather than for a spline
 * preview. Callers pass points; nobody outside here touches a curve object.
 *
 * A run must stay inside ONE rigid frame. There is no skinning anywhere in this project, so a
 * hose authored across a driven pivot would tear the moment the joint moved.
 *
 * @param {Array<[number,number,number]>} points  control points in the parent's frame
 * @param {object} [opts]
 * @param {number} [opts.radius=0.03]
 * @param {number} [opts.segments=20]   samples along the curve
 * @param {number} [opts.radial=6]      sides around it
 */
export function cableRun(points, opts = {}) {
  const { radius = 0.03, segments = 20, radial = 6 } = opts;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return finish(new THREE.TubeGeometry(curve, segments, radius, radial, false).toNonIndexed());
}

/**
 * A tyre: an annular band about the X axis whose tread is CROWNED across its width.
 *
 * `trackBand` given a single circle already makes a hubless rim, and four of the five rings on
 * the monocycle pod's wheels are exactly that. The tyre is not, and the reason is mechanical
 * rather than cosmetic: that vehicle leans, and a flat-treaded tyre leaned over stands on its
 * shoulder edge — which is further from the axle than the tread is, by sqrt(r^2 + (w/2)^2) - r.
 * The machine would climb as it banked and the contact point would be a corner. A crowned tread
 * puts a circular arc across the width, so the contact point migrates around the crown and the
 * geometry keeps meaning something at every lean angle. See `rideLift` in the pod's dimensions
 * for what falls out of it.
 *
 * A track never leans, so `trackBand` stays flat and is left alone.
 *
 * Windings are copied from `trackBand` deliberately — same axis, same surface order (tread,
 * bore, two side walls), so the two read as the same family of shape and the outward faces
 * agree.
 *
 * @param {object} opts
 * @param {number} opts.radius     tread radius on the centreline
 * @param {number} opts.thickness  tread down to the bore, at the centreline
 * @param {number} opts.width      extent along X, centred on 0
 * @param {number} opts.crown      radius of the tread arc across the width; must be >= width/2
 * @param {number} [opts.segments=72]    samples around the circumference
 * @param {number} [opts.crownSteps=16]  strips across the tread
 */
export function crownedTyre({ radius, thickness, width, crown, segments = 72, crownSteps = 16 }) {
  const hw = width / 2;
  const ri = radius - thickness;
  // Tangent to `radius` on the centreline, falling away on an arc of radius `crown`.
  const tread = (u) => radius - (crown - Math.sqrt(Math.max(crown * crown - u * u, 0)));

  const pos = [], uv = [];
  const P = (x, r, a) => [x, r * Math.sin(a), r * Math.cos(a)];

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const aA = (i / segments) * Math.PI * 2;
    const aB = (j / segments) * Math.PI * 2;
    const u0 = i / segments, u1 = (i + 1) / segments;

    // Tread, one strip per crown step.
    for (let k = 0; k < crownSteps; k++) {
      const xa = -hw + (k / crownSteps) * width;
      const xb = -hw + ((k + 1) / crownSteps) * width;
      const ra = tread(xa), rb = tread(xb);
      const t0 = k / crownSteps, t1 = (k + 1) / crownSteps;
      tri(pos, uv, P(xa, ra, aA), P(xb, rb, aA), P(xb, rb, aB), [u0, t0], [u0, t1], [u1, t1]);
      tri(pos, uv, P(xa, ra, aA), P(xb, rb, aB), P(xa, ra, aB), [u0, t0], [u1, t1], [u1, t0]);
    }

    // Bore, reversed so it faces inward.
    tri(pos, uv, P(-hw, ri, aA), P(hw, ri, aB), P(hw, ri, aA), [u0, 0], [u1, 1], [u0, 1]);
    tri(pos, uv, P(-hw, ri, aA), P(-hw, ri, aB), P(hw, ri, aB), [u0, 0], [u1, 0], [u1, 1]);

    // Side walls, from the bore out to whatever the crown left at the shoulder.
    const rs = tread(hw);
    tri(pos, uv, P(hw, ri, aA), P(hw, rs, aB), P(hw, rs, aA), [u0, 0], [u1, 1], [u0, 1]);
    tri(pos, uv, P(hw, ri, aA), P(hw, ri, aB), P(hw, rs, aB), [u0, 0], [u1, 0], [u1, 1]);
    tri(pos, uv, P(-hw, ri, aA), P(-hw, rs, aA), P(-hw, rs, aB), [u0, 0], [u0, 1], [u1, 1]);
    tri(pos, uv, P(-hw, ri, aA), P(-hw, rs, aB), P(-hw, ri, aB), [u0, 0], [u1, 1], [u1, 0]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return finish(geom);
}
