"""仮想シナリオ「炎漢再興 ― 天命を継ぐ者」(s304v)を作る。304年(s304)の史実の勢力図をもとに、
劉皓の楚の独立に伴う領土・人物・軍団の変更だけを仮想設定として重ねる。人物はすべて架空(persons.virtual.json)。
使い方: python3 tools/virtual/hanrevival.py"""
import json, copy, os
ROOT = os.path.join(os.path.dirname(__file__), '../..')
SC = os.path.join(ROOT, 'src/data/scenarios')
RULES = os.path.join(ROOT, 'src/data/rules')
def load(p): return json.load(open(p, encoding='utf-8'))
def save(p, d): json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
SID, BASE, Y = 's304v', 's304', 304
CHU = ['xiangyang', 'jiangling', 'wan', 'wuchang', 'xinye']
V = '仮想(ゲームの創作)'
# 宣帝の血統(劉氏三代と、劉皓の子孫)
XUANDI = {'vh_liu_xiong', 'vh_liu_hao_f', 'vh_liu_hao', 'vh_liu_cheng', 'vh_liu_wei', 'vh_liu_rui', 'vh_liu_ying', 'vh_liu_hong'}

def P(id, name, reading, age_or_born, L, W, I, Po, C, traits, unit, bio, personality, title, gender=None, people='漢', born=None, died=None):
    b = born if born else Y - age_or_born
    o = {'id': id, 'name': name, 'reading': reading, 'born': b, 'died': died, 'factionId': '', 'role': 'general', 'title': title,
         'leadership': L, 'war': W, 'intelligence': I, 'politics': Po, 'charisma': C, 'traits': traits, 'favoredUnit': unit,
         'bio': bio, 'personality': personality, 'people': people, 'fictional': True, 'virtual': True, 'note': '仮想シナリオ「炎漢再興」の架空の人物(史実の同名の人物とは別)'}
    if gender: o['gender'] = gender
    if id in XUANDI: o['bloodline'] = 'xuandi'
    return o

