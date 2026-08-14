import { Category } from "../types";

export interface ImportedPlace {
  name: string;
  mapsUrl?: string;
  note?: string;
  area?: string;
}

/** Minimal RFC4180-ish CSV reader: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const NAME_KEYS = ["title", "name", "名前", "タイトル", "場所"];
const URL_KEYS = ["url", "link", "リンク", "google maps url"];
const NOTE_KEYS = ["note", "comment", "description", "メモ", "コメント", "説明"];

function findColumn(header: string[], keys: string[]): number {
  return header.findIndex((h) => {
    const norm = h.trim().toLowerCase();
    return keys.some((k) => norm === k || norm.includes(k));
  });
}

/**
 * Reads a Google Takeout "保存済みの場所" CSV (Title,Note,URL) — and, more
 * loosely, any CSV that has a name-ish column.
 */
export function parsePlacesCsv(text: string): ImportedPlace[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0];
  let nameIdx = findColumn(header, NAME_KEYS);
  const urlIdx = findColumn(header, URL_KEYS);
  const noteIdx = findColumn(header, NOTE_KEYS);

  // No recognisable header: treat the first column as names.
  const hasHeader = nameIdx >= 0 || urlIdx >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  if (nameIdx < 0) nameIdx = 0;

  const out: ImportedPlace[] = [];
  for (const row of body) {
    const name = (row[nameIdx] ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      mapsUrl: urlIdx >= 0 ? (row[urlIdx] ?? "").trim() || undefined : undefined,
      note: noteIdx >= 0 ? (row[noteIdx] ?? "").trim() || undefined : undefined,
    });
  }
  return out;
}

/**
 * Reads a pasted list. Each line is one place; a Google Maps URL on the line
 * (or on its own after the name) is picked up automatically.
 */
export function parsePastedList(text: string): ImportedPlace[] {
  const out: ImportedPlace[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const urlMatch = line.match(/https?:\/\/\S+/);
    const url = urlMatch?.[0];
    let name = url ? line.replace(url, "").trim() : line;
    // Strip list bullets and numbering people paste in from notes apps.
    name = name.replace(/^[-*・•\d]+[.)\s]*/, "").replace(/[,\t|]+$/, "").trim();

    if (!name && url) {
      const fromUrl = placeNameFromMapsUrl(url);
      if (fromUrl) name = fromUrl;
    }
    if (!name) continue;

    out.push({ name, mapsUrl: url });
  }
  return out;
}

/**
 * Recovers a place name from a full Google Maps URL
 * (`.../maps/place/MoMA/@40.7,...`). Short `maps.app.goo.gl` links do not
 * contain the name, so those return undefined.
 */
export function placeNameFromMapsUrl(url: string): string | undefined {
  const m = url.match(/\/maps\/place\/([^/@?]+)/);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || undefined;
  } catch {
    return m[1].replace(/\+/g, " ").trim() || undefined;
  }
}

const CATEGORY_HINTS: [Category, string[]][] = [
  ["restaurant", ["レストラン", "食堂", "カフェ", "cafe", "coffee", "restaurant", "bar", "grill", "pizza", "deli", "bakery", "ステーキ", "寿司", "ラーメン", "ダイナー"]],
  ["museum", ["美術館", "博物館", "museum", "gallery", "ギャラリー", "ミュージアム", "moma", "met "]],
  // Katakana spellings matter: 「セントラルパーク」 contains neither "park" nor 「公園」.
  ["park", ["公園", "park", "パーク", "garden", "庭園", "high line", "ハイライン", "ガーデン"]],
  ["shopping", ["店", "ショップ", "shop", "store", "market", "mall", "マーケット", "モール", "百貨店"]],
  ["sightseeing", ["展望", "タワー", "tower", "bridge", "橋", "observatory", "memorial", "statue", "square", "スクエア", "スタジアム", "stadium"]],
];

/** Best-effort category from the place name, so imports need less editing. */
export function guessCategory(name: string): Category {
  const lower = name.toLowerCase();
  for (const [category, words] of CATEGORY_HINTS) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return category;
  }
  return "sightseeing";
}
