import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// ゲーム全体を1つのHTMLファイルにまとめて出力する。
// どこに置いても(GitHub Pages・プレビューページなど)そのまま動く。
// PORTRAITS=external のときは、肖像を埋め込まず、dist-publish/portraits/ に別のファイルとして置く
// (公開ページの大きさの上限 16MB を超えないようにするため)。
const external = process.env.PORTRAITS === "external";
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  resolve: external
    ? {
        alias: [
          { find: /^\.\/portraitsInline$/, replacement: fileURLToPath(new URL("./src/data/portraitsExternal.ts", import.meta.url)) },
          // 地形の絵も、公開版では別のファイル(terrain.png)として置く(ページの大きさの上限のため)
          { find: /^\.\/regions\/north-china\/terrain\.png$/, replacement: fileURLToPath(new URL("./src/data/terrainExternal.ts", import.meta.url)) },
        ],
      }
    : undefined,
  build: { chunkSizeWarningLimit: 2000, outDir: external ? "dist-publish" : "dist" },
});