PERSONS = [
 P('vh_liu_hao', '劉皓', 'りゅうこう', 0, 120, 115, 118, 115, 120, ['天命覇王', '炎漢正統', '軍神降臨', '神算鬼謀', '盛世創造', '英傑帰心', '不敗の軍略', '絶世の英姿'], 'cavalry',
   '前漢の宣帝の孫、楚思王 劉衍の末裔と伝えられる(この設定は架空)。祖父・父のもとで文武を学び、八王の乱で乱れた天下を見て、荊州の襄陽に拠って楚王を称した。漢室の再興を志す若き覇王。',
   '大らかで果断。人を見る目があり、敵将にも礼を尽くす', '楚王', born=280),
 P('vh_liu_hao_f', '劉浩', 'りゅうこう', 0, 94, 72, 115, 118, 105, ['名宰相', '経世済民'], None,
   '劉皓の父。西晋に仕えて尚書令まで進んだが、諸王の争いに失望して官を辞し、襄陽に退いた(架空)。子の挙兵を政務で支える。',
   '慎重で緻密。帳簿の一字の誤りも見逃さない', '丞相(元西晋尚書令)', born=249),
 P('vh_liu_xiong', '劉雄', 'りゅうゆう', 0, 108, 103, 108, 110, 110, ['老練', '三代の柱石'], 'infantry',
   '劉皓の祖父。曹魏に仕えて司空に至った老臣(架空)。魏晋の交代を見届けたのち荊州に隠れ住み、孫に天下の大計を授ける。',
   '豪放で懐が深い。昔話が長い', '太傅(元曹魏司空)', born=218, died=312),
 P('vh_huo_lie', '霍烈', 'かくれつ', 32, 110, 115, 82, 65, 94, ['烈火先鋒'], 'cavalry', '河東の豪族の出。張昌の乱の討伐で名を上げ、劉皓の挙兵に真っ先に駆けつけた先鋒の猛将。', '激しく真っすぐ。退くことを知らない', '神武軍の将'),
 P('vh_han_xuance', '韓玄策', 'かんげんさく', 35, 115, 88, 108, 91, 98, ['玄策統兵'], 'infantry', '南陽の人。兵法を家学とし、大軍を手足のように動かす。劉皓の軍の総帥として宛を守る。', '沈着で寡黙。部下の名をすべて覚えている', '大都督'),
 P('vh_pei_xuan', '裴玄', 'はいげん', 29, 99, 72, 115, 110, 96, ['玄機妙算'], 'infantry', '河東裴氏の傍流。若くして洛陽で名を知られた策士で、劉皓の軍師となる。', '皮肉屋だが情に厚い', '軍師祭酒'),
 P('vh_chen_xu', '陳旭', 'ちんきょく', 26, 105, 110, 87, 75, 95, ['旭日突騎'], 'cavalry', '江夏の騎兵の名手。夜明けの奇襲を得意とし、羽林騎を率いる。', '陽気で負けず嫌い', '羽林騎の将'),
 P('vh_yang_hu', '楊虎', 'ようこ', 34, 104, 114, 78, 62, 88, ['猛虎陥陣'], 'infantry', '弘農の猟師の出。素手で虎を倒したと噂される。攻城の先頭に立つ。', '粗野だが義理堅い', '陥陣都尉'),
 P('vh_zhuge_xiang', '諸葛翔', 'しょかつしょう', 31, 103, 65, 116, 112, 99, ['八陣の再来'], 'archer', '琅邪諸葛氏の遠い一族と称する。陣法に通じ、守りの戦では負けたことがない。', '物静かで几帳面', '護軍'),
 P('vh_zhao_lingyun', '趙凌雲', 'ちょうりょううん', 25, 108, 112, 91, 80, 100, ['凌雲槍'], 'cavalry', '常山の槍術の家の出。白龍騎を率い、白馬にまたがって敵陣を駆け抜ける。', '誠実で礼儀正しい', '白龍騎の将'),
 P('vh_wei_tian', '衛天', 'えいてん', 28, 112, 108, 95, 84, 98, ['天策の将'], 'cavalry', '河東衛氏の出と称する。天策軍を預かり、遠征の先陣を務める。', '野心家だが劉皓には心服している', '天策軍の将'),
 P('vh_murong_qian', '慕容謙', 'ぼようけん', 30, 109, 108, 93, 78, 96, ['鮮卑鉄騎'], 'cavalry', '遼東の鮮卑の一族から漢土に出てきた騎将。劉皓の度量に惹かれて仕えた。', '謙虚で用心深い', '騎都尉', people='鮮卑'),
 P('vh_ma_xuan', '馬玄', 'ばげん', 27, 105, 111, 80, 65, 90, ['西涼の騎'], 'cavalry', '涼州の馬氏の末と称する騎将。軽騎で遠く駆けることを得意とする。', '気まぐれで勇敢', '驍騎校尉'),
 P('vh_zhou_jing', '周景', 'しゅうけい', 33, 110, 95, 104, 96, 99, ['長江の水将'], 'infantry', '廬江の人。長江の流れを知り尽くし、荊州水軍を率いる。', '穏やかで粘り強い', '荊州水軍の都督'),
 P('vh_xu_wenyuan', '徐文遠', 'じょぶんえん', 39, 97, 70, 110, 115, 95, ['富国の策'], None, '東海の人。帳簿と治水に通じ、江陵の財政を立て直した。', '倹約家で口うるさい', '江陵太守'),
 P('vh_wang_mingde', '王明徳', 'おうめいとく', 42, 85, 58, 108, 116, 102, ['安民の治'], None, '太原の人。地方官として民に慕われた。新野の守りを任される。', '温厚で忍耐強い', '新野太守'),
 P('vh_xun_jingming', '荀景明', 'じゅんけいめい', 36, 88, 62, 113, 112, 100, ['人物鑑定'], None, '潁川の人。人物の評に優れ、多くの英傑を劉皓に推挙した。', '洒脱で人好き', '吏部尚書'),
 P('vh_xie_xuanzhi', '謝玄之', 'しゃげんし', 28, 98, 82, 110, 106, 104, ['弁舌の士'], 'infantry', '陳郡の人。弁舌で諸侯のあいだを渡り、楚の外交を担う。', '機知に富み、少し軽率', '大鴻臚'),
 P('vh_lu_cheng', '陸承', 'りくしょう', 30, 106, 95, 102, 97, 95, ['水陸の備え'], 'infantry', '呉郡の人。武昌の城を固め、長江の守りを担う。', '堅実で融通がきかない', '武昌太守'),
 P('vh_qin_wu', '秦武', 'しんぶ', 24, 98, 113, 76, 60, 92, ['鉄壁の盾'], 'infantry', '関中の兵の家の出。重い鎧の玄甲軍を率いて、一歩も退かない。', '無口で頑固', '玄甲軍の将'),
 P('vh_su_wan', '蘇婉', 'そえん', 25, 78, 60, 112, 110, 115, ['仁医'], None, '襄陽の医家の娘。戦で傷ついた兵を数多く救い、楚の民政にも加わる。', '優しく芯が強い', '太医令', gender='female'),
 P('vh_shen_yuehua', '沈月華', 'しんげっか', 23, 95, 96, 108, 98, 110, ['月華の弩'], 'archer', '呉興の武門の娘。弩の名手として神弩軍を率いる。', '凛として誇り高い', '神弩軍の将', gender='female'),
 P('vh_gu_qinglan', '顧清蘭', 'こせいらん', 27, 80, 65, 108, 115, 108, ['清廉の政'], None, '呉郡顧氏の娘。清廉な政治で知られ、楚の財政と法令を整える。', '理知的で公平', '尚書左丞', gender='female'),
 # ---- Version 65:皇族(劉皓の妻と子孫)。能力値は成人時の目標(年少のあいだは成長の計算で小さく出る) ----
 P('vh_xie_rong', '謝蓉', 'しゃよう', 0, 72, 45, 108, 104, 112, ['賢后'], None, '陳郡謝氏の娘と伝えられる(架空)。劉皓の正室で、楚王后。聡明で、劉皓の留守には襄陽の内政を支えた。', '穏やかで芯が強い', '楚王后', gender='female', born=282),
 P('vh_liu_cheng', '劉承', 'りゅうしょう', 0, 115, 108, 116, 118, 119, ['帝王之器', '仁政', '皇統継承'], 'infantry', '劉皓と謝蓉の嫡長子。幼いころから帝王の教育を受け、文武に秀でる万能の後継者に育つ(架空)。', '温厚で思慮深い', '世子', born=300),
 P('vh_liu_wei', '劉威', 'りゅうい', 0, 118, 120, 96, 85, 108, ['武神', '破軍', '遠征無双'], 'cavalry', '劉皓の次男。父ゆずりの武勇で、長じて漢軍随一の猛将となる(架空)。', '豪快で一本気', '', born=302),
 P('vh_liu_rui', '劉睿', 'りゅうえい', 0, 103, 82, 120, 119, 110, ['神算鬼謀', '王佐之才', '富国強兵'], None, '劉皓の三男。祖父 劉浩の才を受け継ぎ、知略と政治で兄たちを支える(架空)。305年に生まれるのは、両親がそろい夫婦であるときだけ。', '冷静で緻密', '', born=305),
 P('vh_liu_ying', '劉瑛', 'りゅうえい(女)', 0, 98, 80, 115, 114, 120, ['才色兼備', '外交無双', '人心掌握'], None, '劉皓の長女。才知と美しさで知られ、外交の場で諸国の王を感服させる(架空)。307年に生まれるのは、両親がそろい夫婦であるときだけ。', '明るく聡明', '', gender='female', born=307),
 P('vh_liu_hong', '劉弘', 'りゅうこう(皇孫)', 0, 118, 112, 118, 118, 120, ['中興之主', '文武双全', '盛世創造'], 'cavalry', '劉承と韓瑤の嫡長子。劉皓の面影を最も強く受け継ぐ皇孫(架空)。320年に生まれるのは、劉承と韓瑤がともに生き、夫婦になっているときだけ。史実の劉弘(荊州刺史)とは別の人物。', '快活で度量が大きい', '', born=320),
 P('vh_han_yao', '韓瑤', 'かんよう', 0, 70, 50, 100, 98, 108, ['賢后'], None, '韓玄策の娘(架空)。のちに劉承の正室となる。', '控えめで聡い', '', gender='female', born=302),
]
save(os.path.join(SC, 'persons.virtual.json'), {'note': '仮想シナリオ(炎漢再興)の架空の人物。史実の人物の台帳(s317.persons・persons.extra)とは別に管理する。能力値は仮想シナリオに限り120まで。', 'persons': PERSONS})

