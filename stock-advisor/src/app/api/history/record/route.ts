import { NextResponse } from "next/server";
import { recordToday } from "@/lib/historyService";

export const dynamic = "force-dynamic";

/**
 * Capture today's mention counts and judgments. Idempotent — running it more
 * than once a day replaces that day's entry rather than double-counting.
 *
 * Point a daily cron at this (see README) so rule 1's baseline keeps growing.
 */
export async function POST() {
  try {
    return NextResponse.json(await recordToday());
  } catch (err) {
    console.error("[history] recording failed", err);
    return NextResponse.json({ error: "記録に失敗しました" }, { status: 500 });
  }
}
