import { NextResponse } from "next/server";
import { loadHoldingVerdicts } from "@/lib/holdingsService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadHoldingVerdicts());
}
