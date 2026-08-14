import { Category } from "../types";

export interface ImportedPlace {
  name: string;
  mapsUrl?: string;
  note?: string;
  area?: string;
  /** Google had no name for this pin; the user needs to supply one. */
  unnamed?: boolean;
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
 * Reads Google Takeout's JSON export of saved places.
 *
 * Takeout hands out different shapes depending on which product you tick:
 * "保存済み" gives a CSV per list, while "マップ(自分の場所)" gives a GeoJSON
 * FeatureCollection. Both are accepted so the user does not have to know which
 * one they downloaded.
 */
export function parsePlacesJson(text: string): ImportedPlace[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }

  const out: ImportedPlace[] = [];

  const pushFrom = (entry: Record<string, unknown>) => {
    const props = (entry.properties ?? entry) as Record<string, unknown>;
    const location = (props.location ?? {}) as Record<string, unknown>;

    const name =
      (typeof location.name === "string" && location.name) ||
      (typeof props.name === "string" && props.name) ||
      (typeof props.title === "string" && props.title) ||
      (typeof entry.title === "string" && entry.title) ||
      "";

    const url =
      (typeof props.google_maps_url === "string" && props.google_maps_url) ||
      (typeof props.url === "string" && props.url) ||
      undefined;
    const address =
      (typeof location.address === "string" && location.address) || undefined;

    if (!name.trim()) {
      if (!url) return;
      // The pin has no business attached, but its link usually still says what
      // was pinned. Recover that rather than dropping the entry silently.
      const fromQuery = placeFromMapsQuery(url);
      if (fromQuery.name) {
        out.push({ name: fromQuery.name, mapsUrl: url, area: fromQuery.area });
        return;
      }
      const coords = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      out.push({
        name: coords ? `名称なしのピン (${coords[1]}, ${coords[2]})` : "名称なしのピン",
        mapsUrl: url,
        note: "Googleマップ側に名前がないピンです。マップで確認して名前を付けてください",
        unnamed: true,
      });
      return;
    }

    out.push({
      name: name.trim(),
      mapsUrl: url,
      note: address,
      area: address ? areaFromAddress(address) : undefined,
    });
  };

  const root = data as Record<string, unknown>;
  const features = root?.features;
  if (Array.isArray(features)) {
    features.forEach((f) => pushFrom(f as Record<string, unknown>));
  } else if (Array.isArray(data)) {
    data.forEach((f) => pushFrom(f as Record<string, unknown>));
  }

  return out;
}

const KNOWN_AREAS = [
  "Midtown", "Upper East Side", "Upper West Side", "Chelsea", "SoHo", "Tribeca",
  "Brooklyn", "Harlem", "Queens", "Williamsburg", "Lower East Side",
  "Greenwich Village", "East Village", "West Village", "Manhattan",
];

/**
 * Loose key for spotting the same place twice. Takeout's two exports overlap,
 * so an import of both products would otherwise register everything twice.
 * Case, width, spacing and punctuation are all ignored.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s'’"“”.,!?・･\-–—_/()[\]{}]/g, "");
}

/** Picks the right parser by looking at the file contents, not its name. */
export function parseImportFile(text: string): ImportedPlace[] {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const fromJson = parsePlacesJson(text);
    if (fromJson.length > 0) return fromJson;
  }
  return parsePlacesCsv(text);
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
  [
    "restaurant",
    [
      "レストラン", "食堂", "カフェ", "cafe", "coffee", "restaurant", "bar", "grill",
      "pizza", "ピザ", "deli", "デリカテッセン", "デリ", "bakery", "ベーカリー", "パン",
      "bagel", "ベーグル", "brewery", "ブルワリー", "gelato", "ジェラート", "アイス",
      "tavern", "タヴァーン", "タバーン", "ダイナー", "diner", "ステーキ", "steak",
      "寿司", "sushi", "ラーメン", "ramen", "kitchen", "eatery", "bistro", "ビストロ",
      "brasserie", "食堂", "居酒屋", "スターバックス", "starbucks", "boil",
    ],
  ],
  // No bare "met": matching ignores spacing, so it would swallow "Meta Lab".
  ["museum", ["美術館", "博物館", "museum", "gallery", "ギャラリー", "ミュージアム", "moma", "metropolitan", "メトロポリタン"]],
  // Katakana spellings matter: 「セントラルパーク」 contains neither "park" nor 「公園」.
  ["park", ["公園", "park", "パーク", "garden", "庭園", "high line", "ハイライン", "ガーデン"]],
  [
    "shopping",
    [
      "ショップ", "shop", "store", "ストア", "ストアーズ", "market", "マーケット",
      "ショッピングモール", "百貨店", "boutique", "ブティック", "outlet",
      "ティファニー", "tiffany", "シュプリーム", "supreme", "kith", "glossier",
      "百貨", "免税",
    ],
  ],
  [
    "sightseeing",
    ["展望", "タワー", "tower", "bridge", "橋", "observatory", "memorial", "statue", "square", "スクエア", "スタジアム", "stadium"],
  ],
];

