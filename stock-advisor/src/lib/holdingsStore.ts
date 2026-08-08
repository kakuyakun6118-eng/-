import { randomUUID } from "crypto";
import { dataFile, readList, updateList } from "./jsonStore";
import type { Holding } from "./types";

const HOLDINGS_FILE = dataFile("holdings.json");

export async function listHoldings(): Promise<Holding[]> {
  return readList<Holding>(HOLDINGS_FILE);
}

export async function addHolding(input: Omit<Holding, "id">): Promise<Holding> {
  const holding: Holding = { id: randomUUID(), ...input };
  return updateList<Holding, Holding>(HOLDINGS_FILE, (holdings) => ({
    items: [...holdings, holding],
    result: holding,
  }));
}

export async function updateHolding(id: string, input: Partial<Omit<Holding, "id">>): Promise<Holding | null> {
  return updateList<Holding, Holding | null>(HOLDINGS_FILE, (holdings) => {
    const idx = holdings.findIndex((h) => h.id === id);
    if (idx === -1) return { items: holdings, result: null };
    const updated = { ...holdings[idx], ...input };
    const items = [...holdings];
    items[idx] = updated;
    return { items, result: updated };
  });
}

export async function deleteHolding(id: string): Promise<boolean> {
  return updateList<Holding, boolean>(HOLDINGS_FILE, (holdings) => {
    const items = holdings.filter((h) => h.id !== id);
    return { items, result: items.length !== holdings.length };
  });
}
