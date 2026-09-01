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

/**
 * A corrugated sheet: the folded trapezoidal panel a shipping container is made of.
 *
 * Built in the XY plane — `length` along X, `height` along Y — with the fold displacing along
 * Z between 0 and `depth`. The sheet is SOLID: an outer surface, an inner surface offset by
 * `thickness`, and closed top, bottom and end edges.
 *
 * That solidity is the whole reason this is not a one-sided strip. The blueprint pass renders
 * with `side: DoubleSide`, so a container built from planes looks perfect in the schematic and
 * you can see straight out through the back wall the moment anyone switches to the game view.
 * A wall that is a real sheet works in both modes and needs nothing from either renderer —
 * which is the same argument the emissive attribute makes about not living in a material.
 *
 * `extrudeProfile` cannot do this: a corrugation is a deeply non-convex profile, and that
 * generator fans its caps from vertex 0 on the assumption of convexity. Here the caps are strips
 * between two copies of the profile rather than a fan over one, which is what removes the
 * assumption.
 *
 * The inner surface is offset in Z rather than along the surface normal, so the diagonals are
 * fractionally thicker than the flats. That is what a press brake does to sheet anyway, and it
 * keeps the two surfaces sharing a profile — worth stating rather than pretending otherwise.
 *
 * @param {object} opts
 * @param {number} opts.length      extent along X, centred on 0
 * @param {number} opts.height      extent along Y, centred on 0
 * @param {number} opts.thickness   sheet thickness
 * @param {number} opts.pitch       one full fold; should divide `length` — see `foldPitch`
 * @param {number} opts.depth       fold depth along Z
 * @param {number} [opts.crest=0.32] flat crest, as a fraction of the pitch
 * @param {number} [opts.trough=0.32] flat trough, as a fraction of the pitch
 */
