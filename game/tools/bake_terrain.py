#!/usr/bin/env python3
"""実物の標高データと河川データから、ゲーム用の地形ファイルを作る。

地図の範囲を変えたときだけ実行すればよい(ふだんゲームを動かすのには不要)。

  pip install numpy pillow scipy
  python3 tools/bake_terrain.py north-china

出力:
  src/data/regions/<地域>/terrain.png  R,G = 標高(メートル, 16ビット) / B = 水辺までの距離
  src/data/regions/<地域>/rivers.json  河川の流路(将来の移動計算などに使う)

データの出典(どちらも商用利用可):
  標高: Terrain Tiles (AWS Open Data)。元データは SRTM・GMTED2010 (USGS) と ETOPO1 (NOAA)。
        出典の表示が必要。
  河川・湖: Natural Earth (パブリックドメイン)。
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ZOOM = 7
OUT_WIDTH = 2048
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
RIVERS_FILE = "ne_10m_rivers_lake_centerlines_scale_rank.geojson"
LAKES_FILE = "ne_10m_lakes.geojson"

# Natural Earth に無い川を手で足す(緯度経度)
EXTRA_RIVERS = {
    "north-china": [
        {"name": "洛水", "weight": 0.2,
         "points": [[110.6, 34.05], [111.1, 34.3], [111.6, 34.42], [112.1, 34.6], [112.5, 34.68], [113.03, 34.83]]},
    ],
}

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get("TERRAIN_CACHE", os.path.join(HERE, ".cache"))


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print("download", url)
        urllib.request.urlretrieve(url, path)
    return path


def merc_x(lon):
    return (lon + 180.0) / 360.0 * (2 ** ZOOM) * 256


def merc_y(lat):
    r = np.radians(lat)
    return (1 - np.arcsinh(np.tan(r)) / math.pi) / 2 * (2 ** ZOOM) * 256


def load_elevation(bounds, width, height):
    """標高タイルをつなぎ合わせ、緯度経度の格子に並べ直す。"""
    x0 = int(merc_x(bounds["west"]) // 256)
    x1 = int(merc_x(bounds["east"]) // 256)
    y0 = int(merc_y(bounds["north"]) // 256)
    y1 = int(merc_y(bounds["south"]) // 256)
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.float32)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            p = fetch(TILE_URL.format(z=ZOOM, x=tx, y=ty), os.path.join(CACHE, "tiles", f"{ZOOM}_{tx}_{ty}.png"))
            a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
            elev = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
            mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = elev
    lons = np.linspace(bounds["west"], bounds["east"], width)
    lats = np.linspace(bounds["north"], bounds["south"], height)
    px = merc_x(lons) - x0 * 256 - 0.5
    py = merc_y(lats) - y0 * 256 - 0.5
    yy, xx = np.meshgrid(py, px, indexing="ij")
    return ndimage.map_coordinates(mosaic, [yy, xx], order=1, mode="nearest")


def simplify(points, tol):
    """点の数を減らす(Douglas-Peucker法)。"""
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    ab = b - a
    n = np.hypot(*ab) or 1e-9
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in points[1:-1]]
    i = int(np.argmax(d))
    if d[i] <= tol:
        return [points[0], points[-1]]
    return simplify(points[:i + 2], tol)[:-1] + simplify(points[i + 1:], tol)


def main():
    region_id = sys.argv[1] if len(sys.argv) > 1 else "north-china"
    region_dir = os.path.join(HERE, "..", "src", "data", "regions", region_id)
    region = json.load(open(os.path.join(region_dir, "region.json"), encoding="utf-8"))
    b = region["bounds"]
    W = int(region.get("textureWidth", OUT_WIDTH))
    H = round(W * (b["north"] - b["south"]) / (b["east"] - b["west"]))

    def to_px(lon, lat):
        return ((lon - b["west"]) / (b["east"] - b["west"]) * (W - 1),
                (b["north"] - lat) / (b["north"] - b["south"]) * (H - 1))

    elev = load_elevation(b, W, H)
    sea = elev <= 0
    # 小さな点々を消して、海岸線をなめらかにする
    sea = ndimage.binary_opening(sea, iterations=2)
    labels, n = ndimage.label(sea)
    if n:
        sizes = ndimage.sum(sea, labels, range(1, n + 1))
        # 海は、大きくて、地図の端に接しているものだけ(トルファン盆地のような、海面より低い内陸の盆地を海にしない)
        edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
        sea = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s > 400 and (i + 1) in edge])

    # --- 湖 ---
    lakes = json.load(open(fetch(NE_BASE + LAKES_FILE, os.path.join(CACHE, LAKES_FILE)), encoding="utf-8"))
    lake_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(lake_img)
    for f in lakes["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            ring = poly[0]
            if not any(b["west"] <= p[0] <= b["east"] and b["south"] <= p[1] <= b["north"] for p in ring):
                continue
            draw.polygon([to_px(p[0], p[1]) for p in ring], fill=255)
    lake = np.asarray(lake_img) > 0

    # --- 河川 ---
    rivers = json.load(open(fetch(NE_BASE + RIVERS_FILE, os.path.join(CACHE, RIVERS_FILE)), encoding="utf-8"))
    segments = []  # (名前, 太さ, 点の並び)
    for f in rivers["features"]:
        g = f["geometry"]
        if not g:
            continue
        p = f["properties"]
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for line in lines:
            if any(b["west"] - 0.5 <= q[0] <= b["east"] + 0.5 and b["south"] - 0.5 <= q[1] <= b["north"] + 0.5 for q in line):
                name = p.get("name_ja") or p.get("name") or "unnamed"
                segments.append((name, float(p.get("strokeweig") or 0.2), [[q[0], q[1]] for q in line]))
    for extra in EXTRA_RIVERS.get(region_id, []):
        segments.append((extra["name"], extra["weight"], extra["points"]))

    # 太さごとに川を描き、「川岸までの距離」を求める
    SS = 2  # なめらかにするため2倍の大きさで描く
    river_sdf = np.full((H, W), 99.0, dtype=np.float32)
    center_dist = np.full((H, W), 99.0, dtype=np.float32)
    bins = {}
    for _, weight, line in segments:
        half = 0.4 + 1.0 * weight ** 0.8  # 川幅の半分(ピクセル)
        bins.setdefault(round(half * 4) / 4, []).append(line)
    for half, lines in bins.items():
        img = Image.new("L", (W * SS, H * SS), 0)
        d = ImageDraw.Draw(img)
        for line in lines:
            d.line([tuple(v * SS for v in to_px(q[0], q[1])) for q in line], fill=255, width=1)
        dist = ndimage.distance_transform_edt(np.asarray(img) == 0) / SS
        dist = dist.reshape(H, SS, W, SS).mean(axis=(1, 3)).astype(np.float32)
        center_dist = np.minimum(center_dist, dist)
        river_sdf = np.minimum(river_sdf, dist - half)

    # --- 川に沿って谷底を作る(川が斜面を登って見えないようにする) ---
    valley = ndimage.minimum_filter(elev, size=7)
    valley = ndimage.gaussian_filter(valley, 1.5)
    w = np.exp(-(center_dist / 2.6) ** 2)
    elev = elev * (1 - w) + np.minimum(elev, valley - 4) * w
    elev = np.where(sea, 0, np.maximum(elev, 1))

    # --- 水辺までの距離(海・湖・川をまとめる) ---
    def signed(mask):
        return (ndimage.distance_transform_edt(~mask) - ndimage.distance_transform_edt(mask)).astype(np.float32)

    still = sea | lake
    water_sdf = np.minimum(river_sdf, signed(still) + 0.5 if still.any() else 99)
    # 海の中では川を描かない
    water_sdf = np.where(sea, np.minimum(water_sdf, -1.0), water_sdf)
    water = np.clip(128 - water_sdf * 20, 0, 255).astype(np.uint8)

    m = np.clip(np.round(elev), 0, 65535).astype(np.uint16)
    rgb = np.dstack([(m >> 8).astype(np.uint8), (m & 255).astype(np.uint8), water])
    out = os.path.join(region_dir, "terrain.png")
    Image.fromarray(rgb, "RGB").save(out, optimize=True)
    print("wrote", out, f"{W}x{H}", os.path.getsize(out) // 1024, "KB", "max elev", int(m.max()))

    # --- 河川の流路をJSONにも残す ---
    by_name = {}
    for name, weight, line in segments:
        r = by_name.setdefault(name, {"weight": 0, "lines": []})
        r["weight"] = max(r["weight"], weight)
        pts = [[round(x, 3), round(y, 3)] for x, y in simplify(line, 0.02)]
        r["lines"].append(pts)
    out_rivers = [{"id": f"river-{i}", "name": k, "width": v["weight"], "lines": v["lines"]}
                  for i, (k, v) in enumerate(sorted(by_name.items(), key=lambda kv: -kv[1]["weight"]))]
    with open(os.path.join(region_dir, "rivers.json"), "w", encoding="utf-8") as f:
        json.dump(out_rivers, f, ensure_ascii=False, separators=(",", ":"))
    print("rivers:", len(out_rivers))

    # 確認用の陰影図
    if os.environ.get("TERRAIN_PREVIEW"):
        gy, gx = np.gradient(elev)
        shade = np.clip(0.6 + (-gx - gy) / 400, 0, 1)
        img = np.dstack([shade * 200, shade * 200, shade * 180]).astype(np.uint8)
        img[water > 128] = [60, 110, 170]
        Image.fromarray(img).save(os.environ["TERRAIN_PREVIEW"])


if __name__ == "__main__":
    main()
