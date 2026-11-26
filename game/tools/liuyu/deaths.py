"""劉裕の北伐の人物の死因(deaths.json)。戦死・処刑・暗殺・自害は、その原因(捕虜になる・手を下す人物がいる)がそろったときだけ起こる。
病死・老衰は史実の年(と月)に起こる。書かれていない人物は「病死(推定)」になるため、非業の死の人物はここに必ず書く。"""
import json
P = 'src/data/rules/deaths.json'
d = json.load(open(P, encoding='utf-8'))
K, S = '史実確認済み', '推定'
def D(cause, basis=K, by=None, month=None, note=None):
    o = {'cause': cause, 'basis': basis}
    if by: o['by'] = by
    if month: o['month'] = month
    if note: o['note'] = note
    return o
NEW = {
 'liu_yu_song': D('illness', month=5, note='422年5月、建康で病没(『宋書』武帝紀)'),
 'liu_muzhi': D('illness', month=11, note='417年11月、建康で病没'),
 'liu_daogui': D('illness', note='412年に病没'), 'liu_daolian': D('illness'), 'shen_linzi': D('illness'), 'hu_fan': D('illness'),
 'wang_zhongde': D('illness'), 'mao_dezu': D('illness', S, note='虎牢が落ちて北魏に捕らえられ、のちに没した'), 'zhang_que': D('illness', S), 'zang_aiqin': D('illness'),
 'xie_yu': D('illness'), 'sima_xiuzhi': D('illness', S, note='北魏へ移ったのちに没した'), 'yang_sheng': D('illness', S), 'shuluogan': D('illness', S),
 'jangsu': D('illness'), 'jeonji': D('illness', S), 'feng_ba': D('illness'), 'qifu_chipan': D('illness'), 'juqu_mengxun': D('illness'),
 'li_gao': D('illness'), 'tuoba_si': D('illness', month=11), 'zhangsun_song': D('illness'), 'shusun_jian': D('illness'), 'xi_jin': D('illness'),
 'helian_bobo': D('illness', month=8), 'yao_shao': D('illness', S, note='417年、北伐の軍を防ぎきれず憤死したと伝わる'),
 'yao_xing': D('illness', month=2, note='416年2月、長安で病没'), 'liu_yilong': D('assassination', note='453年、太子の劉劭に殺された(劉劭は台帳にいない)'),
 # 非業の死(原因がそろったときだけ)
 'liu_yi2': D('suicide', by='liu_yu_song', note='412年、劉裕の軍に江陵を攻められて自害した'),
 'zhuge_changmin': D('execution', by='liu_yu_song', note='413年、劉裕に疑われて殺された'),
 'meng_chang': D('suicide', note='410年、盧循の軍が迫ったとき、北伐を止めなかった責めを負って自害した'),
 'he_wuji': D('battle', note='410年、豫章で盧循・徐道覆の軍と戦って戦死した'),
 'liu_jingxuan': D('assassination', note='415年、部下の司馬道賜に殺された'),
 'hu_daoan': D('execution', by='liu_yu_song', note='409年、劉裕に死を賜った'),
 'wang_zhene': D('assassination', by='shen_tianzi', note='418年、長安で沈田子に殺された'),
 'shen_tianzi': D('execution', note='418年、王鎮悪を殺した罪で王脩に処刑された'),
 'zhu_lingshi': D('battle', note='418年、関中からの撤退中に夏の軍に敗れて死んだ'),
 'zhu_chaoshi': D('battle', note='418年、兄とともに夏の軍に殺された'),
 'fu_hongzhi': D('execution', by='helian_bobo', note='418年、青泥で赫連勃勃に捕らえられ、屈せずに殺された'),
 'tan_daoji': D('execution', note='436年、宋の文帝に猜疑されて殺された'),
 'xu_xianzhi': D('suicide', note='426年、少帝の廃殺を問われて自害した'), 'fu_liang': D('execution', note='426年に処刑された'), 'xie_hui': D('execution', note='426年、江陵で挙兵して敗れ、処刑された'),
 'liu_yifu': D('assassination', by='xu_xianzhi', note='424年、徐羨之らに廃されて殺された'),
 'liu_yizhen': D('assassination', by='xu_xianzhi', note='424年、徐羨之らに殺された'),
 'murong_chao': D('execution', by='liu_yu_song', note='410年、広固が落ちて捕らえられ、建康で斬られた'),
 'murong_zhen': D('execution', by='liu_yu_song', note='410年、広固の陥落ののち殺された'),
 'gongsun_wulou': D('execution', by='liu_yu_song', note='410年、広固の陥落ののち殺された'),
 'duan_hui': D('battle', note='409年、臨朐の戦いで戦死した'),
 'yao_hong': D('execution', by='liu_yu_song', note='417年、長安が落ちて降り、建康で斬られた'),
 'yao_bi': D('execution', by='yao_xing', note='416年、帝位を狙ったとして死を賜った'),
 'yao_hui': D('battle', note='417年、長安へ攻め上ったが姚紹に敗れて死んだ'),
 'yao_yi': D('execution', S, by='yao_hong', note='417年、蒲坂で帝を称しようとして捕らえられた(その後の扱いは推定)'),
 'yao_zan': D('execution', S, by='liu_yu_song', note='417年、長安の陥落ののち殺されたと推定'),
 'tuoba_gui': D('assassination', note='409年10月、子の拓跋紹に殺された(拓跋紹は台帳にいないため、この死はゲームでは必ずは起きない)'),
 'gao_yun': D('assassination', note='409年、近臣の離班・桃仁に殺された(二人は台帳にいない)'),
 'qifu_qiangui': D('assassination', note='412年、甥の乞伏公府に殺された'),
 'helian_gui': D('assassination', S, note='424年、弟の赫連昌に殺された'),
 'li_xin': D('battle', by='juqu_mengxun', note='420年、沮渠蒙遜と戦って敗死した'),
 'tufa_rutan': D('execution', by='qifu_chipan', note='415年、西秦に降ったのち毒殺された'),
 'qiao_zong': D('suicide', note='413年、成都が落ちて自害した'), 'qiao_daofu': D('execution', note='413年に捕らえられて斬られた'),
 'lu_xun': D('suicide', note='411年、交州で敗れて自害した'), 'xu_daofu': D('battle', note='411年、始興で敗死した'),
 'cui_hao': D('execution', note='450年、国史の筆禍で処刑された'), 'tuoba_tao': D('assassination', note='452年、宦官の宗愛に殺された'),
 'juqu_mujian': D('execution', note='447年、北魏に殺された'),
}
for k, v in NEW.items(): d['deaths'].setdefault(k, v)
json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('deaths', len(NEW))