# ---- シナリオ ----
b = load(os.path.join(SC, f'{BASE}.json'))
s = copy.deepcopy(b)
s.update({'id': SID, 'year': Y, 'startMonth': 10, 'name': '炎漢再興 ― 天命を継ぐ者', 'virtual': True, 'statCap': 120,
          'summary': '【仮想シナリオ】304年、八王の乱で晋が乱れるなか、楚思王 劉衍の末裔と伝えられる劉皓が、祖父・父とともに荊州の襄陽で楚王を称した。漢室の再興は成るか。',
          'scenarioNote': '仮想シナリオ(ゲームの創作)。304年の史実の勢力図(シナリオ「五胡十六国の幕開け」)に、劉皓の楚の独立(襄陽・江陵・宛・新野・武昌)と、その人物・軍団だけを重ねた。劉皓・劉浩・劉雄と20人の家臣はすべて架空の人物。新野は史実のシナリオの地図には無い都市で、この仮想シナリオだけに置く。能力値の上限は、このシナリオに限り120。'})
s['factions'] = [{'id': 'chu', 'name': '楚', 'people': '漢', 'ruler': '劉皓', 'color': '#c8322a', 'title': '楚王'}] + s['factions']
for c in CHU: s['cityOwners'][c] = 'chu'
s['uncertainOwners'] = [c for c in s.get('uncertainOwners', []) if c not in CHU]
s['ownerNote'] = (s.get('ownerNote') or '') + ' 襄陽・江陵・宛・新野・武昌は、仮想設定で楚(劉皓)のもの。'
s['extraCities'] = [{'id': 'xinye', 'name': '新野', 'reading': 'しんや', 'lon': 112.36, 'lat': 32.52, 'rank': 'town', 'description': '宛と襄陽のあいだ、淯水のほとりの城(仮想シナリオだけに置く都市)。', 'level': 1, 'population': 12000, 'defense': 50, 'garrison': 2000, 'economy': 9, 'food': 14, 'transport': 2, 'military': 2}]
# 史実の荊州の守り(劉弘・陶侃)は、晋のほかの都市へ移る
gov = {k: v for k, v in s['governors'].items() if k not in CHU}
gov.update({'xiangyang': 'vh_liu_hao_f', 'jiangling': 'vh_xu_wenyuan', 'wan': 'vh_han_xuance', 'wuchang': 'vh_lu_cheng', 'xinye': 'vh_wang_mingde'})
s['governors'] = gov
s['governorNote'] = (s.get('governorNote') or '') + ' 楚の太守は仮想設定。'
roster = s['roster']
if 'liu_hong' in roster: roster['liu_hong'] = {**roster['liu_hong'], 'cityId': 'shangyong', 'note': '仮想シナリオ:荊州を楚に奪われ、上庸に退いた(史実では襄陽にいた)'}
if 'tao_kan' in roster: roster['tao_kan'] = {**roster['tao_kan'], 'cityId': 'changsha', 'note': '仮想シナリオ:武昌が楚のものになったため、長沙に置く(史実の所在は推定で武昌の近く)'}
home = {'vh_liu_hao': 'xiangyang', 'vh_liu_hao_f': 'xiangyang', 'vh_liu_xiong': 'xiangyang', 'vh_huo_lie': 'xiangyang', 'vh_han_xuance': 'wan', 'vh_pei_xuan': 'xiangyang', 'vh_chen_xu': 'jiangling',
        'vh_yang_hu': 'wan', 'vh_zhuge_xiang': 'jiangling', 'vh_zhao_lingyun': 'xiangyang', 'vh_wei_tian': 'wan', 'vh_murong_qian': 'wan', 'vh_ma_xuan': 'xiangyang', 'vh_zhou_jing': 'wuchang',
        'vh_xu_wenyuan': 'jiangling', 'vh_wang_mingde': 'xinye', 'vh_xun_jingming': 'xiangyang', 'vh_xie_xuanzhi': 'xiangyang', 'vh_lu_cheng': 'wuchang', 'vh_qin_wu': 'wan', 'vh_su_wan': 'xiangyang',
        'vh_shen_yuehua': 'jiangling', 'vh_gu_qinglan': 'xiangyang', 'vh_xie_rong': 'xiangyang'}
