import { promises as fs } from "fs";
import path from "path";

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

export async function writeList<T>(file: string, items: T[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(items, null, 2) + "\n", "utf-8");
}
