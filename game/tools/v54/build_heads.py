"""Version 54:後宮の人物の頭(写実寄り)を、MakeHuman(CC0)の素材から作って GLB に書き出す。

使い方: python3 build_heads.py <makehuman/data のパス> <出力 .glb>

作るもの(1つのメッシュに、次の部分。すべて同じモーフターゲットの並びを持つ):
  skin   … 頭と首(MakeHuman の基本の人体から、首より上を切り出す)
  lashes … まつげ(MakeHuman の補助のまつげの形)
  eyes   … 眼球(MakeHuman の高精細の眼球。虹彩の絵つき)
  mouth  … 歯と舌(口を開けたときに見える)
  scalp  … 頭皮の殻(MakeHuman の補助の髪の形。髪の地肌)
モーフターゲット:表情(8)・まばたき・話す口の形・人ごとの顔の違い(輪郭・頬・顎・鼻・唇・目・眉・年齢)
絵:肌の色(化粧の3種)・肌の凹凸(毛穴)・肌の粗さ・眼球・まつげ・髪
"""
import json, math, os, struct, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from mh import Base, fit_proxy, read_obj

R = sys.argv[1]
OUT = sys.argv[2]
TEX = int(os.environ.get('TEX', '1024'))
rng = np.random.default_rng(54)

b = Base(R)
b.apply('macrodetails/asian-female-young.target')
# 成人の女性らしく:口を軽く閉じ、唇の厚みを少し抑える(全員の土台)
b.apply('expression/units/asian/mouth-compression.target', 0.18)
b.apply('mouth/mouth-upperlip-volume-decr.target', 0.3)
b.apply('mouth/mouth-lowerlip-volume-decr.target', 0.35)
BASE_V = b.v.copy()

# ---------------- 部分ごとの面を集める ----------------
def keep_head(p):
    x, y, z = p
    return y > 4.3 and (abs(x) < 0.78 or y > 4.95)

head_faces = [f for f in b.faces if f[0] == 'body' and all(keep_head(BASE_V[i]) for i in f[1])]
lash_faces = [f for f in b.faces if f[0].startswith('helper-') and 'eyelashes' in f[0]]
mouth_faces = [f for f in b.faces if f[0] in ('helper-upper-teeth', 'helper-lower-teeth', 'helper-tongue')]
scalp_faces = [f for f in b.faces if f[0] == 'helper-hair']
print('faces', len(head_faces), len(lash_faces), len(mouth_faces), len(scalp_faces))

# ---------------- モーフ(形の変化)の定義 ----------------
EU = 'expression/units/asian/'
def T(rel, w=1.0):
    return (rel, w)

EXPR = {
    # 表情:MakeHuman の表情の単位(顔の筋肉の動き)を組み合わせる
    'smile': [T(EU + 'mouth-corner-puller.target', 0.55), T(EU + 'mouth-elevation.target', 0.1), T(EU + 'eye-left-slit.target', 0.12), T(EU + 'eye-right-slit.target', 0.12)],
    'joy': [T(EU + 'mouth-corner-puller.target', 0.85), T(EU + 'mouth-open.target', 0.22), T(EU + 'mouth-upward-retraction.target', 0.25), T(EU + 'eye-left-slit.target', 0.3), T(EU + 'eye-right-slit.target', 0.3), T(EU + 'eyebrows-left-up.target', 0.15), T(EU + 'eyebrows-right-up.target', 0.15)],
    'shy': [T(EU + 'mouth-corner-puller.target', 0.3), T(EU + 'mouth-compression.target', 0.25), T(EU + 'eye-left-closure.target', 0.25), T(EU + 'eye-right-closure.target', 0.25), T(EU + 'eyebrows-left-inner-up.target', 0.3), T(EU + 'eyebrows-right-inner-up.target', 0.3)],
    'sad': [T(EU + 'mouth-depression.target', 0.55), T(EU + 'eyebrows-left-inner-up.target', 0.75), T(EU + 'eyebrows-right-inner-up.target', 0.75), T(EU + 'eye-left-closure.target', 0.2), T(EU + 'eye-right-closure.target', 0.2)],
    'angry': [T(EU + 'eyebrows-left-down.target', 0.75), T(EU + 'eyebrows-right-down.target', 0.75), T(EU + 'mouth-compression.target', 0.5), T(EU + 'nose-compression.target', 0.3), T(EU + 'eye-left-slit.target', 0.25), T(EU + 'eye-right-slit.target', 0.25)],
    'puzzled': [T(EU + 'eyebrows-left-up.target', 0.55), T(EU + 'eyebrows-right-down.target', 0.4), T(EU + 'mouth-pursing.target', 0.25), T(EU + 'mouth-depression-retraction.target', 0.2)],
    'surprised': [T(EU + 'eyebrows-left-up.target', 0.85), T(EU + 'eyebrows-right-up.target', 0.85), T(EU + 'eye-left-opened-up.target', 0.7), T(EU + 'eye-right-opened-up.target', 0.7), T(EU + 'mouth-open.target', 0.45)],
    'blink': [T(EU + 'eye-left-closure.target', 1.0), T(EU + 'eye-right-closure.target', 1.0)],
    'talkA': [T(EU + 'mouth-open.target', 0.45)],
    'talkO': [T(EU + 'mouth-open.target', 0.25), T(EU + 'mouth-pursing.target', 0.45)],
}
LR = lambda name, w=1.0: [T('%s/l-%s' % name, w), T('%s/r-%s' % name, w)]
SHAPE = {
    # 人ごとの顔の違い(0〜1 の量で混ぜる)
    'oval': [T('head/head-oval.target', 1.0)],
    'round': [T('head/head-round.target', 1.0)],
    'heart': [T('head/head-invertedtriangular.target', 1.0)],
    'square': [T('head/head-square.target', 1.0)],
    'cheekbone': LR(('cheek', 'cheek-bones-incr.target')),
    'cheekfull': LR(('cheek', 'cheek-volume-incr.target')),
    'chinNarrow': [T('chin/chin-width-decr.target', 1.0)],
    'chinLong': [T('chin/chin-height-incr.target', 1.0)],
    'noseNarrow': [T('nose/nose-scale-horiz-decr.target', 1.0), T('nose/nose-nostrils-width-decr.target', 0.6)],
    'noseHigh': [T('nose/nose-scale-depth-incr.target', 0.7), T('nose/nose-greek-incr.target', 0.5)],
    'noseSmall': [T('nose/nose-scale-vert-decr.target', 1.0), T('nose/nose-point-width-decr.target', 0.6)],
    'lipsThin': [T('mouth/mouth-upperlip-volume-decr.target', 1.0), T('mouth/mouth-lowerlip-volume-decr.target', 1.0)],
    'lipsFull': [T('mouth/mouth-upperlip-volume-incr.target', 1.0), T('mouth/mouth-lowerlip-volume-incr.target', 1.0)],
    'mouthSmall': [T('mouth/mouth-scale-horiz-decr.target', 1.0)],
    'eyesLarge': LR(('eyes', 'eye-scale-incr.target')),
    'eyesUp': LR(('eyes', 'eye-corner1-up.target')) + LR(('eyes', 'eye-corner2-up.target')),
    'eyesFold': LR(('eyes', 'eye-eyefold-up.target')),
    'browArch': [T('eyebrows/eyebrows-angle-up.target', 1.0)],
    'older': [T('head/head-age-incr.target', 1.0), T('neck/neck-double-incr.target', 0.3)] + LR(('eyes', 'eye-bag-incr.target'), 0.6),
    'jawSoft': [T('chin/chin-bones-decr.target', 1.0), T('chin/chin-prominent-decr.target', 0.5)],
}
MORPHS = list(EXPR.items()) + list(SHAPE.items())

