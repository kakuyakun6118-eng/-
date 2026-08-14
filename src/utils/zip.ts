/**
 * Pulls importable text files out of a Google Takeout .zip.
 *
 * Takeout hands you a zip, and unzipping it on an iPhone means digging through
 * nested folders in the Files app. Reading the archive directly removes that
 * whole step — the user picks the download exactly as it arrived.
 */

export interface ExtractedFile {
  name: string;
  text: string;
}

/** True when the bytes start with the ZIP local-file-header magic ("PK\x03\x04"). */
export async function isZip(file: File): Promise<boolean> {
  if (/\.zip$/i.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

const IMPORTABLE = /\.(csv|json)$/i;

/**
 * Files Takeout always includes that never contain places. Skipping them keeps
 * the review list clean and avoids pointless parsing.
 */
const SKIP = /(archive_browser|アーカイブ|README|Recently Viewed|Reviews|Labelled places|Requests)/i;

/**
 * Zip entry names come back as raw bytes widened to characters, so Japanese
 * folder names ("保存済み") arrive mojibake'd. Re-interpreting those bytes as
 * UTF-8 restores them; names that are already proper Unicode are left alone.
 */
function decodeEntryName(name: string): string {
  if (/[^\x00-\xff]/.test(name)) return name;
  try {
    const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return name;
  }
}

/** Extracts every .csv/.json entry from a zip, decoded as UTF-8. */
export async function extractFromZip(file: File): Promise<ExtractedFile[]> {
  const { unzip } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());

  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      buf,
      {
        // Only inflate what we can actually read; Takeout archives can also
        // carry photos and other bulk we have no use for.
        filter: (f) => {
          const name = decodeEntryName(f.name);
          return IMPORTABLE.test(name) && !SKIP.test(name);
        },
      },
      (err, data) => (err ? reject(err) : resolve(data)),
    );
  });

  const decoder = new TextDecoder("utf-8");
  return Object.entries(entries)
    .filter(([, bytes]) => bytes.length > 0)
    .map(([name, bytes]) => {
      const readable = decodeEntryName(name);
      return {
        name: readable.split("/").pop() || readable,
        text: decoder.decode(bytes),
      };
    });
}

/**
 * Normalises any picked file into text blobs ready for parsing: zips are
 * expanded, everything else is read as-is.
 */
export async function readImportableFiles(file: File): Promise<ExtractedFile[]> {
  if (await isZip(file)) return extractFromZip(file);
  return [{ name: file.name, text: await file.text() }];
}
