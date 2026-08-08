import { NextRequest, NextResponse } from "next/server";
import { runNotify } from "@/lib/notifyService";

export const dynamic = "force-dynamic";

/**
 * Evaluate alerts and push them to the configured channels.
 * Point a cron at this (see README). `?dryRun=1` reports what would be sent
 * without delivering anything or starting a cooldown.
 */
export async function POST(req: NextRequest) {
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    return NextResponse.json(await runNotify(dryRun));
  } catch (err) {
    console.error("[notify] run failed", err);
    return NextResponse.json({ error: "通知処理に失敗しました" }, { status: 500 });
  }
}
