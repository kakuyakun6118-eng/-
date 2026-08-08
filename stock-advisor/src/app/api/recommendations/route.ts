import { NextResponse } from "next/server";
import { loadRecommendations } from "@/lib/recommendations";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadRecommendations());
}
