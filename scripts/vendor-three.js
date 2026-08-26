#!/usr/bin/env node
/**
 * Copies the pieces of `three` we actually use out of node_modules and into vendor/,
 * so the app can run from a plain static server with an <script type="importmap">
 * and no bundler. Re-run after bumping the three version in package.json.
 */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'three');
const dst = join(root, 'vendor', 'three');

const files = [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/controls/OrbitControls.js', 'addons/controls/OrbitControls.js'],
  ['examples/jsm/renderers/CSS2DRenderer.js', 'addons/renderers/CSS2DRenderer.js'],
  ['examples/jsm/exporters/GLTFExporter.js', 'addons/exporters/GLTFExporter.js'],
];

for (const [from, to] of files) {
  const target = join(dst, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(src, from), target);
  console.log(`  ${to}`);
}

const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
writeFileSync(join(dst, 'VERSION'), `${version}\n`);
console.log(`vendored three@${version} -> vendor/three/`);