export function corrugatedPanel({
  length, height, thickness, pitch, depth, crest = 0.32, trough = 0.32,
}) {
  const a = pitch * crest;
  const c = pitch * trough;
  const b = (pitch - a - c) / 2;
  const n = Math.max(1, Math.round(length / pitch));
  const hy = height / 2;

  // The fold profile, as [x, z] along the panel. Ends on a crest so a run of panels butts
  // together without a half fold at the seam.
  const prof = [];
  for (let i = 0; i < n; i++) {
    const x0 = -length / 2 + i * pitch;
    prof.push([x0, depth], [x0 + a, depth], [x0 + a + b, 0], [x0 + a + b + c, 0]);
  }
  prof.push([length / 2, depth]);

  const pos = [], uv = [];
  const P = (x, y, z) => [x, y, z];
  const quad = (p0, p1, p2, p3, u0, u1) => {
    tri(pos, uv, p0, p1, p2, [u0, 0], [u1, 0], [u1, 1]);
    tri(pos, uv, p0, p2, p3, [u0, 0], [u1, 1], [u0, 1]);
  };

  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, z0] = prof[i], [x1, z1] = prof[i + 1];
    const u0 = i / (prof.length - 1), u1 = (i + 1) / (prof.length - 1);

    // Outer face, +Z.
    quad(P(x0, -hy, z0), P(x1, -hy, z1), P(x1, hy, z1), P(x0, hy, z0), u0, u1);
    // Inner face, reversed so it faces -Z.
    quad(P(x0, hy, z0 - thickness), P(x1, hy, z1 - thickness),
      P(x1, -hy, z1 - thickness), P(x0, -hy, z0 - thickness), u0, u1);
    // Top and bottom edges, closing the sheet along its length.
    quad(P(x0, hy, z0), P(x1, hy, z1), P(x1, hy, z1 - thickness), P(x0, hy, z0 - thickness), u0, u1);
    quad(P(x0, -hy, z0 - thickness), P(x1, -hy, z1 - thickness),
      P(x1, -hy, z1), P(x0, -hy, z0), u0, u1);
  }

  // The two end caps.
  for (const [idx, sign] of [[0, -1], [prof.length - 1, 1]]) {
    const [x, z] = prof[idx];
    const p = [
      P(x, -hy, z), P(x, hy, z), P(x, hy, z - thickness), P(x, -hy, z - thickness),
    ];
    if (sign < 0) quad(p[0], p[1], p[2], p[3], 0, 1);
    else quad(p[3], p[2], p[1], p[0], 0, 1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return finish(geom);
}

/**
 * Sweep a closed convex 2D profile along a circular ARC about the Z axis.
 *
 * The straight-line twin of this is `extrudeProfile`, and the two are deliberately separate
 * functions rather than one with a `radius` option. The extruder's caps are flat and parallel
 * and its side band is a ruled surface; here the caps are splayed by the arc and every side quad
 * is a frustum of a cone. Bolting a curvature parameter onto the extruder would have meant
 * eleven existing subjects sharing a code path for a case none of them use — the argument the
 * project has already made twice about the shared MODELS contract, applied to a generator.
 *
 * A ring is the shape this could not previously make, and a ring is the whole of the portal
 * subject: three concentric rows of segments, each row a repeat of one arc at one pitch.
 *
 * Profile points are `[u, v]` in the swept plane: `u` is the RADIAL offset from `radius`
 * (positive = outboard) and `v` is along Z. Convex, either winding — `ensureCCW` normalises it,
 * exactly as the extruder does, and for the same reason: the caps are fanned from vertex 0 and
 * a fan is only safe on a convex loop.
 *
 * The arc is centred on the +X axis and spans `angle` radians, so a segment authored at zero
 * sits at three o'clock and a row is built by rotating copies about Z. Winding is outward on
 * every surface; `signedVolume` in the invariant suite is what says so rather than the eye.
 *
 * @param {object} opts
 * @param {Array<[number,number]>} opts.profile  section, as [radial offset, z]
 * @param {number} opts.radius                   sweep radius the profile's u = 0 rides on
 * @param {number} opts.angle                    arc swept, in radians
 * @param {number} [opts.segments=10]            steps along the arc
 */
export function arcSegment({ profile, radius, angle, segments = 10 }) {
  const pts = ensureCCW(profile);
  const n = pts.length;
  const steps = Math.max(1, Math.round(segments));

  const at = (i, phi) => {
    const [u, v] = pts[i];
    const r = radius + u;
    return [r * Math.cos(phi), r * Math.sin(phi), v];
  };

  // Perimeter parameterisation for the side band's V coordinate, as in `extrudeProfile`.
  const seg = [];
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    seg.push(perim);
    perim += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  const pos = [], uv = [];

  // Side band. Wound sweep-first then profile-first, which puts the normal at `t_sweep x
  // t_profile` — outboard on the outer face, and consistently outward everywhere else.
  for (let k = 0; k < steps; k++) {
    const p0 = -angle / 2 + (k / steps) * angle;
    const p1 = -angle / 2 + ((k + 1) / steps) * angle;
    const u0 = k / steps, u1 = (k + 1) / steps;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const v0 = seg[i] / perim;
      const v1 = (i === n - 1 ? perim : seg[i + 1]) / perim;
      const A = at(i, p0), B = at(i, p1), C = at(j, p1), D = at(j, p0);
      tri(pos, uv, A, B, C, [u0, v0], [u1, v0], [u1, v1]);
      tri(pos, uv, A, C, D, [u0, v0], [u1, v1], [u0, v1]);
    }
  }

  // End caps, fanned from vertex 0. The far cap faces +phi and the near one -phi, so the two
  // fans run in opposite orders — the same asymmetry the extruder's two caps have.
  const bb = profileBounds(pts);
  const capUV = (p) => [(p[0] - bb.minZ) / bb.dz, (p[1] - bb.minY) / bb.dy];
  for (let i = 1; i < n - 1; i++) {
    const far = [0, i + 1, i].map((k) => at(k, angle / 2));
    tri(pos, uv, far[0], far[1], far[2], capUV(pts[0]), capUV(pts[i + 1]), capUV(pts[i]));
    const near = [0, i, i + 1].map((k) => at(k, -angle / 2));
    tri(pos, uv, near[0], near[1], near[2], capUV(pts[0]), capUV(pts[i]), capUV(pts[i + 1]));
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return finish(geom);
}

/**
 * The angular layout of one row of ring segments.
 *
 * Returns a centre angle and a swept angle per segment, with `gap` of the pitch left open
 * between neighbours. The gap is not styling: every row is ONE InstancedMesh and therefore one
 * part id, so two segments that touched would show no seam at all — the failure the FD-4's bead
 * ran into, avoided here by the segments not touching in the first place.
 *
 * @param {number} count
 * @param {number} [gap=0.08]  fraction of the pitch left open
 */
export function ringLayout(count, gap = 0.08) {
  const pitch = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    angle: i * pitch,
    span: pitch * (1 - gap),
  }));
}

/**
 * A fold pitch that divides a panel exactly.
 *
 * A corrugated wall that ends on a half fold is a wall nobody pressed. Snapping the pitch to the
 * nearest whole count is one line, and it makes the corrugation a consequence of the panel's
 * size rather than a number that happens to look right at one length.
 */
export function foldPitch(length, nominal) {
  return length / Math.max(1, Math.round(length / nominal));
}
