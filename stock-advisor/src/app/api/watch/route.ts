import { NextResponse } from "next/server";
import { loadAccountActivity } from "@/lib/accountActivity";

export const dynamic = "force-dynamic";

export async function GET() {
  const activity = await loadAccountActivity();
  return NextResponse.json(activity);
}