# 名簿に入れるのは開始時に12歳以上の人だけ(劉承・劉威・韓瑤は、開始時に親のもとへ自動で加わる。劉睿・劉瑛・劉弘は条件がそろえば生まれる)
for p in [q for q in PERSONS if q['id'] in home]:
    roster[p['id']] = {'factionId': 'chu', 'cityId': home[p['id']], **({'role': 'ruler'} if p['id'] == 'vh_liu_hao' else {})}
CITY = {c['id']: c for c in load(os.path.join(ROOT, 'src/data/regions/north-china/cities.json'))}
CITY['xinye'] = s['extraCities'][0]
def army(id, name, cmd, at, inf, cav, arc, dlon=0, dlat=0, naval=False):
    c = CITY[at]
    o = {'id': id, 'name': name, 'factionId': 'chu', 'commanderId': cmd, 'lon': round(c['lon'] + dlon, 2), 'lat': round(c['lat'] + dlat, 2), 'facing': 0,
         'troops': {'infantry': inf, 'cavalry': cav, 'archer': arc}, 'morale': 85, 'fatigue': 5, 'food': 60}
    if naval: o['naval'] = True
    return o
CORPS = [
 army('army_huanglong', '皇龍禁軍', 'vh_liu_hao', 'xiangyang', 10000, 6000, 4000, dlat=0.25),
 army('army_shenwu', '神武軍', 'vh_huo_lie', 'xiangyang', 10000, 3000, 2000, dlon=0.3, dlat=0.1),
 army('army_tiance', '天策軍', 'vh_wei_tian', 'wan', 6000, 7000, 2000, dlat=0.25),
 army('army_bailong', '白龍騎', 'vh_zhao_lingyun', 'xiangyang', 0, 9000, 1000, dlon=-0.3, dlat=0.15),
 army('army_yulin', '羽林騎', 'vh_chen_xu', 'jiangling', 0, 8000, 2000, dlat=0.25),
 army('army_xuanjia', '玄甲軍', 'vh_qin_wu', 'wan', 9000, 0, 1000, dlon=0.3),
 army('army_shennu', '神弩軍', 'vh_shen_yuehua', 'jiangling', 2000, 0, 8000, dlon=0.3),
 army('army_jingzhou_navy', '荊州水軍', 'vh_zhou_jing', 'wuchang', 6000, 0, 4000, dlon=-0.25, naval=True),
]
assert sum(sum(a['troops'].values()) for a in CORPS) == 100000
s['armies'] = [a for a in s['armies']] + CORPS
s['relations'] = {**s.get('relations', {}), 'chu|jin': 'war'}
s['relationNote'] = (s.get('relationNote') or '') + ' 楚は西晋(河間王の朝廷)と開戦している(仮想設定)。'
s['startTreasury'] = {'chu': {'gold': 200000, 'grain': 1000000}}
# 検査:人物の死者・重複・太守と指揮官の兼任
cmd = {a['commanderId'] for a in s['armies']}
assert not (cmd & set(s['governors'].values())), cmd & set(s['governors'].values())
assert len([1 for p in PERSONS if p['id'] in home]) == 24  # 武将23人+楚王后
save(os.path.join(SC, f'{SID}.json'), s)

