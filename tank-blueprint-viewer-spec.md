# Procedural Tank + Blueprint Schematic Viewer — Build Spec

## Goal
Build a Three.js scene graph of a tank from code (no imported GLTF/OBJ), rendered two ways:
1. A blueprint/technical-schematic viewer (reference: "Obsidian Dynamics MK VI Doomforge" style — grid paper background, edge-detected outline shading, title block, instrumentation readout, view/explode toggles).
2. The same scene graph droppable into a game with PBR materials swapped in.

The scene graph is the actual deliverable. The blueprint shader is a display mode on top of it, not baked into the asset.

## Reference material
- Geometry proportions/part placement: https://www.the-blueprints.com/blueprints/tanks/ (free ortho line art, browse by nation/era) and https://drawingdatabase.com/m1-abrams/ (clean single-image ortho blueprints, also has Leopard 2 / T-14 / T-54 / T-64 under related). Use these to get hull length/width/height ratios, road wheel count and spacing, turret proportions right — trace over them in the orthographic camera, don't eyeball.
- Do NOT use these as reference for the blueprint *aesthetic* — that's a post-processing problem, not a line-art problem. See below.
- If the design brief is a fictional/stylized vehicle (not a 1:1 real MBT), treat blueprints as proportion sanity-check only — deliberately deviate for silhouette personality.

## Phase 1 — Geometry (game-asset-first design)
Build hull → turret → barrel as a THREE.Object3D hierarchy from primitives (BoxGeometry, CylinderGeometry, LatheGeometry, custom BufferGeometry for anything non-primitive). Road wheels/track links as InstancedMesh, not N separate meshes.

Naming and structure MUST be game-engine-portable from the start, since this hierarchy is the asset:
- `Tank_Root` (Object3D)
  - `Hull_Mesh` (render mesh) + `Hull_Collision` (separate simplified box/convex proxy — do not reuse render geo as collider)
  - `Turret_Pivot` (Object3D, rotation.y drives azimuth) → `Turret_Mesh`
  - `Barrel_Pivot` (Object3D, child of Turret_Pivot, rotation.x drives elevation) → `Barrel_Mesh`
  - `Wheels_Instanced` (InstancedMesh, one per side or combined with instance matrix per wheel)
  - `Details_Group` (hatches, dischargers, sights, stowage — small meshes, low priority for LOD)
- Keep pivots at their true mechanical origin (turret ring center, trunnion point) — this is what makes azimuth/elevation and later Animator/Skeleton rigging in other engines trivial to rebuild.
- Generate real UV2 (box/planar unwrap is fine) even though the blueprint shader doesn't need it — retrofitting UVs after the fact is the actual time sink, per prior analysis.
- Explode view: store each mesh's rest local position at generation time; explode = lerp along a stored per-part radial/axial offset vector, not a hardcoded animation.

## Phase 2 — Blueprint shader (separate, reusable, prototype in isolation)
This is the uncertain/hard part — do this before investing more in tank detail.
- Render normal + depth buffers (MRT or extra pass).
- Fullscreen post pass: Sobel/discontinuity filter over depth+normal → crisp outline independent of view angle and mesh density. Do not use per-mesh wireframe/edge overlays — stated to look inferior to true post-process outlining.
- Composite outline over a flat-shaded base pass, blue-grey ink palette.
- Grid background: separate orthographic full-screen quad or procedural shader grid, not scene geometry.
- Build and test this against a single primitive (a box) first, not the tank, to isolate bugs.
- Land this in the existing display-renderer parts-bin project rather than as a one-off — it's reusable outside tanks.

## Phase 3 — Camera
- Orthographic for front/side/plan elevations; perspective for iso/3-4 views.
- Switching ortho↔perspective: cross-fade or snap-and-ease, not true interpolation (can't lerp projection matrices meaningfully).

## Phase 4 — Annotation/UI chrome
- CSS2DRenderer or screen-projected sprites for numbered leader-line callouts, pinned to 3D anchor points.
- Title block, instrumentation readout, view/mode button row: plain HTML/CSS overlay, not Three.js geometry.
- Build this as a template independent of subject: the source author reused the identical schematic-chrome layout (title block, key-to-items legend, instrumentation panel, view buttons) for an unrelated "Robotic Jellyfish Simulator" schematic — same UI, different subject and readout fields. Confirms Phase 4 should take subject-specific data (title, part list, instrumentation labels/values) as config/props rather than being hardcoded per-vehicle, so the same chrome renders for a tank, a jellyfish robot, or anything else without rebuilding the layer.

## Phase 5 — Game-asset export path (when ready to reuse)
- `GLTFExporter` from the live Three.js scene → GLTF/GLB. This bakes the procedural geometry to a static mesh — proportions become fixed at export time, so finalize geometry before exporting.
- Re-verify pivot origins survive export (GLTF preserves node hierarchy and local transforms, so Turret_Pivot/Barrel_Pivot should carry over correctly if built per Phase 1 naming).
- For non-Three.js engines: rebuild articulation as bones/Animator states manually — hierarchy names above map 1:1 to what needs rigging.
- Materials: blueprint shader is display-only, do not export it — swap to MeshStandardMaterial with real albedo/normal/roughness textures for game use.
- Add LOD tiers and confirm collision proxies are separate assets before treating as done.

## Non-goals for v1
- No physics-simulated tracks (visual instanced geometry only).
- No accurate armor/ballistics values — instrumentation readout is cosmetic.
- No import of any external 3D asset — everything procedural, per the source project's constraint.
