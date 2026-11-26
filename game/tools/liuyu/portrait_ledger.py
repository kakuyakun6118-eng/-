"""劉裕の北伐で追加した人物の肖像画の制作台帳を作る(docs/liuyu-portrait-ledger.xlsx と .md)。
画像がまだ無い人物は「未制作」とする(未制作の肖像画を完成扱いにしない)。容姿・衣装はゲーム上の設定で、史料に姿の記述がある場合だけ「史料」と書く。
使い方: python3 tools/liuyu/portrait_ledger.py"""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
ROOT = os.path.join(os.path.dirname(__file__), '../..')
SC = os.path.join(ROOT, 'src/data/scenarios')
extra = json.load(open(f'{SC}/persons.extra.json', encoding='utf-8'))['persons']
NEW = [l.split("'")[1] for f in ('persons.py', 'persons2.py') for l in open(os.path.join(os.path.dirname(__file__), f), encoding='utf-8') if l.strip().startswith("p('")]
byid = {p['id']: p for p in extra}
NEW = [i for i in NEW if i in byid and i != 'gwanggaeto']  # 広開土王は以前から台帳にいた(肖像あり)
have = {f.rsplit('.', 1)[0].split('@')[0] for f in os.listdir(os.path.join(ROOT, 'public/portraits'))}
s409 = json.load(open(f'{SC}/s409.json', encoding='utf-8'))['roster']
s416 = json.load(open(f'{SC}/s416.json', encoding='utf-8'))['roster']
FN = {'jin': '東晋', 'nanyan': '南燕', 'houqin': '後秦', 'beiwei': '北魏', 'xia': '夏', 'beiyan': '北燕', 'xiqin': '西秦', 'nanliang': '南涼', 'beiliang': '北涼',
      'xiliang': '西涼', 'qiaoshu': '譙蜀', 'chouchi': '仇池', 'tuyuhun': '吐谷渾', 'goguryeo': '高句麗', 'baekje': '百済', 'silla': '新羅'}
# 主な人物は個別に書く(容姿は史料の記述があれば「史料」と明記。ほかはゲーム上の設定)
SPEC = {
 'liu_yu_song': ('最優先', '大柄で堂々とした体格(史料:身長七尺六寸と伝わる『宋書』武帝紀)。日に焼けた顔、太い眉、短いあごひげ。鋭いが落ち着いた目', '東晋の将軍の鎧(筒袖鎧・赤い戦袍)。宋の建国後の版は皇帝の冕服', '胸から上・やや斜め・背景透明。表情は「通常」「勝利」「憂い」の3枚(宋の皇帝の版を別に1枚)'),
 'liu_muzhi': ('高', '中肉、知的で穏やかな顔、整えたひげ', '文官の朝服(黒い進賢冠・赤の衣)', '胸から上・正面・背景透明'),
 'wang_zhene': ('高', '精悍な顔、北方の生まれらしい彫りの深さ。祖父 王猛の面影(ゲーム上の設定)', '武将の鎧(明光鎧ではなく札甲)・兜を手に', '胸から上・斜め・背景透明'),
 'tan_daoji': ('高', '引き締まった顔、細い目、口ひげ', '武将の札甲・緑の戦袍', '胸から上・斜め・背景透明'),
 'shen_tianzi': ('中', '若く荒々しい顔、短いひげ', '軽い鎧・黒い頭巾', '胸から上・斜め・背景透明'),
 'zhu_chaoshi': ('中', '屈強な体つき。大槌を担ぐ(却月陣の逸話)', '鎧・腕当て', '腰から上・大槌を持つ・背景透明'),
 'murong_chao': ('高', '若く端正な顔(史料:容姿が美しかったと伝わる『晋書』慕容超載記)。鮮卑の貴人', '燕の皇帝の衣(黄色の袍・冠)', '胸から上・正面・背景透明'),
 'gongsun_wulou': ('中', '細面で狡猾そうな目つき(ゲーム上の設定)', '文官の朝服', '胸から上・斜め・背景透明'),
 'yao_xing': ('高', '温和で思慮深い顔、豊かなひげ。羌の君主', '天王の衣(紫の袍・冠)。仏教を篤く信じた', '胸から上・正面・背景透明'),
 'yao_hong': ('高', '若く穏やかで気弱そうな顔(史料:孝行で文を好んだ)', '後秦の皇帝の衣', '胸から上・正面・背景透明。表情「通常」「憂い」'),
 'helian_bobo': ('最優先', '堂々とした長身、鋭い目(史料:身長八尺五寸と伝わる『晋書』赫連勃勃載記)。匈奴の王', '毛皮の縁取りの戦袍と鎧・弓', '胸から上・斜め・背景透明。表情「通常」「怒り」'),
 'tuoba_si': ('高', '落ち着いた若い君主の顔、鮮卑の髪型', '北魏の皇帝の衣(鮮卑風の袍)', '胸から上・正面・背景透明'),
 'tuoba_tao': ('中', '少年(416年は8歳)。成長後の版は精悍な武人の顔', '鮮卑の少年の衣/成長後は鎧', '少年版と成人版の2枚・背景透明'),
 'cui_hao': ('高', '色白で秀でた額、知的な顔(史料:容姿が美しく女性のようだったと伝わる『魏書』崔浩伝)', '文官の朝服', '胸から上・正面・背景透明'),
 'liu_yifu': ('中', '少年(416年は10歳)。即位後の版は青年', '皇太子の衣', '少年版と青年版・背景透明'),
 'liu_yizhen': ('中', '少年(418年に12歳)。利発そう', '貴族の少年の衣', '胸から上・背景透明'),
 'liu_yilong': ('中', '少年(416年は9歳)。即位後(宋の文帝)の版は穏やかな青年', '貴族の衣/皇帝の衣', '少年版と青年版・背景透明'),
 'zhang_que': ('中', '成人の女性(年齢は不明。ゲーム上は40代)。落ち着いた品のある顔', '晋の貴婦人の衣(大袖衫・髪飾り)', '胸から上・背景透明。宮廷・皇帝生活モードで使う'),
 'zang_aiqin': ('低', '成人の女性(408年に49歳で没)。質素で慎み深い(史料:倹約を好んだ)', '質素な衣', '胸から上・背景透明(409年以降のシナリオには登場しない)'),
 'hu_daoan': ('低', '成人の女性(409年没)', '晋の貴婦人の衣', '胸から上・背景透明'),
 'juqu_mengxun': ('高', '機知に富んだ目、盧水胡の首長', '胡風の袍と鎧', '胸から上・斜め・背景透明'),
 'li_gao': ('中', '温厚な文人肌の顔、長いひげ', '涼公の衣', '胸から上・正面・背景透明'),
 'feng_ba': ('中', '大柄で寛大そうな顔', '北燕の天王の衣', '胸から上・正面・背景透明'),
 'lu_xun': ('中', '細身で鋭い目(史料:神采清秀と伝わる)', '道士風の衣に鎧', '胸から上・斜め・背景透明'),
}
def age(p, y): return (y - p['born']) if p.get('born') else None
rows = []
for i, pid in enumerate(NEW, 1):
    p = byid[pid]
    fac = FN.get((s416.get(pid) or s409.get(pid) or {}).get('factionId', ''), '(途中登場・ほか)')
    a409, a416 = age(p, 409), age(p, 416)
    pri, looks, cost, comp = SPEC.get(pid, ('低',
        ('女性' if p.get('gender') == 'female' else '男性') + f"・{p.get('people', '漢')}。{('年齢は不明(ゲーム上の設定)' if not p.get('born') else '')}顔立ちはゲーム上の設定",
        ('武将の鎧' if p['role'] == 'general' else '文官の朝服' if p['role'] == 'minister' else '君主の衣') + (f"({p.get('people')}の装い)" if p.get('people') not in (None, '漢') else ''),
        '胸から上・やや斜め・背景透明'))
    rows.append([f'LY{i:02d}', pid, p['name'], p.get('reading', ''), fac, p.get('title', ''), p.get('born') or '不明', p.get('died') or '不明',
                 a409 if a409 is not None else '不明', a416 if a416 is not None else '不明', pri, looks, cost, comp,
                 '済' if pid in have else '未制作', f'public/portraits/{pid}.webp'])