# ---- 首都・外交・家系・宝物・配置・目録(s304 を写して、楚を足す) ----
p = os.path.join(SC, 'capitals.json'); d = load(p)
d['scenarios'][SID] = {**copy.deepcopy(d['scenarios'][BASE]), 'chu': {'city': 'xiangyang', 'certainty': '架空', 'note': '襄陽(仮想シナリオの楚の都)'}}
save(p, d)
p = os.path.join(RULES, 'diplomacyStart.json'); d = load(p)
d[SID] = {**copy.deepcopy(d.get(BASE, {})), 'chu|yue': {'rel': 'hostile', 'basis': '推定', 'note': '仮想設定:東海王 司馬越も楚の自立を認めない'}, 'chenghan|chu': {'rel': 'friendly', 'basis': '推定', 'note': '仮想設定:晋に背いた者どうし、成とは使者を通じる'}}
save(p, d)
p = os.path.join(SC, 'placements.json'); d = load(p)
pl = copy.deepcopy(d['scenarios'].get(BASE, {}))
for k, v in list(pl.items()):
    if v.get('at') in CHU: del pl[k]
d['scenarios'][SID] = pl
import sys; sys.path.insert(0, os.path.dirname(__file__))
from jsonstyle import dump_placements
open(p, 'w', encoding='utf-8').write(dump_placements(d))
p = os.path.join(RULES, 'family.json'); d = load(p)
d['parents']['vh_liu_hao'] = {'father': 'vh_liu_hao_f', 'note': '仮想シナリオの架空の家系(楚思王 劉衍の末裔という設定)'}
d['parents']['vh_liu_hao_f'] = {'father': 'vh_liu_xiong', 'note': '仮想シナリオの架空の家系'}
d['heirs'][SID] = {**copy.deepcopy(d['heirs'].get(BASE, {}))}
d['ranks'][SID] = {**copy.deepcopy(d['ranks'].get(BASE, {})), 'chu': 'king'}
for c, fam in {'vh_liu_cheng': ('vh_liu_hao', 'vh_xie_rong', False), 'vh_liu_wei': ('vh_liu_hao', 'vh_xie_rong', False), 'vh_liu_rui': ('vh_liu_hao', 'vh_xie_rong', True),
               'vh_liu_ying': ('vh_liu_hao', 'vh_xie_rong', True), 'vh_liu_hong': ('vh_liu_cheng', 'vh_han_yao', True), 'vh_han_yao': ('vh_han_xuance', None, False)}.items():
    e = {'father': fam[0], 'note': '仮想シナリオの架空の家系'}
    if fam[1]: e['mother'] = fam[1]
    if fam[2]: e['conditional'] = True
    d['parents'][c] = e
