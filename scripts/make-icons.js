#!/usr/bin/env node
/**
 * Generates the PWA icon set as real PNGs, with no dependencies.
 *
 * cairo/cairosvg are not available on this machine and adding a rasterizer dependency to a
 * project whose whole premise is "no build step" was not worth it. Node ships zlib, which is
 * the only hard part of a PNG encoder; the rest is a CRC table and four chunks.
 *
 * The mark is the vehicle's side silhouette on blueprint grid — the same two-blues-and-paper
 * palette as the viewer, so the installed icon and the app read as one thing.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

const INK = [0x14, 0x31, 0x4f];
const PAPER = [0xe8, 0xee, 0xf6];
const MID = [0x53, 0x74, 0x9c];
const GRID = [0x2a, 0x4c, 0x6e];

// --- tiny raster surface ---------------------------------------------------

const SS = 4;   // supersample factor; downsampled at write time

function surface(size) {
  const w = size * SS;
  const px = new Float64Array(w * w * 3);
  return {
    w,
    fill(rgb) {
      for (let i = 0; i < w * w; i++) {
        px[i * 3] = rgb[0]; px[i * 3 + 1] = rgb[1]; px[i * 3 + 2] = rgb[2];
      }
    },
    set(x, y, rgb, a = 1) {
      if (x < 0 || y < 0 || x >= w || y >= w) return;
      const i = (y * w + x) * 3;
      px[i] += (rgb[0] - px[i]) * a;
      px[i + 1] += (rgb[1] - px[i + 1]) * a;
      px[i + 2] += (rgb[2] - px[i + 2]) * a;
    },
    /** Even-odd scanline fill of a closed polygon given in 0..1 unit coordinates. */
    poly(points, rgb, a = 1) {
      const pts = points.map(([x, y]) => [x * w, y * w]);
      let minY = Infinity, maxY = -Infinity;
      for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(w - 1, Math.ceil(maxY)); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
          if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
            xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
          }
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.set(x, y, rgb, a);
        }
      }
    },
    disc(cx, cy, r, rgb, a = 1) {
      const CX = cx * w, CY = cy * w, R = r * w;
      for (let y = Math.floor(CY - R); y <= Math.ceil(CY + R); y++) {
        for (let x = Math.floor(CX - R); x <= Math.ceil(CX + R); x++) {
          if ((x - CX) ** 2 + (y - CY) ** 2 <= R * R) this.set(x, y, rgb, a);
        }
      }
    },
    ring(cx, cy, r, thickness, rgb, a = 1) {
      const CX = cx * w, CY = cy * w, R = r * w, T = thickness * w;
      for (let y = Math.floor(CY - R - T); y <= Math.ceil(CY + R + T); y++) {
        for (let x = Math.floor(CX - R - T); x <= Math.ceil(CX + R + T); x++) {
          const d = Math.hypot(x - CX, y - CY);
          if (Math.abs(d - R) <= T / 2) this.set(x, y, rgb, a);
        }
      }
    },
    rect(x0, y0, x1, y1, rgb, a = 1) {
      this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], rgb, a);
    },
    /** Box-downsample to `size` and encode as RGBA PNG. */
    png(size) {
      const raw = Buffer.alloc(size * (size * 4 + 1));
      let p = 0;
      for (let y = 0; y < size; y++) {
        raw[p++] = 0;   // filter: none
        for (let x = 0; x < size; x++) {
          let r = 0, g = 0, b = 0;
          for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) {
              const i = ((y * SS + sy) * w + (x * SS + sx)) * 3;
              r += px[i]; g += px[i + 1]; b += px[i + 2];
            }
          }
          const n = SS * SS;
          raw[p++] = Math.round(r / n);
          raw[p++] = Math.round(g / n);
          raw[p++] = Math.round(b / n);
          raw[p++] = 255;
        }
      }
      return encodePNG(size, size, raw);
    },
  };
}

// --- PNG container ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rawRGBA) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawRGBA, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the mark --------------------------------------------------------------

/**
 * @param {number} size  output pixel size
 * @param {number} inset content is drawn inside this margin. Maskable icons get 0.14 so the
 *                       whole mark survives a circular or squircle mask; standard icons get 0.06.
 */
function drawIcon(size, inset) {
  const s = surface(size);
  s.fill(INK);

  // Grid paper, drawn full-bleed so the mask never cuts into blank corners.
  const pitch = 1 / 8;
  for (let i = 1; i < 8; i++) {
    s.rect(i * pitch - 0.002, 0, i * pitch + 0.002, 1, GRID);
    s.rect(0, i * pitch - 0.002, 1, i * pitch + 0.002, GRID);
  }

  // Map unit coordinates into the safe area.
  const k = 1 - inset * 2;
  const X = (v) => inset + v * k;
  const Y = (v) => inset + v * k;
  const S = (v) => v * k;

  // Track band, drawn as an outline so the icon reads as line art at 48px.
  s.rect(X(0.06), Y(0.70), X(0.94), Y(0.86), MID);
  s.rect(X(0.09), Y(0.725), X(0.91), Y(0.835), INK);
  for (let i = 0; i < 5; i++) {
    s.disc(X(0.155 + i * 0.175), Y(0.78), S(0.052), MID);
  }

  // Hull, with the sloped glacis carried by the hull outline itself. Drawing the nose as a
  // separate triangle left a visible notch where the two polygons met.
  s.poly([
    [X(0.06), Y(0.70)], [X(0.06), Y(0.54)], [X(0.78), Y(0.54)],
    [X(0.96), Y(0.63)], [X(0.96), Y(0.70)],
  ], PAPER);

  // Turret + gun.
  s.poly([
    [X(0.26), Y(0.54)], [X(0.31), Y(0.34)], [X(0.62), Y(0.34)], [X(0.70), Y(0.54)],
  ], PAPER);
  s.rect(X(0.62), Y(0.40), X(0.99), Y(0.455), PAPER);

  // Centre-line datum mark through the turret ring — the schematic tell.
  s.rect(X(0.470), Y(0.22), X(0.485), Y(0.62), MID, 0.85);
  s.ring(X(0.4775), Y(0.54), S(0.075), S(0.016), MID, 0.9);

  return s.png(size);
}

mkdirSync(OUT, { recursive: true });

const STANDARD = [192, 512, 180, 167, 152, 120];
for (const size of STANDARD) {
  const name = size === 192 || size === 512 ? `icon-${size}.png` : `apple-touch-icon-${size}.png`;
  writeFileSync(join(OUT, name), drawIcon(size, 0.06));
  console.log(`  icons/${name}`);
}
writeFileSync(join(OUT, 'icon-maskable-512.png'), drawIcon(512, 0.14));
console.log('  icons/icon-maskable-512.png  (0.14 safe-area inset)');
