# 写真の差し替え方

このフォルダに以下のファイル名でJPEG画像を置くと、アプリのイラストの代わりに
その写真が使われます。置かなければ内蔵イラストがそのまま表示されます。

| ファイル名 | 使われる場所 |
| --- | --- |
| `skyline.jpg` | アプリ上部のヘッダー、AI提案タブ |
| `bridge.jpg` | しおりの日別バナー |
| `park.jpg` | しおりの日別バナー |
| `times-square.jpg` | しおりの日別バナー |
| `liberty.jpg` | しおりの日別バナー |
| `brownstone.jpg` | しおりの日別バナー |

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
