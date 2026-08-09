# NY旅のしおり

2026/9/18〜9/24 のニューヨーク旅行用、夫婦2人で共有できる旅のしおりアプリです。
Googleマップでピンを立てた「行きたい場所」を登録し、日程に割り振ってスケジュール化、
読みやすい「しおり」として2人のiPhoneでいつでも見られるようにします。

## できること

- 📍 **行きたい場所**: 場所名・カテゴリ・優先度・エリア・GoogleマップのURL・メモを登録
- 🗓️ **スケジュール**: 日付ごとに時刻・所要時間・メモを付けて予定を組む
- 📖 **しおり**: 宿泊先情報つきで、日別にきれいな一覧表示。共有ボタンでLINE/iMessageに送れる
- ⚙️ **設定**: 出発日・帰国日・宿泊先情報を編集
- 📱 iPhoneのホーム画面に追加してアプリのように使える(PWA)
- 🔄 Firebaseを設定すると、夫婦のiPhone2台でリアルタイムに同じデータを共有できる

Firebase未設定の状態でもアプリ自体はすぐ使えます(その場合は自分の端末だけに保存されます)。

## ローカルで動かす

```bash
npm install
npm run dev
```

`http://localhost:5173` を開いて動作確認できます。

## 2人で共有するためのFirebase設定(所要5〜10分)

共有機能には無料のFirebaseプロジェクトが必要です。どちらか一方(母艦)が1回だけ作業すればOKです。

1. https://console.firebase.google.com/ にアクセスし、Googleアカウントでログイン
2. 「プロジェクトを作成」→ 適当な名前(例: `ny-trip`)を入力 → Google Analyticsは無効でOK
3. 左メニュー「構築」→「Firestore Database」→「データベースの作成」
   - ロケーションは `nam5` (us-central) など任意
   - セキュリティルールは「本番環境モード」でOK(あとで上書きします)
4. 「ルール」タブを開き、このリポジトリの `firestore.rules` の内容を貼り付けて公開
5. 左メニュー「構築」→「Authentication」→「始める」→「Sign-in method」タブで
   **「匿名」を有効化**(ログイン画面なしで2人がすぐ使えるようにするためのものです)
6. 左メニューの歯車 →「プロジェクトの設定」→ 下の方の「マイアプリ」→ `</>`(ウェブ)を選択して
   アプリを登録すると `firebaseConfig` が表示されます。これをメモしておきます

### ローカルで試す場合

`.env.example` を `.env.local` にコピーし、`firebaseConfig` の値を転記して `npm run dev` を再起動。

### 公開版(GitHub Pages)に設定する場合

このリポジトリの GitHub の Settings で設定します。

1. **Settings → Secrets and variables → Actions → Secrets** に以下を1つずつ追加
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
2. (任意) **Secrets and variables → Actions → Variables** に `VITE_TRIP_ID` を追加(未設定なら `ny-2026-09` が使われます)
3. **Settings → Pages** で Source を **「GitHub Actions」** に変更
4. `main` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルド・公開します
   (このブランチの変更を取り込む場合は、一度 `main` にマージしてください)
5. 数分後、`https://<あなたのGitHubユーザー名>.github.io/-/` でアクセスできるようになります

Secretsを設定していない状態でもデプロイ自体は成功しますが、その場合は各端末のローカル保存のみ
(2台で共有されません)。あとから設定してもう一度pushすれば共有が有効になります。

## iPhoneのホーム画面に追加する

1. SafariでアプリのURLを開く
2. 共有ボタン(□に↑)をタップ
3. 「ホーム画面に追加」を選択

夫婦それぞれの iPhone で行うと、アプリのようにアイコンから起動できます。

## データの持たせ方について(補足)

- 共有は「匿名認証 + Firestoreルール」による簡易的なものです。URLとプロジェクトの組み合わせが
  第三者に知られない限りは夫婦2人だけのデータですが、パスワード等はありません。旅行のしおり用途
  としては十分な想定ですが、機密情報の保存には向きません。
- Googleマップの「保存済みリスト」を直接読み込む公式APIはないため、ピンを立てた場所は
  アプリ内で手動登録する方式にしています(名前・メモ・GoogleマップのURLをコピペするだけでOK)。

## 技術構成

- React + TypeScript + Vite
- Firebase Firestore(データ同期)/ Firebase Authentication(匿名認証)
- vite-plugin-pwa(ホーム画面追加・オフラインキャッシュ)
- GitHub Actions → GitHub Pages(自動デプロイ)