pri_order = {'最優先': 0, '高': 1, '中': 2, '低': 3}
rows.sort(key=lambda r: (pri_order[r[10]], r[0]))
HEAD = ['台帳番号', '人物ID', '名前', '読み', '所属(416年/409年)', '肩書き', '生年', '没年', '409年の年齢', '416年の年齢', '優先度', '容姿', '衣装', '構図', '状態', '置き場所']
wb = Workbook(); ws = wb.active; ws.title = '肖像の制作台帳'
ws.append(HEAD)
for r in rows: ws.append(r)
for c in ws[1]: c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='7A2E1E')
for col, w in zip('ABCDEFGHIJKLMNOP', [9, 16, 10, 14, 12, 22, 7, 7, 8, 8, 7, 46, 34, 34, 9, 30]): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    for c in row: c.alignment = Alignment(wrap_text=True, vertical='top')
    if row[14].value == '未制作': row[14].fill = PatternFill('solid', fgColor='F4D6CC')
ws.freeze_panes = 'C2'
ws2 = wb.create_sheet('説明')
for line in ['劉裕の北伐(409年・416年)で追加した人物の肖像画の制作台帳。', '状態が「未制作」の人物は、ゲームでは仮のシルエットで表示される(完成扱いにしない)。',
             '容姿のうち「史料」とあるものは『宋書』『晋書』『魏書』の記述による。ほかはゲーム上の設定。', '画像は public/portraits/<人物ID>.webp に置き、npm run build で取り込まれる。',
             '他人の著作物の画像は使わないこと。', f'人数:{len(rows)}人(済 {sum(r[14] == "済" for r in rows)}・未制作 {sum(r[14] == "未制作" for r in rows)})']:
    ws2.append([line])
ws2.column_dimensions['A'].width = 100
os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
wb.save(os.path.join(ROOT, 'docs/liuyu-portrait-ledger.xlsx'))
md = ['# 劉裕の北伐:肖像画の制作台帳', '', '状態が「未制作」の人物は、ゲームでは仮のシルエットで表示されます(完成扱いにしません)。容姿のうち「史料」とあるものは史書の記述、ほかはゲーム上の設定です。', '',
      '| 番号 | ID | 名前 | 所属 | 409年/416年の年齢 | 優先度 | 容姿 | 衣装 | 構図 | 状態 |', '|---|---|---|---|---|---|---|---|---|---|']
for r in rows: md.append(f'| {r[0]} | {r[1]} | {r[2]} | {r[4]} | {r[8]}/{r[9]} | {r[10]} | {r[11]} | {r[12]} | {r[13]} | {r[14]} |')
open(os.path.join(ROOT, 'docs/liuyu-portrait-ledger.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print(len(rows), 'persons;', sum(r[14] == '未制作' for r in rows), '未制作')
