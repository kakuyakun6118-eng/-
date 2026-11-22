# 写実寄りの頭を作る道具(Version 54)

- `build_heads.py`:MakeHuman(CC0)の基本の人体・変形の素・表情の単位・眼球と、MPFB2(CC0)の唇とまぶたの目印の絵から、`src/assets/heads.glb` を作ります。
  - 取り出し方:`git clone --depth 1 https://github.com/makehumancommunity/makehuman.git` と `git clone --depth 1 https://github.com/makehumancommunity/mpfb2.git` を同じフォルダに置きます。
  - 実行:`TEX=2048 python3 build_heads.py <makehuman/makehuman/data> ../../src/assets/heads.glb`
  - 必要なもの:Python 3・numpy・Pillow(Blender は使いません)
- `mh.py`:MakeHuman の obj・target・mhclo を読む小さな道具。
- `shoot_proto.cjs`:試作3人の比較画像を撮るためのもの(ソフトウェア描画)。

素材のライセンス:MakeHuman の素材(基本の人体・変形の素・表情・眼球の絵)と MPFB2 の素材は CC0 1.0 です。
肌の色・眉・まつげ・髪の絵と、まつげ・髪・結い髪・髪飾りの形は、この道具とゲームのコードで作ったものです。
