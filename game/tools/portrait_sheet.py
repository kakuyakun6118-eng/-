#!/usr/bin/env python3
"""肖像の制作用の資料を作る(docs/portraits/)。
- persons.csv   全人物の一覧(ID・名前・民族・生没年・役割・登場シナリオ・必要なファイル名)
- prompts.json  人物ごとの制作指示(画風の共通指定 + その人物の指定)
- batch01.md    最初に作る主要人物20人の指示
画像そのものは作らない。能力値から決めた顔立ちの指定は、描き分けのための創作設定。"""
import json, os, csv, hashlib
ROOT = os.path.join(os.path.dirname(__file__), '..')
D = os.path.join(ROOT, 'src', 'data', 'scenarios')
OUT = os.path.join(ROOT, 'docs', 'portraits')
os.makedirs(OUT, exist_ok=True)
ledger = {p['id']: p for f in ('s317.persons.json', 'persons.extra.json') for p in json.load(open(os.path.join(D, f), encoding='utf-8'))['persons']}
catalog = json.load(open(os.path.join(D, 'catalog.json'), encoding='utf-8'))['scenarios']
ROLE = {'ruler': '君主', 'general': '武将', 'strategist': '軍師', 'minister': '文官'}
appear = {}
for e in catalog:
    s = json.load(open(os.path.join(D, e['id'] + '.json'), encoding='utf-8'))
    fac = {f['id']: f['name'] for f in s['factions']}
    roster = s.get('roster') or {**{p['id']: {'factionId': p['factionId']} for p in json.load(open(os.path.join(D, 's317.persons.json'), encoding='utf-8'))['persons']}, **s.get('womenRoster', {})}
    for pid, r in roster.items():
        b = ledger[pid]
        appear.setdefault(pid, []).append({'year': e['year'], 'faction': fac[r['factionId']], 'role': r.get('role') or b['role'], 'title': r.get('title') or b['title']})

STYLE = ("写実的で重厚な歴史人物の肖像画(三國志14やTotal Warシリーズのような重厚さ)。油彩のような質感、落ち着いた光、暗い無地の背景。胸から上の構図で、顔がはっきり見える。正方形。"
         "1枚に1人だけを描く(何人も並べた一覧画像にしない)。顔の設計(輪郭・額・頬骨・顎・鼻・目・眉・口元・髭・肌・皺・体格・表情)に必ず従い、ほかの人物と同じ顔にしない。冠や髭や色を変えただけの使い回しは不可。"
         "4世紀の中国(西晋〜東晋・五胡十六国)の装い。明・清の官服や官帽、満洲式の辮髪、近世以降の甲冑、日本式の兜、西洋の板金鎧、現代の小物は描かない。"
         "文字・印・枠・透かしは入れない。ほかの人物と同じ顔にしない。")
