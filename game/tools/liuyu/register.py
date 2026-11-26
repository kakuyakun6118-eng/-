"""s409・s416 を、首都・開始時の外交・後継者と位・宝物・目録に登録する。何度実行しても同じ結果になる。"""
import json
def load(p): return json.load(open(p, encoding='utf-8'))
def save(p, d): json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
W = {'shanshan': ('shanshan', '扜泥城'), 'yutian': ('yutian', '西城'), 'shule': ('shule', '疏勒城'), 'qiuci': ('qiuci', '延城'), 'yanqi': ('yanqi', '員渠城'), 'jushi': ('jiaohe', '交河城')}
def cap(city, cert, note): return {'city': city, 'certainty': cert, 'note': note}
base = {
 'jin': cap('jiankang', '確認', '建康'), 'houqin': cap('changan', '確認', '長安(常安)'), 'beiwei': cap('pingcheng', '確認', '平城(398年に遷都)'),
 'beiyan': cap('jicheng', '確認', '龍城(和龍)'), 'xiliang': cap('jiuquan', '確認', '酒泉(405年に敦煌から遷都)'), 'chouchi': cap('chouchi', '確認', '仇池山'),
 'tuyuhun': cap('tuyuhunting', '推定', '吐谷渾の王帳(暫定の首都)'), 'goguryeo': cap('wandu', '確認', '国内城(427年に平壌へ遷都)'),
 'baekje': cap('hanseong', '推定', '漢城(慰礼城)'), 'silla': cap('geumseong', '確認', '金城(慶州)'),
}
for k, (c, n) in W.items(): base[k] = cap(c, '確認', n)
caps = {
 's409': {**base, 'nanyan': cap('guanggu', '確認', '広固'), 'xia': cap('shuofang', '推定', '朔方・高平の一帯(統万城は413年築城。ゲーム上の推定)'),
          'xiqin': cap('jincheng', '推定', '409年に苑川で再び自立。金城の一帯に置く(ゲーム上の推定)'), 'nanliang': cap('guzang', '確認', '姑臧(406年に後秦から得る)'),
          'beiliang': cap('zhangye', '確認', '張掖'), 'qiaoshu': cap('chengdu', '確認', '成都')},
 's416': {**base, 'xia': cap('shuofang', '確認', '統万城(413年築城。地図では朔方の位置)'), 'xiqin': cap('jincheng', '推定', '枹罕・金城の一帯(ゲーム上の推定)'),
          'beiliang': cap('guzang', '確認', '姑臧(412年に遷都)')},
}
p = 'src/data/scenarios/capitals.json'; d = load(p); d['scenarios'].update(caps); save(p, d)

def rel(r, basis, note, overlord=None):
    o = {'rel': r, 'basis': basis, 'note': note}
    if overlord: o['overlord'] = overlord
    return o
dip = {
 's409': {
  'houqin|nanyan': rel('friendly', '史実', '慕容超は母を取り戻すため姚興に臣礼をとり楽人を献じた。広固の包囲中には後秦に救援を求める(『晋書』慕容超載記)'),
  'houqin|xiqin': rel('vassal', '史実', '乞伏乾帰は407年に後秦に降り、409年7月に苑川で再び秦王を称する(開始時は後秦に従う)', 'houqin'),
  'beiwei|houqin': rel('hostile', '史実', '402年の柴壁の戦いののち、北魏と後秦はにらみ合う'),
  'beiwei|nanyan': rel('hostile', '推定', '北魏は399年に滑台を得て、南燕の北を圧した'),
  'houqin|nanliang': rel('hostile', '史実', '408年、姚弼の軍が姑臧を攻めて敗れた'),
  'nanliang|xia': rel('hostile', '史実', '407年、赫連勃勃が禿髪傉檀を陽武下峡で破った'),
  'beiliang|xiliang': rel('hostile', '史実', '沮渠蒙遜と李暠は境を争った'),
  'beiwei|xia': rel('hostile', '推定', '赫連勃勃の父 劉衛辰は北魏に滅ぼされた'),
  'beiwei|beiyan': rel('hostile', '推定', '北燕は後燕の残り。北魏とは対立する'),
  'goguryeo|beiyan': rel('friendly', '史実', '高雲は高句麗の王族の出。広開土王は使者を送り同族の好を結んだ(『三国史記』)'),
  'baekje|goguryeo': rel('hostile', '史実', '広開土王は百済と戦い続けた(広開土王碑)'),
  'chouchi|houqin': rel('hostile', '推定', '楊盛は後秦と東晋の間を行き来した'),
  'jin|tuyuhun': rel('friendly', '推定', '吐谷渾は南朝にも使いを送った(年次は推定)'),
 },
 's416': {
  'beiwei|houqin': rel('alliance', '史実', '415年、姚興の娘 西平公主が拓跋嗣に嫁いだ。北伐の時、北魏は後秦の救援を議した(『魏書』崔浩伝)'),
  'beiwei|jin': rel('hostile', '史実', '北魏は黄河の北岸に兵を出して東晋の水軍を見張った'),
  'beiwei|xia': rel('hostile', '推定', '赫連勃勃は北魏を仇とする'),
  'beiwei|beiyan': rel('hostile', '史実', '北魏はたびたび北燕を攻めた'),
  'houqin|xiqin': rel('hostile', '史実', '乞伏熾磐は後秦の隴西を攻めた'),
  'goguryeo|beiyan': rel('friendly', '史実', '高句麗は北燕と使者を往来させた'),
  'baekje|goguryeo': rel('hostile', '史実', '高句麗と百済は対立を続けた'),
  'chouchi|jin': rel('friendly', '推定', '楊盛は東晋に臣従を表した'),
  'jin|tuyuhun': rel('friendly', '推定', '吐谷渾は南朝にも使いを送った(年次は推定)'),
 },
}
dip = {s: {'|'.join(sorted(k.split('|'))): v for k, v in t.items()} for s, t in dip.items()}
p = 'src/data/rules/diplomacyStart.json'; d = load(p); d.update(dip); save(p, d)

