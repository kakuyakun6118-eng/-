#!/usr/bin/env python3
"""会戦の戦場用に、実物の標高と土地被覆を切り出して軽いファイルにする。

src/data/battlefields/sites.json に書いた範囲ごとに、次の2つを作る。
  <id>.terrain.png  R,G = 標高(メートル, 16ビット) / B = 土地被覆の種類
  <id>.water.png    水域(白 = 水)。現代の水域なので、歴史的な流路に差し替えられるよう別ファイルにしてある

  pip install numpy pillow rasterio
  python3 tools/bake_battlefield.py            # すべての範囲
  python3 tools/bake_battlefield.py fukou-taihang

データの出典:
  標高: ALOS World 3D - 30m (AW3D30) © JAXA。OpenTopography の公開サーバーから取得する。
  土地被覆: ESA WorldCover 10m 2021 v200 (CC BY 4.0)。
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rasterio.transform import from_bounds

AW3D30_URL = "https://opentopography.s3.sdsc.edu/raster/AW3D30/AW3D30_global/ALPSMLC30_{tile}_DSM.tif"
WORLDCOVER_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
PIXEL_METERS = 60
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get("TERRAIN_CACHE", os.path.join(HERE, ".cache"))

# WorldCover の分類 → ゲーム内の番号
# 0 草地・耕地 / 1 樹林 / 2 低木 / 3 裸地 / 4 水域 / 5 湿地
# (市街地は現代のものなので、耕地と同じ扱いにする)
COVER = {10: 1, 20: 2, 30: 0, 40: 0, 50: 0, 60: 3, 70: 3, 80: 4, 90: 5, 95: 5, 100: 0}


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        print("download", url)
        urllib.request.urlretrieve(url, path)
    return path


def read_into(paths, bounds, width, height, resampling, dtype):
    """複数のファイルから、指定した範囲(緯度経度)を1枚の表に読み込む。"""
    out = np.zeros((height, width), dtype=dtype)
    dst_transform = from_bounds(bounds["west"], bounds["south"], bounds["east"], bounds["north"], width, height)
    for p in paths:
        with rasterio.open(p) as src:
            part = np.zeros((height, width), dtype=dtype)
            reproject(rasterio.band(src, 1), part, dst_transform=dst_transform, dst_crs="EPSG:4326",
                      resampling=resampling, src_nodata=None, dst_nodata=0)
            out = np.where(part != 0, part, out)
    return out


def bake(site, out_dir):
    b = site["bounds"]
    mid = math.radians((b["south"] + b["north"]) / 2)
    width = round((b["east"] - b["west"]) * 111190 * math.cos(mid) / PIXEL_METERS)
    height = round((b["north"] - b["south"]) * 111190 / PIXEL_METERS)

    # --- 標高:1度ごとのタイルを集める(タイル名は南西の角の緯度経度) ---
    dem = []
    for lat in range(math.floor(b["south"]), math.floor(b["north"] - 1e-9) + 1):
        for lon in range(math.floor(b["west"]), math.floor(b["east"] - 1e-9) + 1):
            tile = f"N{lat:03d}E{lon:03d}"
            dem.append(fetch(AW3D30_URL.format(tile=tile), f"aw3d30_{tile}.tif"))
    elev = read_into(dem, b, width, height, Resampling.bilinear, np.float32)
    elev = np.clip(np.round(elev), 0, 65535).astype(np.uint16)

    # --- 土地被覆:3度ごとのタイル ---
    lc = []
    for lat in range(math.floor(b["south"] / 3) * 3, math.floor((b["north"] - 1e-9) / 3) * 3 + 1, 3):
        for lon in range(math.floor(b["west"] / 3) * 3, math.floor((b["east"] - 1e-9) / 3) * 3 + 1, 3):
            tile = f"N{lat:02d}E{lon:03d}"
            lc.append(fetch(WORLDCOVER_URL.format(tile=tile), f"worldcover_{tile}.tif"))
    raw = read_into(lc, b, width, height, Resampling.mode, np.uint8)
    cover = np.zeros_like(raw)
    for k, v in COVER.items():
        cover[raw == k] = v

    rgb = np.dstack([(elev >> 8).astype(np.uint8), (elev & 255).astype(np.uint8), cover])
    Image.fromarray(rgb, "RGB").save(os.path.join(out_dir, f"{site['id']}.terrain.png"), optimize=True)
    Image.fromarray(np.where(cover == 4, 255, 0).astype(np.uint8), "L").convert("1").save(
        os.path.join(out_dir, f"{site['id']}.water.png"), optimize=True)
    site["width"], site["height"] = width, height
    share = {n: round(float((cover == i).mean()) * 100, 1) for i, n in enumerate(["grass", "tree", "shrub", "bare", "water", "wet"])}
    print(site["id"], f"{width}x{height}", "elev", int(elev.min()), "-", int(elev.max()), "m", share)


def main():
    out_dir = os.path.join(HERE, "..", "src", "data", "battlefields")
    path = os.path.join(out_dir, "sites.json")
    sites = json.load(open(path, encoding="utf-8"))
    for site in sites:
        if len(sys.argv) < 2 or site["id"] in sys.argv[1:]:
            bake(site, out_dir)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sites, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
