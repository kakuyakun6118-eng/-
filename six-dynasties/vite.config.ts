import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/ui',
  /*
   * 資産を相対パスで参照する。GitHub Pages のような
   * ドメイン直下でない場所に置いても届くようにするため
   */
  base: './',
  /*
   * 資産は `six-dynasties/public/` に置く。`root` を `src/ui` にしてあるので、
   * 既定のままだと `src/ui/public/` を見に行き、顔の画像が配られなかった
   */
  publicDir: '../../public',
  build: { outDir: '../../dist', emptyOutDir: true },
});
