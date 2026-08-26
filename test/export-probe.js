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
  // Node names differ per subject; the *contract* does not. Resolve the pivots from the
  // declared joints so this probe works for any model the viewer can load.
  const joints = root.userData.joints || [];
  const azimuthNode = joints.find((j) => j.key === 'azimuth')?.targets[0].node;
  const elevationNode = joints.find((j) => j.key === 'elevation')?.targets[0].node;
  const proxy = root.children.find((c) => c.userData.isCollision);
  if (proxy) proxy.visible = true;

  const buf = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: false, trs: true });
  });
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const names = json.nodes.map((n) => n.name);
  const wanted = [root.name, 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group',
                  azimuthNode, elevationNode, proxy?.name].filter(Boolean);
  const turretIdx = names.indexOf(azimuthNode);
  const barrelIdx = names.indexOf(elevationNode);
  return JSON.stringify({
    subject: root.name,
    kb: Math.round(buf.byteLength / 1024),
    nodeCount: names.length,
    missing: wanted.filter((w) => !names.includes(w)),
    azimuthPivot: [azimuthNode, json.nodes[turretIdx]?.translation],
    elevationPivot: [elevationNode, json.nodes[barrelIdx]?.translation],
    elevationUnderAzimuth: !!json.nodes[turretIdx]?.children?.includes(barrelIdx),
    meshes: (json.meshes || []).length,
    hasUV1: JSON.stringify(json.meshes || []).includes('TEXCOORD_1'),
    extensions: json.extensionsUsed || [],
  });
})()
