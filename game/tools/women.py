#!/usr/bin/env python3
"""女性人物を台帳に加え、各シナリオの名簿に置く。史料に名前・事績の残る人物だけを入れる。
name に実名が伝わらない人は、史書での呼び方(劉氏など)。生没年が不明なものは null。"""
import json, os
D = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'scenarios')
# id|名前|読み|生|没|民族|役割|基本の身分|統|武|知|政|魅|外交|文化|経歴|注記|[年:勢力:身分:居所 ...]
W = '''
yang_xianrong|羊献容|ようけんよう||322|漢|m|皇后|20|10|62|58|80|60|62|泰山の羊氏。300年に恵帝の皇后となり、廃立を繰り返された。311年に洛陽が落ちると劉曜の妻とされ、のちに前趙の皇后となった。|300年の皇后冊立は11月。9月開始のシナリオでは、皇后に選ばれる前|300:jin:皇后に選ばれる(推定):luoyang 304:jin:皇后:changan 311:han_zhao:劉曜の妻:pingyang 317:han_zhao:劉曜の妻:changan 319:han_zhao:趙の皇后:changan
liu_e|劉娥|りゅうが||314|匈奴|m|劉聡の貴嬪|10|8|72|60|78|45|70|劉殷の娘。劉聡の貴嬪、のち皇后。劉聡を諫めて、陳元達の命を救ったと伝わる。||311:han_zhao:劉聡の貴嬪:pingyang
huyan_hou|呼延氏|こえんし||312|匈奴|m|劉聡の皇后|10|8|55|50|60|48|45|劉聡の最初の皇后。名は伝わらない。|名は伝わらない|311:han_zhao:劉聡の皇后:pingyang
jin_yuehua|靳月華|きんげつか|||匈奴|m|劉聡の皇后|10|8|55|48|74|40|45|靳準の娘。劉聡の皇后となった。|318年の靳準の乱の後の消息は不明|317:han_zhao:劉聡の皇后:pingyang
liu_shile|劉氏|りゅうし||333|羯|m|石勒の后|25|15|78|72|70|64|50|石勒の后。名は伝わらない。石勒の相談相手で、張賓に劣らない知恵があったと伝わる。|名は伝わらない|311:shile:石勒の妻:xuchang 317:shile:石勒の妻:xiangguo 319:shile:趙王の后:xiangguo 329:shile:趙天王の后:xiangguo
zheng_yingtao|鄭桜桃|ていおうとう|||漢|m|石虎の妃|10|8|58|40|72|35|48|石虎の寵愛を受けた妃。石邃の母。|生没年は不明|329:shile:石虎の妃:ye
ren_lixiong|任氏|じんし|||巴氐|m|李雄の皇后|15|10|60|62|68|50|52|李雄の皇后。名は伝わらない。|名・生没年は不明|311:chenghan:李雄の妻:chengdu 317:chenghan:李雄の皇后:chengdu 319:chenghan:李雄の皇后:chengdu 329:chenghan:李雄の皇后:chengdu
xun_guan|荀灌|じゅんかん|303||漢|g|荀崧の娘|62|58|70|45|78|60|55|荀崧の娘。宛が囲まれたとき、13歳で数十人を率いて夜に城を抜け出し、援軍を呼んで父を救ったと伝わる。|生年は、13歳ごとの事績から逆算した推定|317:jin:荀崧の娘:wan 319:jin:荀崧の娘:wan
zheng_achun|鄭阿春|ていあしゅん||326|漢|m|晋王の夫人|10|8|60|52|76|42|60|元帝(司馬睿)の夫人。司馬昱(のちの簡文帝)の母。||317:jin:晋王の夫人:jiankang 319:jin:元帝の夫人:jiankang
yu_wenjun|庾文君|ゆぶんくん|297|328|漢|m|太子妃|12|8|64|66|76|56|62|庾亮の妹。明帝の皇后となり、成帝が幼くして即位すると、皇太后として政治を見た。||317:jin:世子の妃:jiankang 319:jin:皇太子妃:jiankang
wei_shuo|衛鑠|えいしゃく|272|349|漢|m|書家(衛夫人)|10|8|78|50|80|50|96|河東の衛氏。書の名人で「衛夫人」と呼ばれた。王羲之に書を教えたと伝わる。||300:jin:書家:luoyang 304:jin:書家:luoyang 311:jin_rui:書家:jiankang 317:jin:書家:jiankang 319:jin:書家:jiankang 329:jin:書家:jiankang
xi_xuan|郗璿|ちせん|||漢|m|王羲之の妻|10|8|74|50|72|48|86|郗鑒の娘。王羲之の妻で、書にすぐれ「女中の仙筆」と呼ばれた。長寿だった。|生没年は不明|329:jin:郗鑒の娘:jingkou 357:jin:王羲之の妻:kuaiji 383:jin:王羲之の妻:kuaiji
sima_xingnan|司馬興男|しばこうだん|||漢|m|南康長公主|10|8|62|55|72|62|58|明帝の娘。桓温の妻。|生没年は不明|357:jin:南康長公主(桓温の妻):jiangling
chu_suanzi|褚蒜子|ちょさんし|324|384|漢|m|皇太后|15|8|80|86|82|76|70|褚裒の娘。康帝の皇后。幼い穆帝・哀帝・海西公・孝武帝の時代に、長く皇太后として政治を見た。||357:jin:皇太后(臨朝):jiankang 383:jin:太皇太后:jiankang
he_fani|何法倪|かほうげい|339|404|漢|m|皇后|10|8|58|52|70|44|58|穆帝の皇后。||357:jin:穆帝の皇后:jiankang 383:jin:穆章皇后:jiankang
wang_muzhi|王穆之|おうぼくし||365|漢|m|琅邪王妃|10|8|58|50|68|42|58|太原の王氏。のちに哀帝の皇后となった。||357:jin:琅邪王妃:jiankang
liu_xiean|劉氏|りゅうし|||漢|m|謝安の妻|10|8|70|52|68|50|70|劉惔の妹。謝安の妻。名は伝わらない。『世説新語』に逸話が残る。|名・生没年は不明|357:jin:謝安の妻:kuaiji 383:jin:謝安の妻:jiankang
xie_daoyun|謝道韞|しゃどううん|||漢|m|謝奕の娘|35|20|86|58|84|56|95|謝奕の娘、謝安の姪。詩才で知られ、「柳絮の才」の話が残る。のちに王凝之の妻となった。|生年は不明。357年に12歳以上だったとするのは推定|357:jin:謝奕の娘:kuaiji 383:jin:王凝之の妻:kuaiji
li_shimei|李氏|りし|||巴氐|m|李勢の妹|10|8|60|40|86|40|58|成漢の最後の主・李勢の妹。成漢が滅んだのち、桓温の側室となった。南康長公主との逸話が残る。名は伝わらない。|名・生没年は不明|357:jin:桓温の側室:jiangling
li_lingrong|李陵容|りりょうよう|351|400|漢|m|皇太妃|10|8|58|50|62|42|50|簡文帝の妃。孝武帝の母。||383:jin:孝武帝の母(淑妃):jiankang
wang_yulv|王氏|おうし|||鮮卑|m|拓跋鬱律の妃|35|20|72|62|70|56|45|広寧の人。拓跋鬱律の妃。321年に鬱律が殺されたとき、幼い什翼犍を袴の中に隠して守ったと伝わる。名は伝わらない。|名・生没年は不明。民族は推定|317:dai:鬱律の妃:shengle 319:dai:鬱律の妃:shengle 329:dai:什翼犍の母:shengle
kezuhun|可足渾氏|かそくこんし|||鮮卑|m|燕の皇后|20|10|62|58|60|52|42|慕容儁の皇后。名は伝わらない。慕容垂とその妻の段氏を憎み、陥れたと伝わる。|名・生没年は不明|357:qianyan:燕の皇后:ji
duan_chui|段氏|だんし||358|鮮卑|m|呉王妃|20|12|76|62|78|58|70|段末波の娘。慕容垂の妻。才気があったが、可足渾皇后に陥れられ、獄中で死んだと伝わる。名は伝わらない。|名は伝わらない。没年は推定|357:qianyan:呉王妃:ji
gou_taihou|苟氏|こうし||375|氐|m|東海王の母|25|15|70|72|72|60|50|苻雄の妻、苻堅の母。名は伝わらない。苻堅が即位すると皇太后となった。|名は伝わらない。没年は推定|357:qianqin:東海王の母:changan
zhang_furen|張夫人|ちょうふじん|||漢|m|苻堅の夫人|10|8|76|62|66|52|60|苻堅の夫人。東晋への出兵に反対し、苻堅を諫めたと伝わる。名は伝わらない。|名・生没年は不明|383:qianqin:苻堅の夫人:changan
su_hui|蘇蕙|そけい|||漢|m|竇滔の妻|10|8|86|45|70|40|96|始平の人。前秦の竇滔の妻。夫に、縦横どちらからも読める回文詩「璇璣図」を織って送ったと伝わる。|生没年は不明。383年に生存とするのは推定|383:qianqin:竇滔の妻:changan
'''
ROLE = {'g': 'general', 's': 'strategist', 'm': 'minister', 'r': 'ruler'}
ledger_path = os.path.join(D, 'persons.extra.json')
led = json.load(open(ledger_path, encoding='utf-8'))
existing = {p['id'] for p in led['persons']} | {p['id'] for p in json.load(open(os.path.join(D, 's317.persons.json'), encoding='utf-8'))['persons']}
led['persons'] = [p for p in led['persons'] if p.get('gender') != 'female' or p['id'] == 'qi_shi']
placements = {}
for line in W.strip().split('\n'):
    c = line.split('|'); assert len(c) == 18, (len(c), c[0])
    pid = c[0]
    o = dict(id=pid, name=c[1], reading=c[2], born=int(c[3]) if c[3] else None, died=int(c[4]) if c[4] else None, factionId='', role=ROLE[c[6]], title=c[7],
             leadership=int(c[8]), war=int(c[9]), intelligence=int(c[10]), politics=int(c[11]), charisma=int(c[12]), diplomacy=int(c[13]), culture=int(c[14]),
             traits=[], favoredUnit='infantry' if c[6] == 'g' else None, bio=c[15], gender='female', people=c[5])
    if c[16]: o['note'] = c[16]
    if pid in existing and pid not in {p['id'] for p in led['persons']}: raise SystemExit('重複 ' + pid)
    led['persons'] = [p for p in led['persons'] if p['id'] != pid] + [o]
    for spec in c[17].split():
        y, fac, title, city = spec.split(':')
        placements.setdefault('s' + y, {})[pid] = dict(factionId=fac, title=title, cityId=city)
json.dump(led, open(ledger_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 祁氏(既存)にも女性の印と、外交・文化
s317p = os.path.join(D, 's317.persons.json'); d317 = json.load(open(s317p, encoding='utf-8'))
for p in d317['persons']:
    if p['id'] == 'qi_shi': p.update(gender='female', diplomacy=62, culture=40)
json.dump(d317, open(s317p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for sid, entries in placements.items():
    path = os.path.join(D, sid + '.json'); s = json.load(open(path, encoding='utf-8'))
    if 'roster' not in s:
        s['womenRoster'] = entries          # 317年は名簿を持たないので、別の欄に書く
    else:
        for pid, e in entries.items(): s['roster'][pid] = e
    json.dump(s, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1 if sid != 's317' else 2)
    print(sid, len(entries))
print('女性', sum(1 for p in led['persons'] if p.get('gender') == 'female') + 1)
