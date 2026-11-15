#!/usr/bin/env python3
"""人物ごとの顔の設計データを作る(docs/portraits/faces.json)。
顔の輪郭・額・頬骨・顎・鼻・目・眉・口元・髭・肌・年齢の皺・体格・表情を、人物ごとに決める。
- 民族だけで機械的に決めない:すべての項目は、人物ごとに別々に選ぶ(年齢・経歴・能力が一部の項目に効く)。
- どの2人を比べても、顔の項目(輪郭〜表情)のうち6つ以上が違うようにする(並べたとき、顔だけで別人と分かるように)。
- 顔立ちは描き分けのための創作設定で、史料にもとづくものではない。"""
import json, os, hashlib, itertools
ROOT = os.path.join(os.path.dirname(__file__), '..')
D = os.path.join(ROOT, 'src', 'data', 'scenarios')
OUT = os.path.join(ROOT, 'docs', 'portraits', 'faces.json')
ledger = [p for f in ('s317.persons.json', 'persons.extra.json') for p in json.load(open(os.path.join(D, f), encoding='utf-8'))['persons']]
DIMS = {
 'outline': ['丸顔', '面長', '角ばった顔', '逆三角形の顔', '卵形の顔', 'えらの張った幅広の顔', '細長く頬のこけた顔', '下ぶくれの顔'],
 'forehead': ['広く秀でた額', '狭い額', '丸く張り出した額', '平らで低い額', '生え際の後退した高い額'],
 'cheekbone': ['高く張った頬骨', '目立たない頬骨', 'ふっくらした頬', 'こけた頬', '横に張った頬骨'],
 'jaw': ['角ばった強い顎', '細くとがった顎', '丸く小さな顎', '割れた顎', '後退した顎', '長くしゃくれた顎'],
 'nose': ['高く細い鼻筋', '低く横に広い鼻', '鷲鼻', '団子鼻', '短く上向きの鼻', '長くまっすぐな鼻', '一度折れて曲がった鼻', '細く小さな鼻'],
 'eyes': ['切れ長の細い目', '大きく丸い目', '一重のきつい目', '垂れ目', '奥まった目', '間隔の離れた目', '間隔の狭い鋭い目', '重いまぶたの眠たげな目'],
 'brows': ['太く一文字の眉', '細く長い眉', '吊り上がった眉', '八の字に下がった眉', '濃くつながりかけた眉', '薄くまばらな眉', '弓なりの眉'],
 'mouth': ['薄く引き結んだ唇', '厚い唇', '口角の下がった口', 'わずかに笑みを含んだ口', '大きく横に広い口', '小さくすぼめた口'],
 'skin': ['日に焼けた浅黒い肌', '色白の肌', '風雪で荒れた肌', 'あばたの残る肌', 'つややかな肌', '赤らんだ肌'],
 'build': ['がっしりした肩幅と太い首', '細身でなで肩', '肥えた体つきと二重顎', '骨ばった長身', '小柄で引き締まった体つき', '厚い胸板'],
 'expression': ['鋭くにらむような目つき', '落ち着いて穏やかな表情', '何かを疑うような目つき', '憂いを帯びた表情', '不敵な笑み', '威厳のある無表情', '疲れのにじむ表情', '人なつこい表情'],
 'mark': ['目立った特徴はない', '額に古い刀傷', '頬にほくろ', '眉間に深いしわ', '片耳が欠けている', '目尻に深い笑いじわ', '顎に傷あと'],
}
BEARD = ['髭をきれいに剃っている', '口髭だけ', '短く整えた顎髭', '長く垂れた顎髭', '頬まで続く濃い髭', '三筋に分けた長い髭', '短く刈った無精髭', '先を細く整えた口髭と顎髭']
HAIR_F = ['髪を高く結い上げる', '髪を後ろで大きく結う', '左右に分けて結う', '髪を低くまとめ、かんざしを挿す', '年相応に簡素にまとめる']
FACE_KEYS = list(DIMS.keys())

def h(pid, salt):
    return int(hashlib.md5((pid + '|' + salt).encode()).hexdigest(), 16)
# 初めて登場する年(若い人物に、皺の特徴を付けないため)
FIRST = {}
for e in json.load(open(os.path.join(D, 'catalog.json'), encoding='utf-8'))['scenarios']:
    s = json.load(open(os.path.join(D, e['id'] + '.json'), encoding='utf-8'))
    ids = set(s.get('roster', {})) | set(s.get('womenRoster', {}))
    if not s.get('roster'): ids |= {p['id'] for p in json.load(open(os.path.join(D, 's317.persons.json'), encoding='utf-8'))['persons']}
    for i in ids: FIRST.setdefault(i, e['year'])
def age_at(p):
    return None if not p.get('born') else FIRST.get(p['id'], 317) - p['born']

designs = {}
order = sorted(ledger, key=lambda p: p['id'])
taken = []
def distance(a, b):
    return sum(1 for k in FACE_KEYS if a[k] != b[k])
for p in order:
    pid = p['id']
    female = p.get('gender') == 'female'
    best = None
    for attempt in range(400):
        d = {k: v[h(pid, k + str(attempt)) % len(v)] for k, v in DIMS.items()}
        # 経歴と能力が効く項目(ただし決めつけない:候補をしぼるだけ)
        if p['war'] >= 88 and not female and h(pid, 'w' + str(attempt)) % 3: d['build'] = ['がっしりした肩幅と太い首', '厚い胸板', '骨ばった長身'][h(pid, 'b' + str(attempt)) % 3]
        if female and d['build'] in ('がっしりした肩幅と太い首', '厚い胸板'): d['build'] = ['細身でなで肩', '小柄で引き締まった体つき', '肥えた体つきと二重顎'][h(pid, 'fb' + str(attempt)) % 3]
        if female and d['mark'] in ('額に古い刀傷', '片耳が欠けている', '顎に傷あと') and p['war'] < 50: d['mark'] = '目立った特徴はない'
        if female and d['forehead'] == '生え際の後退した高い額': d['forehead'] = '広く秀でた額'
        if female and p['war'] < 50 and d['nose'] == '一度折れて曲がった鼻': d['nose'] = '細く小さな鼻'
        young = age_at(p) is not None and age_at(p) < 25
        if young and d['mark'] in ('眉間に深いしわ', '目尻に深い笑いじわ'): d['mark'] = '頬にほくろ'
        if young and d['forehead'] == '生え際の後退した高い額': d['forehead'] = '丸く張り出した額'
        m = min((distance(d, o) for o in taken), default=99)
        if best is None or m > best[1]: best = (d, m)
        if m >= 6: break
    d = best[0]
    taken.append(d)
    d['beard'] = '髭はない' if female else BEARD[h(pid, 'beard') % len(BEARD)]
    if female: d['hair'] = HAIR_F[h(pid, 'hair') % len(HAIR_F)]
    designs[pid] = d
mind = min(distance(designs[a['id']], designs[b['id']]) for a, b in itertools.combinations(order, 2))
tuples = {tuple(designs[p['id']][k] for k in FACE_KEYS) for p in order}
json.dump({'note': '顔の設計データ(描き分けのための創作設定。史料にもとづくものではない)。どの2人を比べても、顔の12項目のうち少なくとも min_distance 項目が違う。',
           'keys': FACE_KEYS, 'min_distance': mind, 'count': len(designs), 'faces': designs}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('人数', len(designs), '異なる組み合わせ', len(tuples), 'どの2人でも違う項目の最小数', mind)
