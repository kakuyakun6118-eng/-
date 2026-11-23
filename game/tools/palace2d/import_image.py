"""2Dの後宮の画像を取り込む:大きい版(-l)と小さい版(-s、スマートフォン用)の WebP にして public/palace2d/ に置く。

使い方:
  python3 import_image.py <元の画像> <ID>
  python3 import_image.py --sheet            … 取り込んだ肖像を、ID の札つきで1枚に並べた確認の絵を作る
ID の例:
  A1_normal / A1_通常(肖像。人物の ID と表情)
  bg_garden_day(背景。区画と時刻 morning/day/evening/night)
  ev_scholar(一枚絵)
別人の絵が出ないよう、人物の ID・表情・区画が一覧にないときは取り込まない。
"""
import os, re, sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '../../public/palace2d')
CAST_TS = os.path.join(os.path.dirname(__file__), '../../src/palace2d/cast.ts')
CAST = re.findall(r'\{ id: "([A-Z]\d{1,2})"', open(CAST_TS, encoding='utf-8').read())
EXPR = {'normal': 'normal', 'smile': 'smile', 'joy': 'joy', 'sad': 'sad', 'angry': 'angry', 'puzzled': 'puzzled', 'surprised': 'surprised', 'shy': 'shy',
        '通常': 'normal', '微笑み': 'smile', '微笑': 'smile', '喜び': 'joy', '悲しみ': 'sad', '怒り': 'angry', '困惑': 'puzzled', '驚き': 'surprised', '照れ': 'shy'}
AREAS = ['emperorHall', 'empressPalace', 'consortQuarters', 'ladiesStation', 'garden', 'bath', 'banquet', 'corridor']
TIMES = ['morning', 'day', 'evening', 'night']
EVENTS = ['scholar', 'ambitious', 'provincial', 'attendant', 'consort', 'free', 'banquet']


def sheet():
    d = os.path.join(ROOT, 'p')
    files = sorted(f for f in os.listdir(d) if f.endswith('-s.webp')) if os.path.isdir(d) else []
    if not files:
        print('まだ肖像がありません')
        return
    cols = 8
    w, h = 200, 300
    out = Image.new('RGB', (cols * w, ((len(files) + cols - 1) // cols) * (h + 24)), (40, 30, 26))
    dr = ImageDraw.Draw(out)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(d, f)).convert('RGBA')
        im.thumbnail((w, h))
        x, y = (i % cols) * w, (i // cols) * (h + 24)
        out.paste(im, (x + (w - im.width) // 2, y + h - im.height), im)
        dr.text((x + 6, y + h + 4), f.replace('-s.webp', ''), fill=(240, 220, 170))
    p = os.path.join(ROOT, 'check-sheet.jpg')
    out.save(p, quality=85)
    print('確認の絵:', p, f'({len(files)}枚)')


def main():
    if sys.argv[1] == '--sheet':
        return sheet()
    src, key = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    if key.startswith('bg_'):
        m = re.fullmatch(r'bg_([a-zA-Z]+)_(morning|day|evening|night)', key)
        if not m or m.group(1) not in AREAS:
            sys.exit(f'背景の ID が正しくありません: {key}(区画は {AREAS}、時刻は {TIMES})')
        sub, name = 'bg', f'{m.group(1)}_{m.group(2)}'
    elif key.startswith('ev_'):
        if key[3:] not in EVENTS:
            sys.exit(f'一枚絵の ID が正しくありません: {key}({EVENTS})')
        sub, name = 'ev', key
    else:
        m = re.fullmatch(r'([A-Z]\d{1,2})_(.+)', key)
        if not m or m.group(1) not in CAST:
            sys.exit(f'人物の ID が一覧にありません: {key}(一覧: {", ".join(CAST)})')
        if m.group(2) not in EXPR:
            sys.exit(f'表情の名前が正しくありません: {m.group(2)}({", ".join(k for k in EXPR if not k.isascii())})')
        sub, name = 'p', f'{m.group(1)}_{EXPR[m.group(2)]}'
    os.makedirs(os.path.join(ROOT, sub), exist_ok=True)
    if sub == 'p':
        im = im.convert('RGBA')
        a = im.getchannel('A')
        if a.getextrema()[0] > 200:
            print('注意:背景が透明ではありません。ChatGPT に「背景を透明にして」と頼み直すと、背景画に自然に重なります')
        bbox = a.point(lambda v: 255 if v > 8 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
        for tag, h in {'l': 1400, 's': 800}.items():
            w = round(im.width * h / im.height)
            im.resize((w, h), Image.LANCZOS).save(os.path.join(ROOT, sub, f'{name}-{tag}.webp'), 'WEBP', quality=82, method=6)
    else:
        im = im.convert('RGB')
        for tag, w in {'l': 1600, 's': 960}.items():
            h = round(im.height * w / im.width)
            im.resize((w, h), Image.LANCZOS).save(os.path.join(ROOT, sub, f'{name}-{tag}.webp'), 'WEBP', quality=80, method=6)
    print('取り込みました:', name)


main()
