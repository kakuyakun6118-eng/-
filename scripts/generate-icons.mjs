// Generates simple flat map-pin PNG icons for the PWA without external deps.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [43, 108, 176]; // #2b6cb0
  const white = [255, 255, 255];
  const cx = size / 2;
  const cy = size * 0.42;
  const pinRadius = size * 0.22;
  const tipY = size * 0.78;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      rgba[idx] = bg[0];
      rgba[idx + 1] = bg[1];
      rgba[idx + 2] = bg[2];
      rgba[idx + 3] = 255;

      const dx = x - cx;
      const dy = y - cy;
      const distCircle = Math.sqrt(dx * dx + dy * dy);

      // Pin body: circle + triangular tip pointing down.
      let inPin = distCircle <= pinRadius;
      if (!inPin && y > cy && y <= tipY) {
        const t = (y - cy) / (tipY - cy);
        const halfWidth = pinRadius * (1 - t);
        if (Math.abs(dx) <= halfWidth) inPin = true;
      }
      if (inPin) {
        rgba[idx] = white[0];
        rgba[idx + 1] = white[1];
        rgba[idx + 2] = white[2];
        rgba[idx + 3] = 255;
      }

      // Inner dot (brand-colored hole) to look like a map pin.
      const innerDist = Math.sqrt(dx * dx + dy * dy);
      if (innerDist <= pinRadius * 0.42) {
        rgba[idx] = bg[0];
        rgba[idx + 1] = bg[1];
        rgba[idx + 2] = bg[2];
        rgba[idx + 3] = 255;
      }
    }
  }
  return rgba;
}

const sizes = [192, 512, 180];
for (const size of sizes) {
  const png = encodePNG(size, size, drawIcon(size));
  const outPath = join("public", "icons", `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath}`);
}
