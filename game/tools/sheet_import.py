#!/usr/bin/env python3
"""一覧画像(2×2・3×1 など)から、肖像や名品の絵を切り出して取り込む(Version 40 の一括取り込み)。

使い方:
  python3 tools/sheet_import.py --kind portrait --list docs/portraits/missing-portraits.xlsx --layout 2x2 シート1.png シート2.png ...
  python3 tools/sheet_import.py --kind portrait --ids liu_yuan,shi_le,shi_hu,zhang_bin --layout 2x2 シート.png
  python3 tools/sheet_import.py --kind treasure --ids chuanguo_xi,jizhong_shu,xuanshi_biao,lanting_xu --layout 2x2 シート.png
  オプション:
    --layout 2x2 | 3x1 | 1x1     画像の並び(列×行)。左上から右へ、次の行へ、の順に読む
    --label                      各マスの下に名札(番号と名前)がある一覧(名札を外して切る)。無ければ、マス全体を使う
    --list <xlsx>                足りない画像の一覧(先頭から順に、マスの数だけ当てる)
    --ids a,b,c                  当てる人物ID(または名品ID)を、並びの順に書く。「-」は飛ばす(登録済みの人など)
    --dry                        書き出さずに、どのマスにどのIDを当てるかだけを表示する
    --overwrite                  すでにある画像を上書きする(既定では上書きしない)
取り込み先:public/portraits/<ID>.webp(256×256)・public/treasures/<ID>.webp(384×384)
取り込んだあとは node tools/portraits.cjs(肖像の一覧の書き出し)と python3 tools/portraits_check.py を実行する。"""
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
args = sys.argv[1:]
def opt(name, default=None):
    return args[args.index(name) + 1] if name in args else default
kind = opt('--kind', 'portrait')
layout = opt('--layout', '2x2')
cols, rows = (int(x) for x in layout.lower().split('x'))
label = '--label' in args
dry = '--dry' in args
overwrite = '--overwrite' in args
skip_next = {'--kind', '--layout', '--list', '--ids'}
sheets = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] not in skip_next)]
if not sheets: sys.exit(__doc__)

dest = os.path.join(ROOT, 'public', 'portraits' if kind == 'portrait' else 'treasures')
size = 256 if kind == 'portrait' else 384
os.makedirs(dest, exist_ok=True)

# 当てるIDの並び
if opt('--ids'):
    ids = opt('--ids').split(',')
elif opt('--list'):
    from openpyxl import load_workbook
    ws = load_workbook(opt('--list')).active
    ids = [r[1][:-5] for r in ws.iter_rows(min_row=2, values_only=True) if r and r[1] and not os.path.exists(os.path.join(dest, r[1]))]
else:
    sys.exit('--ids か --list で、当てるIDを指定してください')

# 正しいIDか(肖像:人物台帳と制作指示、名品:名品の台帳)
if kind == 'portrait':
    valid = {k[:-5] for k in json.load(open(os.path.join(ROOT, 'docs', 'portraits', 'prompts.json'), encoding='utf-8'))['prompts']}
else:
    valid = {t['id'] for t in json.load(open(os.path.join(ROOT, 'src', 'data', 'treasures', 'treasures.json'), encoding='utf-8'))['items']}

k = 0; done = []; problems = []
for sheet in sheets:
    im = Image.open(sheet).convert('RGB'); W, H = im.size; tw, th = W / cols, H / rows
    for cell in range(cols * rows):
        if k >= len(ids): break
        target = ids[k]; k += 1
        if target == '-': continue
        if target not in valid: problems.append(f'{os.path.basename(sheet)} {cell + 1}番目:{target} は台帳にないID'); continue
        out = os.path.join(dest, target + '.webp')
        if os.path.exists(out) and not overwrite: problems.append(f'{target} はすでにある(上書きしない)'); continue
        x0, y0 = (cell % cols) * tw, (cell // cols) * th
        if label:  # 名札つき:上から78%の正方形
            side = round(min(tw, th) * 0.785); left = round(x0 + (tw - side) / 2); top = round(y0 + th * 0.02)
            box = (left, top, left + side, top + side)
        else:  # マス全体(余白6px)から、中央の正方形
            m = 6; w, h = tw - 2 * m, th - 2 * m; side = min(w, h)
            left = round(x0 + m + (w - side) / 2); top = round(y0 + m + (h - side) / 2); box = (left, top, round(left + side), round(top + side))
        print(f'{os.path.basename(sheet)} {cell + 1}番目 → {target}')
        if not dry:
            im.crop(box).resize((size, size), Image.LANCZOS).save(out, 'WEBP', quality=86 if kind == 'portrait' else 84, method=6)
            done.append(target)
print(f'取り込んだ:{len(done)}枚' + (f' / 当てるIDが余った:{ids[k:]}' if k < len(ids) else ''))
if problems: print('取り込まなかったもの:'); [print('  ' + p) for p in problems]
