import { NextResponse } from "next/server";
import { loadWatchedActivity } from "@/lib/accountActivity";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadWatchedActivity());
}
