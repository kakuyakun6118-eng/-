import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// ゲーム全体を1つのHTMLファイルにまとめて出力する。
// どこに置いても(GitHub Pages・プレビューページなど)そのまま動く。
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { chunkSizeWarningLimit: 2000 },
});
