#!/usr/bin/env python3
"""できあがった肖像を取り込む。
  python3 tools/portraits_import.py <画像のあるフォルダ>
ファイル名(拡張子を除く)が「人物ID」か「人物ID@年」のものを、256×256 の WebP にして public/portraits/ に置く。
名前が人物IDでないものは取り込まず、一覧に出す。正方形でない絵は、中央を正方形に切り出す。"""
import json, os, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..')
ids = {p['id'] for f in ('s317.persons.json', 'persons.extra.json') for p in json.load(open(os.path.join(ROOT, 'src', 'data', 'scenarios', f), encoding='utf-8'))['persons']}
src = sys.argv[1] if len(sys.argv) > 1 else None
if not src or not os.path.isdir(src): sys.exit('使い方: python3 tools/portraits_import.py <画像のあるフォルダ>')
dst = os.path.join(ROOT, 'public', 'portraits'); os.makedirs(dst, exist_ok=True)
done, skipped = 0, []
for name in sorted(os.listdir(src)):
    base, ext = os.path.splitext(name)
    if ext.lower() not in ('.webp', '.png', '.jpg', '.jpeg'): continue
    pid = base.split('@')[0]
    if pid not in ids or (('@' in base) and not base.split('@')[1].isdigit()): skipped.append(name); continue
    try:
        im = Image.open(os.path.join(src, name)).convert('RGB')
    except Exception as e:
        skipped.append(f'{name}(開けない: {e})'); continue
    w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((256, 256), Image.LANCZOS)
    im.save(os.path.join(dst, base + '.webp'), 'WEBP', quality=86, method=6); done += 1
print('取り込んだ画像:', done)
if skipped: print('取り込まなかったもの(名前が人物IDでない、または開けない):', skipped)
