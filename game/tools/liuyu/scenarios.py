"""409年「劉裕の北伐 ― 南燕討伐」と416年「劉裕の北伐 ― 長安奪還」のシナリオを作る。
都市の持ち主・太守・軍団の位置は『晋書』『宋書』『魏書』『資治通鑑』の通説によるが、細部は「ゲーム上の推定」を含む(uncertainOwners に挙げる)。
使い方: python3 tools/liuyu/scenarios.py  (src/data/scenarios/s409.json・s416.json を作る)"""
import json, os
ROOT = os.path.join(os.path.dirname(__file__), '../..')
SC = os.path.join(ROOT, 'src/data/scenarios')
LED = {x['id']: x for x in json.load(open(f'{SC}/s317.persons.json', encoding='utf-8'))['persons'] + json.load(open(f'{SC}/persons.extra.json', encoding='utf-8'))['persons']}
CITY = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'src/data/regions/north-china/cities.json'), encoding='utf-8'))}

WEST = {  # 西域の国々(383年と同じ範囲。王の名は伝わらない)
    'shanshan': ('鄯善', '#b08a3e', 'shanshan_wang', ['shanshan', 'qiemo', 'jingjue', 'loulan']),
    'yutian': ('于闐', '#7a9a3a', 'yutian_wang', ['yutian']),
    'shule': ('疏勒', '#a86a3a', 'shule_wang', ['shache', 'shule']),
    'qiuci': ('亀茲', '#c0603a', 'qiuci_wang', ['qiuci', 'gumo', 'wensu']),
    'yanqi': ('焉耆', '#8a6aa8', 'yanqi_wang', ['yanqi', 'weili']),
    'jushi': ('車師前部', '#6a8aa8', 'jushi_wang', ['jiaohe', 'jushihou']),
}

def army(id, name, fac, cmd, at, inf, cav, arc, morale=75, food=50, dlon=0.0, dlat=0.0):
    c = CITY[at]
    return {'id': id, 'name': name, 'factionId': fac, 'commanderId': cmd, 'lon': round(c['lon'] + dlon, 2), 'lat': round(c['lat'] + dlat, 2), 'facing': 0,
            'troops': {'infantry': inf, 'cavalry': cav, 'archer': arc}, 'morale': morale, 'fatigue': 10, 'food': food}

def build(sid, year, month, name, summary, note, factions, owners, uncertain, ownerNote, relations, relationNote, roster, governors, armies, cityNames):
    # 西域
    for fid, (nm, col, ruler, cities) in WEST.items():
        factions.append({'id': fid, 'name': nm, 'people': nm, 'ruler': LED[ruler]['name'], 'color': col})
        roster[ruler] = {'factionId': fid, 'role': 'ruler'}
        for c in cities: owners[c] = fid
    # 開始時は、軍団の指揮官と太守を兼ねない(テスト13の決まり)。KEEP_GOV の人物は太守に残して軍団を外し、ほかは太守を外す
    KEEP_GOV = {'yao_guang', 'lu_xun', 'he_wuji', 'liu_daogui'}
    armies[:] = [a for a in armies if a['commanderId'] not in KEEP_GOV or a['commanderId'] not in governors.values()]
    cmd = {a['commanderId'] for a in armies}
    for c in [c for c, pid in governors.items() if pid in cmd]: del governors[c]
    missing = [c for c in CITY if c not in owners]
    assert not missing, (sid, missing)
    # 死者・未生の人物を入れない
    for pid in list(roster):
        p = LED.get(pid)
        assert p, (sid, 'no person', pid)
        assert not (p.get('died') and p['died'] < year), (sid, 'dead', pid, p['died'])
        assert not (p.get('born') and p['born'] > year), (sid, 'unborn', pid)
    fids = {f['id'] for f in factions}
    for k in relations:
        a, b = k.split('|'); assert a in fids and b in fids, k
    for c, pid in governors.items():
        assert c in CITY and pid in roster, (c, pid)
        roster[pid].setdefault('cityId', c)
    for a in armies:
        assert a['commanderId'] in roster and roster[a['commanderId']]['factionId'] == a['factionId'], a['id']
    for pid, r in roster.items():
        assert r['factionId'] in fids, (pid, r)
    return {'id': sid, 'year': year, 'startMonth': month, 'name': name, 'summary': summary, 'scenarioNote': note, 'factions': factions,
            'uncertainOwners': uncertain, 'ownerNote': ownerNote, 'cityNames': cityNames, 'relations': relations, 'relationNote': relationNote,
            'governors': governors, 'governorNote': '太守・守将は史料で確かめられる者を優先し、それ以外は経歴から推し量った(ゲーム上の推定)。', 'armies': armies, 'roster': roster, 'cityOwners': owners}

