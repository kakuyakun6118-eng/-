"""dynasty-batch.cjs の結果(JSON)をまとめ、版ごとの比較の表(Markdown)を出す。
python3 dynasty-summary.py <結果のフォルダ> > 表.md"""
import glob, json, os, sys, statistics as st
d = sys.argv[1]
runs = []
for p in sorted(glob.glob(os.path.join(d, '*.json'))):
    ver, yrs, seed = os.path.basename(p)[:-5].split('-', 2)
    r = json.load(open(p)); r['ver'] = ver; r['yrs'] = int(yrs); runs.append(r)
def avg(xs): return round(st.mean(xs), 1) if xs else '—'
out = []
out.append('| 版 | 年数 | 回数 | 王朝の存続 | 中国統一 | 最大の領土(平均) | 最後の領土(平均) | 歴代皇帝(平均) | 天賦の才の出生(合計) | 西域遠征(出兵・勝ち・失敗) | 西域の属国化・直轄化 | 反乱・内乱・簒奪 | 異常 | セーブ互換 | メモリ(MB) | 時間(秒) |')
out.append('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for ver in ['v64', 'v65', 'v67']:
    for yrs in [100, 200, 300]:
        g = [r for r in runs if r['ver'] == ver and r['yrs'] == yrs]
        if not g: continue
        surv = sum(1 for r in g if r['final']['survived']); uni = sum(1 for r in g if r['unified'])
        w = [r['west'] for r in g]
        un = [r['unrest'] for r in g]
        out.append(f"| {ver} | {yrs} | {len(g)} | {surv}/{len(g)} | {uni}/{len(g)} | {avg([r['maxCities'] for r in g])} | {avg([r['final']['cities'] for r in g])} | {avg([len(r['emperors']) for r in g])} | {sum(r['blood']['prodigies'] for r in g)} | {sum(x['dispatched'] for x in w)}・{sum(x['won'] for x in w)}・{sum(x['failed'] for x in w)} | {sum(x['vassals'] for x in w)}・{sum(x['annexed'] for x in w)} | {sum((x['rebellions'] or 0) for x in un)}・{sum((x['civilWars'] or 0) for x in un)}・{sum((x['usurpations'] or 0) for x in un)} | {sum(len(r['anomalies']) for r in g)} | {sum(1 for r in g if r['save'].get('ok'))}/{len(g)} | {avg([r['heapMB'] or 0 for r in g])} | {avg([r['sec'] for r in g])} |")
print('\n'.join(out))
print()
# 走らせたそれぞれの結果
print('| 版 | 年数 | 種 | 存続 | 統一 | 最大 | 最後 | 皇帝 | 君主(最後) | 滅亡 |')
print('|---|---|---|---|---|---|---|---|---|---|')
for r in sorted(runs, key=lambda r: (r['ver'], r['yrs'], r['seed'])):
    print(f"| {r['ver']} | {r['yrs']} | {r['seed']} | {'○' if r['final']['survived'] else '×'} | {'○' if r['unified'] else '×'} | {r['maxCities']} | {r['final']['cities']} | {len(r['emperors'])} | {r['final']['ruler']} | {r['fell'] or '—'} |")
print()
# 皇帝の交代の前後(交代の月と12か月後)の国力の変化(v67)
ch = [s for r in runs if r['ver'] == 'v67' for s in r['succession'] if s.get('after')]
if ch:
    def pct(a, b): return (b - a) / max(1, a) * 100
    print(f"皇帝の交代の前後(Version 67・{len(ch)}回):都市 {avg([s['after']['cities'] - s['before']['cities'] for s in ch])}、兵力 {avg([pct(s['before']['troops'], s['after']['troops']) for s in ch])}%、金 {avg([pct(s['before']['gold'], s['after']['gold']) for s in ch])}%、人口 {avg([pct(s['before']['pop'], s['after']['pop']) for s in ch])}%(平均)")
    print()
# 皇帝の型と特性(v67)
from collections import Counter
tc = Counter(e['type'] for r in runs if r['ver'] == 'v67' for e in r['emperors'] if e['type'])
print('皇帝の型(Version 67・全回の合計):' + '、'.join(f'{k}{v}' for k, v in tc.most_common()))
trc = Counter(t for r in runs if r['ver'] == 'v67' for e in r['emperors'] for t in (e['traits'] or []))
print('固有特性(多い順):' + '、'.join(f'{k}{v}' for k, v in trc.most_common(20)))