/**
 * Interpuncts and spacing vary between Google Maps entries
 * (「ザ・ハイ・ライン」 vs 「ハイライン」), so matching ignores them.
 */
function forMatching(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[\s・･·、,.'’"“”\-–—_]/g, "");
}

/** Best-effort category from the place name, so imports need less editing. */
export function guessCategory(name: string): Category {
  const haystack = forMatching(name);
  for (const [category, words] of CATEGORY_HINTS) {
    if (words.some((w) => haystack.includes(forMatching(w)))) return category;
  }
  return "sightseeing";
}

/**
 * NYC postcodes mapped to the neighbourhoods the planner clusters by. Google
 * writes many saved places with only a street address, so the postcode is
 * often the only thing saying which part of the city a place is in. Exact
 * lookup rather than ranges — overlapping ranges silently mislabel whole
 * neighbourhoods.
 */
const ZIP_AREAS: Record<string, string> = {
  "10001": "Midtown", "10010": "Midtown", "10016": "Midtown", "10017": "Midtown",
  "10018": "Midtown", "10019": "Midtown", "10020": "Midtown", "10022": "Midtown",
  "10036": "Midtown", "10110": "Midtown", "10111": "Midtown", "10112": "Midtown",
  "10118": "Midtown", "10119": "Midtown", "10165": "Midtown", "10173": "Midtown",
  "10011": "Chelsea",
  "10012": "SoHo", "10013": "SoHo",
  "10014": "Greenwich Village",
  "10003": "East Village", "10009": "East Village",
  "10002": "Lower East Side",
  "10004": "Downtown", "10005": "Downtown", "10006": "Downtown",
  "10007": "Downtown", "10038": "Downtown", "10280": "Downtown", "10282": "Downtown",
  "10021": "Upper East Side", "10028": "Upper East Side",
  "10065": "Upper East Side", "10075": "Upper East Side", "10128": "Upper East Side",
  "10023": "Upper West Side", "10024": "Upper West Side", "10025": "Upper West Side",
  "10026": "Harlem", "10027": "Harlem", "10029": "Harlem", "10030": "Harlem",
  "10031": "Harlem", "10035": "Harlem", "10037": "Harlem", "10039": "Harlem",
};

/** Area from an address line, using neighbourhood names or the postcode. */
export function areaFromAddress(address: string): string | undefined {
  const lower = address.toLowerCase();
  const named = KNOWN_AREAS.find((a) => lower.includes(a.toLowerCase()));
  if (named) return named;

  const jp = JP_AREA_ALIASES.find(([alias]) => address.includes(alias));
  if (jp) return jp[1];

  const zip = address.match(/\b(\d{5})\b/)?.[1];
  if (!zip) return undefined;
  if (ZIP_AREAS[zip]) return ZIP_AREAS[zip];
  if (/^112\d\d$/.test(zip)) return "Brooklyn";
  if (/^104\d\d$/.test(zip)) return "Bronx";
  if (/^11[13]\d\d$/.test(zip)) return "Queens";
  return undefined;
}

/** Tokens in a Maps `q=` value that describe the country/region, not a place. */
const ADDRESS_NOISE = /^(アメリカ合衆国|USA|United States|〒?\d{5}(-\d{4})?|.+州|.+区|NY|New York)$/;

/**
 * Recovers a place name from a Google Maps `?q=` link.
 *
 * Saved pins without an attached business still carry a query describing what
 * was pinned — "Staten Island Ferry", or a Japanese address ending in the
 * neighbourhood name. Reading it turns an anonymous pin back into a real entry.
 */
export function placeFromMapsQuery(url: string): { name?: string; area?: string } {
  const raw = url.match(/[?&]q=([^&]+)/)?.[1];
  if (!raw) return {};

  let q: string;
  try {
    q = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
  } catch {
    return {};
  }
  if (!q || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) return {};

  const area = areaFromAddress(q);

  // "Staten Island Ferry, アメリカ合衆国" — the first comma part is the place.
  for (const part of q.split(",").map((s) => s.trim())) {
    if (part && !ADDRESS_NOISE.test(part)) {
      // A Japanese address has no commas, so the place sits at the end.
      const tokens = part.split(/\s+/).filter((t) => t && !ADDRESS_NOISE.test(t));
      if (tokens.length === 0) continue;
      const name = part.startsWith("アメリカ合衆国") ? tokens[tokens.length - 1] : part;
      return { name, area };
    }
  }
  return { area };
}

/** Japanese-language addresses spell the boroughs out in katakana. */
const JP_AREA_ALIASES: [string, string][] = [
  ["ブルックリン", "Brooklyn"],
  ["マンハッタン", "Manhattan"],
  ["ブロンクス", "Bronx"],
  ["クイーンズ", "Queens"],
  ["ハーレム", "Harlem"],
  ["ミッドタウン", "Midtown"],
  ["チェルシー", "Chelsea"],
  ["ソーホー", "SoHo"],
];
