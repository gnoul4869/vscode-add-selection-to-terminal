'use strict';

/**
 * Generates resources/icon.png from the shapes in resources/icon.svg.
 *
 * vsce refuses SVG icons, so the icon is rasterized here instead of committing a
 * binary blob that nobody can review. Run with `node scripts/make-icon.js`.
 * No dependencies: the PNG is written by hand (zlib for the data chunk).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 128;
const SSAA = 4; // render at SIZE * SSAA, then average down to SIZE
const W = SIZE * SSAA;

/** @param {string} hex */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const C = {
  bg: rgb('#1F2430'),
  border: rgb('#3C4657'),
  panel: rgb('#2E3646'),
  panelLine: rgb('#5B6C8C'),
  code: rgb('#7FD1FF'),
  accent: rgb('#F0B458'),
  term: rgb('#12161E'),
  prompt: rgb('#8BE6A8'),
};

/** Signed distance to a rounded box centred at (cx, cy) with half-size h. */
function sdRoundBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Distance to a polyline; round joins and caps fall out of plain distance. */
function distToPolyline(x, y, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(
      best,
      distToSegment(x, y, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]),
    );
  }
  return best;
}

/** Painter's-algorithm layer: fill or stroke a shape in a solid colour. */
const layers = [
  { kind: 'fill', sd: (x, y) => sdRoundBox(x, y, 64, 64, 60, 60, 24), color: C.bg },
  { kind: 'stroke', sd: (x, y) => sdRoundBox(x, y, 64, 64, 59, 59, 23), width: 2, color: C.border },
  { kind: 'fill', sd: (x, y) => sdRoundBox(x, y, 45, 49, 27, 23, 6), color: C.panel },
  { kind: 'stroke', sd: (x, y) => sdRoundBox(x, y, 45, 49, 27, 23, 6), width: 2, color: C.panelLine },
  { kind: 'poly', points: [[32, 40], [23, 49], [32, 58]], width: 4, color: C.code },
  { kind: 'poly', points: [[58, 40], [67, 49], [58, 58]], width: 4, color: C.code },
  { kind: 'poly', points: [[26, 62], [46, 62]], width: 3, color: C.panelLine },
  { kind: 'poly', points: [[74, 49], [90, 49]], width: 4, color: C.accent },
  { kind: 'poly', points: [[84, 41], [94, 49], [84, 57]], width: 4, color: C.accent },
  { kind: 'fill', sd: (x, y) => sdRoundBox(x, y, 74, 91, 36, 21, 8), color: C.term },
  { kind: 'stroke', sd: (x, y) => sdRoundBox(x, y, 74, 91, 36, 21, 8), width: 2, color: C.accent },
  { kind: 'poly', points: [[50, 82], [59, 90], [50, 98]], width: 4, color: C.prompt },
  { kind: 'fill', sd: (x, y) => sdRoundBox(x, y, 73, 93, 5, 7, 2), color: C.accent },
];

/**
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number]}
 */
function colorAt(x, y) {
  let color = [0, 0, 0];
  for (const layer of layers) {
    let inside = false;
    if (layer.kind === 'fill') inside = layer.sd(x, y) <= 0;
    else if (layer.kind === 'stroke') inside = Math.abs(layer.sd(x, y)) <= layer.width / 2;
    else inside = distToPolyline(x, y, layer.points) <= layer.width / 2;
    if (inside) color = layer.color;
  }
  return color;
}

function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SSAA; sy += 1) {
        for (let sx = 0; sx < SSAA; sx += 1) {
          const [cr, cg, cb] = colorAt(px + (sx + 0.5) / SSAA, py + (sy + 0.5) / SSAA);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const samples = SSAA * SSAA;
      const o = (py * SIZE + px) * 4;
      pixels[o] = Math.round(r / samples);
      pixels[o + 1] = Math.round(g / samples);
      pixels[o + 2] = Math.round(b / samples);
      pixels[o + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function encodePng(pixels, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'resources', 'icon.png');
fs.writeFileSync(out, encodePng(render(), SIZE, SIZE));
console.log(`wrote ${out}`);
