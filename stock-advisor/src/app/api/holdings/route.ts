import { NextRequest, NextResponse } from "next/server";
import { addHolding, listHoldings, updateHolding, deleteHolding } from "@/lib/holdingsStore";

export async function GET() {
  const holdings = await listHoldings();
  return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, name, shares, costBasis, note } = body;
  if (!ticker || !shares || !costBasis) {
    return NextResponse.json({ error: "ticker, shares, costBasis は必須です" }, { status: 400 });
  }
  const holding = await addHolding({
    ticker: String(ticker),
    name: name ? String(name) : undefined,
    shares: Number(shares),
    costBasis: Number(costBasis),
    note: note ? String(note) : undefined,
  });
  return NextResponse.json(holding, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  const updated = await updateHolding(String(id), rest);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  const ok = await deleteHolding(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
