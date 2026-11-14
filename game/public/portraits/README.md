# 肖像画像の置き場所

- ファイル名は `人物ID.webp`(例:`shi_le.webp`)。png・jpg でも読み込みます。大きさは 512×512、胸像。
- 同じ人物は、どのシナリオでも同じIDです(例:劉淵は 300年でも 304年でも `liu_yuan`)。
- 年齢で絵を変えたいときは、`人物ID@年.webp` を足します(例:`fu_jian@357.webp` と `fu_jian@383.webp`)。
  シナリオの開始年以前で、いちばん新しい年の絵が使われます。年のない `人物ID.webp` は、どの年代でも使える基本の絵です。
- 置いたあと `npm run build`(または `node tools/portraits.cjs`)を実行すると、一覧(src/data/portraits.manifest.json)が作り直され、画面に出ます。
- 画像が無い人物は、仮のシルエットになります。
- 人物IDの一覧は `src/data/scenarios/s317.persons.json` と `persons.extra.json` の `id`。
- この時代の人物には同時代の肖像が残っていないため、画面では「創作肖像」と表示します。
