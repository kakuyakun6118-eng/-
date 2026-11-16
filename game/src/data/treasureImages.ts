// 名品の絵(public/treasures/<名品ID>.webp)。数が少なく軽いので、公開版でもページに埋め込む。
const files = import.meta.glob("../../public/treasures/*.webp", { eager: true, query: "?inline", import: "default" }) as Record<string, string>;
const byId = new Map<string, string>();
for (const [path, url] of Object.entries(files)) byId.set(path.slice(path.lastIndexOf("/") + 1, -5), url);
/** その名品の絵(無ければ undefined) */
export function treasureImageOf(id: string): string | undefined {
  return byId.get(id);
}
