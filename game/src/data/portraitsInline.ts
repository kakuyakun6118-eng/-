// 肖像の画像を、ページの中に埋め込む(1つのファイルだけで動く版のため)。
export default import.meta.glob("../../public/portraits/*.{webp,png,jpg,jpeg}", { eager: true, query: "?inline", import: "default" }) as Record<string, string>;
