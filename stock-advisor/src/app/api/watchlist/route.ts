import { NextRequest, NextResponse } from "next/server";
import { addWatchlistEntry, getWatchlist, removeWatchlistEntry } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getWatchlist());
}

export async function POST(req: NextRequest) {
  const { ticker, name } = await req.json();
  if (!ticker) return NextResponse.json({ error: "銘柄コードは必須です" }, { status: 400 });
  try {
    return NextResponse.json(await addWatchlistEntry(String(ticker), name ? String(name) : undefined), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "追加に失敗しました" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker は必須です" }, { status: 400 });
  if (!(await removeWatchlistEntry(ticker))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
