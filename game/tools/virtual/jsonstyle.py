"""placements.json の書式(人物ごとに1行)で書き出す"""
import json
def inline(o):
    return '{ ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}' for k, v in o.items()) + ' }'
def dump_placements(d):
    out = ['{', f' "note": {json.dumps(d["note"], ensure_ascii=False)},', ' "scenarios": {']
    sc = list(d['scenarios'].items())
    for i, (sid, ps) in enumerate(sc):
        out.append(f'  {json.dumps(sid)}: {{')
        items = list(ps.items())
        for j, (pid, v) in enumerate(items):
            out.append(f'   {json.dumps(pid, ensure_ascii=False)}: {inline(v)}' + (',' if j < len(items) - 1 else ''))
        out.append('  }' + (',' if i < len(sc) - 1 else ''))
    out += [' }', '}']
    return '\n'.join(out) + '\n'