def morph_delta(parts):
    d = np.zeros_like(BASE_V)
    for rel, w in parts:
        try:
            d += b.delta(rel, w)
        except FileNotFoundError:
            print('  missing target', rel)
    return d

deltas = []
for name, parts in MORPHS:
    deltas.append(morph_delta(parts))
    print('morph', name, round(float(np.abs(deltas[-1]).max()), 3))

# ---------------- 眼球(代理の形を、基本の人体に合わせる) ----------------
eye_mhclo = os.path.join(R, 'eyes/high-poly/high-poly.mhclo')
eye_pos0, eye_obj = fit_proxy(b, eye_mhclo)
ev, evt, efaces = read_obj(eye_obj)
eye_morph_pos = []
for d in deltas:
    b.v = BASE_V + d
    p, _ = fit_proxy(b, eye_mhclo)
    eye_morph_pos.append(p - eye_pos0)
b.v = BASE_V

# ---------------- UV の詰め直し(頭だけの絵にする) ----------------
def islands(faces):
    parent = {}
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for _, vi, ti in faces:
        for t in ti:
            parent.setdefault(t, t)
        for t in ti[1:]:
            ra, rb = find(ti[0]), find(t)
            if ra != rb:
                parent[ra] = rb
    groups = {}
    for k, (_, vi, ti) in enumerate(faces):
        groups.setdefault(find(ti[0]), []).append(k)
    return list(groups.values())

def tri_area3(a, b_, c):
    return 0.5 * np.linalg.norm(np.cross(b_ - a, c - a))

def pack(faces, positions, important):
    isl = islands(faces)
    boxes = []
    for fl in isl:
        tis = sorted({t for k in fl for t in faces[k][2]})
        uv = b.vt[tis]
        lo, hi = uv.min(0), uv.max(0)
        a3 = sum(tri_area3(*positions[faces[k][1][:3]]) for k in fl)
        auv = sum(tri_area3(*[np.r_[b.vt[t], 0] for t in faces[k][2][:3]]) for k in fl) + 1e-12
        cz = np.mean([positions[i][2] for k in fl for i in faces[k][1]])
        w = important(cz)
        s = math.sqrt(a3 / auv) * w
        boxes.append([fl, tis, lo, hi, s])
    # 大きさをそろえて、棚に並べる
    total = sum(((bx[3] - bx[2]) * bx[4]).prod() for bx in boxes)
    unit = math.sqrt(total) * 1.18
    boxes.sort(key=lambda bx: -(bx[3][1] - bx[2][1]) * bx[4])
    x = y = rowh = 0.0
    pad = 0.006
    newuv = {}
    for fl, tis, lo, hi, s in boxes:
        w, h = (hi - lo) * s / unit
        if x + w > 1:
            x, y, rowh = 0, y + rowh + pad, 0
        for t in tis:
            newuv[t] = (np.array([x, y]) + (b.vt[t] - lo) * s / unit)
        x += w + pad
        rowh = max(rowh, h)
    scale = 1 / max(1, y + rowh)
    return {t: uv * scale for t, uv in newuv.items()}

head_uv = pack(head_faces, BASE_V, lambda cz: 2.2 if cz > 0.55 else 1.0)

# ---------------- 頂点を作る(位置と UV の組ごとに1つ) ----------------
class Prim:
    def __init__(self, name):
        self.name = name
        self.key = {}
        self.src = []  # (元の頂点の番号, uv)
        self.tris = []
    def vert(self, vi, uv, extra=None):
        k = (vi, round(float(uv[0]), 6), round(float(uv[1]), 6))
        if k not in self.key:
            self.key[k] = len(self.src)
            self.src.append((vi, np.asarray(uv, float), extra))
        return self.key[k]
    def face(self, idx):
        self.tris.append((idx[0], idx[1], idx[2]))
        if len(idx) == 4:
            self.tris.append((idx[0], idx[2], idx[3]))

