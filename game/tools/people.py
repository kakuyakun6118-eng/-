#!/usr/bin/env python3
"""人物の台帳に、民族(people)と、民族の注記(peopleNote)を書き込む。
姓や一族から決められるものだけを決め、確かでないものは「推定」「不明」と明記する。"""
import json, os
D = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'scenarios')
XIONGNU = "liu_yuan liu_xuan liu_he liu_cong liu_yao liu_can liu_yi liu_ji liu_jing liu_yannian liu_ya liu_yue liu_chang liu_yin liu_xi huyan_yan huyan_mo huyan_yi bu_tai chen_yuanda jin_zhun jin_kang jin_ming liu_hu liu_wuhuan liu_lugu liu_eloutou liu_xiwuqi liu_weichen".split()
JIE = "shi_le shi_hu shi_hong shi_sui".split()
JIE_GUESS = "shi_sheng shi_cong shi_ta shi_yue".split()
XIANBEI = "wuwuchen tuyuhun_khan tuyan suixi shilian shiyijian qifu_guoren muyu_gen".split()
DI = "pu_hong lv_polou lv_guang yang_maosou yang_nandi yang_jiantou yang_yi yang_pan yang_jun yang_shi yang_ding".split()
BADI = "li_te li_liu li_xiong li_xiang li_shou li_shi li_ban li_yue li_qi li_li li_yun".split()
QIANG = "yao_yizhong yao_xiang yao_chang".split()
GOGURYEO = "eulbul sayu yeo_no go_noja chang_jori sosurim".split()
BAEKJE = "chaekgye biryu ubok hae_gu jin_ui geunchogo geungusu".split()
SILLA = "girim heulhae geupri naemul".split()
SPECIAL = {
 "kui_an": ("不明", "天竺の出と伝わるが、確かではない"),
 "zhi_xiong": ("不明", "支氏は月氏の系統とされる(推定)"), "zhi_quliu": ("不明", "支氏は月氏の系統とされる(推定)"),
 "huyan_mo2": ("匈奴", "呼延は匈奴の姓(推定)"),
 "liu_kuren": ("匈奴", "独孤部。匈奴の系統とされる"),
 "zhai_bin": ("丁零", ""), "helan_aitou": ("鮮卑", "賀蘭部(推定)"), "qi_shi": ("鮮卑", "出自は確かでない(推定)"), "hebani": ("鮮卑", "推定"), "yue_wan": ("鮮卑", "推定"),
 "ren_hui": ("巴氐", "李氏の旗揚げからの将(推定)"), "qiang_wang": ("氐", "推定"), "liang_pinglao": ("氐", "推定"),
 "shi_kan": ("漢", "もとの姓は田。石勒の養子"), "ran_zhan": ("漢", "石虎の養子"),
}
UNKNOWN18 = "kong_chang tao_bao lu_ming guo_ao liu_zheng wang_yang".split()
def people_of(pid):
    if pid in SPECIAL: return SPECIAL[pid]
    if pid in XIONGNU: return ("匈奴", "")
    if pid in JIE: return ("羯", "")
    if pid in JIE_GUESS: return ("羯", "石勒の一族とされる(推定)")
    if pid.startswith(("murong_", "tuoba_", "duan_")) or pid in XIANBEI: return ("鮮卑", "")
    if pid.startswith("yuwen_"): return ("鮮卑", "宇文部は匈奴の系統とも伝わる")
    if pid.startswith("fu_") and pid not in ("fu_chang", "fu_yan"): return ("氐", "")
    if pid in DI: return ("氐", "")
    if pid in BADI: return ("巴氐", "賨(そう)とも呼ばれる")
    if pid in QIANG: return ("羌", "")
    if pid in GOGURYEO: return ("高句麗", "")
    if pid in BAEKJE: return ("百済", "")
    if pid in SILLA: return ("新羅", "")
    if pid in UNKNOWN18: return ("不明", "石勒の旗揚げの仲間。漢人か、それ以外かは確かでない")
    return ("漢", "")
for name in ("s317.persons.json", "persons.extra.json"):
    path = os.path.join(D, name)
    d = json.load(open(path, encoding="utf-8"))
    for p in d["persons"]:
        p["people"], note = people_of(p["id"])
        if note: p["peopleNote"] = note
        else: p.pop("peopleNote", None)
        p.pop("_b", None)
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(name, dict(Counter(p["people"] for p in d["persons"])))
