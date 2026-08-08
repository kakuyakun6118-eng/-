import { promises as fs } from "fs";
import path from "path";
import { withLock } from "./async";

/** Shared read/write for the JSON list files under `data/`. */

export function dataFile(name: string): string {
  return path.join(process.cwd(), "data", name);
}

export async function readList<T>(file: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf-8"));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function write<T>(file: string, items: T[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a temp file and rename, so a crash mid-write can't truncate the
  // existing list. Rename is atomic within a filesystem.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, file);
}

export async function writeList<T>(file: string, items: T[]): Promise<void> {
  return withLock(`file:${file}`, () => write(file, items));
}

/**
 * Read, transform and write back under one lock.
 *
 * Every mutation goes through this — doing the read and the write as separate
 * locked steps would still let two callers interleave and lose an entry.
 */
export function updateList<T, R>(file: string, mutate: (items: T[]) => { items: T[]; result: R }): Promise<R> {
  return withLock(`file:${file}`, async () => {
    const current = await readList<T>(file);
    const { items, result } = mutate(current);
    await write(file, items);
    return result;
  });
}
