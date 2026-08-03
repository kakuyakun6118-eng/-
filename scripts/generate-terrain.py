#!/usr/bin/env python3
"""戦場の地の画を手続き的に描き起こす。

`src/ui/public/terrain/` に 960x894 の WebP を5枚書き出す（布陣図と同じ比率）。
`src/ui/terrainArt.json` に登録すると布陣図の地がその画になる。

**絵描きの代わりではない。** 標高場に陰影を付けて色を乗せた「地図に近い地」で、
写実的に描かれた戦場画とは別物。より良い画が用意できたら
同じファイル名で置き換えればよい。

兵は描かない。兵はゲームの状態から SVG で描いていて、
背景に焼き込むと兵数が変わっても駒が動かなくなる。

上端と下端の帯には隊と兵数の札が乗るので、起伏も植生もそこには置かない。

依存: numpy, Pillow
実行: python3 scripts/generate-terrain.py
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

W, H = 960, 894
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "ui", "public", "terrain")

# 上端と下端は隊と兵数の札が乗る帯。起伏を抑えて読みやすくする
TOP_BAND = 0.27
BOTTOM_BAND = 0.27

Rgb = tuple[int, int, int]


# ── 素材 ──────────────────────────────────────────────


def _box(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    if r < 1:
        return a
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float32)
    zero = np.zeros_like(np.take(c, [0], axis=axis))
    c = np.concatenate([zero, c], axis=axis)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / float(2 * r + 1)


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """浮動小数のままぼかす。

    **8bit に丸めてから Pillow でぼかしてはいけない。** なだらかな面は
    隣り合う画素の差が 1/255 を切るので階段状の段差ができ、
    そこに陰影（傾きの微分）を掛けると等高線が浮き出る。
    実際、砂漠の砂丘に細かい輪郭線が何本も走った。
    箱ぼかしを3回重ねてガウスに近似する
    """
    if sigma <= 0:
        return a
    r = max(1, int(sigma * 1.2))
    out = a.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def value_noise(cells: int, rng: np.random.Generator, aspect: float = 1.0) -> np.ndarray:
    """格子状の乱数を引き伸ばした値ノイズ。`aspect` を上げると横に伸びる。"""
    gh = max(2, cells + 1)
    gw = max(2, int(cells * (W / H) / aspect) + 1)
    grid = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def fbm(rng: np.random.Generator, octaves: int = 4, cells: int = 3,
        gain: float = 0.5, ridged: bool = False, aspect: float = 1.0) -> np.ndarray:
    """複数の周波数を重ねた標高場。

    **octaves を増やしすぎない。** 6段まで重ねると細かい皺が全面に立ち、
    丘陵も砂漠も「くしゃくしゃの紙」に見えた。大きな起伏を3〜4段で作り、
    細部は色と粒に任せるほうが地面に見える。
    """
    total = np.zeros((H, W), dtype=np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = value_noise(cells * 2 ** o, rng, aspect)
        if ridged:
            n = 1.0 - np.abs(n * 2.0 - 1.0)
        total += n * amp
        norm += amp
        amp *= gain
    out = total / norm
    return (out - out.min()) / max(1e-6, out.max() - out.min())


def flatten_bands(field: np.ndarray) -> np.ndarray:
    """上端と下端の起伏を平らに寄せる。札と兵が乗る帯を読みやすくするため。"""
    y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
    weight = np.ones_like(y)
    weight = np.where(y < TOP_BAND, y / TOP_BAND, weight)
    weight = np.where(y > 1.0 - BOTTOM_BAND, (1.0 - y) / BOTTOM_BAND, weight)
    weight = np.clip(weight, 0.0, 1.0) ** 0.75
    mean = float(field.mean())
    return mean + (field - mean) * weight


def heightfield(rng: np.random.Generator, smooth: float = 4.0, **kw) -> np.ndarray:
    """陰影を付けるための標高場。

    **必ず均してから使う。** 双三次で引き伸ばした面は格子の境目で
    傾きが折れるので、そのまま微分すると格子状の縞が陰影に浮く。
    """
    return flatten_bands(_blur(fbm(rng, **kw), smooth))


def band_mask() -> np.ndarray:
    """中央の帯だけ 1 になる重み。植生や地物をここに寄せる。"""
    y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
    m = np.ones_like(y)
    m = np.where(y < TOP_BAND, y / TOP_BAND, m)
    m = np.where(y > 1.0 - BOTTOM_BAND, (1.0 - y) / BOTTOM_BAND, m)
    return np.clip(m, 0.0, 1.0) ** 1.4


def hillshade(height: np.ndarray, scale: float,
              azimuth: float = 315.0, altitude: float = 42.0) -> np.ndarray:
    """左上からの平行光で標高場に陰影を付ける。"""
    dy, dx = np.gradient(height * scale)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    az = np.radians(360.0 - azimuth + 90.0)
    alt = np.radians(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0.0, 1.0)


def slope_of(height: np.ndarray, scale: float) -> np.ndarray:
    dy, dx = np.gradient(height * scale)
    s = np.hypot(dx, dy)
    return s / max(1e-6, float(s.max()))


def ramp(t: np.ndarray, stops: list[tuple[float, Rgb]]) -> np.ndarray:
    """標高を色に写す。stops は (位置, RGB) を昇順に並べたもの。"""
    t = np.clip(t, 0.0, 1.0)
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (t >= p0) & (t <= p1)
        if not m.any():
            continue
        f = ((t[m] - p0) / max(1e-6, p1 - p0))[:, None]
        out[m] = np.array(c0, np.float32) * (1 - f) + np.array(c1, np.float32) * f
    out[t < stops[0][0]] = stops[0][1]
    out[t > stops[-1][0]] = stops[-1][1]
    return out


def blend(rgb: np.ndarray, color: Rgb, mask: np.ndarray) -> None:
    """マスクの強さで色を混ぜる。地面の上に別の地肌を乗せるのに使う。"""
    f = np.clip(mask, 0.0, 1.0)[:, :, None]
    rgb *= 1.0 - f
    rgb += np.array(color, np.float32) * f


def grain(rgb: np.ndarray, rng: np.random.Generator, amount: float = 5.0) -> None:
    """細かなざらつき。のっぺりした面を地肌に寄せる。"""
    rgb += rng.normal(0.0, amount, (H, W, 1)).astype(np.float32)


def directional_texture(rng: np.random.Generator, sigma_y: float, sigma_x: float,
                        contrast: float = 2.2) -> np.ndarray:
    """向きのある細かい模様。麦の畝や砂の風紋に使う。

    1本ずつ線を引いていたときは 1px の縦線が数万本並んで網目が浮いた。
    **面として作って乗せる**ほうが地肌になる
    """
    n = rng.random((H, W)).astype(np.float32)
    img = Image.fromarray((n * 255).astype(np.uint8))
    img = img.resize((max(1, int(W / sigma_x)), max(1, int(H / sigma_y))), Image.BILINEAR)
    # 引き伸ばした跡が縞として浮くので、伸ばした方向に合わせてぼかす
    img = img.resize((W, H), Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(max(0.8, min(sigma_x, sigma_y) * 0.55)))
    t = np.asarray(img, dtype=np.float32) / 255.0
    return np.clip((t - 0.5) * contrast + 0.5, 0.0, 1.0)


def scatter(rgb: np.ndarray, rng: np.random.Generator, count: int,
            radius: tuple[int, int], lit: Rgb, shade: Rgb,
            conifer: bool = False, y_range: tuple[float, float] = (0.24, 0.76)) -> None:
    """木や灌木を散らす。手前ほど大きく描いて遠近を出す。"""
    lo, hi = int(H * y_range[0]), int(H * y_range[1])
    for _ in range(count):
        cy = int(rng.integers(lo, hi))
        cx = int(rng.integers(0, W))
        depth = cy / H
        r = int(rng.integers(radius[0], radius[1]) * (0.5 + 1.0 * depth))
        if r < 2:
            continue
        top = r * 3 if conifer else int(r * 1.6)
        y0, y1 = max(0, cy - top), min(H, cy + r)
        x0, x1 = max(0, cx - r), min(W, cx + r)
        if y1 - y0 < 3 or x1 - x0 < 3:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        patch = rgb[y0:y1, x0:x1]
        if conifer:
            t = (yy - (cy - top)) / max(1, top)
            body = np.abs(xx - cx) <= (r * t)
        else:
            body = ((xx - cx) / r) ** 2 + ((yy - (cy - r * 0.55)) / (r * 0.85)) ** 2 <= 1.0
        if not body.any():
            continue
        left = xx < cx
        patch[body & left] = lit
        patch[body & ~left] = shade
        foot = ((xx - cx) / (r * 1.15)) ** 2 + ((yy - cy) / max(1.0, r * 0.32)) ** 2 <= 1.0
        patch[foot] *= 0.7


def aerial(rgb: np.ndarray, haze: Rgb, strength: float = 0.3) -> np.ndarray:
    """遠くほど霞ませる。上が奥、下が手前。"""
    y = np.linspace(1.0, 0.0, H, dtype=np.float32)[:, None, None]
    f = (y ** 2.2) * strength
    return rgb * (1 - f) + np.array(haze, np.float32) * f


def finish(rgb: np.ndarray, name: str) -> None:
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.webp")
    img.save(path, "WEBP", quality=82, method=6)
    print(f"  {name}.webp  {os.path.getsize(path) // 1024} KB")


# ── 地形 ──────────────────────────────────────────────


def make_plain(rng: np.random.Generator) -> None:
    """平原。麦畑と牧草地の継ぎはぎ、畦道が横切る。"""
    hgt = heightfield(rng, smooth=5.0, octaves=4, cells=3, gain=0.45, aspect=1.8)
    shade = hillshade(hgt, 170.0)

    rgb = ramp(hgt, [
        (0.0, (118, 132, 74)), (0.35, (140, 148, 82)),
        (0.7, (166, 166, 96)), (1.0, (188, 184, 116)),
    ])

    # 耕地の継ぎはぎ。境目をぼかして畑の区画に見せる
    patch = _blur(fbm(rng, octaves=2, cells=3, gain=0.5, aspect=1.5), 6.0)
    blend(rgb, (196, 178, 104), np.clip((patch - 0.58) * 4.0, 0, 1) * 0.75)  # 麦
    blend(rgb, (128, 108, 74), np.clip((0.34 - patch) * 4.5, 0, 1) * 0.55)   # 鋤いた土

    # 畝。区画ごとに向きが違うので、縦横2枚を場所で切り替える
    rows_v = directional_texture(rng, sigma_y=11.0, sigma_x=1.7)
    rows_h = directional_texture(rng, sigma_y=1.7, sigma_x=11.0)
    which = (patch > 0.5).astype(np.float32)
    blend(rgb, (206, 194, 128), (rows_v * which + rows_h * (1 - which)) * 0.22)

    rgb *= (0.74 + 0.46 * shade)[:, :, None]

    # 畦道。中央を横切らせ、越える線として読ませる
    x = np.arange(W)[None, :].astype(np.float32)
    y = np.arange(H)[:, None].astype(np.float32)
    track = H * 0.5 + np.sin(x / W * 4.0) * 30 + np.sin(x / W * 10.0) * 9
    d = np.abs(y - track)
    blend(rgb, (192, 178, 142), np.clip(1.0 - d / 8.0, 0, 1) * 0.55)
    blend(rgb, (150, 138, 104), np.clip(1.0 - np.abs(d - 9.0) / 3.0, 0, 1) * 0.3)

    scatter(rgb, rng, 30, (4, 11), (110, 128, 68), (78, 94, 46), y_range=(0.26, 0.74))
    grain(rgb, rng)
    finish(aerial(rgb, (200, 198, 168)), "plain")


def make_hill(rng: np.random.Generator) -> None:
    """丘陵。乾いた土と露岩、中央に灌木。"""
    hgt = heightfield(rng, smooth=6.0, octaves=4, cells=3, gain=0.48, aspect=1.4)
    shade = hillshade(hgt, 420.0)
    slope = slope_of(hgt, 420.0)
    mid = band_mask()

    rgb = ramp(hgt, [
        (0.0, (118, 122, 76)), (0.28, (146, 138, 86)),
        (0.55, (176, 158, 100)), (0.8, (198, 180, 122)), (1.0, (214, 200, 146)),
    ])
    # 窪みには草、急斜面には乾いた土
    blend(rgb, (108, 122, 70), np.clip((0.42 - hgt) * 3.0, 0, 1) * 0.5 * mid)
    blend(rgb, (150, 132, 96), np.clip((slope - 0.32) * 2.6, 0, 1) * 0.6)

    rgb *= (0.56 + 0.74 * shade)[:, :, None]

    # 露岩。急斜面にだけ粒で置き、下側に影を落とす
    rock = (slope > 0.44) & (rng.random((H, W)) < 0.10)
    rgb[rock] = rgb[rock] * 0.6 + np.array([158, 146, 118], np.float32) * 0.4
    rgb[np.roll(rock, 2, axis=0) & ~rock] *= 0.78

    scatter(rgb, rng, 58, (4, 12), (112, 126, 70), (76, 90, 48))
    grain(rgb, rng)
    finish(aerial(rgb, (206, 198, 172)), "hill")


def make_forest(rng: np.random.Generator) -> None:
    """森林。針葉樹の樹海と、中央の林間の空き地。"""
    hgt = heightfield(rng, smooth=5.0, octaves=4, cells=3, gain=0.5)
    shade = hillshade(hgt, 190.0)

    # 手前を明るく取る。暗いままだと、上に重なる紺の隊が地面に沈んだ
    rgb = ramp(hgt, [
        (0.0, (104, 116, 76)), (0.4, (124, 136, 90)),
        (0.7, (144, 154, 104)), (1.0, (162, 170, 120)),
    ])
    # 苔と下草のむら
    moss = _blur(fbm(rng, octaves=3, cells=4, gain=0.5), 3.0)
    blend(rgb, (84, 104, 58), np.clip((moss - 0.5) * 3.0, 0, 1) * 0.4)
    rgb *= (0.78 + 0.42 * shade)[:, :, None]

    # 樹海。中央に空き地を残す
    for _ in range(3000):
        cx = int(rng.integers(0, W))
        cy = int(rng.integers(int(H * 0.15), int(H * 0.85)))
        if abs(cx - W * 0.5) < W * 0.17 and abs(cy - H * 0.5) < H * 0.17 and rng.random() < 0.9:
            continue
        depth = cy / H
        r = int(rng.integers(5, 12) * (0.45 + 1.05 * depth))
        top = r * 3
        y0, y1 = max(0, cy - top), min(H, cy + r)
        x0, x1 = max(0, cx - r), min(W, cx + r)
        if y1 - y0 < 4 or x1 - x0 < 3:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        t = (yy - (cy - top)) / max(1, top)
        cone = np.abs(xx - cx) <= (r * t)
        patch = rgb[y0:y1, x0:x1]
        left = xx < cx
        # 手前ほど明るく。奥は霞んで沈む
        tone = 0.75 + 0.45 * depth
        patch[cone & left] = np.array([64, 88, 52], np.float32) * tone
        patch[cone & ~left] = np.array([40, 58, 36], np.float32) * tone
        foot = ((xx - cx) / (r * 1.2)) ** 2 + ((yy - cy) / max(1.0, r * 0.3)) ** 2 <= 1.0
        patch[foot] *= 0.72

    # 空き地の倒木。空白に見せないために置くが、目立たせない。
    # 明るい茶にすると赤い棒が散らばっているように見えた
    for _ in range(4):
        cy = int(rng.integers(int(H * 0.44), int(H * 0.58)))
        cx = int(rng.integers(int(W * 0.36), int(W * 0.60)))
        ln = int(rng.integers(30, 56))
        rgb[cy:cy + 3, cx:cx + ln] = np.array([76, 64, 44], np.float32)
        rgb[cy + 3:cy + 5, cx:cx + ln] = np.array([54, 46, 32], np.float32)

    grain(rgb, rng)
    finish(aerial(rgb, (168, 180, 156)), "forest")


def make_desert(rng: np.random.Generator) -> None:
    """砂漠。横に伸びた砂丘と、礫の広がる硬い地面。"""
    # 風で寄せられた砂丘は横に長い。aspect で向きを付ける
    # 横長の格子は幅が数マスしかなく、双三次の引き伸ばしの跡が
    # 陰影に細かい縦筋として出る。ここだけ強く均す
    hgt = heightfield(rng, smooth=16.0, octaves=3, cells=2, gain=0.45, ridged=True, aspect=3.4)
    shade = hillshade(hgt, 380.0)
    slope = slope_of(hgt, 380.0)

    rgb = ramp(hgt, [
        (0.0, (186, 158, 104)), (0.32, (210, 184, 126)),
        (0.66, (228, 206, 152)), (1.0, (242, 226, 182)),
    ])
    # 砂丘のあいだの礫。低いところに硬い地面が覗く
    gravel = np.clip((0.34 - hgt) * 4.0, 0, 1)
    blend(rgb, (172, 152, 116), gravel * 0.55)
    rgb[(gravel > 0.4) & (rng.random((H, W)) < 0.09)] *= 0.82

    # 風紋。砂丘と同じ向き（横）に薄く乗せる
    ripple = directional_texture(rng, sigma_y=3.4, sigma_x=13.0, contrast=1.4)
    blend(rgb, (246, 232, 192), ripple * 0.12 * (1.0 - gravel))

    rgb *= (0.62 + 0.62 * shade)[:, :, None]
    # 稜線に陽の縁を立てる
    crest = np.clip((slope - 0.3) * 3.0, 0, 1) * np.clip((hgt - 0.55) * 3.0, 0, 1)
    blend(rgb, (250, 238, 202), crest * 0.35)

    scatter(rgb, rng, 22, (4, 9), (150, 144, 96), (108, 102, 62))
    grain(rgb, rng)
    finish(aerial(rgb, (234, 222, 190)), "desert")


def make_river(rng: np.random.Generator) -> None:
    """渡河点。浅い川が横切り、石の多い河原と浅瀬。"""
    hgt = heightfield(rng, smooth=5.0, octaves=4, cells=3, gain=0.46, aspect=1.6)
    shade = hillshade(hgt, 180.0)

    rgb = ramp(hgt, [
        (0.0, (112, 126, 74)), (0.4, (138, 146, 88)),
        (0.72, (162, 164, 104)), (1.0, (182, 180, 124)),
    ])
    rgb *= (0.72 + 0.48 * shade)[:, :, None]

    x = np.arange(W)[None, :].astype(np.float32)
    y = np.arange(H)[:, None].astype(np.float32)
    centre = H * 0.5 + np.sin(x / W * 3.2) * 32 + np.sin(x / W * 7.6) * 11
    half = 44.0 + np.sin(x / W * 5.0) * 9.0
    d = np.abs(y - centre)

    # 河原。石の多い帯
    bank = np.clip(1.0 - (d - half) / 46.0, 0, 1) * (d > half)
    blend(rgb, (178, 170, 138), bank * 0.6)
    shingle = (bank > 0.25) & (rng.random((H, W)) < 0.06)
    rgb[shingle] = rgb[shingle] * 0.62 + np.array([206, 200, 178], np.float32) * 0.38

    # 水面。深いほど暗く、岸に寄るほど底が透ける
    depth = np.clip(1.0 - d / half, 0.0, 1.0)
    water = d <= half
    wcol = ramp(depth, [(0.0, (142, 162, 158)), (0.45, (92, 128, 146)), (1.0, (56, 96, 126))])
    rgb[water] = wcol[water]

    # さざなみ。破線に見えないよう面で乗せる
    wave = directional_texture(rng, sigma_y=2.4, sigma_x=9.0, contrast=1.9)
    blend(rgb, (206, 226, 234), water * wave * (0.35 + 0.4 * depth) * 0.35)

    # 浅瀬。中央だけ底が見え、踏み越えられる
    fade = np.clip(1.0 - np.abs(x - W * 0.5) / 84.0, 0, 1)
    ford = water & (np.abs(x - W * 0.5) < 84)
    blend(rgb, (162, 178, 172), (ford * fade) * 0.62)
    rgb[ford & (rng.random((H, W)) < 0.035)] = np.array([196, 198, 186], np.float32)

    scatter(rgb, rng, 26, (4, 10), (108, 124, 68), (74, 88, 46), y_range=(0.22, 0.78))
    grain(rgb, rng)
    finish(aerial(rgb, (192, 200, 182)), "river")


if __name__ == "__main__":
    print("戦場の地を書き出す:")
    make_plain(np.random.default_rng(11))
    make_hill(np.random.default_rng(23))
    make_forest(np.random.default_rng(37))
    make_desert(np.random.default_rng(51))
    make_river(np.random.default_rng(67))
