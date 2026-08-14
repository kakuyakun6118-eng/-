/**
 * Reads a place name out of a Google Maps screenshot.
 *
 * Google Maps puts the place name in the largest text on the card, so the
 * heuristic is: OCR the image, group words into lines, and pick the line with
 * the tallest characters near the top of the image. It is a guess, not a
 * parse — every result is shown to the user for review before saving.
 */

export interface OcrResult {
  /** Best guess at the place name. Empty when nothing readable was found. */
  name: string;
  /** Other lines, offered as alternatives when the guess is wrong. */
  alternatives: string[];
  /** Full recognised text, used to guess area/category. */
  fullText: string;
}

interface Line {
  text: string;
  height: number;
  top: number;
}

/** Chrome/Safari UI and Maps chrome that is never the place name. */
const NOISE = [
  /^[\d.,\s]+$/,
  /^[★☆*]+$/,
  /保存|共有|経路|ルート|近くを検索|ウェブサイト|レビュー|写真|営業中|営業時間|閉店|口コミ|件\)?$/,
  /^(save|share|directions|call|website|reviews?|photos?|open|closed|now)$/i,
  /^https?:/i,
  /^\d{1,2}:\d{2}/,
  /^[◀▶●○◦・:;、。\-–—_|]+$/,
];

function isNoise(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return true;
  return NOISE.some((re) => re.test(t));
}

function cleanup(text: string): string {
  return text
    .replace(/\s+/g, " ")
    // OCR frequently leaves stray punctuation on the ends of a line.
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})\]]+$/gu, "")
    .trim();
}

/**
 * Runs OCR on one image. `tesseract.js` is imported lazily so the ~1MB worker
 * is only fetched when the user actually opens the screenshot importer.
 */
export async function readPlaceFromImage(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["jpn", "eng"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });

  try {
    const { data } = await worker.recognize(file);
    const lines: Line[] = [];

    // tesseract.js v7 exposes geometry through blocks → paragraphs → lines.
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          const text = cleanup(line.text ?? "");
          if (!text || isNoise(text)) continue;
          const box = line.bbox;
          lines.push({
            text,
            height: box ? box.y1 - box.y0 : 0,
            top: box ? box.y0 : 0,
          });
        }
      }
    }

    // Fall back to plain line splitting if geometry is unavailable.
    if (lines.length === 0) {
      const plain = (data.text ?? "")
        .split("\n")
        .map(cleanup)
        .filter((t) => t && !isNoise(t));
      return {
        name: plain[0] ?? "",
        alternatives: plain.slice(1, 8),
        fullText: data.text ?? "",
      };
    }

    // Biggest text wins; ties break toward whatever sits higher on screen.
    const ranked = [...lines].sort((a, b) => b.height - a.height || a.top - b.top);
    const best = ranked[0];

    return {
      name: best.text,
      alternatives: ranked
        .slice(1)
        .map((l) => l.text)
        .filter((t) => t !== best.text)
        .slice(0, 7),
      fullText: data.text ?? "",
    };
  } finally {
    await worker.terminate();
  }
}

const AREA_HINTS = [
  "Midtown", "Downtown", "Upper East Side", "Upper West Side", "Chelsea", "SoHo",
  "Brooklyn", "Harlem", "Queens", "Tribeca", "Williamsburg", "Lower East Side",
  "Greenwich Village", "East Village", "West Village", "Manhattan",
];

/** Pulls an area name out of the OCR text when one is recognisable. */
export function guessArea(fullText: string): string | undefined {
  const found = AREA_HINTS.find((a) => fullText.toLowerCase().includes(a.toLowerCase()));
  return found;
}
