// public/portraits にある肖像画像の一覧を、src/data/portraits.manifest.json に書き出す。
// (画面は、この一覧にある画像だけを読みに行く。無い画像を探して通信の失敗を起こさないため)
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'portraits');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).sort() : [];
fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'portraits.manifest.json'), JSON.stringify({ files }, null, 1) + '\n');
console.log('portraits:', files.length);
