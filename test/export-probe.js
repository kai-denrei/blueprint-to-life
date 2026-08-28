/**
 * GLTF export round-trip probe.
 *
 * Not a unit test — it needs a live WebGL page. Run it against the dev server with:
 *
 *   node scripts/shot.js http://127.0.0.1:5173/ /tmp/exp.png "$(cat test/export-probe.js)"
 *
 * It exports the scene graph to GLB in the browser, parses the GLB's JSON chunk back, and
 * reports the properties Phase 5 actually depends on: that the spec's node names survive, that
 * driven pivots keep their parent/child nesting, that they carry a readable TRS rather than a
 * collapsed matrix, that TEXCOORD_1 exists, and that instanced running gear survives as GPU
 * instancing rather than being flattened.
 *
 * Everything it looks for is resolved from the subject's own declared joints, so it works
 * unchanged on the unarmed, wheel-less, legged subjects as well as on the tanks.
 *
 * Expected, as of 2026-08-28:
 *   /                    Turret_Pivot [0, 1.66, -0.35]   = DIM.turret ring centre
 *                        Barrel_Pivot [0, 0.32, 0.95]    = DIM.barrel trunnion
 *                        nesting Turret_Pivot > Barrel_Pivot true
 *                        extensions include EXT_mesh_gpu_instancing
 *   ?subject=headless    nesting Waist_Yaw > Waist_Pitch and Shoulder_L_Pivot > Elbow_L_Pivot
 *                        no EXT_mesh_gpu_instancing — nothing on it is instanced
 *   every subject        missing []   hasUV1 true   no pivot reported as MATRIX
 *
 * Still unverified: nothing has imported the GLB into a second engine. Round-tripping through
 * three's own exporter proves the file is well-formed, not that Unity or Unreal rigs it.
 */
(async () => {
  // Node names differ per subject; the *contract* does not. Resolve the pivots from the
  // declared joints so this probe works for any model the viewer can load.
  const joints = root.userData.joints || [];
  // Not `azimuth` and `elevation` by name — those two keys only exist on the armed subjects, and
  // BP-Headless01 has neither. Take the first target of every declared joint instead: the
  // property Phase 5 actually depends on is that *driven* pivots survive with a readable
  // translation, whatever the machine happens to call them.
  const drivenNodes = [...new Set(joints.map((j) => j.targets[0].node))];
  // Traversed, not read off root.children: a legged subject hangs everything — the collider
  // included — under a body group whose height is written from the leg pose, so the proxy is a
  // grandchild there. Same reason main.js stopped keeping a list of proxy names.
  let proxy = null;
  root.traverse((o) => { if (!proxy && o.userData.isCollision) proxy = o; });
  if (proxy) proxy.visible = true;

  const buf = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: false, trs: true });
  });
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const names = json.nodes.map((n) => n.name);
  // Only demand what this subject actually claims to have. BP-Headless01 is unarmed and has no
  // running gear, so requiring Barrel_Mesh and Wheels_Instanced of it would report a missing
  // node for geometry it is correct not to carry. The contract is "every named node survives
  // the round trip", not "every subject is an armed vehicle with wheels".
  const has = (n) => !!root.getObjectByName(n);
  const wanted = [root.name, 'Details_Group', ...drivenNodes, proxy?.name,
                  ...['Barrel_Mesh', 'Wheels_Instanced'].filter(has)].filter(Boolean);

  // Nesting: for each driven pivot that has another driven pivot as its parent in the live
  // graph, check the GLB kept that edge. A pivot chain that flattens on export is the failure
  // this probe exists for — a rigger on the other side gets a trunnion in world space.
  const nesting = drivenNodes.flatMap((child) => {
    const live = root.getObjectByName(child);
    const parent = live?.parent?.name;
    if (!drivenNodes.includes(parent)) return [];
    const pi = names.indexOf(parent), ci = names.indexOf(child);
    return [[`${parent} > ${child}`, !!json.nodes[pi]?.children?.includes(ci)]];
  });

  return JSON.stringify({
    subject: root.name,
    kb: Math.round(buf.byteLength / 1024),
    nodeCount: names.length,
    missing: wanted.filter((w) => !names.includes(w)),
    // A `matrix` on the node means trs:true did not take and a rigger has to decompose it to
    // find the joint origin. An *absent* `translation` is not that — glTF omits it when the node
    // sits at its parent's origin, which most of a limb chain's pivots legitimately do.
    pivots: drivenNodes.map((n) => {
      const node = json.nodes[names.indexOf(n)];
      return [n, node?.matrix ? 'MATRIX' : (node?.translation ?? [0, 0, 0])];
    }),
    nesting,
    meshes: (json.meshes || []).length,
    hasUV1: JSON.stringify(json.meshes || []).includes('TEXCOORD_1'),
    extensions: json.extensionsUsed || [],
  });
})()
