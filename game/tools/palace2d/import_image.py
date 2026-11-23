"""2Dの後宮の画像を取り込む:大きい版(-l)と小さい版(-s、スマートフォン用)の WebP にして public/palace2d/ に置く。

使い方:
  python3 import_image.py <元の画像> <ID>
  ID の例: A1_normal(肖像) / bg_garden_day(背景) / ev_scholar(一枚絵)
肖像は、透明な余白を切り詰めてから、高さをそろえる。
"""
import os, sys
from PIL import Image

src, key = sys.argv[1], sys.argv[2]
root = os.path.join(os.path.dirname(__file__), '../../public/palace2d')
im = Image.open(src)
if key.startswith('bg_') or key.startswith('ev_'):
    sub, name = ('bg', key[3:]) if key.startswith('bg_') else ('ev', key)
    im = im.convert('RGB')
    sizes = {'l': 1600, 's': 960}
    os.makedirs(os.path.join(root, sub), exist_ok=True)
    for tag, w in sizes.items():
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(os.path.join(root, sub, f'{name}-{tag}.webp'), 'WEBP', quality=80, method=6)
else:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    sizes = {'l': 1400, 's': 800}
    os.makedirs(os.path.join(root, 'p'), exist_ok=True)
    for tag, h in sizes.items():
        w = round(im.width * h / im.height)
        im.resize((w, h), Image.LANCZOS).save(os.path.join(root, 'p', f'{key}-{tag}.webp'), 'WEBP', quality=82, method=6)
print('取り込みました:', key)
