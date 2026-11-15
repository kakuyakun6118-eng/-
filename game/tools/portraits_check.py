#!/usr/bin/env python3
"""肖像の検査。
  python3 tools/portraits_check.py          … 結果を表示(足りなくても正常終了)
  python3 tools/portraits_check.py --strict … 全員ぶんそろっていなければ失敗
調べること:全人物IDに画像があるか / 必要な年齢差分があるか / 開けない画像・大きさの違う画像がないか /
別人に同じ画像(まったく同じ、またはほぼ同じ)を使っていないか / 人物IDでない名前の画像がないか / ほぼ単色の絵(仮の絵)でないか"""
import json, os, sys, hashlib
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..')
need = json.load(open(os.path.join(ROOT, 'docs', 'portraits', 'prompts.json'), encoding='utf-8'))['prompts']
ids = {k.split('@')[0].replace('.webp', '') for k in need}
# --dir <フォルダ> で、検査する置き場を変えられる
d = sys.argv[sys.argv.index('--dir') + 1] if '--dir' in sys.argv else os.path.join(ROOT, 'public', 'portraits')
files = sorted(f for f in os.listdir(d) if os.path.splitext(f)[1].lower() in ('.webp', '.png', '.jpg', '.jpeg')) if os.path.isdir(d) else []
have = {os.path.splitext(f)[0]: f for f in files}
problems = []; hashes = {}; ahash = {}
def average_hash(im):
    g = im.convert('L').resize((16, 16), Image.LANCZOS); px = list(g.tobytes()); m = sum(px) / len(px)
    return sum(1 << i for i, v in enumerate(px) if v > m)
for base, f in have.items():
    pid = base.split('@')[0]
    if pid not in ids: problems.append(f'人物IDでない名前の画像: {f}'); continue
    try:
        im = Image.open(os.path.join(d, f)); im.load()
    except Exception as e:
        problems.append(f'開けない画像: {f} ({e})'); continue
    if im.size != (256, 256): problems.append(f'大きさが256×256でない: {f} {im.size}')
    rgb = im.convert('RGB'); colors = rgb.resize((32, 32)).getcolors(2000)
    if colors is not None and len(colors) < 40: problems.append(f'色の数が少なすぎる(仮の絵や図形の疑い): {f}')
    h = hashlib.sha256(rgb.tobytes()).hexdigest()
    if h in hashes and hashes[h].split('@')[0] != pid: problems.append(f'別人に同じ画像: {f} と {have[hashes[h]]}')
    hashes.setdefault(h, base)
    ah = average_hash(rgb)
    for other, oh in ahash.items():
        if other.split('@')[0] != pid and bin(ah ^ oh).count('1') <= 6: problems.append(f'別人なのに、ほぼ同じ画像: {f} と {have[other]}')
    ahash[base] = ah
missing = [k for k in need if os.path.splitext(k)[0] not in have]
base_missing = [k for k in missing if '@' not in k]
print(f'必要な画像 {len(need)} 枚(基本 {len(ids)} + 年齢差分 {len(need) - len(ids)}) / 置いてある画像 {len(files)} 枚 / 足りない画像 {len(missing)} 枚(うち基本 {len(base_missing)})')
if problems:
    print('問題:'); [print('  ' + p) for p in problems[:60]]
if missing and len(missing) <= 40: print('足りない画像:', ' '.join(missing))
strict = '--strict' in sys.argv
sys.exit(1 if problems or (strict and missing) else 0)
