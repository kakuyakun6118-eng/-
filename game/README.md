# 五胡乱華 — 天下統一録

五胡十六国時代の中国から始まる、iPhone(Safari)向けの3D歴史シミュレーションゲームの試作品です。
TypeScript + Three.js + Vite で作っています。

## 動かし方

```bash
npm install
npm run dev      # 開発用。表示されたURLをブラウザで開く
npm run build    # dist/index.html に1ファイルで出力
```

## フォルダの見取り図

- `src/data/` … 地域・都市・勢力などのデータ(JSON)。ゲームの中身を足すときはここ
- `src/world/` … 地形と都市の3D表示(`city/` は城壁や建物のある3D都市の組み立て)
- `src/data/rules/` … 都市の規模ごとの決まりなど、ゲームのルール
- `src/sim/` … ゲームの進行の計算(日付、行軍、経路探索、食糧・疲労・士気、敵との接触)。3D表示とは分けてある
- `src/camera/`・`src/input/` … カメラと、マウス・タッチ操作
- `src/ui/` … 文字やパネルなどの画面表示
- `tools/bake_terrain.py` … 実物の標高データから地形ファイルを作るスクリプト。
  地図の範囲を変えるときだけ使う

## データの出典

- 標高: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data)。
  SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey.
  ETOPO1 terrain data: U.S. National Oceanic and Atmospheric Administration.
- 河川・湖: Made with [Natural Earth](https://www.naturalearthdata.com/) (パブリックドメイン)。
- 3D表示: [three.js](https://threejs.org/) (MIT License)。

同じ内容をゲーム内の「出典」ボタンにも表示しています。