skin = Prim('skin')
for _, vi, ti in head_faces:
    skin.face([skin.vert(v, head_uv[t], b.vt[t]) for v, t in zip(vi, ti)])
lashes = Prim('lashes')
for _, vi, ti in lash_faces:
    lashes.face([lashes.vert(v, b.vt[t] if t >= 0 else (0, 0)) for v, t in zip(vi, ti)])
mouth = Prim('mouth')
for _, vi, ti in mouth_faces:
    mouth.face([mouth.vert(v, (0.5, 0.5)) for v in vi])
scalp = Prim('scalp')
for _, vi, ti in scalp_faces:
    scalp.face([scalp.vert(v, (0, 0)) for v in vi])
print('verts', len(skin.src), len(lashes.src), len(mouth.src), len(scalp.src))

S = 0.1  # MakeHuman の単位(デシメートル)→ メートル
# 頭の基準点:首の付け根を原点にする(体の頭の骨に付ける位置)
ORIGIN = np.array([0.0, 4.35, 0.0])

def positions(prim, V):
    return np.array([(V[vi] - ORIGIN) * S for vi, _, _ in prim.src], np.float32)

def normals(prim, P):
    n = np.zeros_like(P, dtype=np.float64)
    for a, b_, c in prim.tris:
        f = np.cross(P[b_] - P[a], P[c] - P[a])
        n[a] += f; n[b_] += f; n[c] += f
    # 同じ位置の頂点(UV の切れ目)は、法線をそろえる
    pos_key = {}
    for i, (vi, _, _) in enumerate(prim.src):
        pos_key.setdefault(vi, []).append(i)
    for idxs in pos_key.values():
        if len(idxs) > 1:
            s = n[idxs].sum(0)
            n[idxs] = s
    l = np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return (n / l).astype(np.float32)

# ---------------- 絵:頭の位置の絵を作り、それを元に肌を塗る ----------------
def raster(prim, P, N, size):
    pos = np.zeros((size, size, 3), np.float32)
    nor = np.zeros((size, size, 3), np.float32)
    ouv = np.zeros((size, size, 2), np.float32)
    mask = np.zeros((size, size), bool)
    UV = np.array([s[1] for s in prim.src])
    OUV = np.array([s[2] for s in prim.src])
    for a, b_, c in prim.tris:
        tri = UV[[a, b_, c]] * (size - 1)
        tri[:, 1] = (size - 1) - tri[:, 1]
        x0, y0 = np.floor(tri.min(0)).astype(int)
        x1, y1 = np.ceil(tri.max(0)).astype(int)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        px = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
        v0, v1 = tri[1] - tri[0], tri[2] - tri[0]
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12:
            continue
        d = px - tri[0]
        l1 = (d[:, 0] * v1[1] - v1[0] * d[:, 1]) / den
        l2 = (v0[0] * d[:, 1] - d[:, 0] * v0[1]) / den
        l0 = 1 - l1 - l2
        ins = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not ins.any():
            continue
        X, Y = xs.ravel()[ins], ys.ravel()[ins]
        ok = (X >= 0) & (X < size) & (Y >= 0) & (Y < size)
        X, Y = X[ok], Y[ok]
        L = np.stack([l0[ins][ok], l1[ins][ok], l2[ins][ok]], 1)
        pos[Y, X] = L @ P[[a, b_, c]]
        nor[Y, X] = L @ N[[a, b_, c]]
        ouv[Y, X] = L @ OUV[[a, b_, c]]
        mask[Y, X] = True
    return pos, nor, ouv, mask

def sample_mask(img, ouv):
    a = np.asarray(img.convert('L'), np.float32) / 255.0
    h, w = a.shape
    x = np.clip((ouv[..., 0] * (w - 1)).astype(int), 0, w - 1)
    y = np.clip(((1 - ouv[..., 1]) * (h - 1)).astype(int), 0, h - 1)
    return a[y, x]

def dilate(img, mask, n=6):
    img = img.copy(); m = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(img); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sm = np.roll(m, (dy, dx), (0, 1)); si = np.roll(img, (dy, dx), (0, 1))
            acc[sm & ~m] += si[sm & ~m]; cnt[sm & ~m] += 1
        new = (cnt > 0) & ~m
        img[new] = acc[new] / cnt[new][..., None] if img.ndim == 3 else acc[new] / cnt[new]
        m = m | new
    return img

