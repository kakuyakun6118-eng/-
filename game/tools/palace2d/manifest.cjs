// 2Dの後宮の画像の目録を作る(public/palace2d/ を調べ、src/palace2d/manifest.json に書く)。ビルドのたびに動く
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '../../public/palace2d');
const out = { portraits: {}, bg: {}, ev: {}, count: 0, bytes: 0 };
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
for (const f of walk(path.join(root, 'p'))) {
  const m = /^([A-Z]\d{2}|A\d)_([a-z]+)-l\.webp$/.exec(f); if (!m) continue;
  (out.portraits[m[1]] ??= {})[m[2]] = 1; out.count++; out.bytes += fs.statSync(path.join(root, 'p', f)).size;
}
for (const f of walk(path.join(root, 'bg'))) {
  const m = /^([a-zA-Z]+)_(morning|day|evening|night)-l\.webp$/.exec(f); if (!m) continue;
  (out.bg[m[1]] ??= {})[m[2]] = 1; out.count++; out.bytes += fs.statSync(path.join(root, 'bg', f)).size;
}
for (const f of walk(path.join(root, 'ev'))) {
  const m = /^ev_([a-z]+)-l\.webp$/.exec(f); if (!m) continue;
  out.ev[m[1]] = 1; out.count++; out.bytes += fs.statSync(path.join(root, 'ev', f)).size;
}
fs.writeFileSync(path.join(__dirname, '../../src/palace2d/manifest.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`palace2d: 画像 ${out.count} 枚(大きい版 ${Math.round(out.bytes / 1024)}KB)`);
