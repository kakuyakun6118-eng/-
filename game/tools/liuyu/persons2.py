"""劉裕の北伐の2つのシナリオで、勢力の君主・重臣として要る人物を足す(persons.py の追加分)。能力値はゲーム上の推定。"""
import json, sys
sys.path.insert(0, 'tools/liuyu')
P = 'src/data/scenarios/persons.extra.json'
d = json.load(open(P, encoding='utf-8'))
have = {x['id'] for x in d['persons']}
def p(id, name, reading, born, died, role, title, L, W, I, Po, C, traits, unit, bio, people='漢', uncertain=False):
    o = {'id': id, 'name': name, 'reading': reading, 'born': born, 'died': died, 'factionId': '', 'role': role, 'title': title,
         'leadership': L, 'war': W, 'intelligence': I, 'politics': Po, 'charisma': C, 'traits': traits, 'favoredUnit': unit, 'bio': bio, 'people': people}
    if uncertain: o['datesUncertain'] = True
    return o
NEW = [
 p('he_wuji', '何無忌', 'かむき', None, 410, 'general', '江州刺史', 76, 74, 68, 62, 70, ['忠烈'], 'infantry', '劉牢之の甥。劉裕とともに桓玄打倒の兵を挙げた。410年、盧循・徐道覆の軍を豫章で迎え撃って戦死した。', uncertain=True),
 p('zhuge_changmin', '諸葛長民', 'しょかつちょうみん', None, 413, 'general', '豫州刺史', 66, 68, 58, 50, 55, ['野心'], 'infantry', '桓玄打倒の挙兵に加わった一人。劉裕の北伐中に建康の留守を預かったが、のち劉裕に疑われて殺された。', uncertain=True),
 p('sima_xiuzhi', '司馬休之', 'しばきゅうし', None, 417, 'general', '荊州刺史', 62, 58, 64, 62, 66, ['宗室'], 'infantry', '晋の宗室。荊州刺史として劉裕と対立し、415年に敗れて後秦へ逃れた。後秦の滅亡後は北魏に移った。', uncertain=True),
 p('qiao_daofu', '譙道福', 'しょうどうふく', None, 413, 'general', '輔国将軍', 66, 70, 52, 40, 50, ['勇将'], 'infantry', '譙縦の将。蜀の守りを担ったが、413年に敗れて殺された。', uncertain=True),
 p('tuoba_tao', '拓跋燾', 'たくばつとう', 408, 452, 'general', '泰平王', 92, 90, 84, 78, 82, ['天才', '騎兵の名手'], 'cavalry', '拓跋嗣の長子(北魏の太武帝)。のちに夏・北燕・北涼を滅ぼして華北を統一した。', people='鮮卑'),
 p('yang_sheng', '楊盛', 'ようせい', None, 425, 'ruler', '仇池公', 66, 66, 68, 66, 66, ['懐柔'], 'cavalry', '仇池の氐の首長。東晋と後秦のあいだで巧みに立ち回り、漢中をうかがった。', people='氐', uncertain=True),
 p('shuluogan', '樹洛干', 'じゅらくかん', None, 417, 'ruler', '吐谷渾の王', 66, 66, 62, 64, 70, [], 'cavalry', '吐谷渾の王。散っていた部衆を集めて国を立て直した。', people='鮮卑', uncertain=True),
 p('gwanggaeto', '広開土王', 'こうかいどおう', 374, 412, 'ruler', '高句麗王', 90, 86, 80, 82, 88, ['征服者'], 'cavalry', '高句麗の第19代の王。遼東を得て、百済・倭と戦い、国の版図を大きく広げた。', people='高句麗'),
 p('jangsu', '長寿王', 'ちょうじゅおう', 394, 491, 'general', '太子', 80, 72, 86, 88, 82, ['長命'], 'cavalry', '広開土王の子。412年に即位し、427年に都を平壌へ移した。', people='高句麗'),
 p('jeonji', '腆支王', 'てんしおう', None, 420, 'ruler', '百済王', 60, 58, 62, 62, 64, [], 'infantry', '百済の王。倭に人質として出されていたが、405年に帰国して即位した。', people='百済', uncertain=True),
 p('juqu_mujian', '沮渠牧犍', 'しょきょぼくけん', None, 447, 'general', '世子', 58, 55, 66, 62, 58, [], 'cavalry', '沮渠蒙遜の子。のちに北涼を継いだ。', people='盧水胡', uncertain=True),
 p('yao_zan', '姚讃', 'ようさん', None, 417, 'general', '征東将軍', 66, 66, 60, 50, 55, [], 'cavalry', '姚興の弟(一説に族弟)。北伐の軍を防ごうとしたが敗れた。', people='羌', uncertain=True),
]
added = 0
for o in NEW:
    if o['id'] in have: print('skip existing', o['id']); continue
    d['persons'].append(o); added += 1
json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('added', added)
