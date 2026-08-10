# 写真の差し替え方

このフォルダに以下のファイル名でJPEG画像を置くと、アプリのイラストの代わりに
その写真が使われます。置かなければ内蔵イラストがそのまま表示されます。

| ファイル名 | 使われる場所 | 状態 |
| --- | --- | --- |
| `skyline.jpg` | ヘッダー、AI提案タブ、しおりのDAY 1 | ✅ 配置済み |
| `bridge.jpg` | しおりのDAY 2 | イラスト表示中 |
| `park.jpg` | しおりのDAY 3 | イラスト表示中 |
| `times-square.jpg` | しおりのDAY 4 | イラスト表示中 |
| `liberty.jpg` | しおりのDAY 5 | イラスト表示中 |
| `brownstone.jpg` | しおりのDAY 6 | イラスト表示中 |

残り5枚も置くと、しおり全体が写真で統一されます。

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
