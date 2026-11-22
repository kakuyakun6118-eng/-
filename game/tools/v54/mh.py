"""MakeHuman(CC0)の素材を読む小さな道具。base.obj・.target・.mhclo を扱う。"""
import gzip, os, re
import numpy as np

class Base:
    def __init__(self, root):
        self.root = root
        vs, vts, faces = [], [], []
        group = None
        for line in open(os.path.join(root, '3dobjs/base.obj')):
            if line.startswith('v '):
                vs.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                vts.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                group = line.split()[1]
            elif line.startswith('f '):
                vi, ti = [], []
                for p in line.split()[1:]:
                    a = p.split('/')
                    vi.append(int(a[0]) - 1)
                    ti.append(int(a[1]) - 1 if len(a) > 1 and a[1] else -1)
                faces.append((group, vi, ti))
        self.v0 = np.array(vs, np.float64)
        self.vt = np.array(vts, np.float64)
        self.faces = faces
        self.v = self.v0.copy()

    def target_path(self, rel):
        for base in [os.path.join(self.root, 'targets'), os.path.join(self.root, '../../../mpfb2/src/mpfb/data/targets')]:
            for ext in ['', '.gz']:
                p = os.path.join(base, rel + ext)
                if os.path.exists(p):
                    return p
        raise FileNotFoundError(rel)

    def read_target(self, rel):
        p = self.target_path(rel)
        f = gzip.open(p, 'rt') if p.endswith('.gz') else open(p)
        idx, d = [], []
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            a = line.split()
            idx.append(int(a[0]))
            d.append([float(a[1]), float(a[2]), float(a[3])])
        return np.array(idx, np.int64), np.array(d, np.float64).reshape(-1, 3)

    def apply(self, rel, w=1.0):
        i, d = self.read_target(rel)
        self.v[i] += d * w

    def delta(self, rel, w=1.0):
        out = np.zeros_like(self.v)
        i, d = self.read_target(rel)
        out[i] += d * w
        return out

    def group_verts(self, name):
        s = set()
        for g, vi, _ in self.faces:
            if g == name:
                s.update(vi)
        return sorted(s)

def fit_proxy(base, mhclo_path):
    """mhclo:各頂点 = 基本の三角形の重みつきの和 + ずれ(大きさの基準で拡大)"""
    lines = open(mhclo_path).read().split('\n')
    scales = {}
    refs = []
    in_verts = False
    obj = None
    for ln in lines:
        a = ln.split()
        if not a or a[0].startswith('#'):
            continue
        if a[0] in ('x_scale', 'y_scale', 'z_scale'):
            scales[a[0][0]] = (int(a[1]), int(a[2]), float(a[3]))
        elif a[0] == 'obj_file':
            obj = a[1]
        elif a[0] == 'verts':
            in_verts = True
        elif in_verts:
            if len(a) == 9:
                refs.append([int(a[0]), int(a[1]), int(a[2]), float(a[3]), float(a[4]), float(a[5]), float(a[6]), float(a[7]), float(a[8])])
            elif len(a) == 1 and a[0].isdigit() and refs == []:
                pass
            elif len(a) < 9 and refs:
                in_verts = False
    v = base.v
    sc = np.array([abs(v[scales[k][0]][i] - v[scales[k][1]][i]) / scales[k][2] for i, k in enumerate('xyz')])
    r = np.array(refs)
    i0, i1, i2 = r[:, 0].astype(int), r[:, 1].astype(int), r[:, 2].astype(int)
    pos = v[i0] * r[:, 3:4] + v[i1] * r[:, 4:5] + v[i2] * r[:, 5:6] + r[:, 6:9] * sc
    return pos, os.path.join(os.path.dirname(mhclo_path), obj)

def read_obj(path):
    vs, vts, faces = [], [], []
    for line in open(path):
        if line.startswith('v '):
            vs.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vts.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            vi, ti = [], []
            for p in line.split()[1:]:
                a = p.split('/')
                vi.append(int(a[0]) - 1)
                ti.append(int(a[1]) - 1 if len(a) > 1 and a[1] else -1)
            faces.append((None, vi, ti))
    return np.array(vs), np.array(vts), faces
