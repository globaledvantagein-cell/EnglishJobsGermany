/**
 * One-time favicon generator. Reads public/logo.jpeg and writes:
 *   public/favicon.ico          (32x32, PNG-in-ICO container)
 *   public/favicon-32x32.png
 *   public/favicon-16x16.png
 *   public/apple-touch-icon.png (180x180)
 *
 * Run from frontend-next/:  node src/scripts/generate-favicons.js
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const SRC = path.join(PUBLIC, 'logo.jpeg');

async function png(size) {
  return sharp(SRC)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

/** Wrap a single PNG in an ICO container (every modern browser accepts PNG-encoded ICO entries). */
function pngToIco(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2);  // palette
  entry.writeUInt8(0, 3);  // reserved
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // data offset

  return Buffer.concat([header, entry, pngBuf]);
}

(async () => {
  if (!fs.existsSync(SRC)) throw new Error('Missing ' + SRC);

  const p32 = await png(32);
  const p16 = await png(16);
  const p180 = await png(180);

  fs.writeFileSync(path.join(PUBLIC, 'favicon-32x32.png'), p32);
  fs.writeFileSync(path.join(PUBLIC, 'favicon-16x16.png'), p16);
  fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), p180);
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), pngToIco(p32, 32));

  console.log('Wrote favicon.ico, favicon-32x32.png, favicon-16x16.png, apple-touch-icon.png to public/');
})().catch(err => { console.error(err); process.exit(1); });
