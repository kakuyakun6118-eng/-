# 写真の差し替え方

このフォルダに以下のファイル名でJPEG画像を置くと、アプリのイラストの代わりに
その写真が使われます。置かなければ内蔵イラストがそのまま表示されます。

| ファイル名 | 使われる場所 | 状態 |
| --- | --- | --- |
| `skyline.jpg` | ヘッダー、AI提案タブ、しおりのDAY 1 | ✅ 配置済み |
| `bridge.jpg` | しおりのDAY 2 | ✅ 配置済み |
| `times-square.jpg` | しおりのDAY 3 | ✅ 配置済み |
| `liberty.jpg` | しおりのDAY 4 | ✅ 配置済み |
| `downtown.jpg` | しおりのDAY 5 | ✅ 配置済み |
| `stadium.jpg` | しおりのDAY 6 | ✅ 配置済み |
| `park.jpg` | しおりのDAY 7 | イラスト表示中 |
| `brownstone.jpg` | しおりのDAY 8以降 | イラスト表示中 |

今回の旅程(9/18〜9/24 = 7日間)では、DAY 7 だけがイラストです。
セントラルパークの写真を `park.jpg` として置くと全日程が写真になります。

## おすすめのサイズ

横1200px前後、縦横比はおおよそ 5:2(横長)。1枚300KB以下にしておくと
iPhoneでの表示が軽くなります。

## 無料で使える写真の入手先

商用・私的利用ともに無料で、クレジット表記も不要な素材サイトです。
「New York」「Brooklyn Bridge」などで検索してダウンロードしてください。

- Unsplash: https://unsplash.com/s/photos/new-york
- Pexels: https://www.pexels.com/search/new%20york/
- Wikimedia Commons(パブリックドメイン): https://commons.wikimedia.org/

旅行から帰ったあとに、ご自身で撮った写真に差し替えると
そのまま思い出のアルバムとしても使えます。

## 置いたあとの反映

ローカルで確認する場合は `npm run dev` を再起動してください。
公開版に反映する場合は、ファイルを追加して `main` ブランチにpushすると
GitHub Actionsが自動で再デプロイします。