def own(d, fid, cities):
    for c in cities.split(): d[c] = fid

# ================= 409年 =================
def s409():
    o = {}
    own(o, 'jin', 'jiankang jingkou wu kuaiji yuzhang xunyang wuchang jiangling changsha panyu shian longbian jianning yongan xiangyang shangyong wan hefei shouchun huaiyin xiapi pengcheng qiao runan')
    own(o, 'nanyan', 'guanggu donglai')
    own(o, 'houqin', 'changan luoyang fengyi chencang anding puban hongnong xingyang xuchang junyi shanggui pingyang')
    own(o, 'beiwei', 'pingcheng shengle yanmen daijun jinyang shangdang lishi ye xiangguo zhongshan xindu ji yanci yewang')
    own(o, 'beiyan', 'jicheng tuhe lingzhi zimeng')
    own(o, 'xia', 'shuofang gaonu')
    own(o, 'xiqin', 'jincheng longxi')
    own(o, 'nanliang', 'guzang xiping')
    own(o, 'beiliang', 'zhangye')
    own(o, 'xiliang', 'jiuquan dunhuang gaochang yiwu')
    own(o, 'qiaoshu', 'chengdu baxi jiangzhou')
    own(o, 'chouchi', 'chouchi hanzhong')
    own(o, 'tuyuhun', 'tuyuhunting')
    own(o, 'goguryeo', 'wandu pyongyang xiangping xuantu')
    own(o, 'baekje', 'hanseong')
    own(o, 'silla', 'geumseong')
    F = [
        {'id': 'jin', 'name': '東晋', 'people': '漢', 'ruler': '司馬徳宗(安帝)', 'color': '#3c86c9'},
        {'id': 'nanyan', 'name': '南燕', 'people': '鮮卑', 'ruler': '慕容超', 'color': '#b8452f'},
        {'id': 'houqin', 'name': '後秦', 'people': '羌', 'ruler': '姚興', 'color': '#6b8f2f'},
        {'id': 'beiwei', 'name': '北魏', 'people': '鮮卑', 'ruler': '拓跋珪(道武帝)', 'color': '#5a4a8a'},
        {'id': 'xia', 'name': '夏', 'people': '匈奴', 'ruler': '赫連勃勃', 'color': '#8a2f2f'},
        {'id': 'beiyan', 'name': '北燕', 'people': '漢', 'ruler': '高雲', 'color': '#c27a2c'},
        {'id': 'xiqin', 'name': '西秦', 'people': '鮮卑', 'ruler': '乞伏乾帰', 'color': '#2f8a7a'},
        {'id': 'nanliang', 'name': '南涼', 'people': '鮮卑', 'ruler': '禿髪傉檀', 'color': '#a8833a'},
        {'id': 'beiliang', 'name': '北涼', 'people': '盧水胡', 'ruler': '沮渠蒙遜', 'color': '#4a6a9a'},
        {'id': 'xiliang', 'name': '西涼', 'people': '漢', 'ruler': '李暠', 'color': '#9a5a7a'},
        {'id': 'qiaoshu', 'name': '譙蜀', 'people': '漢', 'ruler': '譙縦', 'color': '#5a8a4a'},
        {'id': 'chouchi', 'name': '仇池', 'people': '氐', 'ruler': '楊盛', 'color': '#7a6a4a'},
        {'id': 'tuyuhun', 'name': '吐谷渾', 'people': '鮮卑', 'ruler': '樹洛干', 'color': '#904581'},
        {'id': 'goguryeo', 'name': '高句麗', 'people': '高句麗', 'ruler': '広開土王', 'color': '#3a7a9a'},
        {'id': 'baekje', 'name': '百済', 'people': '百済', 'ruler': '腆支王', 'color': '#9a7a3a'},
        {'id': 'silla', 'name': '新羅', 'people': '新羅', 'ruler': '実聖尼師今', 'color': '#7a9a6a'},
    ]
    R = {
        'sima_dezong': {'factionId': 'jin', 'role': 'ruler', 'title': '安帝', 'cityId': 'jiankang'},
        'sima_dewen': {'factionId': 'jin', 'title': '琅邪王(安帝の弟)', 'cityId': 'jiankang'},
        'liu_yu_song': {'factionId': 'jin', 'title': '車騎将軍・揚州刺史・録尚書事'},
        'liu_muzhi': {'factionId': 'jin', 'title': '丹陽尹(留守の政務)', 'cityId': 'jiankang'},
        'meng_chang': {'factionId': 'jin', 'title': '尚書左僕射', 'cityId': 'jiankang'},
        'xie_yu': {'factionId': 'jin', 'title': '吏部尚書(推定)', 'cityId': 'jiankang'},
        'liu_yi2': {'factionId': 'jin', 'title': '撫軍将軍・豫州刺史', 'cityId': 'jiankang'},
        'zhuge_changmin': {'factionId': 'jin', 'title': '監太尉留府事'},
        'he_wuji': {'factionId': 'jin', 'title': '鎮南将軍・江州刺史'},
        'liu_daogui': {'factionId': 'jin', 'title': '荊州刺史'},
        'liu_daolian': {'factionId': 'jin', 'title': '彭城内史(推定)'},
        'liu_jingxuan': {'factionId': 'jin', 'title': '中軍諮議参軍(推定)'},
        'wang_zhene': {'factionId': 'jin', 'title': '中軍参軍'},
        'tan_daoji': {'factionId': 'jin', 'title': '太尉参軍'},
        'shen_tianzi': {'factionId': 'jin', 'title': '振武将軍(推定)'},
        'shen_linzi': {'factionId': 'jin', 'title': '参軍(推定)'},
        'zhu_lingshi': {'factionId': 'jin', 'title': '寧朔将軍'},
        'zhu_chaoshi': {'factionId': 'jin', 'title': '参軍(推定)'},
        'hu_fan': {'factionId': 'jin', 'title': '参軍'},
        'ding_wu': {'factionId': 'jin', 'title': '劉裕の側近'},
        'wang_zhongde': {'factionId': 'jin', 'title': '太尉参軍(推定)'},
        'mao_dezu': {'factionId': 'jin', 'title': '参軍(推定)'},
        'fu_hongzhi': {'factionId': 'jin', 'title': '参軍(推定)', 'cityId': 'jingkou'},
        'xie_hui': {'factionId': 'jin', 'title': '参軍(推定)'},
        'xu_xianzhi': {'factionId': 'jin', 'title': '太尉左司馬(推定)', 'cityId': 'jiankang'},
        'fu_liang': {'factionId': 'jin', 'title': '員外散騎侍郎(推定)', 'cityId': 'jiankang'},
        'sima_xiuzhi': {'factionId': 'jin', 'title': '晋の宗室', 'cityId': 'jiankang'},
        'zhang_que': {'factionId': 'jin', 'title': '劉裕の夫人', 'cityId': 'jingkou'},
        # 劉裕の子(劉義符・劉義真・劉義隆)と拓跋燾は12歳未満のため名簿に入れない。開始時に親のもとへ自動で加わる(court.ts の addLivingChildren)
        'lu_xun': {'factionId': 'jin', 'title': '広州刺史(晋に任じられた盧循)', 'note': '410年に北伐の隙をついて北上する(盧循の反乱)'},
        'xu_daofu': {'factionId': 'jin', 'title': '始興相(盧循の一党)'},
        # 南燕
        'murong_chao': {'factionId': 'nanyan', 'role': 'ruler', 'title': '南燕の皇帝', 'cityId': 'guanggu'},
        'murong_zhen': {'factionId': 'nanyan', 'title': '征虜将軍'},
        'gongsun_wulou': {'factionId': 'nanyan', 'title': '尚書都督'},
        'murong_zhong': {'factionId': 'nanyan', 'title': '青州刺史(推定)'},
        'duan_hui': {'factionId': 'nanyan', 'title': '右僕射', 'cityId': 'guanggu'},
        'han_fan': {'factionId': 'nanyan', 'title': '尚書令', 'cityId': 'guanggu'},
        # 後秦
        'yao_xing': {'factionId': 'houqin', 'role': 'ruler', 'title': '後秦の天王', 'cityId': 'changan'},
        'yao_hong': {'factionId': 'houqin', 'title': '皇太子', 'cityId': 'changan'},
        'yao_bi': {'factionId': 'houqin', 'title': '広平公・雍州刺史'},
        'yao_shao': {'factionId': 'houqin', 'title': '東平公'},
        'yao_hui': {'factionId': 'houqin', 'title': '征北将軍(推定)'},
        'yao_yi': {'factionId': 'houqin', 'title': '陳留公(推定)'},
        'yao_guang': {'factionId': 'houqin', 'title': '洛陽の守将(推定)'},
        'yao_zan': {'factionId': 'houqin', 'title': '征東将軍(推定)'},
        'yao_nan': {'factionId': 'houqin', 'title': '将軍', 'cityId': 'changan'},
        'yao_qiang': {'factionId': 'houqin', 'title': '将軍', 'cityId': 'changan'},
        'yin_zhao': {'factionId': 'houqin', 'title': '尚書', 'cityId': 'changan'},
        'kumarajiva': {'factionId': 'houqin', 'title': '国師(長安で経典を訳す)', 'cityId': 'changan'},
        # 北魏
        'tuoba_gui': {'factionId': 'beiwei', 'role': 'ruler', 'title': '北魏の皇帝(道武帝)', 'cityId': 'pingcheng'},
        'tuoba_si': {'factionId': 'beiwei', 'title': '斉王', 'cityId': 'pingcheng'},
        'zhangsun_song': {'factionId': 'beiwei', 'title': '南平公', 'cityId': 'pingcheng'},
        'shusun_jian': {'factionId': 'beiwei', 'title': '将軍'},
        'xi_jin': {'factionId': 'beiwei', 'title': '将軍'},
        'cui_hao': {'factionId': 'beiwei', 'title': '博士祭酒', 'cityId': 'pingcheng'},
        # 夏
        'helian_bobo': {'factionId': 'xia', 'role': 'ruler', 'title': '大夏の天王・大単于', 'cityId': 'shuofang'},
        'helian_gui': {'factionId': 'xia', 'title': '赫連勃勃の子', 'cityId': 'shuofang'},
        'wang_maide': {'factionId': 'xia', 'title': '軍師'},
        # 北燕
        'gao_yun': {'factionId': 'beiyan', 'role': 'ruler', 'title': '北燕の天王', 'cityId': 'jicheng'},
        'feng_ba': {'factionId': 'beiyan', 'title': '侍中・征北大将軍'},
        # 西秦・南涼・北涼・西涼・譙蜀・仇池ほか
        'qifu_qiangui': {'factionId': 'xiqin', 'role': 'ruler', 'title': '秦王(409年に再び自立)'},
        'qifu_chipan': {'factionId': 'xiqin', 'title': '太子'},
        'tufa_rutan': {'factionId': 'nanliang', 'role': 'ruler', 'title': '涼王'},
        'juqu_mengxun': {'factionId': 'beiliang', 'role': 'ruler', 'title': '張掖公'},
        'juqu_mujian': {'factionId': 'beiliang', 'title': '沮渠蒙遜の子', 'cityId': 'zhangye'},
        'li_gao': {'factionId': 'xiliang', 'role': 'ruler', 'title': '涼公'},
        'li_xin': {'factionId': 'xiliang', 'title': '世子'},
        'qiao_zong': {'factionId': 'qiaoshu', 'role': 'ruler', 'title': '成都王'},
        'qiao_daofu': {'factionId': 'qiaoshu', 'title': '輔国将軍'},
        'yang_sheng': {'factionId': 'chouchi', 'role': 'ruler', 'title': '仇池公'},
        'shuluogan': {'factionId': 'tuyuhun', 'role': 'ruler', 'title': '吐谷渾の王'},
        'gwanggaeto': {'factionId': 'goguryeo', 'role': 'ruler', 'title': '高句麗王(好太王)'},
        'jangsu': {'factionId': 'goguryeo', 'title': '太子', 'cityId': 'wandu'},
        'jeonji': {'factionId': 'baekje', 'role': 'ruler', 'title': '百済王'},
        'silseong': {'factionId': 'silla', 'role': 'ruler', 'title': '新羅王'},
    }
    G = {'jiangling': 'liu_daogui', 'xunyang': 'he_wuji', 'hefei': 'zhuge_changmin', 'pengcheng': 'liu_daolian', 'panyu': 'lu_xun', 'shian': 'xu_daofu',
         'donglai': 'murong_zhong', 'anding': 'yao_bi', 'puban': 'yao_shao', 'shanggui': 'yao_hui', 'pingyang': 'yao_yi', 'luoyang': 'yao_guang', 'xuchang': 'yao_zan',
         'ye': 'shusun_jian', 'jincheng': 'qifu_qiangui', 'guzang': 'tufa_rutan', 'zhangye': 'juqu_mengxun', 'jiuquan': 'li_gao', 'dunhuang': 'li_xin',
         'chengdu': 'qiao_zong', 'baxi': 'qiao_daofu', 'chouchi': 'yang_sheng', 'tuyuhunting': 'shuluogan', 'wandu': 'gwanggaeto', 'hanseong': 'jeonji', 'geumseong': 'silseong'}
    A = [
        army('army_liu_yu', '劉裕の北伐軍', 'jin', 'liu_yu_song', 'xiapi', 20000, 1500, 8500, morale=86, food=60),
        army('army_liu_daogui', '劉道規の荊州軍', 'jin', 'liu_daogui', 'jiangling', 8000, 500, 3000),
        army('army_he_wuji', '何無忌の江州軍', 'jin', 'he_wuji', 'xunyang', 6000, 300, 2000),
        army('army_lu_xun', '盧循の広州の兵', 'jin', 'lu_xun', 'panyu', 15000, 0, 5000, morale=70),
        army('army_murong_zhen', '慕容鎮の鉄騎', 'nanyan', 'murong_zhen', 'guanggu', 12000, 14000, 4000, morale=72, dlon=-0.3),
        army('army_gongsun_wulou', '公孫五楼の軍', 'nanyan', 'gongsun_wulou', 'guanggu', 8000, 4000, 2000, morale=68),
        army('army_yao_xing', '姚興の本軍', 'houqin', 'yao_xing', 'changan', 25000, 15000, 8000),
        army('army_yao_bi', '姚弼の安定軍', 'houqin', 'yao_bi', 'anding', 8000, 8000, 2000),
        army('army_helian_bobo', '赫連勃勃の騎兵', 'xia', 'helian_bobo', 'shuofang', 4000, 20000, 2000, morale=82),
        army('army_tuoba_gui', '拓跋珪の本軍', 'beiwei', 'tuoba_gui', 'pingcheng', 15000, 30000, 5000),
        army('army_xi_jin', '奚斤の軍', 'beiwei', 'xi_jin', 'ye', 8000, 10000, 2000),
        army('army_feng_ba', '馮跋の軍', 'beiyan', 'feng_ba', 'jicheng', 8000, 8000, 2000),
        army('army_qifu', '乞伏乾帰の軍', 'xiqin', 'qifu_qiangui', 'jincheng', 5000, 8000, 1000),
        army('army_tufa', '禿髪傉檀の軍', 'nanliang', 'tufa_rutan', 'guzang', 6000, 9000, 1000),
        army('army_juqu', '沮渠蒙遜の軍', 'beiliang', 'juqu_mengxun', 'zhangye', 6000, 10000, 1000),
        army('army_li_gao', '李暠の軍', 'xiliang', 'li_gao', 'jiuquan', 6000, 5000, 1000),
        army('army_qiao', '譙道福の蜀軍', 'qiaoshu', 'qiao_daofu', 'baxi', 9000, 500, 3000),
    ]
    rel = {'jin|nanyan': 'war', 'houqin|xia': 'war', 'beiliang|nanliang': 'war', 'jin|qiaoshu': 'war'}
    return build('s409', 409, 4, '劉裕の北伐 ― 南燕討伐',
        '409年春。南燕の慕容超が淮北を荒らすと、東晋の実権を握る劉裕は北伐を決めた。北では後秦の姚興・北魏の拓跋珪・夏の赫連勃勃が争い、河西には四つの涼が並び立つ。',
        '開始は409年4月(劉裕が建康を発ち、水路で下邳に入った時期)。南燕は広固と東莱(山東半島)だけの小国だが、鮮卑の鉄騎が強い。後秦は南燕と結ぶが、夏との戦いで余力が少ない。盧循は晋の広州刺史として番禺にいるが、のちに北伐の隙をついて背く。西秦の乞伏乾帰は後秦の臣下から409年7月に再び自立する(開始時は後秦に従う)。人物の生死・所属は『晋書』『宋書』『魏書』『資治通鑑』の通説により、不確かなところはゲーム上の推定。',
        F, o, ['runan', 'qiao', 'wan', 'junyi', 'xuchang', 'yewang', 'lishi', 'lingzhi', 'zimeng', 'hanzhong', 'gaonu', 'gaochang', 'yiwu', 'jincheng', 'longxi'],
        '淮北・河南・遼西・河西の境目の都市は、この年の持ち主が史料で確かめにくい(ゲーム上の推定)。朔方は赫連勃勃の根拠地(統万城の築城は413年)。',
        rel, '東晋と南燕は開戦(劉裕の出陣)。夏は後秦と、北涼は南涼と、東晋は譙蜀と戦争中。そのほかの関係は diplomacyStart.json に書く。',
        R, G, A, {'jicheng': {'name': '龍城', 'reading': 'りゅうじょう'}})

