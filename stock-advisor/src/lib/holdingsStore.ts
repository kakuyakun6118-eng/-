import { randomUUID } from "crypto";
import { dataFile, readList, writeList } from "./jsonStore";
import type { Holding } from "./types";

const HOLDINGS_FILE = dataFile("holdings.json");

export async function listHoldings(): Promise<Holding[]> {
  return readList<Holding>(HOLDINGS_FILE);
}

export async function addHolding(input: Omit<Holding, "id">): Promise<Holding> {
  const holdings = await listHoldings();
  const holding: Holding = { id: randomUUID(), ...input };
  await writeList(HOLDINGS_FILE, [...holdings, holding]);
  return holding;
}

export async function updateHolding(id: string, input: Partial<Omit<Holding, "id">>): Promise<Holding | null> {
  const holdings = await listHoldings();
  const idx = holdings.findIndex((h) => h.id === id);
  if (idx === -1) return null;
  holdings[idx] = { ...holdings[idx], ...input };
  await writeList(HOLDINGS_FILE, holdings);
  return holdings[idx];
}

export async function deleteHolding(id: string): Promise<boolean> {
  const holdings = await listHoldings();
  const next = holdings.filter((h) => h.id !== id);
  if (next.length === holdings.length) return false;
  await writeList(HOLDINGS_FILE, next);
  return true;
}
