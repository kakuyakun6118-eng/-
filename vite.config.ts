import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-180.png"],
      manifest: {
        name: "NY旅のしおり",
        short_name: "NY旅のしおり",
        description: "2人で共有するニューヨーク旅行のスケジュール&しおり",
        start_url: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2b6cb0",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // jpg is included so photos dropped into public/photos work offline.
        globPatterns: ["**/*.{js,css,html,png,jpg,svg,ico}"],
      },
    }),
  ],
});