d['marriages'] = [m for m in d['marriages'] if not (m[0] == 'vh_liu_hao' and m[1] == 'vh_xie_rong')] + [['vh_liu_hao', 'vh_xie_rong', 'primary', '仮想シナリオ:劉皓の正室(楚王后)']]
d['plannedMarriages'] = [{'husband': 'vh_liu_cheng', 'wife': 'vh_han_yao', 'kind': 'primary', 'minAge': 16, 'scenarios': ['s304v'], 'note': '仮想シナリオ:劉承と韓瑤は、ともに16歳になり生きていれば夫婦になる(劉弘の両親)'}]
d['_noteConditional'] = 'parents の conditional:その年に両親が生きて夫婦であるときだけ生まれる子(仮想シナリオの劉睿・劉瑛・劉弘)。2年遅れまで待ち、条件がそろわなければ生まれない。'
d['_noteVirtual'] = '仮想シナリオ(s304v):劉雄→劉浩→劉皓の三代は架空の家系。史実の人物とは別のID(vh_)で管理する。'
save(p, d)
p = os.path.join(ROOT, 'src/data/treasures/treasures.json'); d = load(p)
for t in d['items']:
    h = t.get('holdings', {})
    if BASE in h: h[SID] = h[BASE]
save(p, d)
p = os.path.join(SC, 'catalog.json'); d = load(p)
E = {'id': SID, 'year': Y, 'title': '炎漢再興 ― 天命を継ぐ者', 'summary': '楚思王の末裔と伝えられる劉皓が、荊州の襄陽で楚王を称し、漢室の再興を目指す(仮想シナリオ)。', 'status': 'ready', 'category': 'virtual',
     'powers': ['楚(劉皓)', '西晋', '東海王 司馬越', '漢(劉淵)', '成(李雄)'], 'figures': ['劉皓', '劉浩', '劉雄', '司馬越', '劉淵']}
ids = [e['id'] for e in d['scenarios']]
if SID in ids: d['scenarios'][ids.index(SID)] = E
else: d['scenarios'].append(E)
save(p, d)
print('ok', len(s['roster']), 'persons', len(s['armies']), 'armies')
