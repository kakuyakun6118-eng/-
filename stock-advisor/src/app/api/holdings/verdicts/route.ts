import { NextResponse } from "next/server";
import { loadHoldingVerdicts } from "@/lib/holdingsService";
import { recentIssues } from "@/lib/dataHealth";

export const dynamic = "force-dynamic";

export async function GET() {
  const verdicts = await loadHoldingVerdicts();
  // Read issues after loading, so any failure just hit is reported to the client.
  return NextResponse.json({ verdicts, issues: recentIssues() });
}
