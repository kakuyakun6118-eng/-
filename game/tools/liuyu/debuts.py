"""途中から登場する史実の大人の人物(family.json の debuts)。
383年など早い年代から始めたとき、劉裕や北伐の諸将が、史実で世に出た年に、ゆかりの人物の勢力へ加わる。
follow はゆかりの人物(先に書いた人がゲームにいて生きていれば、その勢力に加わる)。faction はゆかりの人物がいないときの勢力。
どちらも無いときは登場しない(歴史が変わったため)。開始の年より前の登場は扱わない(シナリオの名簿で決める)。"""
import json
P = 'src/data/rules/family.json'
d = json.load(open(P, encoding='utf-8'))
def D(person, year, follow=(), faction=None, title='', city=None, note=''):
    o = {'person': person, 'year': year}
    if follow: o['follow'] = list(follow)
    if faction: o['faction'] = faction
    if title: o['title'] = title
    if city: o['city'] = city
    if note: o['note'] = note
    return o
LY = ['liu_yu_song']
d['debuts'] = [
 # 東晋(北府軍と劉裕の一党)
 D('liu_yu_song', 399, ['liu_laozhi'], 'jin', '北府軍の参軍', note='399年、劉牢之に従って孫恩の乱を討つ(『宋書』武帝紀)'),
 D('zang_aiqin', 399, LY, None, '劉裕の妻'),
 D('he_wuji', 399, ['liu_laozhi'], 'jin', '北府軍の将'),
 D('liu_daogui', 399, LY, 'jin', '劉裕の弟'),
 D('liu_daolian', 399, LY, 'jin', '劉裕の弟'),
 D('liu_yi2', 400, [], 'jin', '北府軍の将'),
 D('zhuge_changmin', 400, [], 'jin', '北府軍の将'),
 D('meng_chang', 400, [], 'jin', '青州主簿'),
 D('liu_muzhi', 404, LY, 'jin', '劉裕の主簿', note='404年、桓玄打倒の挙兵ののち劉裕に招かれる'),
 D('wang_zhene', 404, LY, 'jin', '参軍'), D('tan_daoji', 404, LY, 'jin', '参軍'), D('zhu_lingshi', 404, LY, 'jin', '参軍'),
 D('zhu_chaoshi', 404, LY, 'jin', '参軍'), D('hu_fan', 404, LY, 'jin', '参軍'), D('ding_wu', 404, LY, 'jin', '劉裕の側近'),
 D('xu_xianzhi', 404, LY, 'jin', '参軍'), D('fu_liang', 404, LY, 'jin', '参軍'), D('xie_yu', 404, [], 'jin', '尚書'), D('sima_xiuzhi', 404, [], 'jin', '晋の宗室'),
 D('lu_xun', 404, [], 'jin', '広州刺史', 'panyu', '404年、東晋は広州を占めた盧循を刺史に任じた'), D('xu_daofu', 404, ['lu_xun'], 'jin', '始興相', 'shian'),
 D('qiao_zong', 404, [], 'jin', '益州の参軍', 'chengdu'), D('qiao_daofu', 404, ['qiao_zong'], 'jin', '譙縦の一族'),
 D('zhang_que', 405, LY, None, '劉裕の夫人'), D('hu_daoan', 405, LY, None, '劉裕の側室'),
 D('wang_zhongde', 405, LY, 'jin', '参軍'), D('shen_tianzi', 405, LY, 'jin', '参軍'), D('shen_linzi', 405, LY, 'jin', '参軍'),
 D('fu_hongzhi', 405, LY, 'jin', '参軍'), D('mao_dezu', 405, LY, 'jin', '参軍'), D('xie_hui', 410, LY, 'jin', '太尉参軍'),
 # 後秦
 D('yao_xing', 384, ['yao_chang'], None, '姚萇の長子'), D('yao_shao', 384, ['yao_chang', 'yao_xing'], None, '姚萇の子'),
 D('yao_zan', 395, ['yao_xing'], None, '将軍'), D('yao_bi', 400, ['yao_xing'], None, '姚興の子'), D('yao_hui', 400, ['yao_xing'], None, '将軍'),
 D('yao_yi', 400, ['yao_xing'], None, '姚興の子'), D('yao_guang', 400, ['yao_xing'], None, '姚興の子'),
 D('yao_nan', 400, ['yao_xing'], None, '将軍'), D('yao_qiang', 400, ['yao_xing'], None, '将軍'), D('yin_zhao', 400, ['yao_xing'], None, '尚書'),
 D('helian_bobo', 391, ['yao_xing', 'yao_chang'], None, '亡命した鉄弗部の王子', note='391年、父 劉衛辰が北魏に滅ぼされ、後秦の側へ逃れた'),
 D('wang_maide', 407, ['helian_bobo'], None, '軍師'), D('helian_gui', 407, ['helian_bobo'], None, '赫連勃勃の子'),
 # 南燕
 D('murong_zhen', 398, ['murong_de'], None, '将軍'), D('murong_zhong', 398, ['murong_de'], None, '将軍'), D('duan_hui', 398, ['murong_de'], None, '尚書'),
 D('han_fan', 398, ['murong_de'], None, '尚書'), D('gongsun_wulou', 400, ['murong_de'], None, '将軍'),
 D('murong_chao', 405, ['murong_de'], None, '慕容徳の甥', note='405年、長安から広固へ逃れてきて後継に立てられた'),
 # 北魏
 D('zhangsun_song', 386, ['tuoba_gui'], None, '南部大人'), D('shusun_jian', 386, ['tuoba_gui'], None, '将軍'), D('xi_jin', 386, ['tuoba_gui'], None, '将軍'),
 D('cui_hao', 400, ['tuoba_gui', 'tuoba_si'], None, '博士'),
 # 北燕・西秦・河西
 D('gao_yun', 397, ['murong_bao', 'murong_sheng', 'murong_xi', 'murong_chui'], None, '侍御郎'), D('feng_ba', 397, ['murong_bao', 'murong_sheng', 'murong_xi', 'murong_chui'], None, '中衛将軍'),
 D('qifu_qiangui', 385, ['qifu_guoren'], None, '乞伏国仁の弟'), D('qifu_chipan', 400, ['qifu_qiangui'], None, '乞伏乾帰の子'),
 D('juqu_mengxun', 386, ['lv_guang'], None, '盧水胡の酋長'), D('juqu_mujian', 410, ['juqu_mengxun'], None, '沮渠蒙遜の子'),
 D('li_gao', 386, ['lv_guang'], None, '効穀県令'), D('li_xin', 400, ['li_gao'], None, '李暠の子'),
 D('tufa_rutan', 386, ['lv_guang'], None, '河西鮮卑の首長'),
# (仇池・吐谷渾・高句麗・百済の君主は、ゲームの中の継承で決まるため、途中の登場には入れない)
]
d['_noteDebuts'] = 'debuts:途中から登場する史実の大人の人物(tools/liuyu/debuts.py が書く)。開始の年より後の登場だけ使う。ゆかりの人物がいなければ登場しない。'
L = {p['id'] for p in json.load(open('src/data/scenarios/s317.persons.json'))['persons'] + json.load(open('src/data/scenarios/persons.extra.json'))['persons']}
for x in d['debuts']:
    assert x['person'] in L, x
    for f in x.get('follow', []): assert f in L, (x, f)
json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(d['debuts']), 'debuts')