# ================= 416年 =================
def s416():
    o = {}
    own(o, 'jin', 'jiankang jingkou wu kuaiji yuzhang xunyang wuchang jiangling changsha panyu shian longbian jianning yongan xiangyang shangyong wan hefei shouchun huaiyin xiapi pengcheng qiao runan guanggu donglai chengdu baxi jiangzhou hanzhong')
    own(o, 'houqin', 'changan luoyang fengyi chencang anding puban hongnong xingyang xuchang junyi shanggui pingyang')
    own(o, 'beiwei', 'pingcheng shengle yanmen daijun jinyang shangdang lishi ye xiangguo zhongshan xindu ji yanci yewang')
    own(o, 'beiyan', 'jicheng tuhe lingzhi zimeng')
    own(o, 'xia', 'shuofang gaonu')
    own(o, 'xiqin', 'jincheng longxi xiping')
    own(o, 'beiliang', 'zhangye guzang')
    own(o, 'xiliang', 'jiuquan dunhuang gaochang yiwu')
    own(o, 'chouchi', 'chouchi')
    own(o, 'tuyuhun', 'tuyuhunting')
    own(o, 'goguryeo', 'wandu pyongyang xiangping xuantu')
    own(o, 'baekje', 'hanseong')
    own(o, 'silla', 'geumseong')
    F = [
        {'id': 'jin', 'name': '東晋', 'people': '漢', 'ruler': '司馬徳宗(安帝)', 'color': '#3c86c9'},
        {'id': 'houqin', 'name': '後秦', 'people': '羌', 'ruler': '姚泓', 'color': '#6b8f2f'},
        {'id': 'beiwei', 'name': '北魏', 'people': '鮮卑', 'ruler': '拓跋嗣(明元帝)', 'color': '#5a4a8a'},
        {'id': 'xia', 'name': '夏', 'people': '匈奴', 'ruler': '赫連勃勃', 'color': '#8a2f2f'},
        {'id': 'beiyan', 'name': '北燕', 'people': '漢', 'ruler': '馮跋', 'color': '#c27a2c'},
        {'id': 'xiqin', 'name': '西秦', 'people': '鮮卑', 'ruler': '乞伏熾磐', 'color': '#2f8a7a'},
        {'id': 'beiliang', 'name': '北涼', 'people': '盧水胡', 'ruler': '沮渠蒙遜', 'color': '#4a6a9a'},
        {'id': 'xiliang', 'name': '西涼', 'people': '漢', 'ruler': '李暠', 'color': '#9a5a7a'},
        {'id': 'chouchi', 'name': '仇池', 'people': '氐', 'ruler': '楊盛', 'color': '#7a6a4a'},
        {'id': 'tuyuhun', 'name': '吐谷渾', 'people': '鮮卑', 'ruler': '樹洛干', 'color': '#904581'},
        {'id': 'goguryeo', 'name': '高句麗', 'people': '高句麗', 'ruler': '長寿王', 'color': '#3a7a9a'},
        {'id': 'baekje', 'name': '百済', 'people': '百済', 'ruler': '腆支王', 'color': '#9a7a3a'},
        {'id': 'silla', 'name': '新羅', 'people': '新羅', 'ruler': '実聖尼師今', 'color': '#7a9a6a'},
    ]
    R = {
        'sima_dezong': {'factionId': 'jin', 'role': 'ruler', 'title': '安帝', 'cityId': 'jiankang'},
        'sima_dewen': {'factionId': 'jin', 'title': '琅邪王(北伐に同行を願い出る)', 'cityId': 'jiankang'},
        'liu_yu_song': {'factionId': 'jin', 'title': '太尉・中書監・都督中外諸軍事'},
        'liu_muzhi': {'factionId': 'jin', 'title': '尚書左僕射(建康の留守)', 'cityId': 'jiankang'},
        'liu_daolian': {'factionId': 'jin', 'title': '荊州刺史'},
        'wang_zhene': {'factionId': 'jin', 'title': '寧朔将軍(前鋒)'},
        'tan_daoji': {'factionId': 'jin', 'title': '冠軍将軍(前鋒)'},
        'shen_tianzi': {'factionId': 'jin', 'title': '建武将軍(武関道)'},
        'shen_linzi': {'factionId': 'jin', 'title': '寧朔将軍(汴水)'},
        'zhu_lingshi': {'factionId': 'jin', 'title': '益州刺史'},
        'zhu_chaoshi': {'factionId': 'jin', 'title': '寧遠将軍'},
        'hu_fan': {'factionId': 'jin', 'title': '参軍'},
        'ding_wu': {'factionId': 'jin', 'title': '劉裕の側近'},
        'wang_zhongde': {'factionId': 'jin', 'title': '冀州刺史(黄河の水軍)'},
        'fu_hongzhi': {'factionId': 'jin', 'title': '振武将軍(武関道・推定)'},
        'mao_dezu': {'factionId': 'jin', 'title': '参軍(推定)'},
        'xie_hui': {'factionId': 'jin', 'title': '太尉参軍'},
        'xu_xianzhi': {'factionId': 'jin', 'title': '太尉左司馬', 'cityId': 'jiankang'},
        'fu_liang': {'factionId': 'jin', 'title': '中書侍郎(推定)', 'cityId': 'jiankang'},
        'zhang_que': {'factionId': 'jin', 'title': '劉裕の夫人', 'cityId': 'jiankang'},
        # 劉裕の子(劉義符・劉義真・劉義隆)と拓跋燾は12歳未満のため名簿に入れない。開始時に親のもとへ自動で加わる(court.ts の addLivingChildren)
        # 後秦
        'yao_hong': {'factionId': 'houqin', 'role': 'ruler', 'title': '後秦の皇帝(416年2月に即位)', 'cityId': 'changan'},
        'yao_shao': {'factionId': 'houqin', 'title': '東平公・太宰', 'cityId': 'changan'},
        'yao_hui': {'factionId': 'houqin', 'title': '征北将軍・安定の守将'},
        'yao_yi': {'factionId': 'houqin', 'title': '并州牧(蒲坂)'},
        'yao_guang': {'factionId': 'houqin', 'title': '征南将軍・洛陽の守将'},
        'yao_zan': {'factionId': 'houqin', 'title': '征東将軍(推定)'},
        'yao_nan': {'factionId': 'houqin', 'title': '将軍', 'cityId': 'changan'},
        'yao_qiang': {'factionId': 'houqin', 'title': '将軍', 'cityId': 'changan'},
        'yin_zhao': {'factionId': 'houqin', 'title': '尚書', 'cityId': 'changan'},
        'kumarajiva': None,  # 413年に没
        'sima_xiuzhi': {'factionId': 'houqin', 'title': '晋から亡命した宗室(415年)', 'cityId': 'changan'},
        # 北魏
        'tuoba_si': {'factionId': 'beiwei', 'role': 'ruler', 'title': '北魏の皇帝(明元帝)', 'cityId': 'pingcheng'},
        'zhangsun_song': {'factionId': 'beiwei', 'title': '南平公・司徒'},
        'shusun_jian': {'factionId': 'beiwei', 'title': '相州刺史(推定)'},
        'xi_jin': {'factionId': 'beiwei', 'title': '将軍'},
        'cui_hao': {'factionId': 'beiwei', 'title': '博士祭酒', 'cityId': 'pingcheng'},
        # 夏
        'helian_bobo': {'factionId': 'xia', 'role': 'ruler', 'title': '大夏の天王・大単于', 'cityId': 'shuofang'},
        'helian_gui': {'factionId': 'xia', 'title': '太子', 'cityId': 'shuofang'},
        'wang_maide': {'factionId': 'xia', 'title': '軍師'},
        # ほか
        'feng_ba': {'factionId': 'beiyan', 'role': 'ruler', 'title': '北燕の天王'},
        'qifu_chipan': {'factionId': 'xiqin', 'role': 'ruler', 'title': '河南王・秦王'},
        'juqu_mengxun': {'factionId': 'beiliang', 'role': 'ruler', 'title': '河西王'},
        'juqu_mujian': {'factionId': 'beiliang', 'title': '沮渠蒙遜の子', 'cityId': 'guzang'},
        'li_gao': {'factionId': 'xiliang', 'role': 'ruler', 'title': '涼公'},
        'li_xin': {'factionId': 'xiliang', 'title': '世子'},
        'yang_sheng': {'factionId': 'chouchi', 'role': 'ruler', 'title': '仇池公'},
        'shuluogan': {'factionId': 'tuyuhun', 'role': 'ruler', 'title': '吐谷渾の王'},
        'jangsu': {'factionId': 'goguryeo', 'role': 'ruler', 'title': '高句麗王(長寿王)'},
        'jeonji': {'factionId': 'baekje', 'role': 'ruler', 'title': '百済王'},
        'silseong': {'factionId': 'silla', 'role': 'ruler', 'title': '新羅王'},
    }
    R = {k: v for k, v in R.items() if v}
    G = {'jiangling': 'liu_daolian', 'chengdu': 'zhu_lingshi', 'luoyang': 'yao_guang', 'anding': 'yao_hui', 'puban': 'yao_yi', 'xuchang': 'yao_zan',
         'ye': 'shusun_jian', 'jicheng': 'feng_ba', 'jincheng': 'qifu_chipan', 'guzang': 'juqu_mengxun', 'jiuquan': 'li_gao', 'dunhuang': 'li_xin',
         'chouchi': 'yang_sheng', 'tuyuhunting': 'shuluogan', 'wandu': 'jangsu', 'hanseong': 'jeonji', 'geumseong': 'silseong'}
    A = [
        army('army_liu_yu', '劉裕の本軍', 'jin', 'liu_yu_song', 'pengcheng', 25000, 2000, 8000, morale=88, food=60),
        army('army_wang_zhene', '王鎮悪・檀道済の前鋒', 'jin', 'wang_zhene', 'shouchun', 12000, 1000, 4000, morale=84, food=55, dlat=0.3),
        army('army_tan_daoji', '檀道済の軍', 'jin', 'tan_daoji', 'runan', 9000, 800, 3000, morale=82, food=55),
        army('army_shen_linzi', '沈林子の汴水の軍', 'jin', 'shen_linzi', 'pengcheng', 6000, 300, 2000, morale=80, dlon=-0.4),
        army('army_wang_zhongde', '王仲徳の黄河の水軍', 'jin', 'wang_zhongde', 'huaiyin', 8000, 200, 3000, morale=80),
        army('army_shen_tianzi', '沈田子の武関道の軍', 'jin', 'shen_tianzi', 'xiangyang', 4000, 500, 1500, morale=84),
        army('army_liu_daolian', '劉道憐の荊州軍', 'jin', 'liu_daolian', 'jiangling', 8000, 500, 3000, morale=70),
        army('army_yao_hong', '姚泓の本軍', 'houqin', 'yao_hong', 'changan', 20000, 12000, 6000, morale=66),
        army('army_yao_shao', '姚紹の軍', 'houqin', 'yao_shao', 'changan', 10000, 8000, 3000, morale=72, dlon=1.0, dlat=0.2),
        army('army_yao_yi', '姚懿の蒲坂の軍', 'houqin', 'yao_yi', 'puban', 8000, 6000, 2000, morale=62),
        army('army_yao_guang', '姚洸の洛陽の軍', 'houqin', 'yao_guang', 'luoyang', 6000, 2000, 2000, morale=58),
        army('army_yao_hui', '姚恢の安定の軍', 'houqin', 'yao_hui', 'anding', 8000, 8000, 2000, morale=64),
        army('army_helian_bobo', '赫連勃勃の騎兵', 'xia', 'helian_bobo', 'gaonu', 6000, 25000, 3000, morale=86, dlon=-1.2, dlat=-0.6),
        army('army_tuoba_si', '拓跋嗣の本軍', 'beiwei', 'tuoba_si', 'pingcheng', 15000, 25000, 5000),
        army('army_zhangsun_song', '長孫嵩の河北の軍', 'beiwei', 'zhangsun_song', 'ye', 10000, 15000, 3000),
        army('army_feng_ba', '馮跋の軍', 'beiyan', 'feng_ba', 'jicheng', 8000, 8000, 2000),
        army('army_qifu', '乞伏熾磐の軍', 'xiqin', 'qifu_chipan', 'jincheng', 6000, 10000, 1500),
        army('army_juqu', '沮渠蒙遜の軍', 'beiliang', 'juqu_mengxun', 'guzang', 7000, 12000, 1500),
        army('army_li_gao', '李暠の軍', 'xiliang', 'li_gao', 'jiuquan', 6000, 5000, 1000),
    ]
    rel = {'houqin|jin': 'war', 'houqin|xia': 'war', 'beiliang|xiqin': 'war', 'beiliang|xiliang': 'war'}
    return build('s416', 416, 6, '劉裕の北伐 ― 長安奪還',
        '416年夏。後秦の姚興が没し、姚泓が継いだが、一族の争いと夏の侵攻で国は揺れていた。劉裕は好機と見て、水陸の大軍で洛陽・長安を目指す。',
        '開始は416年6月(ゲーム上の設定)。史実では劉裕は8月に建康を発ち、王鎮悪・檀道済が淮水・淝水から許昌・洛陽へ、沈林子が汴水を、王仲徳が黄河の水軍を、沈田子・傅弘之が武関道を進んだ。開始時の軍団の位置は、その出発点に近い場所に置いた(ゲーム上の推定)。南燕(410年)・譙蜀(413年)・南涼(414年)はすでに滅んでいる。統万城(413年築城)は朔方の位置に置く。人物の生死・所属は『晋書』『宋書』『魏書』『資治通鑑』の通説により、不確かなところはゲーム上の推定。',
        F, o, ['runan', 'qiao', 'wan', 'junyi', 'xuchang', 'xingyang', 'yewang', 'lishi', 'lingzhi', 'zimeng', 'hanzhong', 'gaonu', 'gaochang', 'yiwu', 'shanggui'],
        '淮北・河南・遼西・河西の境目の都市は、この年の持ち主が史料で確かめにくい(ゲーム上の推定)。漢中は仇池の楊盛からの回復を推定。',
        rel, '東晋は後秦と開戦(北伐の決定)。夏は後秦と、西秦は北涼と、北涼は西涼と戦争中。北魏は後秦と婚姻で結ぶ(415年)。そのほかは diplomacyStart.json に書く。',
        R, G, A, {'jicheng': {'name': '龍城', 'reading': 'りゅうじょう'}, 'shuofang': {'name': '統万', 'reading': 'とうまん'}})

for s in (s409(), s416()):
    json.dump(s, open(f"{SC}/{s['id']}.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(s['id'], len(s['factions']), 'factions', len(s['roster']), 'persons', len(s['armies']), 'armies')
