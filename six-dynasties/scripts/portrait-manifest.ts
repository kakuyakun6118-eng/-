/*
 * `public/portraits/` に置かれた画を数え、`src/data/portraits.json` を作り直す。
 *   npm run portraits
 *
 * 画は一枚ずつ足していけるようにしてあるので、**足したらこれを走らせる。**
 * ファイル名は `<役>_<年の帯>_<番号>.webp`（例 `emperor_old_3.webp`）。
 * 役は emperor / empress / prince / chancellor / marshal / chieftain / north、
 * 年の帯は young / mid / old（胡族の女性だけ female）
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'portraits');
const OUT = join(process.cwd(), 'src', 'data', 'portraits.json');

const manifest: Record<string, Record<string, string[]>> = {};
const skipped: string[] = [];

for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith('.webp') && !file.endsWith('.png') && !file.endsWith('.jpg')) continue;
  const stem = file.replace(/\.[^.]+$/, '');
  const parts = stem.split('_');
  // <役>_<帯>_<番号>
  if (parts.length < 3) {
    skipped.push(file);
    continue;
  }
  const [role, band] = parts;
  manifest[role] ??= {};
  manifest[role][band] ??= [];
  manifest[role][band].push(file);
}

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);

for (const [role, bands] of Object.entries(manifest)) {
  const counts = Object.entries(bands)
    .map(([band, list]) => `${band} ${list.length}`)
    .join('／');
  console.log(`  ${role}: ${counts}`);
}
if (skipped.length > 0) console.log(`  名の形が違って読み飛ばした: ${skipped.join(', ')}`);