ATTIRE = {
 '漢': {'文': '頭に介幘か進賢冠、襟を右前に合わせた袖の広い袍。', '武': '小札を綴じた筒袖鎧か両当鎧、鉢形の冑(かぶと)に赤い房、または髪を束ねて幘をかぶる。', '君': '通天冠か遠遊冠、黒と朱を基調にした袍。'},
 '匈奴': {'文': '漢の文化に通じた支配層として、漢式の冠と袍。帯や襟に毛皮や金の飾り。', '武': '革や鉄の小札鎧、毛皮の縁取りのある外套、革の帯。', '君': '漢式の冠と袍に、草原風の金の帯飾りや毛皮を添える。'},
 '羯': {'文': '漢式の袍に、革の帯。', '武': '鉄の小札鎧に毛皮の外套。', '君': '漢式の冠と袍に、草原風の帯飾り。', '顔': '史書は羯の人を「鼻が高く、髭が濃い」と記す。彫りの深い顔立ち。'},
 '鮮卑': {'文': '袖の細い胡服に革の帯。漢人の臣と交わる者は漢式の袍も。', '武': '鉄の小札鎧、袖の細い胡服、革の長靴、毛皮の帽子か冑。', '君': '袖の細い胡服に金の帯飾り。慕容氏は、歩くと揺れる金の飾り(歩揺)の付いた冠を好んだと伝わる。', '顔': '拓跋部は髪を編んで垂らしたので「索頭」と呼ばれた。'},
 '氐': {'文': '漢式に近い袍と冠。', '武': '小札鎧。髪は編むと伝わる(推定)。', '君': '漢式の冠と袍。'},
 '巴氐': {'文': '漢式の袍と冠。', '武': '小札鎧、蜀の地の装い。', '君': '漢式の冠と袍。'},
 '羌': {'文': '毛織の衣に革の帯。', '武': '小札鎧に毛織の外套。髪を束ねず垂らすと伝わる。', '君': '毛織の衣に金の飾り。髪を垂らす。'},
 '丁零': {'文': '毛皮と毛織の衣(推定)。', '武': '革の鎧に毛皮の外套(推定)。', '君': '毛皮と毛織の衣(推定)。'},
 '高句麗': {'文': '襟を左前に合わせた上衣、鳥の羽を挿した冠(折風)。古墳の壁画をもとにする。', '武': '小札鎧に冑。古墳の壁画をもとにする。', '君': '白い薄絹の冠(白羅冠)と、襟を合わせた上衣。古墳の壁画をもとにする。'},
 '百済': {'文': '袖の広い上衣と冠(資料が乏しく、推定)。', '武': '小札鎧と冑(推定)。', '君': '金の飾りの付いた冠と袖の広い上衣(推定)。'},
 '新羅': {'文': '上衣と冠(資料が乏しく、推定)。', '武': '小札鎧と冑(推定)。', '君': '金の飾りの付いた冠(推定)。'},
 '不明': {'文': '漢式の袍と冠(出自が確かでないため、漢式とする)。', '武': '小札鎧(出自が確かでないため、特定の民族の特徴は付けない)。', '君': '漢式の冠と袍。'},
}
FACE = ['面長', '角ばった顎', '丸顔', '細面', '頬骨の高い顔', 'えらの張った顔', '卵形の顔', '額の広い顔']
BROW = ['太く一文字の眉', '細く長い眉', '吊り上がった眉', '八の字に下がった眉', '濃く短い眉', '弓なりの眉']
EYE = ['切れ長の目', '大きく丸い目', '細く鋭い目', '垂れ気味の目', '奥まった目', '三白眼ぎみの目']
BEARD_Y = ['髭はまだ薄い', '口髭だけ', '短く整えた顎髭']
BEARD_M = ['長い顎髭', '口髭と短い顎髭', '頬まで続く濃い髭', '三筋に分けた長い髭', '短く刈った髭', '髭をきれいに剃っている']
BEARD_O = ['白い長い顎髭', '白髪まじりの豊かな髭', '白く薄い髭']
def pick(lst, pid, salt):
    return lst[int(hashlib.md5((pid + salt).encode()).hexdigest(), 16) % len(lst)]
def age_words(age):
    if age is None: return ('壮年(年齢は不明)', BEARD_M)
    if age < 20: return (f'{age}歳ごろの若者', BEARD_Y)
    if age < 30: return (f'{age}歳ごろの青年', BEARD_Y + BEARD_M[:2])
    if age < 50: return (f'{age}歳ごろの壮年', BEARD_M)
    if age < 62: return (f'{age}歳ごろの初老。髪に白いものが混じる', BEARD_M + BEARD_O[:1])
    return (f'{age}歳ごろの老人。白髪', BEARD_O)
FACES = json.load(open(os.path.join(OUT, 'faces.json'), encoding='utf-8'))['faces']
WOMEN = {
 '后': '皇后・皇太后:高く結い上げた髪に、金の歩揺(揺れる飾り)を挿す。襟を右前に合わせた袖の広い深衣、裾に飾りの垂れ布(雑裾垂髾)。色は黒・朱・深紅。',
 '妃': '王妃・夫人:高い髻にかんざし。袖の広い上衣と長い裳、帯から細い垂れ布。',
 '主': '公主・貴族の女性:高い髻、薄い絹の上衣と長い裳。顧愷之の絵に見られるような、たなびく垂れ布。',
 '文': '文人・書家の女性:簡素にまとめた髪、落ち着いた色の上衣と裳。筆や書物を手にしてもよい。',
 '武': '武勇の事績のある女性:髪を固く結い、袖を絞った上衣に、革の帯。簡素な鎧を重ねてもよい(推定)。',
 '胡': '鮮卑など北方の女性:袖の細い胡服に革の帯、毛皮の縁取り。帽子をかぶってもよい(推定)。',
}
def woman_attire(p, a):
    t = (a['title'] or '') + p['title']
    if p.get('people') in ('鮮卑', '匈奴', '羯') and '后' not in t: return WOMEN['胡']
    if any(k in t for k in ('皇后', '皇太后', '太皇太后', '后')): return WOMEN['后']
    if any(k in t for k in ('妃', '夫人', '母')): return WOMEN['妃']
    if '公主' in t or '娘' in t: return WOMEN['主']
    if p['role'] == 'general': return WOMEN['武']
    return WOMEN['文']

