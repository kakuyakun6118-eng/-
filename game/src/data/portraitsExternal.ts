// 公開用の版:肖像の多くは埋め込まず、ページと同じ場所の portraits/<ファイル名> から読む。
// ただし公開ページに置けるファイルの数に上限(1版あたり約500)があるため、
// 名前が a〜k で始まる肖像だけは、ページの中に埋め込む(ページの大きさは上限16MBに収まる)。
export default import.meta.glob("../../public/portraits/[a-k]*.{webp,png,jpg,jpeg}", { eager: true, query: "?inline", import: "default" }) as Record<string, string>;