def noise2(size, scale, seed):
    r = np.random.default_rng(seed)
    small = r.random((max(2, size // scale), max(2, size // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC), np.float32) / 255.0

P_skin = positions(skin, BASE_V)
N_skin = normals(skin, P_skin)
pos, nor, ouv, mask = raster(skin, P_skin, N_skin, TEX)
MP = os.path.join(R, '../../../mpfb2/src/mpfb/data/textures')
lipm = sample_mask(Image.open(os.path.join(MP, 'mpfb_lips.jpg')).filter(ImageFilter.GaussianBlur(6)), ouv)
lidm = sample_mask(Image.open(os.path.join(MP, 'mpfb_eyelids.jpg')).filter(ImageFilter.GaussianBlur(10)), ouv)

# 顔の目印(メートル・頭の原点から)
def mh(p):
    return (np.array(p) - ORIGIN) * S
EYE_L, EYE_R = mh(BASE_V[b.group_verts('joint-l-eye')].mean(0)), mh(BASE_V[b.group_verts('joint-r-eye')].mean(0))
JAW = mh(BASE_V[b.group_verts('joint-jaw')].mean(0))
print('eye', EYE_L, 'jaw', JAW)
X, Y, Z = pos[..., 0], pos[..., 1], pos[..., 2]
front = np.clip(nor[..., 2], 0, 1)

def g2(cx, cy, sx, sy, xs=X, ys=Y):
    return np.exp(-(((xs - cx) / sx) ** 2 + ((ys - cy) / sy) ** 2))

BROW_IDX = None
def brow_mask(arch, thick, length, lift, seed=7):
    """眉(柳の葉の形):目の上の弧に、短い毛を一本ずつ描く。眉頭は上向き、眉尻は外へ寝かせる"""
    r = np.random.default_rng(seed)
    out = np.zeros_like(X)
    sel = (Z > 0.06) & (Y > EYE_L[1] + 0.004) & (Y < EYE_L[1] + 0.04) & (np.abs(X) < 0.07) & mask
    ys, xs = np.nonzero(sel)
    px, py = X[ys, xs], Y[ys, xs]
    acc = np.zeros(len(px), np.float32)
    for side in (1, -1):
        ex, ey = (EYE_L if side > 0 else EYE_R)[:2]
        for k in range(300):
            t = r.uniform(0, 1) ** 0.9
            cx = side * (abs(ex) - 0.012 + t * length)
            cy = ey + 0.0165 + lift + arch * math.sin(t * math.pi * 0.85) - 0.006 * t * t + r.normal(0, thick * (1 - 0.6 * t) * 0.45)
            ang = (math.pi * 0.42 * (1 - t) + 0.12) if side > 0 else (math.pi - (math.pi * 0.42 * (1 - t) + 0.12))
            ln = 0.0034 + 0.0018 * r.random()
            dx, dy = math.cos(ang) * ln, math.sin(ang) * ln
            # 線分までの距離
            qx, qy = px - cx, py - cy
            h = np.clip((qx * dx + qy * dy) / (ln * ln), 0, 1)
            dd = np.hypot(qx - h * dx, qy - h * dy)
            w = 0.00018
            acc = np.maximum(acc, np.clip(1 - dd / w, 0, 1) * (0.55 + 0.45 * (1 - h)) * (0.75 + 0.25 * r.random()))
    out[ys, xs] = acc
    soft = np.asarray(Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    return np.clip(soft * 1.1, 0, 0.92)

STYLES = {
    # 魏晋の化粧:皇后は紅を濃く・花鈿、妃は桃色の頬と目元、女官は控えめ
    'empress': dict(skin=(0.92, 0.76, 0.66), lip=(0.70, 0.20, 0.22), lipA=0.7, lid=(0.78, 0.36, 0.36), lidA=0.45, blush=0.10, brow=(0.07, 0.05, 0.045), arch=0.004, thick=0.0028, flower=True),
    'consort': dict(skin=(0.92, 0.76, 0.66), lip=(0.80, 0.30, 0.34), lipA=0.7, lid=(0.85, 0.52, 0.52), lidA=0.4, blush=0.16, brow=(0.08, 0.06, 0.05), arch=0.005, thick=0.0025, flower=False),
    'lady': dict(skin=(0.86, 0.69, 0.57), lip=(0.70, 0.38, 0.36), lipA=0.45, lid=(0.75, 0.55, 0.50), lidA=0.15, blush=0.06, brow=(0.09, 0.07, 0.06), arch=0.003, thick=0.0033, flower=False),
}

def paint(st):
    base = np.array(st['skin'], np.float32)
    col = np.ones(pos.shape, np.float32) * base
    mott = noise2(TEX, 24, 1) - 0.5
    fine = noise2(TEX, 4, 2) - 0.5
    col *= (1 + 0.05 * mott[..., None] + 0.025 * fine[..., None])
    # 赤み:頬・鼻先・耳・唇のまわり
    red = np.array([0.98, 0.55, 0.52], np.float32)
    cheek = (g2(abs(EYE_L[0]) + 0.012, EYE_L[1] - 0.03, 0.022, 0.016, np.abs(X)) * front)
    nose = g2(0, EYE_L[1] - 0.035, 0.008, 0.012) * (Z > 0.09)
    a = np.clip(cheek * st['blush'] * 1.2 + nose * 0.05, 0, 0.3)[..., None]
    col = col * (1 - a) + red * a * col / base.max()
    # 首・頭の後ろはわずかに暗く(顔との色の差は小さく)
    col *= (0.97 + 0.03 * front)[..., None]
    # まぶたの影と目元の紅
    lid = np.array(st['lid'], np.float32)
    la = np.clip(lidm * st['lidA'] * 1.6, 0, st['lidA'])[..., None]
    col = col * (1 - la) + col * lid * la * 1.15
    # 唇
    lip = np.array(st['lip'], np.float32)
    lm = np.clip(lipm * 1.3, 0, 1)
    la2 = (lm * st['lipA'])[..., None]
    col = col * (1 - la2) + lip * la2 * (0.9 + 0.2 * fine[..., None])
    # 眉
    bm = brow_mask(st['arch'], st['thick'], 0.034, 0.0)
    brow = np.array(st['brow'], np.float32)
    ba = np.clip(bm * 0.9, 0, 0.9)[..., None]
    col = col * (1 - ba) + brow * ba
    # 花鈿(額の花の印)
    if st['flower']:
        fy = EYE_L[1] + 0.045
        for k in range(5):
            ang = k / 5 * math.tau
            m = g2(0.0045 * math.sin(ang), fy + 0.0045 * math.cos(ang), 0.0022, 0.0022) * (Z > 0.08)
            col = col * (1 - m[..., None] * 0.85) + np.array([0.75, 0.10, 0.12]) * m[..., None] * 0.85
    col = dilate(col, mask)
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))

skin_imgs = {k: paint(st) for k, st in STYLES.items()}
# 肌の粗さ(G)と凹凸(毛穴):唇はつや、鼻・額は少し、頬は柔らかく
rough = 0.62 - 0.22 * np.clip(lipm * 1.3, 0, 1) - 0.06 * g2(0, EYE_L[1] - 0.02, 0.02, 0.05) * front
rough = dilate(rough, mask)
pores = noise2(TEX, 2, 3) * 0.5 + noise2(TEX, 6, 4) * 0.5
bump = dilate(np.clip(0.5 + (pores - 0.5) * 0.9 - lipm * 0.0, 0, 1), mask)
mr = np.stack([np.zeros_like(rough), rough, np.zeros_like(rough)], -1)
rough_img = Image.fromarray((np.clip(mr, 0, 1) * 255).astype(np.uint8))
bump_img = Image.fromarray((bump * 255).astype(np.uint8))

# まつげの絵(根元が濃く、毛先が細く消える。glTF では v=0 が絵の上)
LW, LH = 512, 128
im = Image.new('RGBA', (LW, LH), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
for i in range(340):
    x = rng.uniform(4, LW - 4); bend = rng.uniform(-10, 10); ln = rng.uniform(0.6, 1.0) * LH
    pts = [(x + bend * (k / 6) ** 2, ln * k / 6) for k in range(7)]
    for k in range(6):
        a = int(240 * (1 - k / 7))
        dr.line([pts[k], pts[k + 1]], fill=(4, 3, 3, a), width=1)
lash_img = im
# 髪の絵(毛の流れ。縦の筋・つや・毛先)
HW, HH = 512, 1024
h = np.zeros((HH, HW), np.float32)
for i in range(1400):
    x = rng.uniform(0, HW); w = rng.uniform(0.6, 2.2); dk = rng.uniform(0.3, 1.0)
    xs = np.arange(HW)
    h += dk * np.exp(-((((xs - x + HW / 2) % HW) - HW / 2) / w) ** 2)[None, :] * 0.08
h = np.clip(h, 0, 1)
wave = (np.sin(np.arange(HH) / HH * math.tau * 3)[:, None] * 0.5 + 0.5) * 0.15
hair = np.stack([0.16 + 0.55 * h + wave * 0.3, 0.13 + 0.42 * h + wave * 0.25, 0.12 + 0.36 * h + wave * 0.2], -1)
rows = np.arange(HH)[:, None] / HH
# v が小さい所(生え際)ほど毛が細く途切れる。1本ずつの長さを変えて、ぎざぎざの生え際にする
cut = rng.uniform(0.02, 0.09, HW)[None, :]
alpha = np.where(rows > 0.14, 1.0, np.clip((rows - cut) / 0.03, 0, 1) * np.clip(h * 4, 0, 1))
hair_img = Image.fromarray((np.dstack([np.clip(hair, 0, 1), alpha]) * 255).astype(np.uint8), 'RGBA')
eye_arr = np.asarray(Image.open(os.path.join(R, 'eyes/materials/brown_eye.png')).convert('RGB'), np.float32) / 255
sat = eye_arr.max(2) - eye_arr.min(2)
irisw = np.clip((sat - 0.12) / 0.2, 0, 1)[..., None]
lum = eye_arr.mean(2, keepdims=True)
eye_arr = eye_arr * (1 - irisw) + (lum * np.array([0.62, 0.42, 0.30]) * 0.9) * irisw
eye_img = Image.fromarray((np.clip(eye_arr, 0, 1) * 255).astype(np.uint8))


# ---------------- まつげ:まぶたの縁(目の開口部の境界)から、反り上がる帯を作る ----------------
def rim_loops():
    """まぶたの縁:補助のまつげの輪(目のまわりの帯)の、内側の境界の線"""
    out = {}
    for name, ec in (('L', EYE_L), ('R', EYE_R)):
        fs = [f for f in lash_faces if (mh(BASE_V[f[1][0]])[0] > 0) == (name == 'L')]
        cnt = {}
        for _, vi, _ in fs:
            n = len(vi)
            for k in range(n):
                e = tuple(sorted((vi[k], vi[(k + 1) % n])))
                cnt[e] = cnt.get(e, 0) + 1
        adj = {}
        for (a, c), k in cnt.items():
            if k == 1:
                adj.setdefault(a, []).append(c); adj.setdefault(c, []).append(a)
        seen, loops = set(), []
        for st in adj:
            if st in seen:
                continue
            loop, prev, cur = [st], None, st
            seen.add(st)
            while True:
                nx = [v for v in adj[cur] if v != prev and v not in seen]
                if not nx:
                    break
                prev, cur = cur, nx[0]
                seen.add(cur); loop.append(cur)
            loops.append(loop)
        rad = lambda lp: np.mean([np.linalg.norm((mh(BASE_V[v]) - ec)[:2]) for v in lp])
        loops.sort(key=rad)
        print('  loops', name, [(len(l), round(rad(l), 4)) for l in loops])
        out[name] = loops[0]
    return out

RIMS = rim_loops()
print('rim', {k: len(v) for k, v in RIMS.items()})
lash_pos, lash_uv, lash_tri, lash_src = [], [], [], []
def lash_strip(rim, ec, upper):
    # 帯の内側の縁だけ(角度ごとに、目の中心にいちばん近い点)
    ang = {v: math.atan2(*(mh(BASE_V[v]) - ec)[[1, 0]]) for v in rim}
    rad = {v: np.linalg.norm((mh(BASE_V[v]) - ec)[:2]) for v in rim}
    bins = {}
    for v in rim:
        k = int((ang[v] + math.pi) / (math.pi / 14))
        if k not in bins or rad[v] < rad[bins[k]]:
            bins[k] = v
    inner = list(bins.values())
    pts = [v for v in inner if (mh(BASE_V[v])[1] > ec[1] - 0.0005) == upper]
    pts.sort(key=lambda v: abs(mh(BASE_V[v])[0]))
    if len(pts) < 3:
        return
    L = len(pts)
    base_i = len(lash_pos)
    for k, v in enumerate(pts):
        p0 = mh(BASE_V[v])
        t = k / (L - 1)
        out = p0 - ec; out[2] = 0; out /= np.linalg.norm(out) + 1e-9
        # 根元を、まぶたの縁(目の側へ 1.2mm・前へ 0.5mm)に寄せる
        p = p0 - out * 0.0012 + np.array([0, 0, 0.0005])
        # 目尻ほど長く、外へ流れる。上は反り上がる
        ln = (0.0036 + 0.0018 * math.sin(t * math.pi) + 0.0012 * t) if upper else 0.0014
        d = out * ln * 0.8 + np.array([0, 0, 1]) * ln * 0.55 + (np.array([0, 1, 0]) if upper else np.array([0, -1, 0])) * ln * 0.25
        mid = p + d * 0.5 + np.array([0, 0, 1]) * ln * 0.15
        for j, q in enumerate((p, mid, p + d)):
            lash_pos.append(q); lash_uv.append((t * (6 if upper else 3), j / 2)); lash_src.append(v)
    for k in range(L - 1):
        a = base_i + k * 3
        for j in range(2):
            lash_tri.append((a + j, a + 3 + j, a + 4 + j)); lash_tri.append((a + j, a + 4 + j, a + 1 + j))
for name, ec in (('L', EYE_L), ('R', EYE_R)):
    lash_strip(RIMS[name], ec, True)
    lash_strip(RIMS[name], ec, False)


# ---------------- 髪の地(頭の形に沿った、なめらかな殻。頭頂から生え際へ毛が流れる) ----------------
P0 = positions(skin, BASE_V)
eyeY = EYE_L[1]
sk = P0[P0[:, 1] > eyeY]
C = np.array([0.0, (sk[:, 1].min() + sk[:, 1].max()) / 2 - 0.01, (sk[:, 2].min() + sk[:, 2].max()) / 2 - 0.005])
okv = (P0[:, 1] > JAW[1] - 0.005) & ~((np.abs(P0[:, 0]) > 0.062) & (P0[:, 1] < eyeY + 0.022) & (P0[:, 1] > eyeY - 0.045) & (P0[:, 2] > -0.04) & (P0[:, 2] < 0.03))
rel = (P0 - C)[okv]
rn = np.linalg.norm(rel, axis=1)
dirs = rel / rn[:, None]
TRI = np.array(skin.tris)
TRI = TRI[okv[TRI].all(1)]
TA, TB, TC = P0[TRI[:, 0]] - C, P0[TRI[:, 1]] - C, P0[TRI[:, 2]] - C
E1, E2 = TB - TA, TC - TA
def skull_r(d):
    """頭の中心から d の向きへの光線が、肌に当たる距離(いちばん遠い当たり)"""
    pv = np.cross(d, E2)
    det = (E1 * pv).sum(1)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    tv = -TA
    u = (tv * pv).sum(1) * inv
    qv = np.cross(tv, E1)
    v = (qv @ d) * inv
    t = (E2 * qv).sum(1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
    return float(t[hit].max()) if hit.any() else float('nan')

deg = np.array([0, 40, 65, 85, 100, 125, 150, 180])
yh = np.array([eyeY + 0.052, eyeY + 0.047, eyeY + 0.024, eyeY + 0.012, eyeY + 0.008, eyeY - 0.03, JAW[1] + 0.03, JAW[1] + 0.012])
NU, NV = 64, 30
HP, HUV, H_near = [], [], []
DIRS, RR, TT = [], [], []
for j in range(NV + 1):
    t = j / NV
    for i in range(NU + 1):
        th = (i / NU) * math.tau - math.pi  # -π〜π(0 が正面)
        ydst = np.interp(abs(math.degrees(th)), deg, yh)
        e_h = math.asin(np.clip((ydst - C[1]) / 0.092, -1, 1))
        e_h -= 0.07  # 生え際の先(毛先が消える分)
        e = math.pi / 2 - t * (math.pi / 2 - e_h)
        d = np.array([math.cos(e) * math.sin(th), math.sin(e), math.cos(e) * math.cos(th)])
        DIRS.append(d); RR.append(skull_r(d)); TT.append(t)
        HUV.append(((i / NU) * 8, 1 - t * 0.92))
RR = np.array(RR).reshape(NV + 1, NU + 1)
# 当たらなかった向き(首の下など)は、上の行の値で埋める
for j in range(NV + 1):
    for i in range(NU + 1):
        if not np.isfinite(RR[j, i]):
            RR[j, i] = RR[j - 1, i] if j > 0 and np.isfinite(RR[j - 1, i]) else 0.08
print('skull r', float(RR.min()), float(RR.max()))
# 半径をならす(耳・首の出っ張りを拾ったとがりを消す)
for _ in range(3):
    pad = np.pad(RR, ((1, 1), (0, 0)), mode='edge')
    RR = (pad[:-2] + pad[2:] + np.roll(RR, 1, 1) + np.roll(RR, -1, 1) + RR * 2) / 6
RR[:, -1] = RR[:, 0]
for k, (d, t) in enumerate(zip(DIRS, TT)):
    p = C + d * (RR.flat[k] + 0.0035 + 0.006 * (1 - t) ** 1.5)
    HP.append(p)
    H_near.append(int(np.argmin(np.linalg.norm(P0 - p, axis=1))))
HP = np.array(HP, np.float32); HUV = np.array(HUV, np.float32)
hair_tris = []
for j in range(NV):
    for i in range(NU):
        a0 = j * (NU + 1) + i
        hair_tris += [(a0, a0 + NU + 1, a0 + 1), (a0 + 1, a0 + NU + 1, a0 + NU + 2)]
class _P: pass
hp = _P(); hp.tris = hair_tris; hp.src = [(0, None, None)] * len(HP)
HN = normals(hp, HP)
H_src = [skin.src[k] for k in H_near]
print('hair verts', len(HP), 'center', C)

# ---------------- GLB に書き出す ----------------
buf = bytearray()
views, accessors = [], []
def add(data, target=None):
    while len(buf) % 4:
        buf.append(0)
    off = len(buf); buf.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target:
        v['target'] = target
    views.append(v)
    return len(views) - 1
def acc(arr, ctype, typ, target=None, minmax=False):
    vi = add(arr.tobytes(), target)
    a = {'bufferView': vi, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if minmax:
        a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accessors.append(a)
    return len(accessors) - 1
def sparse_acc(delta, eps=1e-6):
    idx = np.nonzero(np.abs(delta).max(1) > eps)[0].astype(np.uint32)
    a = {'componentType': 5126, 'count': int(delta.shape[0]), 'type': 'VEC3', 'min': delta.min(0).tolist(), 'max': delta.max(0).tolist()}
    if len(idx):
        iv = add(idx.tobytes()); vv = add(delta[idx].astype(np.float32).tobytes())
        a['sparse'] = {'count': int(len(idx)), 'indices': {'bufferView': iv, 'componentType': 5125}, 'values': {'bufferView': vv}}
    accessors.append(a)
    return len(accessors) - 1

images, textures, materials = [], [], []
def tex(img, name, fmt='JPEG'):
    import io
    bio = io.BytesIO()
    if fmt == 'JPEG':
        img.convert('RGB').save(bio, 'JPEG', quality=86)
        mime = 'image/jpeg'
    else:
        img.save(bio, 'PNG', optimize=True)
        mime = 'image/png'
    iv = add(bio.getvalue())
    images.append({'bufferView': iv, 'mimeType': mime, 'name': name})
    textures.append({'source': len(images) - 1, 'name': name})
    return len(textures) - 1

skin_tex = {k: tex(v, 'skin_' + k) for k, v in skin_imgs.items()}
rough_tex = tex(rough_img, 'skin_rough')
bump_tex = tex(bump_img, 'skin_bump')
lash_tex = tex(lash_img, 'lash', 'PNG')
hair_tex = tex(hair_img, 'hair', 'PNG')
eye_tex = tex(eye_img.resize((512, 512)), 'eye')
materials = [
    {'name': 'skin', 'pbrMetallicRoughness': {'baseColorTexture': {'index': skin_tex['consort']}, 'metallicFactor': 0, 'roughnessFactor': 1, 'metallicRoughnessTexture': {'index': rough_tex}}},
    {'name': 'lashes', 'alphaMode': 'BLEND', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': lash_tex}, 'metallicFactor': 0, 'roughnessFactor': 0.6}},
    {'name': 'eyes', 'pbrMetallicRoughness': {'baseColorTexture': {'index': eye_tex}, 'metallicFactor': 0, 'roughnessFactor': 0.15}},
    {'name': 'mouth', 'pbrMetallicRoughness': {'baseColorFactor': [0.85, 0.78, 0.72, 1], 'metallicFactor': 0, 'roughnessFactor': 0.4}},
    {'name': 'hair', 'alphaMode': 'MASK', 'alphaCutoff': 0.35, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': hair_tex}, 'metallicFactor': 0, 'roughnessFactor': 0.5}},
    {'name': 'cornea', 'alphaMode': 'BLEND', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 0.08], 'metallicFactor': 0, 'roughnessFactor': 0.02}},
]

def lash_uvs(prim):
    # まつげの帯:根元(目の中心に近い側)を v=0、毛先を v=1。横(u)は目のまわりの角度
    P = positions(prim, BASE_V)
    uv = np.zeros((len(P), 2), np.float32)
    E = np.array([EYE_L if p[0] > 0 else EYE_R for p in P])
    d = P - E
    r = np.linalg.norm(d[:, :2], axis=1)
    up = d[:, 1] > 0
    for side in (True, False):
        for half in (True, False):
            m = ((P[:, 0] > 0) == side) & (up == half)
            if not m.any():
                continue
            lo, hi = r[m].min(), r[m].max()
            uv[m, 1] = (r[m] - lo) / (hi - lo + 1e-9)
    uv[:, 0] = (np.arctan2(d[:, 1], np.abs(d[:, 0])) / math.pi + 0.5) * 6
    return uv

def scalp_uvs(prim):
    # 頭頂から流れ落ちる向き(結い上げ)
    P = positions(prim, BASE_V)
    top = np.array([0, P[:, 1].max(), P[:, 2].mean()])
    uv = np.zeros((len(P), 2), np.float32)
    d = P - top
    uv[:, 0] = (np.arctan2(d[:, 0], d[:, 2]) / math.tau + 0.5) * 3
    uv[:, 1] = np.clip(np.linalg.norm(d, axis=1) / 0.2, 0, 1)
    return uv

prims_json = []
target_names = [m[0] for m in MORPHS]
for prim, mi in ((skin, 0), (mouth, 3)):
    P = positions(prim, BASE_V)
    N = normals(prim, P)
    if prim is skin:
        UV = np.array([s[1] for s in prim.src], np.float32)
        UV[:, 1] = 1 - UV[:, 1]
    elif prim is lashes:
        UV = lash_uvs(prim)
    elif prim is scalp:
        UV = scalp_uvs(prim)
    else:
        UV = np.zeros((len(P), 2), np.float32)
    idx = np.array(prim.tris, np.uint16 if len(P) < 65535 else np.uint32).ravel()
    attrs = {'POSITION': acc(P, 5126, 'VEC3', 34962, True), 'NORMAL': acc(N, 5126, 'VEC3', 34962), 'TEXCOORD_0': acc(UV, 5126, 'VEC2', 34962)}
    tg = []
    for k, d in enumerate(deltas):
        DP = np.array([d[vi] * S for vi, _, _ in prim.src], np.float32)
        t = {'POSITION': sparse_acc(DP)}
        if k < len(EXPR) and prim is skin:
            Nn = normals(prim, P + DP)
            t['NORMAL'] = sparse_acc((Nn - N).astype(np.float32), 1e-3)
        tg.append(t)
    prims_json.append({'attributes': attrs, 'indices': acc(idx, 5123 if idx.dtype == np.uint16 else 5125, 'SCALAR', 34963), 'material': mi, 'targets': tg})

# 髪の地
htg = [{'POSITION': sparse_acc(np.array([d_[vi] * S for vi, _, _ in H_src], np.float32))} for d_ in deltas]
prims_json.append({'attributes': {'POSITION': acc(HP, 5126, 'VEC3', 34962, True), 'NORMAL': acc(HN, 5126, 'VEC3', 34962), 'TEXCOORD_0': acc(HUV, 5126, 'VEC2', 34962)}, 'indices': acc(np.array(hair_tris, np.uint16).ravel(), 5123, 'SCALAR', 34963), 'material': 4, 'targets': htg})
# まつげ
LP = np.array(lash_pos, np.float32)
LUV = np.array(lash_uv, np.float32)
LN = np.tile(np.array([0, 0, 1], np.float32), (len(LP), 1))
ltg = [{'POSITION': sparse_acc(np.array([d[v] * S for v in lash_src], np.float32))} for d in deltas]
prims_json.insert(1, {'attributes': {'POSITION': acc(LP, 5126, 'VEC3', 34962, True), 'NORMAL': acc(LN, 5126, 'VEC3', 34962), 'TEXCOORD_0': acc(LUV, 5126, 'VEC2', 34962)}, 'indices': acc(np.array(lash_tri, np.uint16).ravel(), 5123, 'SCALAR', 34963), 'material': 1, 'targets': ltg})
# 眼球
EP = ((eye_pos0 - ORIGIN) * S).astype(np.float32)
eprim = Prim('eyes')
cprim = Prim('cornea')
for _, vi, ti in efaces:
    uvs = [evt[t] if t >= 0 else (0, 0) for t in ti]
    # 角膜(透明な膜):絵の右下の青い円に当てられた面
    corn = all(u[0] > 0.9 and u[1] < 0.12 for u in uvs)
    pr = cprim if corn else eprim
    pr.face([pr.vert(v, uv) for v, uv in zip(vi, uvs)])
print('eye verts', len(eprim.src), 'cornea verts', len(cprim.src))
EPP = np.array([EP[vi] for vi, _, _ in eprim.src], np.float32)
EN = normals(eprim, EPP)
EUV = np.array([s[1] for s in eprim.src], np.float32); EUV[:, 1] = 1 - EUV[:, 1]
eidx = np.array(eprim.tris, np.uint16).ravel()
etg = []
for k in range(len(deltas)):
    DP = np.array([eye_morph_pos[k][vi] * S for vi, _, _ in eprim.src], np.float32)
    etg.append({'POSITION': sparse_acc(DP)})
prims_json.insert(2, {'attributes': {'POSITION': acc(EPP, 5126, 'VEC3', 34962, True), 'NORMAL': acc(EN, 5126, 'VEC3', 34962), 'TEXCOORD_0': acc(EUV, 5126, 'VEC2', 34962)}, 'indices': acc(eidx, 5123, 'SCALAR', 34963), 'material': 2, 'targets': etg})
CPP = np.array([EP[vi] for vi, _, _ in cprim.src], np.float32)
CN = normals(cprim, CPP)
ctg = [{'POSITION': sparse_acc(np.array([eye_morph_pos[k][vi] * S for vi, _, _ in cprim.src], np.float32))} for k in range(len(deltas))]
prims_json.insert(3, {'attributes': {'POSITION': acc(CPP, 5126, 'VEC3', 34962, True), 'NORMAL': acc(CN, 5126, 'VEC3', 34962)}, 'indices': acc(np.array(cprim.tris, np.uint16).ravel(), 5123, 'SCALAR', 34963), 'material': 5, 'targets': ctg})

landmarks = {'eyeL': EYE_L.tolist(), 'eyeR': EYE_R.tolist(), 'jaw': JAW.tolist(), 'top': float(P_skin[:, 1].max()), 'chin': float(P_skin[P_skin[:, 2] > 0.05][:, 1].min())}
gltf = {
    'asset': {'version': '2.0', 'generator': 'goko v54 build_heads.py (MakeHuman CC0 assets)', 'copyright': 'Base mesh, targets, eye texture: MakeHuman / MPFB2 assets, CC0 1.0. Painted textures: generated.'},
    'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [{'name': 'head', 'mesh': 0}],
    'meshes': [{'name': 'head', 'primitives': prims_json, 'weights': [0] * len(target_names), 'extras': {'targetNames': target_names, 'parts': ['skin', 'lashes', 'eyes', 'cornea', 'mouth', 'hair'], 'landmarks': landmarks, 'skinTextures': {k: v for k, v in skin_tex.items()}, 'bumpTexture': bump_tex}}],
    'materials': materials, 'textures': textures, 'images': images, 'samplers': [],
    'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}],
}
while len(buf) % 4:
    buf.append(0)
gltf['buffers'][0]['byteLength'] = len(buf)
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
out = bytearray(b'glTF') + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(buf))
out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(buf)) + b'BIN\x00' + buf
open(OUT, 'wb').write(out)
if os.environ.get('SAVE_SKIN'):
    for k, v in skin_imgs.items():
        v.save(os.path.join(os.environ['SAVE_SKIN'], 'skin_%s.jpg' % k))
print('wrote', OUT, len(out) // 1024, 'KB', 'landmarks', landmarks)
