import { promises as fs } from "fs";
import path from "path";

/**
 * Remembers which alerts have already gone out, so an hourly cron doesn't
 * resend the same warning every hour. A condition that still holds tomorrow
 * is worth repeating once, hence a cooldown rather than a permanent record.
 */

const STORE_FILE = path.join(process.cwd(), "data", "history", "notified.json");

export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** dedupeKey → epoch millis of the last send */
export type NotifyLog = Record<string, number>;

export async function loadNotifyLog(): Promise<NotifyLog> {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, "utf-8")) as NotifyLog;
  } catch {
    return {};
  }
}

export async function saveNotifyLog(log: NotifyLog): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(log, null, 2) + "\n", "utf-8");
}

export function isOnCooldown(log: NotifyLog, key: string, now: number, cooldownMs = COOLDOWN_MS): boolean {
  const last = log[key];
  return last !== undefined && now - last < cooldownMs;
}

/** Record the sends and drop entries whose cooldown has long expired. */
export function recordSends(log: NotifyLog, keys: string[], now: number, cooldownMs = COOLDOWN_MS): NotifyLog {
  const next: NotifyLog = {};
  for (const [key, ts] of Object.entries(log)) {
    if (now - ts < cooldownMs * 2) next[key] = ts;
  }
  for (const key of keys) next[key] = now;
  return next;
}