p = 'src/data/rules/family.json'; d = load(p)
d['heirs']['s409'] = {'jin': 'sima_dewen', 'houqin': 'yao_hong', 'beiwei': 'tuoba_si', 'xia': 'helian_gui', 'xiqin': 'qifu_chipan', 'xiliang': 'li_xin', 'beiliang': 'juqu_mujian', 'goguryeo': 'jangsu'}
d['heirs']['s416'] = {'jin': 'sima_dewen', 'beiwei': 'tuoba_tao', 'xia': 'helian_gui', 'xiliang': 'li_xin', 'beiliang': 'juqu_mujian'}
d['heirNotes']['s409'] = '東晋の安帝には子がなく、弟の琅邪王 司馬徳文が後を継ぐ立場(のちの恭帝)。後秦の姚泓は409年に太子に立てられた(『晋書』姚興載記)。'
d['heirNotes']['s416'] = '北魏の拓跋燾は422年に太子に立つ(開始時は泰平王。ゲーム上は後継の第一候補)。後秦の姚泓には成人の後継がいない。'
rk = {'jin': 'emperor', 'houqin': 'emperor', 'beiwei': 'emperor', 'xia': 'king', 'beiyan': 'king', 'xiqin': 'king', 'beiliang': 'duke', 'xiliang': 'duke',
      'chouchi': 'duke', 'tuyuhun': 'chief', 'goguryeo': 'king', 'baekje': 'king', 'silla': 'king', **{k: 'king' for k in W}}
d['ranks']['s409'] = {**rk, 'nanyan': 'emperor', 'nanliang': 'king', 'qiaoshu': 'king'}
d['ranks']['s416'] = {**rk, 'beiliang': 'king'}
# 夏の称帝(史実の年)
d['historicCrown'].pop('song', None); d['historicCrown'].setdefault('xia', 418)  # 赫連勃勃は418年に長安で皇帝を称した
save(p, d)

p = 'src/data/treasures/treasures.json'; d = load(p)
for t in d['items']:
    h = t.get('holdings', {})
    if 's383' in h:
        h.setdefault('s409', h['s383']); h.setdefault('s416', h['s383'])
save(p, d)

p = 'src/data/scenarios/catalog.json'; d = load(p)
ids = [e['id'] for e in d['scenarios']]
E409 = {'id': 's409', 'year': 409, 'title': '劉裕の北伐 ― 南燕討伐', 'summary': '東晋の劉裕が、淮北を荒らした南燕の慕容超を討つため北伐に出る。', 'status': 'ready',
        'powers': ['東晋', '南燕', '後秦', '北魏', '夏'], 'figures': ['劉裕', '慕容超', '姚興', '拓跋珪', '赫連勃勃']}
E416 = {'id': 's416', 'year': 416, 'title': '劉裕の北伐 ― 長安奪還', 'summary': '姚興の死で揺れる後秦へ、劉裕が水陸の大軍で洛陽・長安を目指す。', 'status': 'ready',
        'powers': ['東晋', '後秦', '北魏', '夏', '北燕'], 'figures': ['劉裕', '王鎮悪', '檀道済', '姚泓', '赫連勃勃']}
for e in (E409, E416):
    if e['id'] in ids: d['scenarios'][ids.index(e['id'])] = e
    else: d['scenarios'].append(e)
save(p, d)
print('ok')
