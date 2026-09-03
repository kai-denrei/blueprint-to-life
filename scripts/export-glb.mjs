#!/usr/bin/env node
/**
 * Export a subject to .glb from Node — no browser, no download dialog.
 *
 *   node scripts/export-glb.mjs <subjectId> <out.glb>
 *
 * The builders are DOM-free (the invariants test already runs them under Node), and three's
 * GLTFExporter needs only a FileReader for its binary packing, shimmed below. Same options as
 * the page's export button: binary, collision proxies INCLUDED (onlyVisible false) so the
 * consumer decides what to drop, as the game does by name.
 */
import { writeFileSync } from 'node:fs';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SUBJECTS } from '../src/subjects/index.js';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend && this.onloadend(); });
    }
    readAsDataURL() { throw new Error('images are not exported from Node'); }
  };
}

const [, , id, out] = process.argv;
const entry = SUBJECTS[id];
if (!entry || !out) {
  console.error(`usage: export-glb.mjs <${Object.keys(SUBJECTS).join('|')}> <out.glb>`);
  process.exit(2);
}
const root = entry.subject.build();
root.updateMatrixWorld(true);
const data = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
writeFileSync(out, Buffer.from(data));
let nodes = 0, meshes = 0;
root.traverse((o) => { nodes++; if (o.isMesh) meshes++; });
console.log(`${id} -> ${out}: ${(data.byteLength / 1024).toFixed(0)} KB, ${nodes} nodes, ${meshes} meshes`);
