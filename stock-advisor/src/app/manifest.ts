import type { MetadataRoute } from "next";

/**
 * Lets iOS "ホーム画面に追加" install this as a standalone app: launched from
 * the home screen it opens without Safari's address bar and gets its own icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "株価インパクト・アドバイザー",
    short_name: "株アドバイザー",
    description: "ニュースと相場データから今日のおすすめ銘柄と保有株の売り時を提案する個人用ツール",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