def prompt(p, a, year):
    kind = '君' if a['role'] == 'ruler' else '武' if a['role'] == 'general' else '文'
    people = p.get('people', '漢')
    att = ATTIRE.get(people, ATTIRE['不明'])
    age = year - p['born'] if p.get('born') else None
    words, beards = age_words(age)
    traits = []
    female = p.get('gender') == 'female'
    if female: pass
    elif p['war'] >= 85: traits.append('がっしりした体つき、戦場の傷あと、鋭い眼光')
    elif p['war'] <= 35 and not female: traits.append('武人らしくない、細い肩')
    if p['intelligence'] >= 85: traits.append('思慮深く落ち着いた表情')
    if p['charisma'] >= 85: traits.append('人を引きつける堂々とした佇まい')
    elif p['charisma'] <= 35: traits.append('険しく近寄りがたい表情')
    if p['politics'] >= 85: traits.append('穏やかで端正な身なり')
    fd = FACES[p['id']]
    face = '、'.join(fd[k] for k in ('outline', 'forehead', 'cheekbone', 'jaw', 'nose', 'eyes', 'brows', 'mouth', 'skin', 'build', 'expression', 'mark')) + f"、{fd['beard']}" + (f"、{fd['hair']}" if fd.get('hair') else '')
    if age is not None and age < 18 and p.get('gender') != 'female': face = face.replace(fd['beard'], '髭はまだない')
    return {
        'style': STYLE,
        'person': f"{p['name']}({p['reading']})。{'女性。' if p.get('gender') == 'female' else ''}{year}年ごろ、{words}。{people}{'(' + p['peopleNote'] + ')' if p.get('peopleNote') else ''}。{a['faction']}の{ROLE[a['role']]}、{a['title'] or '官職不明'}。{p['bio']}",
        'gender': '女性' if p.get('gender') == 'female' else '男性',
        'attire': woman_attire(p, a) if p.get('gender') == 'female' else att[kind] + (' ' + att['顔'] if '顔' in att else ''),
        'face_fiction': face + ('、' + '、'.join(traits) if traits else ''),
        'note': '顔立ちの指定は、ほかの人物と描き分けるための創作設定(史料にもとづくものではない)。装いは、史料や出土品から分かる範囲の指針で、「推定」とあるものは根拠が乏しい。',
    }
rows = []; prompts = {}
for pid, apps in sorted(appear.items(), key=lambda kv: (kv[1][0]['year'], kv[0])):
    p = ledger[pid]
    first, last = apps[0], apps[-1]
    files = [f"{pid}.webp"]
    prompts[files[0]] = prompt(p, first, first['year'])
    if last['year'] - first['year'] >= 25:
        f2 = f"{pid}@{last['year']}.webp"
        files.append(f2)
        prompts[f2] = prompt(p, last, last['year'])
    rows.append([pid, p['name'], p['reading'], p.get('people', ''), p.get('peopleNote', ''), p['born'] if p['born'] else '不明', p['died'] if p['died'] else '不明',
                 ROLE[first['role']], first['faction'], first['title'], ' '.join(str(a['year']) for a in apps), ' '.join(files), p.get('note', '')])
with open(os.path.join(OUT, 'persons.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(['人物ID', '名前', '読み', '民族', '民族の注記', '生年', '没年', '役割(初登場時)', '所属(初登場時)', '官職(初登場時)', '登場シナリオ', '必要な画像ファイル', '注記']); w.writerows(rows)
json.dump({'note': '人物ごとの肖像の制作指示。style は全員共通。face_fiction は描き分けのための創作設定。', 'count': len(prompts), 'prompts': prompts}, open(os.path.join(OUT, 'prompts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
FIRST = ['liu_yuan', 'shi_le', 'shi_hu', 'liu_yao', 'sima_rui', 'wang_dao', 'zu_ti', 'tao_kan', 'murong_hui', 'tuoba_yilu', 'li_xiong', 'zhang_gui', 'zhang_bin', 'sima_ying', 'zhang_fang', 'fu_jian', 'wang_meng', 'murong_ke', 'huan_wen', 'xie_an', 'yao_xiang', 'eulbul']
with open(os.path.join(OUT, 'batch01.md'), 'w', encoding='utf-8') as f:
    f.write('# 肖像 第1回(主要人物)の制作指示\n\n画風・時代考証・描き分けを確かめるための最初の組。保存名は `public/portraits/<ファイル名>`、256×256 の WebP。\n\n## 全員に共通の指定\n\n' + STYLE + '\n\n')
    for pid in FIRST:
        pr = prompts[pid + '.webp']
        f.write(f"## {ledger[pid]['name']} — `{pid}.webp`\n\n- 人物:{pr['person']}\n- 装い:{pr['attire']}\n- 顔立ち(創作設定):{pr['face_fiction']}\n\n")
variants = sum(1 for k in prompts if '@' in k)
print('人物', len(rows), '画像', len(prompts), '(基本', len(rows), '+ 年齢差分', variants, ')')
