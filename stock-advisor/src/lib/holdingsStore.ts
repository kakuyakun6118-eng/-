import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Holding } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const HOLDINGS_FILE = path.join(DATA_DIR, "holdings.json");

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(HOLDINGS_FILE);
  } catch {
    await fs.writeFile(HOLDINGS_FILE, "[]\n", "utf-8");
  }
}

export async function listHoldings(): Promise<Holding[]> {
  await ensureFile();
  const raw = await fs.readFile(HOLDINGS_FILE, "utf-8");
  return JSON.parse(raw) as Holding[];
}

async function saveHoldings(holdings: Holding[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(HOLDINGS_FILE, JSON.stringify(holdings, null, 2) + "\n", "utf-8");
}

export async function addHolding(input: Omit<Holding, "id">): Promise<Holding> {
  const holdings = await listHoldings();
  const holding: Holding = { id: randomUUID(), ...input };
  holdings.push(holding);
  await saveHoldings(holdings);
  return holding;
}

export async function updateHolding(id: string, input: Partial<Omit<Holding, "id">>): Promise<Holding | null> {
  const holdings = await listHoldings();
  const idx = holdings.findIndex((h) => h.id === id);
  if (idx === -1) return null;
  holdings[idx] = { ...holdings[idx], ...input };
  await saveHoldings(holdings);
  return holdings[idx];
}

export async function deleteHolding(id: string): Promise<boolean> {
  const holdings = await listHoldings();
  const next = holdings.filter((h) => h.id !== id);
  if (next.length === holdings.length) return false;
  await saveHoldings(next);
  return true;
}
