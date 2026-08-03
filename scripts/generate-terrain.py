#!/usr/bin/env python3
"""戦場の地の画を手続き的に描き起こす。

`src/ui/public/terrain/` に 960x750 の WebP を5枚書き出す。
出力を `src/ui/terrainArt.json` に登録すると布陣図の地がその画になる。

**これは絵描きの代わりではない。** 標高場に陰影を付けて色を乗せた
「地図に近い地」で、写実的に描かれた戦場画とは別物。
より良い画が用意できたら同じファイル名で置き換えればよい。

兵は描かない。兵はゲームの状態から SVG で描いていて、
背景に焼き込むと兵数が変わっても駒が動かなくなる。

依存: numpy, Pillow
実行: python3 scripts/generate-terrain.py
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

W, H = 960, 750
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "ui", "public", "terrain")

# 上端と下端は隊と兵数の札が乗る帯なので、起伏を抑えて読みやすくする
TOP_BAND = 0.26
BOTTOM_BAND = 0.26


def value_noise(shape: tuple[int, int], cells: int, rng: np.random.Generator,
                aspect: float = 1.0) -> np.ndarray:
    """格子状の乱数を双三次に拡大した値ノイズ。

    `aspect` を上げると横に伸びた模様になる。砂丘や畝のように
    風や耕作の向きが決まっている地形はこれで向きを付ける。
    """
    h, w = shape
    gh = max(2, cells + 1)
    gw = max(2, int(cells * (w / h) / aspect) + 1)
    grid = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    # 双三次はごく小さい格子から引き伸ばすと輪郭が振動し、
    # 全面に細かい網目（モアレ）が出る。軽くぼかして消す
    img = img.filter(ImageFilter.GaussianBlur(max(1.0, min(w / max(2, gw), h / max(2, gh)) * 0.18)))
    return np.asarray(img, dtype=np.float32) / 255.0


def fbm(shape: tuple[int, int], rng: np.random.Generator, octaves: int = 5, cells: int = 3,
        gain: float = 0.5, ridged: bool = False, aspect: float = 1.0) -> np.ndarray:
    """複数の周波数を重ねた標高場。`ridged` で尾根の立った地形になる。

    **octaves を増やしすぎない。** 6段まで重ねると細かい皺が
    全面に立ち、丘陵も砂漠も「くしゃくしゃの紙」に見えた。
    大きな起伏を3〜4段で作り、細部は色と粒に任せるほうが地面に見える。
    """
    total = np.zeros(shape, dtype=np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = value_noise(shape, cells * 2 ** o, rng, aspect)
        if ridged:
            n = 1.0 - np.abs(n * 2.0 - 1.0)
        total += n * amp
        norm += amp
        amp *= gain
    out = total / norm
    return (out - out.min()) / max(1e-6, out.max() - out.min())


def flatten_bands(field: np.ndarray) -> np.ndarray:
    """上端と下端の起伏を平らに寄せる。札と兵が乗る帯を読みやすくするため。"""
    h = field.shape[0]
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    weight = np.ones_like(y)
    weight = np.where(y < TOP_BAND, y / TOP_BAND, weight)
    weight = np.where(y > 1.0 - BOTTOM_BAND, (1.0 - y) / BOTTOM_BAND, weight)
    weight = np.clip(weight, 0.0, 1.0) ** 0.7
    mean = float(field.mean())
    return mean + (field - mean) * weight


def hillshade(height: np.ndarray, scale: float = 260.0,
              azimuth: float = 315.0, altitude: float = 45.0) -> np.ndarray:
    """左上からの平行光で標高場に陰影を付ける。"""
    dy, dx = np.gradient(height * scale)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    az = np.radians(360.0 - azimuth + 90.0)
    alt = np.radians(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0.0, 1.0)


def ramp(t: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
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


def aerial(rgb: np.ndarray, haze: tuple[int, int, int], strength: float = 0.34) -> np.ndarray:
    """遠くほど霞ませる。上が奥、下が手前。"""
    y = np.linspace(1.0, 0.0, rgb.shape[0], dtype=np.float32)[:, None, None]
    f = (y ** 2.2) * strength
    return rgb * (1 - f) + np.array(haze, np.float32) * f


def scatter(rgb: np.ndarray, height: np.ndarray, rng: np.random.Generator,
            count: int, radius: tuple[int, int], color: tuple[int, int, int],
            shade: tuple[int, int, int], centre_only: bool = True) -> None:
    """木や灌木を散らす。`centre_only` なら中央の帯にだけ置く。"""
    h, w = height.shape
    lo = int(h * TOP_BAND * 0.75) if centre_only else 0
    hi = int(h * (1 - BOTTOM_BAND * 0.75)) if centre_only else h
    for _ in range(count):
        cy = rng.integers(lo, hi)
        cx = rng.integers(0, w)
        # 手前ほど大きく描いて遠近を出す
        depth = cy / h
        r = int(rng.integers(radius[0], radius[1]) * (0.55 + 0.9 * depth))
        if r < 2:
            continue
        y0, y1 = max(0, cy - r * 2), min(h, cy + r)
        x0, x1 = max(0, cx - r), min(w, cx + r)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        # 上半分を樹冠、下を影に見立てた楕円
        crown = ((xx - cx) / r) ** 2 + ((yy - (cy - r * 0.55)) / (r * 0.85)) ** 2 <= 1.0
        if not crown.any():
            continue
        lit = xx < cx
        patch = rgb[y0:y1, x0:x1]
        patch[crown & lit] = color
        patch[crown & ~lit] = shade
        # 足元の影
        foot = ((xx - cx) / (r * 1.1)) ** 2 + ((yy - cy) / max(1, r * 0.3)) ** 2 <= 1.0
        patch[foot] = patch[foot] * 0.72


def texture(rgb: np.ndarray, rng: np.random.Generator, color: tuple[int, int, int],
            alpha: float, scale: tuple[float, float], seed_cells: int = 60) -> None:
    """麦の畝や砂の風紋。方向のある細かい模様を面で乗せる。

    1本ずつ線を引いていたときは、1px の縦線が数万本並んで
    画面全体に網目が浮いた。**面として作って乗せる**ほうが地肌になる。
    `scale` は (縦, 横) のぼかし量で、大きいほうへ模様が伸びる
    """
    h, w = rgb.shape[:2]
    n = rng.random((h, w)).astype(np.float32)
    img = Image.fromarray((n * 255).astype(np.uint8))
    # 方向のあるぼかし。縦横で別々にかけて筋の向きを作る
    img = img.resize((max(1, int(w / scale[1])), max(1, int(h / scale[0]))), Image.BILINEAR)
    img = img.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
    t = np.asarray(img, dtype=np.float32) / 255.0
    t = np.clip((t - 0.5) * 2.4 + 0.5, 0.0, 1.0)
    # 手前ほど模様をはっきり出す
    depth = np.linspace(0.45, 1.0, h, dtype=np.float32)[:, None]
    f = (t * alpha * depth)[:, :, None]
    rgb *= 1.0 - f
    rgb += np.array(color, np.float32) * f
    _ = seed_cells


def finish(rgb: np.ndarray, name: str) -> None:
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.webp")
    img.save(path, "WEBP", quality=84, method=6)
    print(f"{path}  {os.path.getsize(path) // 1024} KB")


def make_plain(rng: np.random.Generator) -> None:
    """平原。収穫前の麦畑と草地。畦道が横切る。"""
    hgt = flatten_bands(fbm((H, W), rng, octaves=3, cells=2, gain=0.45, aspect=2.0))
    shade = hillshade(hgt, scale=150.0)
    rgb = ramp(hgt, [
        (0.0, (150, 146, 92)), (0.35, (178, 168, 96)),
        (0.65, (196, 182, 106)), (1.0, (208, 196, 128)),
    ])
    rgb *= (0.72 + 0.5 * shade)[:, :, None]
    texture(rgb, rng, (216, 202, 134), 0.34, scale=(9.0, 1.6))
    # 畦道。中央の帯を横切らせ、越える線として読ませる
    y = np.arange(H)[:, None]
    x = np.arange(W)[None, :]
    path_y = H * 0.5 + np.sin(x / W * 4.2) * 26 + np.sin(x / W * 11.0) * 8
    band = np.abs(y - path_y) < 7
    rgb[band] = rgb[band] * 0.55 + np.array([196, 182, 148], np.float32) * 0.45
    scatter(rgb, hgt, rng, 34, (4, 13), (118, 132, 74), (84, 98, 52))
    finish(aerial(rgb, (206, 200, 168)), "plain")


def make_hill(rng: np.random.Generator) -> None:
    """丘陵。連なるなだらかな丘、稜線に陽、その下に陰。露岩と灌木。"""
    hgt = flatten_bands(fbm((H, W), rng, octaves=3, cells=2, gain=0.42, aspect=1.6))
    shade = hillshade(hgt, scale=520.0)
    rgb = ramp(hgt, [
        (0.0, (128, 120, 78)), (0.3, (156, 142, 88)),
        (0.6, (182, 164, 104)), (0.82, (200, 184, 128)), (1.0, (212, 198, 150)),
    ])
    rgb *= (0.58 + 0.72 * shade)[:, :, None]
    # 露岩。傾斜の急なところにだけ出す
    dy, dx = np.gradient(hgt * 520.0)
    steep = np.hypot(dx, dy) > 3.4
    rock = rng.random((H, W)) < 0.35
    rgb[steep & rock] = rgb[steep & rock] * 0.62 + np.array([132, 118, 84], np.float32) * 0.38
    scatter(rgb, hgt, rng, 46, (4, 12), (116, 128, 72), (80, 92, 50))
    finish(aerial(rgb, (208, 198, 170)), "hill")


def make_forest(rng: np.random.Generator) -> None:
    """森林。深い針葉樹林と、中央の林間の空き地。"""
    hgt = flatten_bands(fbm((H, W), rng, octaves=5, cells=3, gain=0.5))
    shade = hillshade(hgt, scale=150.0)
    rgb = ramp(hgt, [
        (0.0, (74, 84, 58)), (0.4, (92, 104, 70)),
        (0.7, (110, 122, 82)), (1.0, (128, 140, 96)),
    ])
    rgb *= (0.66 + 0.55 * shade)[:, :, None]
    # 樹海。中央に空き地を残すため、幅方向の密度に穴を空ける
    for _ in range(2600):
        cx = int(rng.integers(0, W))
        cy = int(rng.integers(int(H * 0.16), int(H * 0.84)))
        gap = abs(cx - W * 0.5) < W * 0.16 and abs(cy - H * 0.5) < H * 0.16
        if gap and rng.random() < 0.88:
            continue
        depth = cy / H
        r = int(rng.integers(5, 11) * (0.5 + 1.0 * depth))
        y0, y1 = max(0, cy - r * 3), min(H, cy + r)
        x0, x1 = max(0, cx - r), min(W, cx + r)
        if y1 - y0 < 3 or x1 - x0 < 3:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        # 針葉樹。上に尖った三角形
        t = (yy - (cy - r * 3)) / max(1, r * 3)
        cone = np.abs(xx - cx) <= (r * t)
        patch = rgb[y0:y1, x0:x1]
        lit = xx < cx
        patch[cone & lit] = (62, 84, 54)
        patch[cone & ~lit] = (40, 58, 38)
    # 倒木と下草
    scatter(rgb, hgt, rng, 30, (5, 10), (96, 112, 66), (66, 80, 46))
    finish(aerial(rgb, (176, 186, 162)), "forest")


def make_desert(rng: np.random.Generator) -> None:
    """砂漠。乾いた砂丘と礫の平地。稜線に陽、風下側に陰。"""
    # 風で寄せられた砂丘は横に長い。aspect で向きを付ける
    # （転がし平均で均していたときは、縞模様の筋が全面に出た）
    hgt = flatten_bands(fbm((H, W), rng, octaves=3, cells=2, gain=0.45,
                            ridged=True, aspect=3.2))
    shade = hillshade(hgt, scale=430.0)
    rgb = ramp(hgt, [
        (0.0, (176, 154, 100)), (0.35, (204, 182, 122)),
        (0.68, (224, 204, 148)), (1.0, (238, 222, 176)),
    ])
    rgb *= (0.62 + 0.62 * shade)[:, :, None]
    # 風紋は砂丘と同じ向き（横）に伸びる
    texture(rgb, rng, (242, 228, 190), 0.26, scale=(2.0, 14.0))
    # 礫と乾いた低木
    grit = rng.random((H, W)) < 0.012
    rgb[grit] = rgb[grit] * 0.78
    scatter(rgb, hgt, rng, 18, (5, 9), (150, 142, 92), (112, 104, 64))
    finish(aerial(rgb, (232, 220, 186)), "desert")


def make_river(rng: np.random.Generator) -> None:
    """渡河点。浅い川が横切り、石の多い河原と浅瀬。両岸は草地。"""
    hgt = flatten_bands(fbm((H, W), rng, octaves=5, cells=2, gain=0.5))
    shade = hillshade(hgt, scale=110.0)
    rgb = ramp(hgt, [
        (0.0, (128, 132, 84)), (0.4, (152, 154, 96)),
        (0.7, (172, 172, 112)), (1.0, (190, 188, 132)),
    ])
    rgb *= (0.7 + 0.5 * shade)[:, :, None]

    y = np.arange(H)[:, None].astype(np.float32)
    x = np.arange(W)[None, :].astype(np.float32)
    centre = H * 0.5 + np.sin(x / W * 3.4) * 34 + np.sin(x / W * 8.5) * 12
    dist = np.abs(y - centre)

    bank = dist < 78
    rgb[bank] = rgb[bank] * 0.55 + np.array([186, 176, 138], np.float32) * 0.45
    shingle = bank & (rng.random((H, W)) < 0.05)
    rgb[shingle] = rgb[shingle] * 0.7 + np.array([210, 202, 178], np.float32) * 0.3

    water = dist < 52
    depth = np.clip(1.0 - dist / 52.0, 0.0, 1.0)
    wcol = ramp(depth, [(0.0, (128, 152, 158)), (0.5, (86, 122, 140)), (1.0, (58, 96, 122))])
    rgb[water] = wcol[water]
    # 水面の照り返し
    # 横に流れる光。斜めの正弦にしていたときは網目の陰影に見えた
    glint = np.sin(x / 26.0 + np.sin(x / 90.0) * 2.4 + y / 140.0)
    sheen = water & (glint > 0.93) & (np.abs(y - centre) % 17 < 3)
    rgb[sheen] = rgb[sheen] * 0.5 + np.array([220, 236, 242], np.float32) * 0.5

    # 浅瀬。中央だけ底が見え、踏み越えられる
    ford = water & (np.abs(x - W * 0.5) < 78)
    rgb[ford] = rgb[ford] * 0.42 + np.array([150, 172, 172], np.float32) * 0.58
    stones = ford & (rng.random((H, W)) < 0.03)
    rgb[stones] = np.array([192, 196, 186], np.float32)

    scatter(rgb, hgt, rng, 22, (6, 11), (110, 126, 70), (78, 92, 50))
    finish(aerial(rgb, (198, 204, 186)), "river")


if __name__ == "__main__":
    make_plain(np.random.default_rng(11))
    make_hill(np.random.default_rng(23))
    make_forest(np.random.default_rng(37))
    make_desert(np.random.default_rng(51))
    make_river(np.random.default_rng(67))
