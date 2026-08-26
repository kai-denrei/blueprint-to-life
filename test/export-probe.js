/**
 * GLTF export round-trip probe.
 *
 * Not a unit test — it needs a live WebGL page. Run it against the dev server with:
 *
 *   node scripts/shot.js http://127.0.0.1:5173/ /tmp/exp.png "$(cat test/export-probe.js)"
 *
 * It exports the scene graph to GLB in the browser, parses the GLB's JSON chunk back, and
 * reports the properties Phase 5 actually depends on: that the spec's node names survive,
 * that Barrel_Pivot is still a child of Turret_Pivot, that both pivots carry a readable
 * `translation` (not a collapsed matrix), that TEXCOORD_1 exists, and that the road wheels
 * survive as GPU instancing rather than being flattened.
 *
 * Expected, as of 2026-08-26:
 *   turretTranslation [0, 1.66, -0.35]   = DIM.turret ring centre
 *   barrelTranslation [0, 0.32, 0.95]    = DIM.barrel trunnion
 *   missing []   barrelUnderTurret true   hasUV1 true
 *   extensions include EXT_mesh_gpu_instancing
 *
 * Still unverified: nothing has imported the GLB into a second engine. Round-tripping through
 * three's own exporter proves the file is well-formed, not that Unity or Unreal rigs it.
 */
(async () => {
  const buf = await new Promise((resolve, reject) => {
    root.getObjectByName('Hull_Collision').visible = true;
    new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: false, trs: true });
  });
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const names = json.nodes.map((n) => n.name);
  const wanted = ['Tank_Root', 'Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
                  'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'];
  const turretIdx = names.indexOf('Turret_Pivot');
  const barrelIdx = names.indexOf('Barrel_Pivot');
  return JSON.stringify({
    kb: Math.round(buf.byteLength / 1024),
    nodeCount: names.length,
    missing: wanted.filter((w) => !names.includes(w)),
    turretTranslation: json.nodes[turretIdx]?.translation,
    barrelTranslation: json.nodes[barrelIdx]?.translation,
    barrelUnderTurret: !!json.nodes[turretIdx]?.children?.includes(barrelIdx),
    meshes: (json.meshes || []).length,
    hasUV1: JSON.stringify(json.meshes || []).includes('TEXCOORD_1'),
    extensions: json.extensionsUsed || [],
  });
})()
